import Database from 'better-sqlite3';
import { PaymentMethod, PaymentStatus } from '../../shared/ipc-contracts';

export const reportRepository = {
  getDailyCollectionSummary(db: Database.Database, fromDate: string, toDate: string) {
    return db.prepare(`
      SELECT 
        COUNT(id) as totalCollections,
        COUNT(DISTINCT farmer_id) as uniqueFarmers,
        COALESCE(SUM(quantity_ml), 0) as totalQuantityMl,
        COALESCE(SUM(amount_paise), 0) as totalAmountPaise,
        
        COALESCE(SUM(CASE WHEN milk_type = 'COW' THEN quantity_ml ELSE 0 END), 0) as cowQuantityMl,
        COALESCE(SUM(CASE WHEN milk_type = 'COW' THEN amount_paise ELSE 0 END), 0) as cowAmountPaise,
        COALESCE(SUM(CASE WHEN milk_type = 'COW' THEN quantity_ml * fat_x100 ELSE 0 END), 0) as cowFatSum,
        COALESCE(SUM(CASE WHEN milk_type = 'COW' THEN quantity_ml * snf_x100 ELSE 0 END), 0) as cowSnfSum,
        
        COALESCE(SUM(CASE WHEN milk_type = 'BUFFALO' THEN quantity_ml ELSE 0 END), 0) as buffaloQuantityMl,
        COALESCE(SUM(CASE WHEN milk_type = 'BUFFALO' THEN amount_paise ELSE 0 END), 0) as buffaloAmountPaise,
        COALESCE(SUM(CASE WHEN milk_type = 'BUFFALO' THEN quantity_ml * fat_x100 ELSE 0 END), 0) as buffaloFatSum,
        COALESCE(SUM(CASE WHEN milk_type = 'BUFFALO' THEN quantity_ml * snf_x100 ELSE 0 END), 0) as buffaloSnfSum,

        COALESCE(SUM(CASE WHEN shift_type = 'MORNING' THEN quantity_ml ELSE 0 END), 0) as morningQuantityMl,
        COALESCE(SUM(CASE WHEN shift_type = 'MORNING' THEN amount_paise ELSE 0 END), 0) as morningAmountPaise,
        COALESCE(SUM(CASE WHEN shift_type = 'EVENING' THEN quantity_ml ELSE 0 END), 0) as eveningQuantityMl,
        COALESCE(SUM(CASE WHEN shift_type = 'EVENING' THEN amount_paise ELSE 0 END), 0) as eveningAmountPaise
      FROM milk_collections
      WHERE status = 'ACTIVE' 
        AND business_date >= @fromDate 
        AND business_date <= @toDate
    `).get({ fromDate, toDate }) as any;
  },

  getShiftCollectionReport(db: Database.Database, shiftId: number) {
    const shift = db.prepare(`
      SELECT * FROM shifts WHERE id = @shiftId
    `).get({ shiftId }) as any;
    
    if (!shift) return null;

    const stats = db.prepare(`
      SELECT 
        COUNT(id) as totalCollections,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeCollections,
        SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END) as voidedCollections,
        
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'COW' THEN quantity_ml ELSE 0 END), 0) as cowQuantityMl,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'COW' THEN amount_paise ELSE 0 END), 0) as cowAmountPaise,
        
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'BUFFALO' THEN quantity_ml ELSE 0 END), 0) as buffaloQuantityMl,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND milk_type = 'BUFFALO' THEN amount_paise ELSE 0 END), 0) as buffaloAmountPaise
      FROM milk_collections
      WHERE shift_id = @shiftId
    `).get({ shiftId }) as any;

    const collections = db.prepare(`
      SELECT * FROM milk_collections 
      WHERE shift_id = @shiftId
      ORDER BY receipt_number ASC
    `).all({ shiftId }) as any[];

    return { shift, stats, collections };
  },

  getSettlementBatchReport(db: Database.Database, periodId: number) {
    const period = db.prepare(`
      SELECT * FROM settlement_periods WHERE id = @periodId AND status = 'FINALIZED'
    `).get({ periodId }) as any;
    
    if (!period) return null;

    const items = db.prepare(`
      SELECT * FROM weekly_settlements 
      WHERE settlement_period_id = @periodId
      ORDER BY member_code_snapshot ASC
    `).all({ periodId }) as any[];

    // Include payment allocation info
    const allocations = db.prepare(`
      SELECT pa.weekly_settlement_id, SUM(pa.allocated_paise) as total_allocated
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE p.status = 'RECORDED'
      GROUP BY pa.weekly_settlement_id
    `).all() as any[];

    const allocMap = new Map<number, number>();
    for (const a of allocations) {
      allocMap.set(a.weekly_settlement_id, a.total_allocated);
    }

    const reportItems = items.map(item => {
      const allocated = allocMap.get(item.id) || 0;
      return {
        ...item,
        allocated_paise: allocated,
        outstanding_paise: item.net_amount_paise - allocated
      };
    });

    return { period, items: reportItems };
  },

  getPaymentRegister(db: Database.Database, filters: { fromDate?: string, toDate?: string, farmerId?: number, method?: PaymentMethod, status?: PaymentStatus }) {
    let sql = `SELECT * FROM payments WHERE 1=1`;
    const params: any = {};
    if (filters.fromDate) { sql += ` AND business_date >= @fromDate`; params.fromDate = filters.fromDate; }
    if (filters.toDate) { sql += ` AND business_date <= @toDate`; params.toDate = filters.toDate; }
    if (filters.farmerId) { sql += ` AND farmer_id = @farmerId`; params.farmerId = filters.farmerId; }
    if (filters.method) { sql += ` AND payment_method = @method`; params.method = filters.method; }
    if (filters.status) { sql += ` AND status = @status`; params.status = filters.status; }
    sql += ` ORDER BY business_date DESC, id DESC`;
    
    return db.prepare(sql).all(params) as any[];
  },

  getOutstandingFarmerReport(db: Database.Database) {
    // Get farmers
    const farmers = db.prepare(`SELECT id, member_code, name_mr, name_en, is_active FROM farmers`).all() as any[];
    
    // Get total finalized net amount per farmer
    const finalized = db.prepare(`
      SELECT farmer_id, SUM(net_amount_paise) as total_net
      FROM weekly_settlements ws
      JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
      WHERE sp.status = 'FINALIZED'
      GROUP BY farmer_id
    `).all() as any[];

    // Get total active payments per farmer
    const paid = db.prepare(`
      SELECT farmer_id, SUM(amount_paise) as total_paid
      FROM payments
      WHERE status = 'RECORDED'
      GROUP BY farmer_id
    `).all() as any[];

    const netMap = new Map<number, number>();
    for (const f of finalized) netMap.set(f.farmer_id, f.total_net);

    const paidMap = new Map<number, number>();
    for (const p of paid) paidMap.set(p.farmer_id, p.total_paid);

    const result = [];
    for (const f of farmers) {
      const net = netMap.get(f.id) || 0;
      const paidAmt = paidMap.get(f.id) || 0;
      const outstanding = net - paidAmt;
      
      // Keep inactive farmers if outstanding != 0, else skip inactive. Keep active always.
      if (f.is_active || outstanding !== 0) {
        result.push({
          farmer_id: f.id,
          member_code: f.member_code,
          name_mr: f.name_mr,
          name_en: f.name_en,
          is_active: f.is_active,
          total_net: net,
          total_paid: paidAmt,
          outstanding
        });
      }
    }
    
    // Sort by member code
    result.sort((a, b) => {
      const codeA = parseInt(a.member_code, 10);
      const codeB = parseInt(b.member_code, 10);
      return (isNaN(codeA) ? 0 : codeA) - (isNaN(codeB) ? 0 : codeB);
    });

    return result;
  },

  getDashboardSummaryBaseData(db: Database.Database, businessDate: string, weekStart: string, weekEnd: string) {
    const today = db.prepare(`
      SELECT 
        COUNT(id) as todayCount,
        COALESCE(SUM(quantity_ml), 0) as todayLitres,
        COALESCE(SUM(amount_paise), 0) as todayAmount,
        COALESCE(SUM(CASE WHEN milk_type = 'COW' THEN quantity_ml ELSE 0 END), 0) as cowLitres,
        COALESCE(SUM(CASE WHEN milk_type = 'BUFFALO' THEN quantity_ml ELSE 0 END), 0) as buffaloLitres,
        COUNT(DISTINCT farmer_id) as todayActiveFarmers
      FROM milk_collections
      WHERE status = 'ACTIVE' AND business_date = @businessDate
    `).get({ businessDate }) as any;

    const week = db.prepare(`
      SELECT 
        COALESCE(SUM(quantity_ml), 0) as weekLitres,
        COALESCE(SUM(amount_paise), 0) as weekAmount
      FROM milk_collections
      WHERE status = 'ACTIVE' AND business_date >= @weekStart AND business_date <= @weekEnd
    `).get({ weekStart, weekEnd }) as any;

    const latestSettlement = db.prepare(`
      SELECT settlement_number FROM settlement_periods 
      WHERE status = 'FINALIZED' ORDER BY period_end DESC LIMIT 1
    `).get() as any;

    // Active payments and finalized net
    const finalized = db.prepare(`
      SELECT SUM(ws.net_amount_paise) as total_net
      FROM weekly_settlements ws
      JOIN settlement_periods sp ON ws.settlement_period_id = sp.id
      WHERE sp.status = 'FINALIZED'
    `).get() as any;

    const paid = db.prepare(`
      SELECT SUM(amount_paise) as total_paid
      FROM payments
      WHERE status = 'RECORDED'
    `).get() as any;
    
    const recentPayments = db.prepare(`
      SELECT * FROM payments 
      WHERE status = 'RECORDED'
      ORDER BY id DESC LIMIT 5
    `).all() as any[];

    // unpaid farmer count = active farmers with outstanding > 0
    // To do this simply, we re-run the outstanding logic
    const outstanding = this.getOutstandingFarmerReport(db);
    let unpaidFarmerCount = 0;
    let totalFarmerPayable = 0;
    let totalFarmerDebt = 0;

    for (const f of outstanding) {
      if (f.outstanding > 0) {
        unpaidFarmerCount++;
        totalFarmerPayable += f.outstanding;
      } else if (f.outstanding < 0) {
        totalFarmerDebt += Math.abs(f.outstanding);
      }
    }

    return {
      today,
      week,
      latestSettlement: latestSettlement ? latestSettlement.settlement_number : null,
      totalFarmerPayable,
      totalFarmerDebt,
      unpaidFarmerCount,
      recentPayments
    };
  }
};
