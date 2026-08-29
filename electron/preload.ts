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
};

// Expose safe API to the renderer process
try {
  contextBridge.exposeInMainWorld('dairyApi', dairyApi);
} catch (error) {
  // Graceful fallback for non-isolated test environments
  (window as unknown as { dairyApi: DairyApiBridge }).dairyApi = dairyApi;
}
