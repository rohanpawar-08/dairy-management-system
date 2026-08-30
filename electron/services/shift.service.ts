import Database from 'better-sqlite3';
import {
  OpenShiftPayload,
  ReopenShiftPayload,
  ShiftDto,
  ShiftReadinessDto,
  ShiftSummaryDto,
} from '../../shared/ipc-contracts';
import { formatMlAsLitres, formatPaiseAsRupees } from '../../shared/money';
import { sessionService } from '../core/session.service';
import { ShiftRow, shiftRepository } from '../db/shift.repository';
import { ratePlanRepository } from '../db/rate-plan.repository';
import { auditService } from './audit.service';
import { businessDateProvider } from '../utils/business-date';

export class ShiftService {
  private mapToDto(row: ShiftRow): ShiftDto {
    return {
      id: row.id,
      businessDate: row.business_date,
      shiftType: row.shift_type,
      status: row.status,
      openedByUserId: row.opened_by_user_id,
      openedByName: row.opened_by_name,
      openedAt: row.opened_at,
      closedByUserId: row.closed_by_user_id,
      closedByName: row.closed_by_name,
      closedAt: row.closed_at,
      reopenedByUserId: row.reopened_by_user_id,
      reopenedByName: row.reopened_by_name,
      reopenedAt: row.reopened_at,
      reopenReason: row.reopen_reason,
      reopenCount: row.reopen_count,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getReadiness(db: Database.Database, businessDate?: string): ShiftReadinessDto {
    const targetDate = businessDate || businessDateProvider.getToday();
    const cowPlan = ratePlanRepository.findApprovedPlanForDate(db, 'COW', targetDate);
    const buffaloPlan = ratePlanRepository.findApprovedPlanForDate(db, 'BUFFALO', targetDate);

    const warnings: string[] = [];
    if (!cowPlan) {
      warnings.push(`No approved Cow milk rate plan found for date ${targetDate}.`);
    }
    if (!buffaloPlan) {
      warnings.push(`No approved Buffalo milk rate plan found for date ${targetDate}.`);
    }

    return {
      hasActiveCowPlan: !!cowPlan,
      activeCowPlanName: cowPlan?.plan_name ?? null,
      hasActiveBuffaloPlan: !!buffaloPlan,
      activeBuffaloPlanName: buffaloPlan?.plan_name ?? null,
      warnings,
    };
  }

  getCurrentShift(db: Database.Database, webContentsId?: number): ShiftDto | null {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const row = shiftRepository.getCurrentOpenShift(db);
    return row ? this.mapToDto(row) : null;
  }

  getShiftById(db: Database.Database, id: number, webContentsId?: number): ShiftDto {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }
    const row = shiftRepository.getById(db, id);
    if (!row) {
      throw new Error(`Shift #${id} not found.`);
    }
    return this.mapToDto(row);
  }

  getShiftSummary(db: Database.Database, shiftId: number, webContentsId?: number): ShiftSummaryDto {
    if (webContentsId !== undefined) {
      sessionService.requireAuthenticated(webContentsId);
    }

    const shift = shiftRepository.getById(db, shiftId);
    if (!shift) {
      throw new Error(`Shift #${shiftId} not found.`);
    }

    const raw = shiftRepository.getShiftSummaryRaw(db, shiftId);
    const readiness = this.getReadiness(db, shift.business_date);

    return {
      shiftId: shift.id,
      businessDate: shift.business_date,
      shiftType: shift.shift_type,
      status: shift.status,
      totalActiveCollections: raw.total_active_collections,
      uniqueFarmersCount: raw.unique_farmers_count,
      cowQuantityMl: raw.cow_quantity_ml,
      cowAmountPaise: raw.cow_amount_paise,
      buffaloQuantityMl: raw.buffalo_quantity_ml,
      buffaloAmountPaise: raw.buffalo_amount_paise,
      totalQuantityMl: raw.total_quantity_ml,
      totalAmountPaise: raw.total_amount_paise,
      totalVoidedCollections: raw.total_voided_collections,
      cowLitresFormatted: formatMlAsLitres(raw.cow_quantity_ml),
      cowAmountFormatted: `₹${formatPaiseAsRupees(raw.cow_amount_paise)}`,
      buffaloLitresFormatted: formatMlAsLitres(raw.buffalo_quantity_ml),
      buffaloAmountFormatted: `₹${formatPaiseAsRupees(raw.buffalo_amount_paise)}`,
      totalLitresFormatted: formatMlAsLitres(raw.total_quantity_ml),
      totalAmountFormatted: `₹${formatPaiseAsRupees(raw.total_amount_paise)}`,
      readiness,
    };
  }

  openShift(
    db: Database.Database,
    payload: OpenShiftPayload,
    webContentsId: number
  ): ShiftDto {
    const session = sessionService.requireAuthenticated(webContentsId);

    if (!payload.businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(payload.businessDate)) {
      throw new Error('Valid business date in YYYY-MM-DD format is required.');
    }

    if (payload.shiftType !== 'MORNING' && payload.shiftType !== 'EVENING') {
      throw new Error("Shift type must be either 'MORNING' or 'EVENING'.");
    }

    // Check if another shift is currently OPEN
    const currentOpen = shiftRepository.getCurrentOpenShift(db);
    if (currentOpen) {
      throw new Error(
        `Cannot open shift: Shift #${currentOpen.id} (${currentOpen.business_date} ${currentOpen.shift_type}) is currently open. Please close it first.`
      );
    }

    // Check if shift for (businessDate, shiftType) already exists
    const existing = shiftRepository.getByDateAndType(
      db,
      payload.businessDate,
      payload.shiftType
    );
    if (existing) {
      throw new Error(
        `A shift already exists for date ${payload.businessDate} and shift ${payload.shiftType} (Status: ${existing.status}).`
      );
    }

    const nowIso = businessDateProvider.getNowIso();

    const openTx = db.transaction((): ShiftDto => {
      const shiftId = shiftRepository.insertShift(db, {
        businessDate: payload.businessDate,
        shiftType: payload.shiftType,
        openedByUserId: session.userId,
        openedAt: nowIso,
        notes: payload.notes?.trim() || null,
        nowIso,
      });

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'SHIFT_OPENED',
        entityName: 'shifts',
        entityId: String(shiftId),
        details: {
          shiftId,
          businessDate: payload.businessDate,
          shiftType: payload.shiftType,
        },
        createdAt: nowIso,
      });

      const row = shiftRepository.getById(db, shiftId);
      if (!row) {
        throw new Error('Failed to retrieve newly opened shift.');
      }
      return this.mapToDto(row);
    });

    return openTx();
  }

  closeShift(
    db: Database.Database,
    shiftId: number,
    webContentsId: number
  ): ShiftDto {
    const session = sessionService.requireAuthenticated(webContentsId);

    const shift = shiftRepository.getById(db, shiftId);
    if (!shift) {
      throw new Error(`Shift #${shiftId} not found.`);
    }

    if (shift.status !== 'OPEN') {
      throw new Error(`Cannot close shift #${shiftId}: Shift is already ${shift.status}.`);
    }

    const nowIso = businessDateProvider.getNowIso();

    const closeTx = db.transaction((): ShiftDto => {
      shiftRepository.closeShift(db, shiftId, session.userId, nowIso, nowIso);

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'SHIFT_CLOSED',
        entityName: 'shifts',
        entityId: String(shiftId),
        details: {
          shiftId,
          businessDate: shift.business_date,
          shiftType: shift.shift_type,
        },
        createdAt: nowIso,
      });

      const updated = shiftRepository.getById(db, shiftId);
      if (!updated) {
        throw new Error('Failed to retrieve closed shift.');
      }
      return this.mapToDto(updated);
    });

    return closeTx();
  }

  reopenShift(
    db: Database.Database,
    payload: ReopenShiftPayload,
    webContentsId: number
  ): ShiftDto {
    // Only OWNER can reopen a locked shift!
    const session = sessionService.requireRole(webContentsId, 'OWNER');

    if (!payload.reason || typeof payload.reason !== 'string' || !payload.reason.trim()) {
      throw new Error('A mandatory reason is required to reopen a locked shift.');
    }

    const shift = shiftRepository.getById(db, payload.shiftId);
    if (!shift) {
      throw new Error(`Shift #${payload.shiftId} not found.`);
    }

    if (shift.status !== 'LOCKED') {
      throw new Error(`Cannot reopen shift #${payload.shiftId}: Shift is currently ${shift.status}.`);
    }

    // Check if another shift is currently OPEN
    const currentOpen = shiftRepository.getCurrentOpenShift(db);
    if (currentOpen) {
      throw new Error(
        `Cannot reopen shift: Shift #${currentOpen.id} (${currentOpen.business_date} ${currentOpen.shift_type}) is currently open.`
      );
    }

    const nowIso = businessDateProvider.getNowIso();

    const reopenTx = db.transaction((): ShiftDto => {
      shiftRepository.reopenShift(
        db,
        payload.shiftId,
        session.userId,
        nowIso,
        payload.reason.trim(),
        nowIso
      );

      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'SHIFT_REOPENED',
        entityName: 'shifts',
        entityId: String(payload.shiftId),
        details: {
          shiftId: payload.shiftId,
          businessDate: shift.business_date,
          shiftType: shift.shift_type,
          reopenReason: payload.reason.trim(),
          reopenCount: shift.reopen_count + 1,
        },
        createdAt: nowIso,
      });

      const updated = shiftRepository.getById(db, payload.shiftId);
      if (!updated) {
        throw new Error('Failed to retrieve reopened shift.');
      }
      return this.mapToDto(updated);
    });

    return reopenTx();
  }
}

export const shiftService = new ShiftService();
