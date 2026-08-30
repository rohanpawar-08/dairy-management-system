import { Injectable, inject, signal } from '@angular/core';
import {
  CreateMilkCollectionPayload,
  DuplicateCollectionCheckResult,
  MilkCollectionDto,
  OpenShiftPayload,
  RatePlanMilkType,
  ReopenShiftPayload,
  ShiftDto,
  ShiftSummaryDto,
  VoidCollectionPayload,
  CalculateRatePreviewPayload,
  CalculateRatePreviewResult,
  ResolveApprovedRatePayload,
  ResolveApprovedRateResult,
} from '../../../../shared/ipc-contracts';
import { ElectronBridgeService } from './electron-bridge.service';

@Injectable({
  providedIn: 'root',
})
export class CollectionStateService {
  private readonly bridge = inject(ElectronBridgeService);

  public readonly currentShift = signal<ShiftDto | null>(null);
  public readonly shiftSummary = signal<ShiftSummaryDto | null>(null);
  public readonly recentCollections = signal<MilkCollectionDto[]>([]);
  public readonly isLoading = signal<boolean>(false);
  public readonly isSaving = signal<boolean>(false);
  public readonly errorMessage = signal<string | null>(null);
  public readonly enabledMilkTypes = signal<'COW' | 'BUFFALO' | 'BOTH'>('BOTH');

  /**
   * Load the active open shift, dairy settings, and its current summary/recent collections.
   */
  public async loadCurrentShift(): Promise<ShiftDto | null> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const [shiftRes, setupRes] = await Promise.all([
        this.bridge.shifts.getCurrent(),
        this.bridge.getSetupStatus(),
      ]);

      if (setupRes.success && setupRes.data?.dairyProfile?.enabledMilkTypes) {
        this.enabledMilkTypes.set(setupRes.data.dairyProfile.enabledMilkTypes);
      }

      if (!shiftRes.success) {
        this.errorMessage.set(shiftRes.error?.messageMr || shiftRes.error?.messageEn || 'Failed to load shift');
        this.currentShift.set(null);
        this.shiftSummary.set(null);
        this.recentCollections.set([]);
        return null;
      }

      const shift = shiftRes.data ?? null;
      this.currentShift.set(shift);

      if (shift) {
        await Promise.all([
          this.loadShiftSummary(shift.id),
          this.loadRecentCollections(shift.id),
        ]);
      } else {
        this.shiftSummary.set(null);
        this.recentCollections.set([]);
      }

      return shift;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(msg);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Load summary metrics for a given shift.
   */
  public async loadShiftSummary(shiftId: number): Promise<ShiftSummaryDto | null> {
    try {
      const res = await this.bridge.shifts.getSummary(shiftId);
      if (res.success && res.data) {
        this.shiftSummary.set(res.data);
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Load recent collections for a shift.
   */
  public async loadRecentCollections(shiftId: number): Promise<MilkCollectionDto[]> {
    try {
      const res = await this.bridge.collections.listByShift(shiftId);
      if (res.success && res.data) {
        this.recentCollections.set(res.data);
        return res.data;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Open a new shift.
   */
  public async openShift(payload: OpenShiftPayload): Promise<ShiftDto> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.bridge.shifts.open(payload);
      if (!res.success || !res.data) {
        throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to open shift');
      }

      this.currentShift.set(res.data);
      await Promise.all([
        this.loadShiftSummary(res.data.id),
        this.loadRecentCollections(res.data.id),
      ]);
      return res.data;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Close and lock an active shift.
   */
  public async closeShift(shiftId: number): Promise<ShiftDto> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.bridge.shifts.close(shiftId);
      if (!res.success || !res.data) {
        throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to close shift');
      }

      this.currentShift.set(null);
      this.shiftSummary.set(null);
      this.recentCollections.set([]);
      return res.data;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Reopen a locked shift (Owner only).
   */
  public async reopenShift(payload: ReopenShiftPayload): Promise<ShiftDto> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.bridge.shifts.reopen(payload);
      if (!res.success || !res.data) {
        throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to reopen shift');
      }

      this.currentShift.set(res.data);
      await Promise.all([
        this.loadShiftSummary(res.data.id),
        this.loadRecentCollections(res.data.id),
      ]);
      return res.data;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Create a new milk collection transaction with in-flight guard.
   */
  public async recordCollection(
    payload: CreateMilkCollectionPayload
  ): Promise<MilkCollectionDto> {
    if (this.isSaving()) {
      throw new Error('Save already in flight. Please wait.');
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.bridge.collections.create(payload);
      if (!res.success || !res.data) {
        throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to record collection');
      }

      const created = res.data;
      // Prepend to recent collections signal
      this.recentCollections.update((list) => [created, ...list]);

      // Reload summary asynchronously
      if (this.currentShift()) {
        this.loadShiftSummary(this.currentShift()!.id);
      }

      return created;
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Void an existing collection (Owner only).
   */
  public async voidCollection(
    payload: VoidCollectionPayload
  ): Promise<MilkCollectionDto> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const res = await this.bridge.collections.void(payload);
      if (!res.success || !res.data) {
        throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to void collection');
      }

      const voided = res.data;
      this.recentCollections.update((list) =>
        list.map((c) => (c.id === voided.id ? voided : c))
      );

      if (this.currentShift()) {
        await this.loadShiftSummary(this.currentShift()!.id);
      }

      return voided;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Check for active duplicate collections for a farmer in current shift.
   */
  public async checkDuplicate(payload: {
    shiftId: number;
    farmerId: number;
    milkType: RatePlanMilkType;
  }): Promise<DuplicateCollectionCheckResult> {
    const res = await this.bridge.collections.checkDuplicate(payload);
    if (!res.success || !res.data) {
      return { isDuplicate: false, existingCollections: [] };
    }
    return res.data;
  }

  /**
   * Calculate live rate and amount preview.
   */
  public async calculatePreview(
    payload: CalculateRatePreviewPayload
  ): Promise<CalculateRatePreviewResult> {
    const res = await this.bridge.ratePlans.calculatePreview(payload);
    if (!res.success || !res.data) {
      throw new Error(res.error?.messageMr || res.error?.messageEn || 'Rate calculation failed');
    }
    return res.data;
  }

  /**
   * Resolve authoritative approved rate and amount for collection entry.
   */
  public async resolveApprovedRate(
    payload: ResolveApprovedRatePayload
  ): Promise<ResolveApprovedRateResult> {
    const res = await this.bridge.ratePlans.resolveApprovedRate(payload);
    if (!res.success || !res.data) {
      throw new Error(res.error?.messageMr || res.error?.messageEn || 'Rate calculation failed');
    }
    return res.data;
  }
}
