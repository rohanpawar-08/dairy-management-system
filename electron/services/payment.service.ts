import Database from 'better-sqlite3';
import {
  PaymentDto,
  PaymentAllocationDto,
  PaymentMethod,
  PaymentStatus,
  RecordPaymentPayload,
  VoidPaymentPayload,
} from '../../shared/ipc-contracts';
import { formatPaiseAsRupees, parseRupeesToPaise } from '../../shared/money';
import { farmerRepository } from '../db/farmer.repository';
import { paymentRepository, PaymentAllocationRow, PaymentRow } from '../db/payment.repository';
import { sessionService } from '../core/session.service';
import { auditService } from './audit.service';
import { paymentNumberService } from './payment-number.service';

export interface BusinessDateProvider {
  getTodayBusinessDate(): string;
  getNowIso(): string;
}

export const defaultDateProvider: BusinessDateProvider = {
  getTodayBusinessDate(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  },
  getNowIso(): string {
    return new Date().toISOString();
  },
};

export class PaymentService {
  constructor(private dateProvider: BusinessDateProvider = defaultDateProvider) {}

  recordPayment(
    db: Database.Database,
    payload: RecordPaymentPayload,
    webContentsId: number
  ): PaymentDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const farmerId = payload.farmerId;
    if (!farmerId || farmerId <= 0) {
      throw new Error('Valid farmerId is required.');
    }

    const farmer = farmerRepository.getById(db, farmerId);
    if (!farmer) {
      throw new Error(`Farmer with ID ${farmerId} not found.`);
    }

    const businessDate = payload.businessDate?.trim();
    if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new Error('Valid businessDate in YYYY-MM-DD format is required.');
    }

    let amountPaise = 0;
    if (typeof payload.amountRupees === 'number') {
      if (payload.amountRupees <= 0 || !Number.isFinite(payload.amountRupees)) {
        throw new Error('Payment amount must be a positive number.');
      }
      amountPaise = Math.round(payload.amountRupees * 100);
    } else if (typeof payload.amountRupees === 'string') {
      amountPaise = parseRupeesToPaise(payload.amountRupees);
    } else {
      throw new Error('Valid payment amount in rupees is required.');
    }

    if (amountPaise <= 0) {
      throw new Error('Payment amount must be greater than zero integer paise.');
    }

    const method = payload.paymentMethod;
    const validMethods: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'];
    if (!validMethods.includes(method)) {
      throw new Error(`Invalid payment method '${method}'.`);
    }

    const externalRef = payload.externalReference?.trim() || null;
    if (method !== 'CASH' && !externalRef) {
      throw new Error(`External reference (transaction ID / cheque no) is required for payment method '${method}'.`);
    }

    const notes = payload.notes?.trim() || null;

    // Check outstanding balance
    const totalFinalizedNet = paymentRepository.getFarmerFinalizedSettlementsTotalNet(db, farmer.id);
    const totalActivePaid = paymentRepository.getFarmerTotalActivePayments(db, farmer.id);
    const outstandingBalance = Math.max(totalFinalizedNet - totalActivePaid, 0);

    if (outstandingBalance <= 0) {
      throw new Error(
        `Farmer ${farmer.member_code} (${farmer.name_mr}) has no positive outstanding settlement balance to receive payment.`
      );
    }

    if (amountPaise > outstandingBalance) {
      throw new Error(
        `Payment amount (₹${formatPaiseAsRupees(amountPaise)}) exceeds farmer's positive outstanding balance (₹${formatPaiseAsRupees(outstandingBalance)}).`
      );
    }

    const paymentNumber = paymentNumberService.generatePaymentNumber(db, businessDate);

    // Atomic Transaction: Payment record + FIFO Allocation
    const recordTx = db.transaction(() => {
      const paymentRow = paymentRepository.createPayment(db, {
        paymentNumber,
        farmerId: farmer.id,
        businessDate,
        amountPaise,
        paymentMethod: method,
        externalReference: externalRef,
        notes,
        createdByUserId: session.userId,
      });

      // FIFO Allocation
      const targets = paymentRepository.getFarmerFinalizedSettlementsWithOutstanding(db, farmer.id);
      let remainingToAllocate = amountPaise;
      const allocsToInsert: { paymentId: number; weeklySettlementId: number; allocatedPaise: number }[] = [];

      for (const target of targets) {
        if (target.remainingPaise > 0) {
          const allocAmount = Math.min(remainingToAllocate, target.remainingPaise);
          allocsToInsert.push({
            paymentId: paymentRow.id,
            weeklySettlementId: target.weeklySettlementId,
            allocatedPaise: allocAmount,
          });
          remainingToAllocate -= allocAmount;
          if (remainingToAllocate === 0) {
            break;
          }
        }
      }

      if (remainingToAllocate > 0) {
        throw new Error(`FIFO allocation incomplete: unable to allocate remaining ${remainingToAllocate} paise.`);
      }

      const allocSum = allocsToInsert.reduce((sum, a) => sum + a.allocatedPaise, 0);
      if (allocSum !== amountPaise) {
        throw new Error(`Allocation assertion failed: sum of allocations (${allocSum}) != payment amount (${amountPaise}).`);
      }

      paymentRepository.createAllocations(db, allocsToInsert);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'PAYMENT_RECORDED',
        entityName: 'payments',
        entityId: String(paymentRow.id),
        details: {
          paymentNumber: paymentRow.payment_number,
          farmerId: farmer.id,
          memberCode: farmer.member_code,
          amountPaise,
          paymentMethod: method,
          allocationsCount: allocsToInsert.length,
        },
      });

      return paymentRow;
    });

    const paymentRow = recordTx();
    return this.mapPaymentToDto(db, paymentRow);
  }

  voidPayment(
    db: Database.Database,
    payload: VoidPaymentPayload,
    webContentsId: number
  ): PaymentDto {
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    const reason = payload.reason?.trim();
    if (!reason) {
      throw new Error('Void reason is required.');
    }

    const payment = paymentRepository.getPaymentById(db, payload.paymentId);
    if (!payment) {
      throw new Error(`Payment with ID ${payload.paymentId} not found.`);
    }

    if (payment.status !== 'RECORDED') {
      throw new Error(`Only RECORDED payments can be voided. Current status is ${payment.status}.`);
    }

    const voidTx = db.transaction(() => {
      const nowIso = this.dateProvider.getNowIso();
      paymentRepository.voidPayment(db, payment.id, session.userId, reason, nowIso);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'PAYMENT_VOIDED',
        entityName: 'payments',
        entityId: String(payment.id),
        details: {
          paymentNumber: payment.payment_number,
          farmerId: payment.farmer_id,
          amountPaise: payment.amount_paise,
          voidReason: reason,
        },
      });
    });

    voidTx();

    const updated = paymentRepository.getPaymentById(db, payment.id)!;
    return this.mapPaymentToDto(db, updated);
  }

  listPayments(
    db: Database.Database,
    filter:
      | {
          farmerId?: number;
          memberCode?: string;
          status?: PaymentStatus;
          fromDate?: string;
          toDate?: string;
        }
      | undefined,
    webContentsId: number
  ): PaymentDto[] {
    sessionService.requireAuthenticated(webContentsId);
    const rows = paymentRepository.listPayments(db, filter);
    return rows.map((r) => this.mapPaymentToDto(db, r));
  }

  private mapPaymentToDto(db: Database.Database, row: PaymentRow): PaymentDto {
    const allocRows = paymentRepository.getAllocationsByPaymentId(db, row.id);
    const allocations: PaymentAllocationDto[] = allocRows.map((a) => ({
      id: a.id,
      paymentId: a.payment_id,
      weeklySettlementId: a.weekly_settlement_id,
      settlementPeriodNumber: a.settlement_period_number || 'UNKNOWN',
      periodStart: a.period_start || '',
      periodEnd: a.period_end || '',
      allocatedPaise: a.allocated_paise,
      createdAt: a.created_at,
    }));

    return {
      id: row.id,
      paymentNumber: row.payment_number,
      farmerId: row.farmer_id,
      farmerMemberCode: row.farmer_member_code || '',
      farmerNameMr: row.farmer_name_mr || '',
      farmerNameEn: row.farmer_name_en || null,
      businessDate: row.business_date,
      amountPaise: row.amount_paise,
      paymentMethod: row.payment_method,
      externalReference: row.external_reference,
      notes: row.notes,
      status: row.status,
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name || 'System User',
      createdAt: row.created_at,
      voidedByUserId: row.voided_by_user_id,
      voidedByName: row.voided_by_name || null,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
      updatedAt: row.updated_at,
      allocations,
    };
  }
}

export const paymentService = new PaymentService();
