import { Injectable, inject, signal } from '@angular/core';
import { ElectronBridgeService } from './electron-bridge.service';
import {
  FarmerFilter,
  FarmerListDto,
  FarmerDetailDto,
  CreateFarmerPayload,
  UpdateFarmerPayload,
  FarmerStatusFilter,
  FarmerMilkFilter,
} from '../../../../shared/ipc-contracts';

@Injectable({
  providedIn: 'root',
})
export class FarmerStateService {
  private readonly bridge = inject(ElectronBridgeService);

  readonly farmers = signal<FarmerListDto[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<FarmerStatusFilter>('ACTIVE');
  readonly milkTypeFilter = signal<FarmerMilkFilter>('ALL');

  async loadFarmers(customFilter?: FarmerFilter): Promise<FarmerListDto[]> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const filter: FarmerFilter = customFilter ?? {
      search: this.searchQuery() || undefined,
      status: this.statusFilter(),
      milkType: this.milkTypeFilter(),
    };

    try {
      const res = await this.bridge.farmers.list(filter);
      if (res.success && res.data) {
        this.farmers.set(res.data);
        return res.data;
      } else {
        const errorMsg = res.error?.messageMr || res.error?.messageEn || 'Failed to load farmers';
        this.errorMessage.set(errorMsg);
        return [];
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(msg);
      return [];
    } finally {
      this.isLoading.set(false);
    }
  }

  async getFarmerEditDetail(id: number): Promise<FarmerDetailDto | null> {
    const res = await this.bridge.farmers.getEditDetail(id);
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to fetch farmer edit details');
  }

  async createFarmer(payload: CreateFarmerPayload): Promise<FarmerListDto> {
    this.isLoading.set(true);
    try {
      const res = await this.bridge.farmers.create(payload);
      if (res.success && res.data) {
        await this.loadFarmers();
        return res.data;
      }
      throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to create farmer');
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateFarmer(id: number, payload: UpdateFarmerPayload): Promise<FarmerListDto> {
    this.isLoading.set(true);
    try {
      const res = await this.bridge.farmers.update(id, payload);
      if (res.success && res.data) {
        await this.loadFarmers();
        return res.data;
      }
      throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to update farmer');
    } finally {
      this.isLoading.set(false);
    }
  }

  async deactivateFarmer(id: number, reason?: string): Promise<FarmerListDto> {
    this.isLoading.set(true);
    try {
      const res = await this.bridge.farmers.deactivate(id, { reason });
      if (res.success && res.data) {
        await this.loadFarmers();
        return res.data;
      }
      throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to deactivate farmer');
    } finally {
      this.isLoading.set(false);
    }
  }

  async reactivateFarmer(id: number): Promise<FarmerListDto> {
    this.isLoading.set(true);
    try {
      const res = await this.bridge.farmers.reactivate(id);
      if (res.success && res.data) {
        await this.loadFarmers();
        return res.data;
      }
      throw new Error(res.error?.messageMr || res.error?.messageEn || 'Failed to reactivate farmer');
    } finally {
      this.isLoading.set(false);
    }
  }
}
