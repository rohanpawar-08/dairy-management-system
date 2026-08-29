/**
 * Strongly-Typed IPC Contracts & Domain DTOs
 *
 * All inter-process communication between Angular (renderer) and Electron (main)
 * strictly adheres to these TypeScript interfaces and channel names.
 */

export interface IpcErrorDetails {
  code: string;
  messageMr: string;
  messageEn: string;
  details?: string;
}

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: IpcErrorDetails;
}

export interface PingResult {
  message: string;
  timestamp: string;
  processType: string;
}

export interface AppVersionInfo {
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
}

export interface SqliteSmokeResult {
  ok: boolean;
  version: string;
  queryResult: number;
  database: string;
  timestamp: string;
  migrationVersion: number;
  tablesCount: number;
  migrationOk: boolean;
  stage3?: Stage3SmokeSummary;
  stage4?: Stage4SmokeSummary;
  stage5?: Stage5SmokeSummary;
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

export interface Stage5SmokeSummary {
  zeroSeedPlansConfirmed: boolean;
  cowDraftCreatedOk: boolean;
  buffaloDraftCreatedOk: boolean;
  cowPlanApprovedOk: boolean;
  buffaloPlanApprovedOk: boolean;
  cowCalculation5950PaiseOk: boolean;
  cowPreview50Litres297500PaiseOk: boolean;
  buffaloCalculation9000PaiseOk: boolean;
  buffaloPreview50Litres450000PaiseOk: boolean;
  dateResolutionOk: boolean;
  overlappingApprovalRejected: boolean;
  cloneOk: boolean;
  supersedeOk: boolean;
  oldDateResolvesOldPlanOk: boolean;
  newDateResolvesNewPlanOk: boolean;
  operatorDraftListRejected: boolean;
  operatorMutationRejected: boolean;
  operatorResolveApprovedRateOk: boolean;
  approvedPlanImmutableOk: boolean;
  auditEventsOk: boolean;
  noHardDeleteOk: boolean;
}

// Stage 3 DTOs & Contracts
export type SetupState = 'UNINITIALIZED' | 'READY' | 'INCONSISTENT';

export interface SetupStatusResult {
  state: SetupState;
  dairyProfile: DairyProfileSummary | null;
  hasOwner?: boolean;
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
  defaultMilkType?: 'COW' | 'BUFFALO' | 'BOTH';
  settlementStartDay:
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';
  username?: string;
  password?: string;
  pin?: string;
  ownerPassword?: string;
  ownerPin?: string;
}

export interface DairyProfileSummary {
  id?: number;
  centreName: string;
  registrationCode?: string | null;
  ownerName: string;
  phonePrimary: string;
  phoneSecondary?: string | null;
  addressLine?: string | null;
  taluka?: string | null;
  district?: string | null;
  pincode?: string | null;
  defaultLanguage: string;
  settlementStartDay: string;
  enabledMilkTypes?: 'COW' | 'BUFFALO' | 'BOTH';
  createdAt?: string;
  updatedAt?: string;
}

export type UserRole = 'OWNER' | 'OPERATOR';

export interface AuthSessionDto {
  userId: number;
  username: string;
  fullName: string;
  role: UserRole;
  loginTime?: string;
  expiresAt?: string;
}

export interface LoginPayload {
  username: string;
  password?: string;
  pin?: string;
  type?: 'PASSWORD' | 'PIN';
}

// Stage 4 Farmer DTOs & Contracts
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
  hasFinancialActivity: boolean;
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

// Stage 5 Rate Plan DTOs & Contracts
export type RatePlanMilkType = 'COW' | 'BUFFALO';
export type RatePlanStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';
export type RatePlanPricingBasis = 'PER_PERCENT_POINT_PER_LITRE';
export type RatePlanRoundingMode = 'ROUND_HALF_UP';
export type RatePlanStrategyType = 'FORMULA';

export interface RateFormulaParametersDto {
  fatRatePaisePerPoint: number;
  snfRatePaisePerPoint: number;
  minimumFatX100: number;
  maximumFatX100: number;
  fatStepX100: number;
  minimumSnfX100: number;
  maximumSnfX100: number;
  snfStepX100: number;
}

export interface RatePlanDto {
  id: number;
  planName: string;
  milkType: RatePlanMilkType;
  strategyType: RatePlanStrategyType;
  pricingBasis: RatePlanPricingBasis;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD
  status: RatePlanStatus;
  roundingMode: RatePlanRoundingMode;
  notes: string | null;
  parameters: RateFormulaParametersDto;
  createdByUserId: number;
  createdByName?: string;
  approvedByUserId: number | null;
  approvedByName?: string | null;
  approvedAt: string | null;
  cancelledByUserId: number | null;
  cancelledByName?: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  lifecycleState?: 'CURRENT' | 'UPCOMING' | 'EXPIRED' | 'DRAFT' | 'CANCELLED';
}

export interface RatePlanFilter {
  milkType?: RatePlanMilkType;
  status?: RatePlanStatus | 'ALL';
}

export interface CreateRatePlanDraftPayload {
  planName: string;
  milkType: RatePlanMilkType;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD
  notes?: string | null;
  parameters: RateFormulaParametersDto;
}

export interface UpdateRatePlanDraftPayload {
  planName: string;
  milkType: RatePlanMilkType;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD
  notes?: string | null;
  parameters: RateFormulaParametersDto;
}

export interface CloneRatePlanPayload {
  sourcePlanId: number;
  newPlanName: string;
  newEffectiveFrom: string; // YYYY-MM-DD
  newEffectiveTo?: string | null; // YYYY-MM-DD
  notes?: string | null;
  parameters?: Partial<RateFormulaParametersDto>;
}

export interface ApproveRatePlanPayload {
  planId: number;
}

export interface SupersedeRatePlanPayload {
  oldPlanId: number;
  newPlanId: number;
  newEffectiveFrom: string; // YYYY-MM-DD
}

export interface CancelRatePlanPayload {
  planId: number;
  reason: string;
}

export interface CalculateRatePreviewPayload {
  planId?: number;
  milkType: RatePlanMilkType;
  parameters?: RateFormulaParametersDto;
  fatX100: number;
  snfX100: number;
  quantityMl?: number;
}

export interface CalculateRatePreviewResult {
  valid: boolean;
  ratePaisePerLitre: number;
  amountPaise?: number;
  rateRupeesFormatted: string;
  amountRupeesFormatted?: string;
  error?: string;
  errorMr?: string;
}

export interface ResolveApprovedRatePayload {
  milkType: RatePlanMilkType;
  businessDate: string; // YYYY-MM-DD
  fatX100: number;
  snfX100: number;
  quantityMl?: number;
}

export interface ResolveApprovedRateResult {
  ratePlanId: number;
  planName: string;
  milkType: RatePlanMilkType;
  effectiveFrom: string;
  effectiveTo: string | null;
  ratePaisePerLitre: number;
  amountPaise?: number;
  rateRupeesFormatted: string;
  amountRupeesFormatted?: string;
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
  // Stage 5 Rate Plan Methods
  ratePlans: {
    list: (filter?: RatePlanFilter) => Promise<IpcResponse<RatePlanDto[]>>;
    getById: (id: number) => Promise<IpcResponse<RatePlanDto>>;
    createDraft: (payload: CreateRatePlanDraftPayload) => Promise<IpcResponse<RatePlanDto>>;
    updateDraft: (id: number, payload: UpdateRatePlanDraftPayload) => Promise<IpcResponse<RatePlanDto>>;
    clone: (payload: CloneRatePlanPayload) => Promise<IpcResponse<RatePlanDto>>;
    approve: (id: number) => Promise<IpcResponse<RatePlanDto>>;
    supersede: (payload: SupersedeRatePlanPayload) => Promise<IpcResponse<{ oldPlan: RatePlanDto; newPlan: RatePlanDto }>>;
    cancel: (id: number, payload: CancelRatePlanPayload) => Promise<IpcResponse<RatePlanDto>>;
    calculatePreview: (payload: CalculateRatePreviewPayload) => Promise<IpcResponse<CalculateRatePreviewResult>>;
    resolveApprovedRate: (payload: ResolveApprovedRatePayload) => Promise<IpcResponse<ResolveApprovedRateResult>>;
  };
}
