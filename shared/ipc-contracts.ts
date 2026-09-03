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
  stage6?: Stage6SmokeSummary;
  stage7?: Stage7SmokeSummary;
  stage8?: Stage8SmokeSummary;
  stage9?: Stage9SmokeSummary;
  stage10?: Stage10SmokeSummary;
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
  RATE_PLAN_CLONED: 'dairy:rate-plan:clone',
  RATE_PLAN_CLONE: 'dairy:rate-plan:clone',
  RATE_PLAN_APPROVE: 'dairy:rate-plan:approve',
  RATE_PLAN_SUPERSEDE: 'dairy:rate-plan:supersede',
  RATE_PLAN_CANCEL: 'dairy:rate-plan:cancel',
  RATE_PLAN_CALCULATE_PREVIEW: 'dairy:rate-plan:calculate-preview',
  RATE_PLAN_RESOLVE_APPROVED_RATE: 'dairy:rate-plan:resolve-approved-rate',
  // Stage 6 Shift & Milk Collection Channels
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
  BACKUP_GET_USB_DRIVES: 'dairy:backup:get-usb-drives',
  BACKUP_CREATE_USB: 'dairy:backup:create-usb',
  BACKUP_GET_SCHEDULE: 'dairy:backup:get-schedule',
  BACKUP_UPDATE_SCHEDULE: 'dairy:backup:update-schedule',
  RESTORE_SELECT_CANDIDATE: 'dairy:restore:select-candidate',
  RESTORE_EXECUTE: 'dairy:restore:execute',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// Stage 6 Shift & Collection Types and DTOs
export type ShiftType = 'MORNING' | 'EVENING';
export type ShiftStatus = 'OPEN' | 'LOCKED';

export interface ShiftDto {
  id: number;
  businessDate: string; // YYYY-MM-DD
  shiftType: ShiftType;
  status: ShiftStatus;
  openedByUserId: number;
  openedByName: string;
  openedAt: string;
  closedByUserId: number | null;
  closedByName: string | null;
  closedAt: string | null;
  reopenedByUserId: number | null;
  reopenedByName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  reopenCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftReadinessDto {
  hasActiveCowPlan: boolean;
  activeCowPlanName: string | null;
  hasActiveBuffaloPlan: boolean;
  activeBuffaloPlanName: string | null;
  warnings: string[];
}

export interface ShiftSummaryDto {
  shiftId: number;
  businessDate: string;
  shiftType: ShiftType;
  status: ShiftStatus;
  totalActiveCollections: number;
  uniqueFarmersCount: number;
  cowQuantityMl: number;
  cowAmountPaise: number;
  buffaloQuantityMl: number;
  buffaloAmountPaise: number;
  totalQuantityMl: number;
  totalAmountPaise: number;
  totalVoidedCollections: number;
  cowLitresFormatted: string;
  cowAmountFormatted: string;
  buffaloLitresFormatted: string;
  buffaloAmountFormatted: string;
  totalLitresFormatted: string;
  totalAmountFormatted: string;
  readiness?: ShiftReadinessDto;
}

export interface OpenShiftPayload {
  businessDate: string; // YYYY-MM-DD
  shiftType: ShiftType;
  notes?: string | null;
}

export interface ReopenShiftPayload {
  shiftId: number;
  reason: string;
}

export type MilkCollectionStatus = 'ACTIVE' | 'VOIDED';
export type DuplicateReason = 'SECOND_CAN' | 'RETEST' | 'CORRECTION' | 'OTHER';

export interface MilkCollectionDto {
  id: number;
  receiptNumber: string;
  shiftId: number;
  farmerId: number;
  farmerMemberCode: string;
  farmerNameMr: string;
  farmerNameEn: string | null;
  businessDate: string;
  shiftType: ShiftType;
  milkType: RatePlanMilkType;
  quantityMl: number;
  quantityLitresFormatted: string;
  fatX100: number;
  fatFormatted: string;
  snfX100: number;
  snfFormatted: string;
  ratePlanId: number;
  ratePlanName: string;
  rateAppliedPaise: number;
  rateRupeesFormatted: string;
  amountPaise: number;
  amountRupeesFormatted: string;
  duplicateConfirmed: boolean;
  duplicateReason: string | null;
  status: MilkCollectionStatus;
  voidedAt: string | null;
  voidedByUserId: number | null;
  voidedByName: string | null;
  voidReason: string | null;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilkCollectionPayload {
  shiftId: number;
  farmerId?: number;
  memberCode?: string;
  milkType: RatePlanMilkType;
  quantityLitres: string | number;
  fatPercent: string | number;
  snfPercent: string | number;
  duplicateConfirmed?: boolean;
  duplicateReason?: string | null;
}

export interface ExistingCollectionSummary {
  id: number;
  receiptNumber: string;
  milkType: RatePlanMilkType;
  quantityMl: number;
  quantityLitresFormatted: string;
  fatX100: number;
  snfX100: number;
  amountPaise: number;
  createdAt: string;
}

export interface DuplicateCollectionCheckResult {
  isDuplicate: boolean;
  existingCollections: ExistingCollectionSummary[];
}

export interface VoidCollectionPayload {
  collectionId: number;
  reason: string;
}

export interface MilkCollectionFilter {
  shiftId?: number;
  farmerId?: number;
  businessDate?: string;
  status?: MilkCollectionStatus;
  milkType?: RatePlanMilkType;
}

export interface Stage6SmokeSummary {
  migrationVersion4Ok: boolean;
  tablesCount11Ok: boolean;
  zeroCollectionsInitially: boolean;
  indiaBusinessDateOk: boolean;
  morningShiftOpened: boolean;
  secondOpenShiftRejected: boolean;
  activeFarmerResolved: boolean;
  inactiveFarmerRejected: boolean;
  bothFarmerRequiresMilkTypeSelection: boolean;
  disabledMilkTypeRejected: boolean;
  cowCollectionCreated: boolean;
  buffaloCollectionCreated: boolean;
  exactCowRateSnapshotOk: boolean;
  exactBuffaloRateSnapshotOk: boolean;
  receiptSequenceOk: boolean;
  receiptRollbackDoesNotConsumeNumber: boolean;
  duplicateBlockedBeforeConfirmation: boolean;
  confirmedDuplicateCreatedSeparately: boolean;
  duplicateAuditOk: boolean;
  shiftSummaryOk: boolean;
  shiftClosedAndLocked: boolean;
  collectionRejectedAfterClose: boolean;
  operatorReopenRejected: boolean;
  ownerReopenOk: boolean;
  oldSnapshotUnchangedAfterRateSupersede: boolean;
  newCollectionUsesNewPlan: boolean;
  operatorVoidRejected: boolean;
  settlementLinkedVoidRejected: boolean;
  ownerVoidOk: boolean;
  voidExcludedFromTotals: boolean;
  auditEventsOk: boolean;
  noHardDeleteOk: boolean;
}

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
  // Stage 6 Shift & Collection Methods
  shifts: {
    getCurrent: () => Promise<IpcResponse<ShiftDto | null>>;
    getById: (id: number) => Promise<IpcResponse<ShiftDto>>;
    open: (payload: OpenShiftPayload) => Promise<IpcResponse<ShiftDto>>;
    close: (shiftId: number) => Promise<IpcResponse<ShiftDto>>;
    reopen: (payload: ReopenShiftPayload) => Promise<IpcResponse<ShiftDto>>;
    getSummary: (shiftId: number) => Promise<IpcResponse<ShiftSummaryDto>>;
  };
  collections: {
    create: (payload: CreateMilkCollectionPayload) => Promise<IpcResponse<MilkCollectionDto>>;
    listByShift: (shiftId: number) => Promise<IpcResponse<MilkCollectionDto[]>>;
    getByReceipt: (receiptNumber: string) => Promise<IpcResponse<MilkCollectionDto>>;
    void: (payload: VoidCollectionPayload) => Promise<IpcResponse<MilkCollectionDto>>;
    checkDuplicate: (payload: { shiftId: number; farmerId: number; milkType: RatePlanMilkType }) => Promise<IpcResponse<DuplicateCollectionCheckResult>>;
  };
  // Stage 7 Adjustment & Ledger Methods
  adjustments: {
    create: (payload: CreateAdjustmentPayload) => Promise<IpcResponse<AdjustmentDto>>;
    list: (filter?: AdjustmentFilter) => Promise<IpcResponse<AdjustmentDto[]>>;
    getById: (id: number) => Promise<IpcResponse<AdjustmentDto>>;
    void: (payload: VoidAdjustmentPayload) => Promise<IpcResponse<AdjustmentDto>>;
  };
  ledger: {
    getFarmerLedger: (payload: GetFarmerLedgerPayload) => Promise<IpcResponse<LedgerSummaryDto>>;
  };
  // Stage 8 Settlement & Payment Methods
  settlements: {
    listPeriods: () => Promise<IpcResponse<SettlementPeriodDto[]>>;
    getPeriod: (periodId: number) => Promise<IpcResponse<SettlementPeriodDto>>;
    createDraft: (payload: CreateSettlementDraftPayload) => Promise<IpcResponse<SettlementPeriodDto>>;
    preview: (payload: { periodId?: number; periodStart?: string }) => Promise<IpcResponse<SettlementPreviewDto>>;
    finalize: (payload: FinalizeSettlementPayload) => Promise<IpcResponse<SettlementPeriodDto>>;
    cancelDraft: (payload: CancelSettlementDraftPayload) => Promise<IpcResponse<SettlementPeriodDto>>;
    listFarmerSettlements: (filter?: { periodId?: number; farmerId?: number; memberCode?: string }) => Promise<IpcResponse<WeeklySettlementDto[]>>;
    getOutstanding: (farmerId: number) => Promise<IpcResponse<FarmerOutstandingDto>>;
  };
  payments: {
    list: (filter?: { farmerId?: number; memberCode?: string; status?: PaymentStatus; fromDate?: string; toDate?: string }) => Promise<IpcResponse<PaymentDto[]>>;
    record: (payload: RecordPaymentPayload) => Promise<IpcResponse<PaymentDto>>;
    void: (payload: VoidPaymentPayload) => Promise<IpcResponse<PaymentDto>>;
  };
  // Stage 9 Report Methods
  reports: {
    getDashboardSummary: () => Promise<IpcResponse<DashboardSummaryDto>>;
    preview: (payload: ReportPreviewRequest) => Promise<IpcResponse<ReportPreviewResult>>;
    exportPdf: (payload: PdfExportRequest) => Promise<IpcResponse<PdfExportResult>>;
  };
  // Stage 10 Backup & Restore Methods
  backup: {
    create: () => Promise<IpcResponse<BackupResultDto>>;
    getHistory: (limit?: number) => Promise<IpcResponse<BackupHistoryItemDto[]>>;
    selectDestination: () => Promise<IpcResponse<BackupDestinationDto>>;
    getUsbDrives: () => Promise<IpcResponse<DetectedUsbDriveDto[]>>;
    createUsbBackup: (payload: CreateUsbBackupPayload) => Promise<IpcResponse<BackupResultDto>>;
    getSchedule: () => Promise<IpcResponse<BackupScheduleDto>>;
    updateSchedule: (payload: UpdateBackupSchedulePayload) => Promise<IpcResponse<BackupScheduleDto>>;
  };
  restore: {
    selectCandidate: () => Promise<IpcResponse<RestoreCandidateDto>>;
    execute: (payload: ExecuteRestorePayload) => Promise<IpcResponse<RestoreResultDto>>;
  };
}

// Stage 7 Adjustment & Ledger DTOs & Contracts
export type AdjustmentEntryType = 'ADVANCE' | 'DEDUCTION' | 'CREDIT';
export type AdjustmentCategory =
  | 'CASH_ADVANCE'
  | 'CATTLE_FEED'
  | 'MEDICINE'
  | 'LOAN_RECOVERY'
  | 'EQUIPMENT'
  | 'OTHER_DEDUCTION'
  | 'BONUS'
  | 'PRICE_CORRECTION'
  | 'OTHER_CREDIT';

export type AdjustmentStatus = 'ACTIVE' | 'VOIDED';

export interface AdjustmentDto {
  id: number;
  referenceNumber: string;
  farmerId: number;
  farmerMemberCode: string;
  farmerNameMr: string;
  farmerNameEn: string | null;
  businessDate: string; // YYYY-MM-DD
  entryType: AdjustmentEntryType;
  category: AdjustmentCategory;
  categoryLabelMr: string;
  categoryLabelEn: string;
  amountPaise: number;
  amountRupeesFormatted: string;
  reason: string;
  notes: string | null;
  status: AdjustmentStatus;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  voidedByUserId: number | null;
  voidedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  updatedAt: string;
}

export interface CreateAdjustmentPayload {
  farmerId?: number;
  memberCode?: string;
  businessDate?: string; // YYYY-MM-DD
  entryType: AdjustmentEntryType;
  category: AdjustmentCategory;
  amountRupees: string | number;
  reason: string;
  notes?: string | null;
}

export interface VoidAdjustmentPayload {
  adjustmentId: number;
  reason: string;
}

export interface AdjustmentFilter {
  farmerId?: number;
  memberCode?: string;
  entryType?: AdjustmentEntryType;
  status?: AdjustmentStatus;
  fromDate?: string;
  toDate?: string;
}

export type LedgerSourceType = 'OPENING_BALANCE' | 'MILK_COLLECTION' | 'CREDIT' | 'DEDUCTION' | 'ADVANCE';

export interface LedgerItemDto {
  id: string; // e.g. "OB-1", "MC-101", "ADJ-201"
  sourceType: LedgerSourceType;
  sourceId: number;
  referenceNumber: string;
  businessDate: string; // YYYY-MM-DD
  description: string;
  creditPaise: number;
  debitPaise: number;
  signedAmountPaise: number; // + for credit to farmer, - for debit from farmer
  runningBalancePaise: number;
  status: 'ACTIVE' | 'VOIDED';
  createdAt: string;
  isVoided?: boolean;
}

export interface LedgerSummaryDto {
  farmerId: number;
  memberCode: string;
  farmerNameMr: string;
  farmerNameEn: string | null;
  isActive: boolean;
  openingBalancePaise: number;
  openingBalanceFormatted: string;
  milkCreditsPaise: number;
  milkCreditsFormatted: string;
  adjustmentCreditsPaise: number;
  adjustmentCreditsFormatted: string;
  deductionsPaise: number;
  deductionsFormatted: string;
  advancesPaise: number;
  advancesFormatted: string;
  netMovementPaise: number;
  netMovementFormatted: string;
  currentBalancePaise: number;
  currentBalanceFormatted: string;
  balanceDirection: BalanceDirection;
  broughtForwardBalancePaise: number;
  broughtForwardBalanceFormatted: string;
  fromDate: string | null;
  toDate: string | null;
  asOfDate: string;
  items: LedgerItemDto[];
}

export interface GetFarmerLedgerPayload {
  farmerId?: number;
  memberCode?: string;
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  includeVoided?: boolean;
}

export interface Stage7SmokeSummary {
  migrationVersion5Ok: boolean;
  tablesCount12Ok: boolean;
  zeroAdjustmentsInitially: boolean;
  positiveOpeningBalanceOk: boolean;
  negativeOpeningBalanceOk: boolean;
  milkCollectionCreditIncluded: boolean;
  ownerAdvanceCreated: boolean;
  ownerDeductionCreated: boolean;
  ownerCreditCreated: boolean;
  adjustmentReferenceSequenceOk: boolean;
  referenceRollbackDoesNotConsumeNumber: boolean;
  computedBalanceExact: boolean;
  runningBalanceExact: boolean;
  operatorLedgerViewAllowed: boolean;
  operatorMutationRejected: boolean;
  unauthenticatedRejected: boolean;
  inactiveFarmerLedgerAllowed: boolean;
  inactiveFarmerMutationRejected: boolean;
  adjustmentVoidOk: boolean;
  voidExcludedFromBalance: boolean;
  hardDeleteRejected: boolean;
  immutableUpdateRejected: boolean;
  auditEventsOk: boolean;
  auditRollbackOk: boolean;
}

// Stage 8 Settlement & Payment DTOs & Contracts
export type SettlementPeriodStatus = 'DRAFT' | 'FINALIZED' | 'CANCELLED';

export interface SettlementPeriodDto {
  id: number;
  settlementNumber: string;
  periodStart: string;
  periodEnd: string;
  status: SettlementPeriodStatus;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  finalizedByUserId: number | null;
  finalizedByName: string | null;
  finalizedAt: string | null;
  cancelledByUserId: number | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  updatedAt: string;
  settlementsCount?: number;
  totalNetAmountPaise?: number;
}

export interface CreateSettlementDraftPayload {
  periodStart: string;
}

export interface CancelSettlementDraftPayload {
  periodId: number;
  reason: string;
}

export interface FinalizeSettlementPayload {
  periodId: number;
}

export interface SettlementPreviewItemDto {
  farmerId: number;
  memberCode: string;
  farmerNameMr: string;
  farmerNameEn: string | null;
  openingBalancePaise: number;
  milkQuantityMl: number;
  milkCollectionCount: number;
  milkAmountPaise: number;
  creditAmountPaise: number;
  deductionAmountPaise: number;
  advanceAmountPaise: number;
  netAmountPaise: number;
  openingBalanceIncluded: boolean;
}

export interface SettlementPreviewDto {
  periodStart: string;
  periodEnd: string;
  configuredStartDay: string;
  eligibleFarmerCount: number;
  milkCollectionCount: number;
  totalMilkQuantityMl: number;
  totalMilkAmountPaise: number;
  totalCreditsPaise: number;
  totalDeductionsPaise: number;
  totalAdvancesPaise: number;
  totalNetPaise: number;
  farmerItems: SettlementPreviewItemDto[];
  warnings: string[];
  hasPriorUnsettledActivity: boolean;
}

export interface WeeklySettlementDto {
  id: number;
  settlementPeriodId: number;
  farmerId: number;
  memberCodeSnapshot: string;
  farmerNameMrSnapshot: string;
  farmerNameEnSnapshot: string | null;
  openingBalancePaise: number;
  milkQuantityMl: number;
  milkCollectionCount: number;
  milkAmountPaise: number;
  creditAmountPaise: number;
  deductionAmountPaise: number;
  advanceAmountPaise: number;
  netAmountPaise: number;
  createdAt: string;
  allocatedPaymentPaise?: number;
  outstandingAmountPaise?: number;
}

export type SettlementItemSourceType = 'OPENING_BALANCE' | 'MILK_COLLECTION' | 'ADJUSTMENT';

export interface SettlementItemDto {
  id: number;
  weeklySettlementId: number;
  sourceType: SettlementItemSourceType;
  sourceId: number;
  businessDate: string | null;
  referenceNumber: string;
  signedAmountPaise: number;
  createdAt: string;
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'OTHER';
export type PaymentStatus = 'RECORDED' | 'VOIDED';

export interface PaymentDto {
  id: number;
  paymentNumber: string;
  farmerId: number;
  farmerMemberCode: string;
  farmerNameMr: string;
  farmerNameEn: string | null;
  businessDate: string;
  amountPaise: number;
  paymentMethod: PaymentMethod;
  externalReference: string | null;
  notes: string | null;
  status: PaymentStatus;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  voidedByUserId: number | null;
  voidedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  updatedAt: string;
  allocations?: PaymentAllocationDto[];
}

export interface PaymentAllocationDto {
  id: number;
  paymentId: number;
  weeklySettlementId: number;
  settlementPeriodNumber: string;
  periodStart: string;
  periodEnd: string;
  allocatedPaise: number;
  createdAt: string;
}

export interface RecordPaymentPayload {
  farmerId: number;
  businessDate: string;
  amountRupees: string | number;
  paymentMethod: PaymentMethod;
  externalReference?: string | null;
  notes?: string | null;
}

export interface VoidPaymentPayload {
  paymentId: number;
  reason: string;
}

export interface FarmerOutstandingDto {
  farmerId: number;
  memberCode: string;
  farmerNameMr: string;
  farmerNameEn: string | null;
  totalFinalizedNetPaise: number;
  totalActivePaidPaise: number;
  outstandingBalancePaise: number;
  canRecordPayment: boolean;
}

export interface Stage8SmokeSummary {
  migrationVersion6Ok: boolean;
  tablesCount17Ok: boolean;
  zeroSettlementsInitially: boolean;
  draftCreatedOk: boolean;
  secondDraftRejected: boolean;
  weeklyDateValidationOk: boolean;
  overlapRejected: boolean;
  previewCreatesNoSnapshots: boolean;
  previewTotalsExact: boolean;
  operatorPreviewAllowed: boolean;
  operatorMutationRejected: boolean;
  settlementFinalizedOk: boolean;
  farmerSnapshotsExact: boolean;
  openingBalanceIncludedOnce: boolean;
  settlementItemsLinked: boolean;
  duplicateSourcesPrevented: boolean;
  linkedCollectionVoidRejected: boolean;
  linkedAdjustmentVoidRejected: boolean;
  finalizedSettlementImmutable: boolean;
  draftCancellationOk: boolean;
  paymentRecordedOk: boolean;
  partialPaymentOk: boolean;
  fifoAllocationOk: boolean;
  paymentNumberSequenceOk: boolean;
  paymentRollbackDoesNotConsumeNumber: boolean;
  paymentOverOutstandingRejected: boolean;
  operatorPaymentRejected: boolean;
  paymentVoidOk: boolean;
  voidRestoresOutstanding: boolean;
  settlementHardDeleteRejected: boolean;
  paymentHardDeleteRejected: boolean;
  immutableUpdatesRejected: boolean;
  auditEventsOk: boolean;
  auditRollbackOk: boolean;
}

// ============================================================================
// Stage 9 Reports & Dashboard DTOs
// ============================================================================

export interface DashboardSummaryDto {
  indiaBusinessDate: string;
  currentShift: ShiftSummaryDto | null;
  todayLitresFormatted: string;
  todayAmountFormatted: string;
  todayCollectionCount: number;
  cowLitresFormatted: string;
  buffaloLitresFormatted: string;
  todayActiveFarmers: number;
  currentWeekLitresFormatted: string;
  currentWeekAmountFormatted: string;
  latestFinalizedSettlementNumber: string | null;
  totalFarmerPayableFormatted: string;
  totalFarmerDebtFormatted: string;
  unpaidFarmerCount: number;
  recentPayments: PaymentDto[];
  readinessWarnings: string[];
}

export type ReportType =
  | 'DAILY_COLLECTION_SUMMARY'
  | 'SHIFT_COLLECTION_REPORT'
  | 'FARMER_LEDGER_STATEMENT'
  | 'SETTLEMENT_BATCH_REPORT'
  | 'PAYMENT_REGISTER'
  | 'OUTSTANDING_FARMER_REPORT'
  | 'PAYMENT_VOUCHER';

export interface ReportPreviewRequest {
  reportType: ReportType;
  fromDate?: string;
  toDate?: string;
  shiftId?: number;
  farmerId?: number;
  settlementPeriodId?: number;
  paymentId?: number;
  paymentMethod?: PaymentMethod;
  status?: string;
}

export interface PdfExportRequest extends ReportPreviewRequest {
  suggestedFilename: string;
}

export interface PdfExportResult {
  cancelled: boolean;
  fileName?: string;
}

export type ReportPreviewResult = any; // Will be properly typed below if needed, or left flexible for UI to cast.

export interface Stage9SmokeSummary {
  schemaUnchangedVersion6: boolean;
  tablesUnchanged17: boolean;
  dailySummaryExact: boolean;
  cowBuffaloBreakdownExact: boolean;
  shiftReportExact: boolean;
  weightedQualityExact: boolean;
  voidedCollectionsExcluded: boolean;
  ledgerStatementExact: boolean;
  settlementReportExact: boolean;
  voidedPaymentsExcluded: boolean;
  outstandingReportExact: boolean;
  dashboardSummaryExact: boolean;
  operatorPreviewAllowed: boolean;
  unauthenticatedRejected: boolean;
  htmlEscapingOk: boolean;
  noExternalResources: boolean;
  filenameSanitizationOk: boolean;
  pdfMagicHeaderOk: boolean;
  pdfNonEmptyOk: boolean;
  temporaryPdfRemoved: boolean;
  arbitraryPathNotExposed: boolean;
}

export interface Stage10SmokeSummary {
  bridgeMethodsPresent: boolean;
  smokeBackupCreatedOk: boolean;
  smokeBackupVerifiedOk: boolean;
  smokeHistoryBasenameOnly: boolean;
  temporaryBackupCleaned: boolean;
  noRendererPathExposed: boolean;
}

// ============================================================================
// Stage 10 Backup & Restore DTOs
// ============================================================================

export interface BackupResultDto {
  displayName: string;
  sizeBytes: number;
  checksumSha256: string;
  migrationVersion: number;
  createdAt: string;
}

export interface BackupHistoryItemDto {
  displayName: string;
  sizeBytes: number;
  checksumSha256: string;
  triggerType: string;
  createdAt: string;
}

export interface BackupDestinationDto {
  cancelled: boolean;
  displayPath?: string;
}

export interface RestoreCandidateDto {
  cancelled: boolean;
  token?: string;
  displayName?: string;
  sizeBytes?: number;
}

export interface ExecuteRestorePayload {
  token: string;
  confirmed: boolean;
}

export interface RestoreResultDto {
  success: boolean;
  safetyBackupName: string | null;
  restartScheduled: boolean;
}

export interface DetectedUsbDriveDto {
  id: string; // opaque sender-bound token
  label: string;
  freeSpaceBytes: number;
  totalSpaceBytes: number;
}

export interface CreateUsbBackupPayload {
  usbToken: string;
}

export interface BackupScheduleDto {
  enabled: boolean;
  time: string; // HH:MM
  lastRunDate: string | null; // YYYY-MM-DD
}

export interface UpdateBackupSchedulePayload {
  enabled: boolean;
  time: string; // HH:MM
}
