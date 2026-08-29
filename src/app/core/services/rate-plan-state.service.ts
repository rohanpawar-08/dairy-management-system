import { Injectable, inject, signal, computed } from '@angular/core';
import {
  RatePlanDto,
  RatePlanFilter,
  CreateRatePlanDraftPayload,
  UpdateRatePlanDraftPayload,
  CloneRatePlanPayload,
  SupersedeRatePlanPayload,
  CalculateRatePreviewPayload,
  CalculateRatePreviewResult,
  ResolveApprovedRatePayload,
  ResolveApprovedRateResult,
} from '../../../../shared/ipc-contracts';
import { ElectronBridgeService } from './electron-bridge.service';

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    return (
      (obj['messageEn'] as string) ||
      (obj['messageMr'] as string) ||
      (obj['details'] as string) ||
      fallback
    );
  }
  return fallback;
}

@Injectable({
  providedIn: 'root',
})
export class RatePlanStateService {
  private readonly bridge = inject(ElectronBridgeService);

  readonly plans = signal<RatePlanDto[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly currentCowPlan = computed(() =>
    this.plans().find(
      (p) => p.milkType === 'COW' && p.status === 'APPROVED' && p.lifecycleState === 'CURRENT'
    ) ?? null
  );

  readonly currentBuffaloPlan = computed(() =>
    this.plans().find(
      (p) => p.milkType === 'BUFFALO' && p.status === 'APPROVED' && p.lifecycleState === 'CURRENT'
    ) ?? null
  );

  readonly upcomingCowPlan = computed(() =>
    this.plans().find(
      (p) => p.milkType === 'COW' && p.status === 'APPROVED' && p.lifecycleState === 'UPCOMING'
    ) ?? null
  );

  readonly upcomingBuffaloPlan = computed(() =>
    this.plans().find(
      (p) => p.milkType === 'BUFFALO' && p.status === 'APPROVED' && p.lifecycleState === 'UPCOMING'
    ) ?? null
  );

  readonly hasMissingApprovedRate = computed(
    () => !this.currentCowPlan() || !this.currentBuffaloPlan()
  );

  async loadPlans(filter: RatePlanFilter = {}): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.bridge.ratePlans.list(filter);
      if (res.success && res.data) {
        this.plans.set(res.data);
      } else {
        this.errorMessage.set(extractErrorMessage(res.error, 'Failed to load rate plans.'));
      }
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to load rate plans.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async getPlanById(id: number): Promise<RatePlanDto | null> {
    const res = await this.bridge.ratePlans.getById(id);
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, `Failed to retrieve rate plan #${id}`));
  }

  async createDraft(payload: CreateRatePlanDraftPayload): Promise<RatePlanDto> {
    const res = await this.bridge.ratePlans.createDraft(payload);
    if (res.success && res.data) {
      await this.loadPlans();
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to create rate plan draft'));
  }

  async updateDraft(
    id: number,
    payload: UpdateRatePlanDraftPayload
  ): Promise<RatePlanDto> {
    const res = await this.bridge.ratePlans.updateDraft(id, payload);
    if (res.success && res.data) {
      await this.loadPlans();
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to update rate plan draft'));
  }

  async clonePlan(payload: CloneRatePlanPayload): Promise<RatePlanDto> {
    const res = await this.bridge.ratePlans.clone(payload);
    if (res.success && res.data) {
      await this.loadPlans();
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to clone rate plan'));
  }

  async approvePlan(id: number): Promise<RatePlanDto> {
    const res = await this.bridge.ratePlans.approve(id);
    if (res.success && res.data) {
      await this.loadPlans();
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to approve rate plan'));
  }

  async supersedePlan(
    payload: SupersedeRatePlanPayload
  ): Promise<{ oldPlan: RatePlanDto; newPlan: RatePlanDto }> {
    const res = await this.bridge.ratePlans.supersede(payload);
    if (res.success && res.data) {
      await this.loadPlans();
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to supersede rate plan'));
  }

  async cancelPlan(id: number, reason: string): Promise<RatePlanDto> {
    const res = await this.bridge.ratePlans.cancel(id, { planId: id, reason });
    if (res.success && res.data) {
      await this.loadPlans();
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to cancel rate plan'));
  }

  async calculatePreview(
    payload: CalculateRatePreviewPayload
  ): Promise<CalculateRatePreviewResult> {
    const res = await this.bridge.ratePlans.calculatePreview(payload);
    if (res.success && res.data) {
      return res.data;
    }
    return {
      valid: false,
      ratePaisePerLitre: 0,
      rateRupeesFormatted: '₹0.00',
      error: extractErrorMessage(res.error, 'Preview calculation failed'),
      errorMr: 'दर गणना पूर्वदर्शन अयशस्वी झाले.',
    };
  }

  async resolveApprovedRate(
    payload: ResolveApprovedRatePayload
  ): Promise<ResolveApprovedRateResult> {
    const res = await this.bridge.ratePlans.resolveApprovedRate(payload);
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(extractErrorMessage(res.error, 'Failed to resolve approved rate'));
  }
}
