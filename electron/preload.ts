import { contextBridge, ipcRenderer } from 'electron';
import type {
  DairyApiBridge,
  IpcResponse,
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
  ExecuteRestorePayload,
} from '../shared/ipc-contracts';

// Inlined channel constants so preload is completely self-contained in sandboxed renderer
const CHANNELS = {
  PING: 'dairy:ping',
  SQLITE_SMOKE: 'dairy:sqlite-smoke',
  APP_VERSION: 'dairy:app-version',
  SETUP_GET_STATUS: 'setup:get-status',
  SETUP_COMPLETE: 'setup:complete',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_SESSION: 'auth:get-session',
  PROFILE_GET: 'profile:get',
  // Stage 4 Farmer Channels
  FARMER_LIST: 'dairy:farmer:list',
  FARMER_GET: 'dairy:farmer:get',
  FARMER_GET_BY_CODE: 'dairy:farmer:get-by-code',
  FARMER_GET_EDIT_DETAIL: 'dairy:farmer:get-edit-detail',
  FARMER_CREATE: 'dairy:farmer:create',
  FARMER_UPDATE: 'dairy:farmer:update',
  FARMER_DEACTIVATE: 'dairy:farmer:deactivate',
  FARMER_REACTIVATE: 'dairy:farmer:reactivate',
  // Stage 5 Rate Plan Channels
  RATE_PLAN_LIST: 'dairy:rate-plan:list',
  RATE_PLAN_GET: 'dairy:rate-plan:get',
  RATE_PLAN_CREATE_DRAFT: 'dairy:rate-plan:create-draft',
  RATE_PLAN_UPDATE_DRAFT: 'dairy:rate-plan:update-draft',
  RATE_PLAN_CLONE: 'dairy:rate-plan:clone',
  RATE_PLAN_APPROVE: 'dairy:rate-plan:approve',
  RATE_PLAN_SUPERSEDE: 'dairy:rate-plan:supersede',
  RATE_PLAN_CANCEL: 'dairy:rate-plan:cancel',
  RATE_PLAN_CALCULATE_PREVIEW: 'dairy:rate-plan:calculate-preview',
  RATE_PLAN_RESOLVE_APPROVED_RATE: 'dairy:rate-plan:resolve-approved-rate',
  // Stage 6 Shift & Collection Channels
  SHIFT_GET_CURRENT: 'dairy:shift:get-current',
  SHIFT_GET_BY_ID: 'dairy:shift:get-by-id',
  SHIFT_OPEN: 'dairy:shift:open',
  SHIFT_CLOSE: 'dairy:shift:close',
  SHIFT_REOPEN: 'dairy:shift:reopen',
  SHIFT_GET_SUMMARY: 'dairy:shift:get-summary',
  COLLECTION_CREATE: 'dairy:collection:create',
  COLLECTION_LIST_BY_SHIFT: 'dairy:collection:list-by-shift',
  COLLECTION_GET_BY_RECEIPT: 'dairy:collection:get-by-receipt',
  COLLECTION_VOID: 'dairy:collection:void',
  COLLECTION_CHECK_DUPLICATE: 'dairy:collection:check-duplicate',
  // Stage 7 Adjustment & Ledger Channels
  ADJUSTMENT_CREATE: 'dairy:adjustment:create',
  ADJUSTMENT_LIST: 'dairy:adjustment:list',
  ADJUSTMENT_GET: 'dairy:adjustment:get',
  ADJUSTMENT_VOID: 'dairy:adjustment:void',
  LEDGER_GET_FARMER: 'dairy:ledger:get-farmer',
  // Stage 8 Settlement & Payment Channels
  SETTLEMENT_LIST_PERIODS: 'dairy:settlement:list-periods',
  SETTLEMENT_GET_PERIOD: 'dairy:settlement:get-period',
  SETTLEMENT_CREATE_DRAFT: 'dairy:settlement:create-draft',
  SETTLEMENT_PREVIEW: 'dairy:settlement:preview',
  SETTLEMENT_FINALIZE: 'dairy:settlement:finalize',
  SETTLEMENT_CANCEL_DRAFT: 'dairy:settlement:cancel-draft',
  SETTLEMENT_LIST_FARMER_SETTLEMENTS: 'dairy:settlement:list-farmer-settlements',
  SETTLEMENT_GET_OUTSTANDING: 'dairy:settlement:get-outstanding',
  PAYMENT_LIST: 'dairy:payment:list',
  PAYMENT_RECORD: 'dairy:payment:record',
  PAYMENT_VOID: 'dairy:payment:void',
  // Stage 9 Report Channels
  REPORT_DASHBOARD_SUMMARY: 'dairy:report:dashboard-summary',
  REPORT_PREVIEW: 'dairy:report:preview',
  REPORT_EXPORT_PDF: 'dairy:report:export-pdf',
  // Stage 10 Backup & Restore Channels
  BACKUP_CREATE: 'dairy:backup:create',
  BACKUP_GET_HISTORY: 'dairy:backup:get-history',
  BACKUP_SELECT_DESTINATION: 'dairy:backup:select-destination',
  RESTORE_SELECT_CANDIDATE: 'dairy:restore:select-candidate',
  RESTORE_EXECUTE: 'dairy:restore:execute',
} as const;

/**
 * Preload Script exposing the allowlisted `window.dairyApi` bridge.
 * Renderer isolation is strictly maintained: no Node.js APIs or raw ipcRenderer methods are exposed.
 */
const dairyApi: DairyApiBridge = {
  ping: (): Promise<IpcResponse<PingResult>> => {
    return ipcRenderer.invoke(CHANNELS.PING);
  },

  smokeSqlite: (): Promise<IpcResponse<SqliteSmokeResult>> => {
    return ipcRenderer.invoke(CHANNELS.SQLITE_SMOKE);
  },

  getAppVersion: (): Promise<IpcResponse<AppVersionInfo>> => {
    return ipcRenderer.invoke(CHANNELS.APP_VERSION);
  },

  getSetupStatus: (): Promise<IpcResponse<SetupStatusResult>> => {
    return ipcRenderer.invoke(CHANNELS.SETUP_GET_STATUS);
  },

  completeSetup: (payload: CompleteSetupPayload): Promise<IpcResponse<DairyProfileSummary>> => {
    return ipcRenderer.invoke(CHANNELS.SETUP_COMPLETE, payload);
  },

  login: (payload: LoginPayload): Promise<IpcResponse<AuthSessionDto>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_LOGIN, payload);
  },

  logout: (): Promise<IpcResponse<{ success: boolean }>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_LOGOUT);
  },

  getSession: (): Promise<IpcResponse<AuthSessionDto | null>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_GET_SESSION);
  },

  getProfile: (): Promise<IpcResponse<DairyProfileSummary>> => {
    return ipcRenderer.invoke(CHANNELS.PROFILE_GET);
  },

  farmers: {
    list: (filter?: FarmerFilter): Promise<IpcResponse<FarmerListDto[]>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_LIST, filter);
    },

    getById: (id: number): Promise<IpcResponse<FarmerListDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_GET, id);
    },

    getByCode: (code: string, activeOnly?: boolean): Promise<IpcResponse<FarmerListDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_GET_BY_CODE, code, activeOnly);
    },

    getEditDetail: (id: number): Promise<IpcResponse<FarmerDetailDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_GET_EDIT_DETAIL, id);
    },

    create: (payload: CreateFarmerPayload): Promise<IpcResponse<FarmerListDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_CREATE, payload);
    },

    update: (id: number, payload: UpdateFarmerPayload): Promise<IpcResponse<FarmerListDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_UPDATE, id, payload);
    },

    deactivate: (id: number, payload?: DeactivateFarmerPayload): Promise<IpcResponse<FarmerListDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_DEACTIVATE, id, payload);
    },

    reactivate: (id: number): Promise<IpcResponse<FarmerListDto>> => {
      return ipcRenderer.invoke(CHANNELS.FARMER_REACTIVATE, id);
    },
  },

  ratePlans: {
    list: (filter?: RatePlanFilter): Promise<IpcResponse<RatePlanDto[]>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_LIST, filter);
    },

    getById: (id: number): Promise<IpcResponse<RatePlanDto>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_GET, id);
    },

    createDraft: (payload: CreateRatePlanDraftPayload): Promise<IpcResponse<RatePlanDto>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_CREATE_DRAFT, payload);
    },

    updateDraft: (id: number, payload: UpdateRatePlanDraftPayload): Promise<IpcResponse<RatePlanDto>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_UPDATE_DRAFT, id, payload);
    },

    clone: (payload: CloneRatePlanPayload): Promise<IpcResponse<RatePlanDto>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_CLONE, payload);
    },

    approve: (id: number): Promise<IpcResponse<RatePlanDto>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_APPROVE, { planId: id });
    },

    supersede: (payload: SupersedeRatePlanPayload): Promise<IpcResponse<{ oldPlan: RatePlanDto; newPlan: RatePlanDto }>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_SUPERSEDE, payload);
    },

    cancel: (id: number, payload: CancelRatePlanPayload): Promise<IpcResponse<RatePlanDto>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_CANCEL, { planId: id, reason: payload.reason });
    },

    calculatePreview: (payload: CalculateRatePreviewPayload): Promise<IpcResponse<CalculateRatePreviewResult>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_CALCULATE_PREVIEW, payload);
    },

    resolveApprovedRate: (payload: ResolveApprovedRatePayload): Promise<IpcResponse<ResolveApprovedRateResult>> => {
      return ipcRenderer.invoke(CHANNELS.RATE_PLAN_RESOLVE_APPROVED_RATE, payload);
    },
  },

  shifts: {
    getCurrent: (): Promise<IpcResponse<ShiftDto | null>> => {
      return ipcRenderer.invoke(CHANNELS.SHIFT_GET_CURRENT);
    },

    getById: (id: number): Promise<IpcResponse<ShiftDto>> => {
      return ipcRenderer.invoke(CHANNELS.SHIFT_GET_BY_ID, id);
    },

    open: (payload: OpenShiftPayload): Promise<IpcResponse<ShiftDto>> => {
      return ipcRenderer.invoke(CHANNELS.SHIFT_OPEN, payload);
    },

    close: (shiftId: number): Promise<IpcResponse<ShiftDto>> => {
      return ipcRenderer.invoke(CHANNELS.SHIFT_CLOSE, shiftId);
    },

    reopen: (payload: ReopenShiftPayload): Promise<IpcResponse<ShiftDto>> => {
      return ipcRenderer.invoke(CHANNELS.SHIFT_REOPEN, payload);
    },

    getSummary: (shiftId: number): Promise<IpcResponse<ShiftSummaryDto>> => {
      return ipcRenderer.invoke(CHANNELS.SHIFT_GET_SUMMARY, shiftId);
    },
  },

  collections: {
    create: (payload: CreateMilkCollectionPayload): Promise<IpcResponse<MilkCollectionDto>> => {
      return ipcRenderer.invoke(CHANNELS.COLLECTION_CREATE, payload);
    },

    listByShift: (shiftId: number): Promise<IpcResponse<MilkCollectionDto[]>> => {
      return ipcRenderer.invoke(CHANNELS.COLLECTION_LIST_BY_SHIFT, shiftId);
    },

    getByReceipt: (receiptNumber: string): Promise<IpcResponse<MilkCollectionDto>> => {
      return ipcRenderer.invoke(CHANNELS.COLLECTION_GET_BY_RECEIPT, receiptNumber);
    },

    void: (payload: VoidCollectionPayload): Promise<IpcResponse<MilkCollectionDto>> => {
      return ipcRenderer.invoke(CHANNELS.COLLECTION_VOID, payload);
    },

    checkDuplicate: (payload: { shiftId: number; farmerId: number; milkType: RatePlanMilkType }): Promise<IpcResponse<DuplicateCollectionCheckResult>> => {
      return ipcRenderer.invoke(CHANNELS.COLLECTION_CHECK_DUPLICATE, payload);
    },
  },

  adjustments: {
    create: (payload: CreateAdjustmentPayload): Promise<IpcResponse<AdjustmentDto>> => {
      return ipcRenderer.invoke(CHANNELS.ADJUSTMENT_CREATE, payload);
    },

    list: (filter?: AdjustmentFilter): Promise<IpcResponse<AdjustmentDto[]>> => {
      return ipcRenderer.invoke(CHANNELS.ADJUSTMENT_LIST, filter);
    },

    getById: (id: number): Promise<IpcResponse<AdjustmentDto>> => {
      return ipcRenderer.invoke(CHANNELS.ADJUSTMENT_GET, id);
    },

    void: (payload: VoidAdjustmentPayload): Promise<IpcResponse<AdjustmentDto>> => {
      return ipcRenderer.invoke(CHANNELS.ADJUSTMENT_VOID, payload);
    },
  },

  ledger: {
    getFarmerLedger: (payload: GetFarmerLedgerPayload): Promise<IpcResponse<LedgerSummaryDto>> => {
      return ipcRenderer.invoke(CHANNELS.LEDGER_GET_FARMER, payload);
    },
  },

  settlements: {
    listPeriods: () => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_LIST_PERIODS);
    },
    getPeriod: (periodId: number) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_GET_PERIOD, periodId);
    },
    createDraft: (payload: any) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_CREATE_DRAFT, payload);
    },
    preview: (payload: any) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_PREVIEW, payload);
    },
    finalize: (payload: any) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_FINALIZE, payload);
    },
    cancelDraft: (payload: any) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_CANCEL_DRAFT, payload);
    },
    listFarmerSettlements: (filter?: any) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_LIST_FARMER_SETTLEMENTS, filter);
    },
    getOutstanding: (farmerId: number) => {
      return ipcRenderer.invoke(CHANNELS.SETTLEMENT_GET_OUTSTANDING, farmerId);
    },
  },

  payments: {
    list: (filter?: any) => {
      return ipcRenderer.invoke(CHANNELS.PAYMENT_LIST, filter);
    },
    record: (payload: any) => {
      return ipcRenderer.invoke(CHANNELS.PAYMENT_RECORD, payload);
    },
    void: (payload: any) => {
      return ipcRenderer.invoke(CHANNELS.PAYMENT_VOID, payload);
    },
  },
  reports: {
    getDashboardSummary: () => ipcRenderer.invoke(CHANNELS.REPORT_DASHBOARD_SUMMARY),
    preview: (payload: any) => ipcRenderer.invoke(CHANNELS.REPORT_PREVIEW, payload),
    exportPdf: (payload: any) => ipcRenderer.invoke(CHANNELS.REPORT_EXPORT_PDF, payload),
  },
  // Stage 10 Backup & Restore Methods
  backup: {
    create: () => ipcRenderer.invoke(CHANNELS.BACKUP_CREATE),
    getHistory: (limit?: number) => ipcRenderer.invoke(CHANNELS.BACKUP_GET_HISTORY, limit),
    selectDestination: () => ipcRenderer.invoke(CHANNELS.BACKUP_SELECT_DESTINATION),
  },
  restore: {
    selectCandidate: () => ipcRenderer.invoke(CHANNELS.RESTORE_SELECT_CANDIDATE),
    execute: (payload: ExecuteRestorePayload) => ipcRenderer.invoke(CHANNELS.RESTORE_EXECUTE, payload),
  },
};

// Expose safe API to the renderer process
try {
  contextBridge.exposeInMainWorld('dairyApi', dairyApi);
} catch (error) {
  // Graceful fallback for non-isolated test environments
  (window as unknown as { dairyApi: DairyApiBridge }).dairyApi = dairyApi;
}
