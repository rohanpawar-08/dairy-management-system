import { Injectable } from '@angular/core';
import {
  DairyApiBridge,
  IpcResponse,
  IpcErrorDetails,
  PingResult,
  SqliteSmokeResult,
  AppVersionInfo,
  SetupStatusResult,
  CompleteSetupPayload,
  DairyProfileSummary,
  LoginPayload,
  AuthSessionDto,
  FarmerFilter,
  FarmerListDto,
  FarmerDetailDto,
  CreateFarmerPayload,
  UpdateFarmerPayload,
  DeactivateFarmerPayload,
  RatePlanFilter,
  RatePlanDto,
  CreateRatePlanDraftPayload,
  UpdateRatePlanDraftPayload,
  CloneRatePlanPayload,
  SupersedeRatePlanPayload,
  CancelRatePlanPayload,
  CalculateRatePreviewPayload,
  CalculateRatePreviewResult,
  ResolveApprovedRatePayload,
  ResolveApprovedRateResult,
  ShiftDto,
  ShiftSummaryDto,
  OpenShiftPayload,
  ReopenShiftPayload,
  MilkCollectionDto,
  CreateMilkCollectionPayload,
  VoidCollectionPayload,
  DuplicateCollectionCheckResult,
  RatePlanMilkType,
  CreateAdjustmentPayload,
  VoidAdjustmentPayload,
  AdjustmentFilter,
  GetFarmerLedgerPayload,
  AdjustmentDto,
  LedgerSummaryDto,
  SettlementPeriodDto,
  CreateSettlementDraftPayload,
  CancelSettlementDraftPayload,
  FinalizeSettlementPayload,
  SettlementPreviewDto,
  WeeklySettlementDto,
  PaymentDto,
  RecordPaymentPayload,
  VoidPaymentPayload,
  FarmerOutstandingDto,
} from '../../../../shared/ipc-contracts';

const NO_BRIDGE_ERROR: IpcErrorDetails = {
  code: 'NO_ELECTRON_BRIDGE',
  messageMr: 'Electron प्रीलोड ब्रिज उपलब्ध नाही (ब्राउझर मोड)',
  messageEn: 'Electron preload bridge is not available (Browser mode)',
};

@Injectable({
  providedIn: 'root',
})
export class ElectronBridgeService {
  private get api(): DairyApiBridge | undefined {
    return typeof window !== 'undefined' ? window.dairyApi : undefined;
  }

  public get isElectron(): boolean {
    return !!this.api;
  }

  /**
   * Ping the Electron main process via typed IPC.
   */
  public async ping(): Promise<IpcResponse<PingResult>> {
    if (!this.api) {
      return {
        success: false,
        error: NO_BRIDGE_ERROR,
      };
    }
    return this.api.ping();
  }

  /**
   * Run the in-memory SQLite smoke test via Electron main process.
   */
  public async smokeSqlite(): Promise<IpcResponse<SqliteSmokeResult>> {
    if (!this.api) {
      return {
        success: false,
        error: NO_BRIDGE_ERROR,
      };
    }
    return this.api.smokeSqlite();
  }

  /**
   * Get the application and runtime version info.
   */
  public async getAppVersion(): Promise<IpcResponse<AppVersionInfo>> {
    if (!this.api) {
      return {
        success: true,
        data: {
          version: '0.1.0-web-dev',
          electronVersion: 'N/A',
          chromeVersion: 'N/A',
          nodeVersion: 'N/A',
          platform: 'web',
        },
      };
    }
    return this.api.getAppVersion();
  }

  /**
   * Stage 3: Get first-run setup status.
   */
  public async getSetupStatus(): Promise<IpcResponse<SetupStatusResult>> {
    if (!this.api) {
      return {
        success: true,
        data: { state: 'UNINITIALIZED', dairyProfile: null, hasOwner: false },
      };
    }
    return this.api.getSetupStatus();
  }

  /**
   * Stage 3: Complete first-run dairy setup.
   */
  public async completeSetup(
    payload: CompleteSetupPayload
  ): Promise<IpcResponse<DairyProfileSummary>> {
    if (!this.api) {
      return {
        success: false,
        error: NO_BRIDGE_ERROR,
      };
    }
    return this.api.completeSetup(payload);
  }

  /**
   * Stage 3: Authenticate via Password or Quick PIN.
   */
  public async login(payload: LoginPayload): Promise<IpcResponse<AuthSessionDto>> {
    if (!this.api) {
      return {
        success: false,
        error: NO_BRIDGE_ERROR,
      };
    }
    return this.api.login(payload);
  }

  /**
   * Stage 3: Terminate session on logout.
   */
  public async logout(): Promise<IpcResponse<{ success: boolean }>> {
    if (!this.api) {
      return {
        success: true,
        data: { success: true },
      };
    }
    return this.api.logout();
  }

  /**
   * Stage 3: Retrieve current authenticated session.
   */
  public async getSession(): Promise<IpcResponse<AuthSessionDto | null>> {
    if (!this.api) {
      return {
        success: true,
        data: null,
      };
    }
    return this.api.getSession();
  }

  /**
   * Stage 3: Retrieve Dairy Centre Profile summary.
   */
  public async getProfile(): Promise<IpcResponse<DairyProfileSummary>> {
    if (!this.api) {
      return {
        success: false,
        error: NO_BRIDGE_ERROR,
      };
    }
    return this.api.getProfile();
  }

  /**
   * Stage 4: Farmer / Member Management methods.
   */
  public readonly farmers = {
    list: async (filter?: FarmerFilter): Promise<IpcResponse<FarmerListDto[]>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.list(filter);
    },

    getById: async (id: number): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.getById(id);
    },

    getByCode: async (
      code: string,
      activeOnly?: boolean
    ): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.getByCode(code, activeOnly);
    },

    getEditDetail: async (id: number): Promise<IpcResponse<FarmerDetailDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.getEditDetail(id);
    },

    create: async (payload: CreateFarmerPayload): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.create(payload);
    },

    update: async (
      id: number,
      payload: UpdateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.update(id, payload);
    },

    deactivate: async (
      id: number,
      payload?: DeactivateFarmerPayload
    ): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.deactivate(id, payload);
    },

    reactivate: async (id: number): Promise<IpcResponse<FarmerListDto>> => {
      if (!this.api?.farmers) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.farmers.reactivate(id);
    },
  };

  /**
   * Stage 5: Rate Plan Management methods.
   */
  public readonly ratePlans = {
    list: async (filter?: RatePlanFilter): Promise<IpcResponse<RatePlanDto[]>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.list(filter);
    },

    getById: async (id: number): Promise<IpcResponse<RatePlanDto>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.getById(id);
    },

    createDraft: async (payload: CreateRatePlanDraftPayload): Promise<IpcResponse<RatePlanDto>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.createDraft(payload);
    },

    updateDraft: async (
      id: number,
      payload: UpdateRatePlanDraftPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.updateDraft(id, payload);
    },

    clone: async (payload: CloneRatePlanPayload): Promise<IpcResponse<RatePlanDto>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.clone(payload);
    },

    approve: async (id: number): Promise<IpcResponse<RatePlanDto>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.approve(id);
    },

    supersede: async (
      payload: SupersedeRatePlanPayload
    ): Promise<IpcResponse<{ oldPlan: RatePlanDto; newPlan: RatePlanDto }>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.supersede(payload);
    },

    cancel: async (
      id: number,
      payload: CancelRatePlanPayload
    ): Promise<IpcResponse<RatePlanDto>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.cancel(id, payload);
    },

    calculatePreview: async (
      payload: CalculateRatePreviewPayload
    ): Promise<IpcResponse<CalculateRatePreviewResult>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.calculatePreview(payload);
    },

    resolveApprovedRate: async (
      payload: ResolveApprovedRatePayload
    ): Promise<IpcResponse<ResolveApprovedRateResult>> => {
      if (!this.api?.ratePlans) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ratePlans.resolveApprovedRate(payload);
    },
  };

  /**
   * Stage 6: Shifts IPC Methods
   */
  public readonly shifts = {
    getCurrent: async (): Promise<IpcResponse<ShiftDto | null>> => {
      if (!this.api?.shifts) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.shifts.getCurrent();
    },

    getById: async (id: number): Promise<IpcResponse<ShiftDto>> => {
      if (!this.api?.shifts) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.shifts.getById(id);
    },

    open: async (payload: OpenShiftPayload): Promise<IpcResponse<ShiftDto>> => {
      if (!this.api?.shifts) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.shifts.open(payload);
    },

    close: async (shiftId: number): Promise<IpcResponse<ShiftDto>> => {
      if (!this.api?.shifts) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.shifts.close(shiftId);
    },

    reopen: async (payload: ReopenShiftPayload): Promise<IpcResponse<ShiftDto>> => {
      if (!this.api?.shifts) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.shifts.reopen(payload);
    },

    getSummary: async (shiftId: number): Promise<IpcResponse<ShiftSummaryDto>> => {
      if (!this.api?.shifts) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.shifts.getSummary(shiftId);
    },
  };

  /**
   * Stage 6: Milk Collections IPC Methods
   */
  public readonly collections = {
    create: async (
      payload: CreateMilkCollectionPayload
    ): Promise<IpcResponse<MilkCollectionDto>> => {
      if (!this.api?.collections) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.collections.create(payload);
    },

    listByShift: async (
      shiftId: number
    ): Promise<IpcResponse<MilkCollectionDto[]>> => {
      if (!this.api?.collections) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.collections.listByShift(shiftId);
    },

    getByReceipt: async (
      receiptNumber: string
    ): Promise<IpcResponse<MilkCollectionDto>> => {
      if (!this.api?.collections) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.collections.getByReceipt(receiptNumber);
    },

    void: async (
      payload: VoidCollectionPayload
    ): Promise<IpcResponse<MilkCollectionDto>> => {
      if (!this.api?.collections) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.collections.void(payload);
    },

    checkDuplicate: async (payload: {
      shiftId: number;
      farmerId: number;
      milkType: RatePlanMilkType;
    }): Promise<IpcResponse<DuplicateCollectionCheckResult>> => {
      if (!this.api?.collections) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.collections.checkDuplicate(payload);
    },
  };

  /**
   * Stage 7: Adjustments & Deductions IPC Methods
   */
  public readonly adjustments = {
    create: async (
      payload: CreateAdjustmentPayload
    ): Promise<IpcResponse<AdjustmentDto>> => {
      if (!this.api?.adjustments) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.adjustments.create(payload);
    },

    list: async (
      filter?: AdjustmentFilter
    ): Promise<IpcResponse<AdjustmentDto[]>> => {
      if (!this.api?.adjustments) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.adjustments.list(filter);
    },

    getById: async (id: number): Promise<IpcResponse<AdjustmentDto>> => {
      if (!this.api?.adjustments) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.adjustments.getById(id);
    },

    void: async (
      payload: VoidAdjustmentPayload
    ): Promise<IpcResponse<AdjustmentDto>> => {
      if (!this.api?.adjustments) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.adjustments.void(payload);
    },
  };

  /**
   * Stage 7: Computed Farmer Ledger IPC Methods
   */
  public readonly ledger = {
    getFarmerLedger: async (
      payload: GetFarmerLedgerPayload
    ): Promise<IpcResponse<LedgerSummaryDto>> => {
      if (!this.api?.ledger) {
        return {
          success: false,
          error: NO_BRIDGE_ERROR,
        };
      }
      return this.api.ledger.getFarmerLedger(payload);
    },
  };

  /**
   * Stage 8: Weekly Settlements IPC Methods
   */
  public readonly settlements = {
    listPeriods: async (): Promise<IpcResponse<SettlementPeriodDto[]>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.listPeriods();
    },

    getPeriod: async (periodId: number): Promise<IpcResponse<SettlementPeriodDto>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.getPeriod(periodId);
    },

    createDraft: async (payload: CreateSettlementDraftPayload): Promise<IpcResponse<SettlementPeriodDto>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.createDraft(payload);
    },

    preview: async (payload: { periodId?: number; periodStart?: string }): Promise<IpcResponse<SettlementPreviewDto>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.preview(payload);
    },

    finalize: async (payload: FinalizeSettlementPayload): Promise<IpcResponse<SettlementPeriodDto>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.finalize(payload);
    },

    cancelDraft: async (payload: CancelSettlementDraftPayload): Promise<IpcResponse<SettlementPeriodDto>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.cancelDraft(payload);
    },

    listFarmerSettlements: async (filter?: { periodId?: number; farmerId?: number; memberCode?: string }): Promise<IpcResponse<WeeklySettlementDto[]>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.listFarmerSettlements(filter);
    },

    getOutstanding: async (farmerId: number): Promise<IpcResponse<FarmerOutstandingDto>> => {
      if (!this.api?.settlements) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.settlements.getOutstanding(farmerId);
    },
  };

  /**
   * Stage 8: Payments IPC Methods
   */
  public readonly payments = {
    list: async (filter?: { farmerId?: number; memberCode?: string; status?: any; fromDate?: string; toDate?: string }): Promise<IpcResponse<PaymentDto[]>> => {
      if (!this.api?.payments) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.payments.list(filter);
    },

    record: async (payload: RecordPaymentPayload): Promise<IpcResponse<PaymentDto>> => {
      if (!this.api?.payments) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.payments.record(payload);
    },

    void: async (payload: VoidPaymentPayload): Promise<IpcResponse<PaymentDto>> => {
      if (!this.api?.payments) {
        return { success: false, error: NO_BRIDGE_ERROR };
      }
      return this.api.payments.void(payload);
    },
  };

  /**
   * Stage 9: Reports IPC Methods
   */
  public readonly reports = {
    getDashboardSummary: async (): Promise<IpcResponse<any>> => {
      if (!this.api?.reports) return { success: false, error: NO_BRIDGE_ERROR };
      return this.api.reports.getDashboardSummary();
    },
    preview: async (payload: any): Promise<IpcResponse<any>> => {
      if (!this.api?.reports) return { success: false, error: NO_BRIDGE_ERROR };
      return this.api.reports.preview(payload);
    },
    exportPdf: async (payload: any): Promise<IpcResponse<any>> => {
      if (!this.api?.reports) return { success: false, error: NO_BRIDGE_ERROR };
      return this.api.reports.exportPdf(payload);
    }
  };
}
