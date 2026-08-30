import { Injectable, signal, computed } from '@angular/core';
import { ElectronBridgeService } from './electron-bridge.service';
import {
  CreateAdjustmentPayload,
  GetFarmerLedgerPayload,
  LedgerSummaryDto,
  VoidAdjustmentPayload,
} from '../../../../shared/ipc-contracts';

@Injectable({
  providedIn: 'root',
})
export class LedgerStateService {
  readonly summary = signal<LedgerSummaryDto | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly fromDate = signal<string | null>(null);
  readonly toDate = signal<string | null>(null);
  readonly includeVoided = signal<boolean>(false);
  readonly memberCodeInput = signal<string>('');

  readonly hasSummary = computed(() => !!this.summary());
  readonly items = computed(() => this.summary()?.items ?? []);

  constructor(private bridge: ElectronBridgeService) {}

  async loadLedger(payload: GetFarmerLedgerPayload): Promise<LedgerSummaryDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.ledger.getFarmerLedger({
        ...payload,
        fromDate: payload.fromDate ?? this.fromDate() ?? undefined,
        toDate: payload.toDate ?? this.toDate() ?? undefined,
        includeVoided: payload.includeVoided ?? this.includeVoided(),
      });

      if (response.success && response.data) {
        this.summary.set(response.data);
        if (response.data.memberCode) {
          this.memberCodeInput.set(response.data.memberCode);
        }
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'खतवही (Ledger) लोड करता आली नाही.';
        this.error.set(errMsg);
        this.summary.set(null);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      this.summary.set(null);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async searchByMemberCode(code: string): Promise<LedgerSummaryDto | null> {
    const trimmed = code.trim();
    if (!trimmed) {
      this.error.set('कृपया सभासद कोड टाका.');
      return null;
    }
    this.memberCodeInput.set(trimmed);
    return this.loadLedger({ memberCode: trimmed });
  }

  async setFilters(fromDate: string | null, toDate: string | null, includeVoided: boolean): Promise<void> {
    this.fromDate.set(fromDate);
    this.toDate.set(toDate);
    this.includeVoided.set(includeVoided);

    const current = this.summary();
    if (current) {
      await this.loadLedger({
        farmerId: current.farmerId,
        fromDate: fromDate ?? undefined,
        toDate: toDate ?? undefined,
        includeVoided,
      });
    }
  }

  async createAdjustment(payload: CreateAdjustmentPayload): Promise<boolean> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const current = this.summary();
      const farmerId = payload.farmerId ?? current?.farmerId;

      const response = await this.bridge.adjustments.create({
        ...payload,
        farmerId,
      });

      if (response.success && response.data) {
        // Refresh ledger
        if (farmerId) {
          await this.loadLedger({ farmerId });
        }
        return true;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'समायोजन (Adjustment) नोंदवता आले नाही.';
        this.error.set(errMsg);
        return false;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  async voidAdjustment(payload: VoidAdjustmentPayload): Promise<boolean> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.adjustments.void(payload);
      if (response.success && response.data) {
        const current = this.summary();
        if (current) {
          await this.loadLedger({ farmerId: current.farmerId });
        }
        return true;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'समायोजन रद्द (Void) करता आले नाही.';
        this.error.set(errMsg);
        return false;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  reset(): void {
    this.summary.set(null);
    this.loading.set(false);
    this.error.set(null);
    this.fromDate.set(null);
    this.toDate.set(null);
    this.includeVoided.set(false);
    this.memberCodeInput.set('');
  }
}
