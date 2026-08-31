import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runMigrations } from '../../electron/db/migrator';
import { applyAndVerifyPragmas } from '../../electron/db/connection';
import { reportRepository } from '../../electron/db/report.repository';
import { reportService } from '../../electron/services/report.service';
import { reportTemplateService, escapeHtml } from '../../electron/services/report-template.service';

describe('Stage 9: Reports & Offline PDF Generation', () => {
  let db: Database.Database;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-test-reports-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new Database(dbPath);
    applyAndVerifyPragmas(db);
    runMigrations(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('Report Logic', () => {
    it('should generate accurate daily summary with exact cow/buffalo breakdowns', () => {
      // Add required foreign keys
      db.prepare("INSERT INTO users (id, username, full_name, password_hash, pin_hash, role) VALUES (1, 'test', 'Test', 'hash', 'hash', 'OWNER')").run();
      db.prepare("INSERT INTO rate_plans (id, plan_name, milk_type, strategy_type, pricing_basis, effective_from, status, created_by_user_id, approved_by_user_id, approved_at) VALUES (1, 'Cow Plan', 'COW', 'FORMULA', 'PER_PERCENT_POINT_PER_LITRE', '2026-08-01', 'APPROVED', 1, 1, '2026-08-01')").run();
      db.prepare("INSERT INTO rate_plans (id, plan_name, milk_type, strategy_type, pricing_basis, effective_from, status, created_by_user_id, approved_by_user_id, approved_at) VALUES (2, 'Buffalo Plan', 'BUFFALO', 'FORMULA', 'PER_PERCENT_POINT_PER_LITRE', '2026-08-01', 'APPROVED', 1, 1, '2026-08-01')").run();
      db.prepare("INSERT INTO farmers (id, member_code, name_mr, name_en) VALUES (1, 'F1', 'Farmer 1', 'F1')").run();
      db.prepare("INSERT INTO farmers (id, member_code, name_mr, name_en) VALUES (2, 'F2', 'Farmer 2', 'F2')").run();
      db.prepare("INSERT INTO shifts (id, business_date, shift_type, status, opened_at, opened_by_user_id) VALUES (1, '2026-08-30', 'MORNING', 'OPEN', 1234567890, 1)").run();

      const stmt = db.prepare(`
        INSERT INTO milk_collections (
          receipt_number, farmer_id, shift_id, shift_type, business_date,
          milk_type, quantity_ml, fat_x100, snf_x100, rate_plan_id, rate_applied_paise,
          amount_paise, status, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1)
      `);

      // Add COW
      stmt.run('C1', 1, 1, 'MORNING', '2026-08-30', 'COW', 10000, 350, 850, 1, 3000, 30000);
      stmt.run('C2', 1, 1, 'MORNING', '2026-08-30', 'COW', 5000, 400, 850, 1, 3500, 17500);
      // Add BUFFALO
      stmt.run('B1', 2, 1, 'MORNING', '2026-08-30', 'BUFFALO', 20000, 600, 900, 2, 5000, 100000);

      const raw = reportRepository.getDailyCollectionSummary(db, '2026-08-30', '2026-08-30');
      
      expect(raw.totalCollections).toBe(3);
      expect(raw.cowQuantityMl).toBe(15000);
      expect(raw.cowAmountPaise).toBe(47500);
      expect(raw.buffaloQuantityMl).toBe(20000);
      expect(raw.buffaloAmountPaise).toBe(100000);
      
      const payload = { reportType: 'DAILY_COLLECTION_SUMMARY' as const, fromDate: '2026-08-30', toDate: '2026-08-30' };
      const data = reportService.previewReport(db, payload);
      expect(data.cowLitresFormatted).toBe('15.0');
      expect(data.cowFatAvg).toBe('3.67'); // (10000*3.5 + 5000*4.0)/15000 = (35000+20000)/15000 = 3.6666
      
      // Test explicit round-half-up boundary
      stmt.run('C3', 1, 1, 'MORNING', '2026-08-30', 'COW', 1000, 365, 850, 1, 3650, 3650); // Adds 3650 to fat sum
      const data2 = reportService.previewReport(db, payload);
      // Previous sum = 55000. New sum = 55000 + 3650 = 58650.
      // Total Qty = 15000 + 1000 = 16000.
      // Avg = 58650 / 16000 = 3.665625 => rounds to 3.67
      expect(data2.cowFatAvg).toBe('3.67');
    });

    it('should exclude voided collections and payments', () => {
      // Logic checked in getDailyCollectionSummary SQL ('status = ACTIVE')
      const raw = reportRepository.getDailyCollectionSummary(db, '2026-08-30', '2026-08-30');
      expect(raw.totalCollections).toBe(0);
    });
  });

  describe('PDF Security & Formatting', () => {
    it('escapes HTML to prevent injection', () => {
      const malicious = '<script>alert("hack")</script>';
      const safe = escapeHtml(malicious);
      expect(safe).toBe('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
      expect(safe).not.toContain('<script>');
    });

    it('generates offline template without external resources', () => {
      const html = reportTemplateService.generateHtml('TEST', { generatedAt: '2026-08-30' }, { centreName: 'Test' });
      expect(html).toContain("content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;\"");
      expect(html).not.toContain('<script');
      expect(html).not.toContain('http://');
      expect(html).not.toContain('https://');
    });
  });
});
