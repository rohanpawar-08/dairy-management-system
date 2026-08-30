import { Injectable, signal, computed } from '@angular/core';
import { ElectronBridgeService } from './electron-bridge.service';
import {
  CancelSettlementDraftPayload,
  CreateSettlementDraftPayload,
  FarmerOutstandingDto,
  FinalizeSettlementPayload,
  PaymentDto,
  RecordPaymentPayload,
  SettlementPeriodDto,
  SettlementPreviewDto,
  VoidPaymentPayload,
  WeeklySettlementDto,
} from '../../../../shared/ipc-contracts';

@Injectable({
  providedIn: 'root',
})
export class SettlementStateService {
  readonly periods = signal<SettlementPeriodDto[]>([]);
  readonly activeDraftPeriod = computed(() => this.periods().find((p) => p.status === 'DRAFT') || null);
  readonly selectedPeriod = signal<SettlementPeriodDto | null>(null);

  readonly previewData = signal<SettlementPreviewDto | null>(null);
  readonly farmerSettlements = signal<WeeklySettlementDto[]>([]);
  readonly payments = signal<PaymentDto[]>([]);
  readonly farmerOutstanding = signal<FarmerOutstandingDto | null>(null);

  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  constructor(private bridge: ElectronBridgeService) {}

  async loadPeriods(): Promise<SettlementPeriodDto[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.settlements.listPeriods();
      if (response.success && response.data) {
        this.periods.set(response.data);
        if (response.data.length > 0 && !this.selectedPeriod()) {
          this.selectedPeriod.set(response.data[0]);
        }
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'साप्ताहिक हिशोब कालावधी लोड करता आले नाहीत.';
        this.error.set(errMsg);
        return [];
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async selectPeriod(periodId: number): Promise<void> {
    const period = this.periods().find((p) => p.id === periodId) || null;
    this.selectedPeriod.set(period);
    if (period) {
      if (period.status === 'DRAFT') {
        await this.loadPreview({ periodId: period.id });
      } else {
        await this.loadFarmerSettlements({ periodId: period.id });
      }
    }
  }

  async loadPreview(payload: { periodId?: number; periodStart?: string }): Promise<SettlementPreviewDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.settlements.preview(payload);
      if (response.success && response.data) {
        this.previewData.set(response.data);
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'पूर्वावलोकन (Preview) लोड करता आले नाही.';
        this.error.set(errMsg);
        this.previewData.set(null);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      this.previewData.set(null);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async createDraft(payload: CreateSettlementDraftPayload): Promise<SettlementPeriodDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.settlements.createDraft(payload);
      if (response.success && response.data) {
        await this.loadPeriods();
        this.selectedPeriod.set(response.data);
        await this.loadPreview({ periodId: response.data.id });
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'ड्राफ्ट हिशोब कालावधी तयार करता आला नाही.';
        this.error.set(errMsg);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async finalizePeriod(payload: FinalizeSettlementPayload): Promise<SettlementPeriodDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.settlements.finalize(payload);
      if (response.success && response.data) {
        await this.loadPeriods();
        this.selectedPeriod.set(response.data);
        await this.loadFarmerSettlements({ periodId: response.data.id });
        this.previewData.set(null);
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'हिशोब अंतिम (Finalize) करता आला नाही.';
        this.error.set(errMsg);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async cancelDraft(payload: CancelSettlementDraftPayload): Promise<SettlementPeriodDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.settlements.cancelDraft(payload);
      if (response.success && response.data) {
        await this.loadPeriods();
        this.previewData.set(null);
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'ड्राफ्ट हिशोब कालावधी रद्द करता आला नाही.';
        this.error.set(errMsg);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async loadFarmerSettlements(filter?: { periodId?: number; farmerId?: number; memberCode?: string }): Promise<WeeklySettlementDto[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.settlements.listFarmerSettlements(filter);
      if (response.success && response.data) {
        this.farmerSettlements.set(response.data);
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'सभासद हिशोब यादी लोड करता आली नाही.';
        this.error.set(errMsg);
        this.farmerSettlements.set([]);
        return [];
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      this.farmerSettlements.set([]);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async loadOutstanding(farmerId: number): Promise<FarmerOutstandingDto | null> {
    try {
      const response = await this.bridge.settlements.getOutstanding(farmerId);
      if (response.success && response.data) {
        this.farmerOutstanding.set(response.data);
        return response.data;
      } else {
        this.farmerOutstanding.set(null);
        return null;
      }
    } catch {
      this.farmerOutstanding.set(null);
      return null;
    }
  }

  async loadPayments(filter?: { farmerId?: number; memberCode?: string; status?: any; fromDate?: string; toDate?: string }): Promise<PaymentDto[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.payments.list(filter);
      if (response.success && response.data) {
        this.payments.set(response.data);
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'पेमेंट नोंद यादी लोड करता आली नाही.';
        this.error.set(errMsg);
        this.payments.set([]);
        return [];
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      this.payments.set([]);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async recordPayment(payload: RecordPaymentPayload): Promise<PaymentDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.payments.record(payload);
      if (response.success && response.data) {
        await this.loadPayments({ farmerId: payload.farmerId });
        await this.loadOutstanding(payload.farmerId);
        const sel = this.selectedPeriod();
        if (sel) {
          await this.loadFarmerSettlements({ periodId: sel.id });
        }
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'पेमेंट नोंदवता आले नाही.';
        this.error.set(errMsg);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async voidPayment(payload: VoidPaymentPayload): Promise<PaymentDto | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.bridge.payments.void(payload);
      if (response.success && response.data) {
        await this.loadPayments();
        await this.loadOutstanding(response.data.farmerId);
        const sel = this.selectedPeriod();
        if (sel) {
          await this.loadFarmerSettlements({ periodId: sel.id });
        }
        return response.data;
      } else {
        const errMsg = response.error?.messageMr || response.error?.messageEn || 'पेमेंट रद्द (Void) करता आले नाही.';
        this.error.set(errMsg);
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      return null;
    } finally {
      this.loading.set(false);
    }
  }
}
