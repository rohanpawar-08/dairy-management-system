/**
 * Unified response envelope for all IPC communication.
 */
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    messageMr: string;
    messageEn: string;
    details?: unknown;
  };
}

export interface Stage3SmokeSummary {
  setupStatusBefore: string;
  setupStatusAfter: string;
  credentialVerificationOk: boolean;
  ownerLoginOk: boolean;
  sessionIsolationOk: boolean;
  auditEventsOk: boolean;
  logoutOk: boolean;
}

export interface Stage4SmokeSummary {
  farmerCreatedOk: boolean;
  memberCodeLeadingZeroPreserved: boolean;
  searchOk: boolean;
  openingBalanceExactOk: boolean;
  maskingOk: boolean;
  operatorMutationRejected: boolean;
  deactivateOk: boolean;
  activeResolutionBlockedForInactive: boolean;
  auditEventsOk: boolean;
}

/**
 * Result payload from the in-memory/temporary SQLite smoke test query.
 */
export interface SqliteSmokeResult {
  ok: boolean;
  version: string;
  queryResult: number;
  database: string;
  timestamp: string;
  migrationVersion?: number;
  tablesCount?: number;
  migrationOk?: boolean;
  stage3?: Stage3SmokeSummary;
  stage4?: Stage4SmokeSummary;
}

/**
 * Result payload from the IPC ping round trip.
 */
export interface PingResult {
  message: string;
  timestamp: string;
  processType: string;
}

/**
 * Application version metadata.
 */
export interface AppVersionInfo {
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
}

// Stage 3 Setup & Auth DTOs
export type SetupState = 'UNINITIALIZED' | 'READY' | 'INCONSISTENT';

export interface DairyProfileSummary {
  centreName: string;
  registrationCode?: string;
  ownerName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  addressLine?: string;
  taluka?: string;
  district?: string;
  pincode?: string;
  defaultLanguage: 'mr' | 'en';
  settlementStartDay: string;
  enabledMilkTypes?: 'COW' | 'BUFFALO' | 'BOTH';
}

export interface SetupStatusResult {
  state: SetupState;
  dairyProfile: DairyProfileSummary | null;
  message?: string;
}

export interface CompleteSetupPayload {
  centreName: string;
  registrationCode?: string;
  ownerName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  addressLine?: string;
  taluka?: string;
  district?: string;
  pincode?: string;
  defaultLanguage: 'mr' | 'en';
  enabledMilkTypes: 'COW' | 'BUFFALO' | 'BOTH';
  settlementStartDay:
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';
  username: string;
  password: string;
  pin?: string;
}

export type UserRole = 'OWNER' | 'OPERATOR';

export interface AuthSessionDto {
  userId: number;
  username: string;
  fullName: string;
  role: UserRole;
  loginTime: string;
}

export interface LoginPayload {
  username: string;
  password?: string;
  pin?: string;
}

// ============================================================================
// Stage 4: Farmers Domain DTOs and Interfaces
// ============================================================================

export type FarmerMilkType = 'COW' | 'BUFFALO' | 'BOTH';
export type FarmerStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';
export type FarmerMilkFilter = 'COW' | 'BUFFALO' | 'BOTH' | 'ALL';

export type BalanceDirection = 'PAYABLE_TO_FARMER' | 'FARMER_DEBT_TO_DAIRY' | 'NONE';

export interface FarmerFilter {
  search?: string;
  status?: FarmerStatusFilter;
  milkType?: FarmerMilkFilter;
  limit?: number;
  offset?: number;
}

/**
 * List / search DTO with masked bank account and UPI details.
 * Safe for display across all roles (Owner and Operator).
 */
export interface FarmerListDto {
  id: number;
  memberCode: string;
  nameMr: string;
  nameEn: string | null;
  phone: string | null;
  village: string | null;
  maskedBankAccount: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  maskedUpiId: string | null;
  defaultMilkType: FarmerMilkType;
  openingBalancePaise: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detailed DTO for Owner editing view with full unmasked financial details.
 * Strictly forbidden for Operator users.
 */
export interface FarmerDetailDto {
  id: number;
  memberCode: string;
  nameMr: string;
  nameEn: string | null;
  phone: string | null;
  village: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  upiId: string | null;
  defaultMilkType: FarmerMilkType;
  openingBalancePaise: number;
  hasFinancialActivity: boolean; // When true, openingBalancePaise is locked
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFarmerPayload {
  memberCode: string;
  nameMr: string;
  nameEn?: string | null;
  phone?: string | null;
  village?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  defaultMilkType: FarmerMilkType;
  openingBalancePaise: number;
}

export interface UpdateFarmerPayload {
  memberCode: string;
  nameMr: string;
  nameEn?: string | null;
  phone?: string | null;
  village?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  defaultMilkType: FarmerMilkType;
  openingBalancePaise: number;
}

export interface DeactivateFarmerPayload {
  reason?: string;
}

/**
 * Strictly allowlisted IPC Channel Identifiers.
 */
export const IPC_CHANNELS = {
  PING: 'dairy:ping',
  SQLITE_SMOKE: 'dairy:sqlite-smoke',
  APP_VERSION: 'dairy:app-version',
  // Stage 3 Channels
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
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * Strongly typed interface for the preload bridge exposed on `window.dairyApi`.
 */
export interface DairyApiBridge {
  ping: () => Promise<IpcResponse<PingResult>>;
  smokeSqlite: () => Promise<IpcResponse<SqliteSmokeResult>>;
  getAppVersion: () => Promise<IpcResponse<AppVersionInfo>>;
  // Stage 3 Methods
  getSetupStatus: () => Promise<IpcResponse<SetupStatusResult>>;
  completeSetup: (payload: CompleteSetupPayload) => Promise<IpcResponse<DairyProfileSummary>>;
  login: (payload: LoginPayload) => Promise<IpcResponse<AuthSessionDto>>;
  logout: () => Promise<IpcResponse<{ success: boolean }>>;
  getSession: () => Promise<IpcResponse<AuthSessionDto | null>>;
  getProfile: () => Promise<IpcResponse<DairyProfileSummary>>;
  // Stage 4 Farmer Methods
  farmers: {
    list: (filter?: FarmerFilter) => Promise<IpcResponse<FarmerListDto[]>>;
    getById: (id: number) => Promise<IpcResponse<FarmerListDto>>;
    getByCode: (code: string, activeOnly?: boolean) => Promise<IpcResponse<FarmerListDto>>;
    getEditDetail: (id: number) => Promise<IpcResponse<FarmerDetailDto>>;
    create: (payload: CreateFarmerPayload) => Promise<IpcResponse<FarmerListDto>>;
    update: (id: number, payload: UpdateFarmerPayload) => Promise<IpcResponse<FarmerListDto>>;
    deactivate: (id: number, payload?: DeactivateFarmerPayload) => Promise<IpcResponse<FarmerListDto>>;
    reactivate: (id: number) => Promise<IpcResponse<FarmerListDto>>;
  };
}
