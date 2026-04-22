import type { Role, TranslatorRequestStatus } from "@prisma/client";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "TOO_LONG"
  | "RATE_LIMITED"
  | "TRANSLATION_UNAVAILABLE"
  | "UPSTREAM_ERROR"
  | "BAD_REQUEST"
  | "OCR_ERROR"
  | "UNSUPPORTED_FILE"
  | "NOT_FOUND"
  | "INACTIVE_TRANSLATOR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "MODEL_UNAVAILABLE";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: ApiError;
}

export interface TranslateSuccessResponse {
  ok: true;
  result: string;
}

export type TranslateResponse = TranslateSuccessResponse | ApiErrorResponse;

export interface OcrSuccessResponse {
  ok: true;
  text: string;
}

export type OcrResponse = OcrSuccessResponse | ApiErrorResponse;

export interface PublicMode {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface PublicExample {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  iconKey: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface PublicTranslator {
  id: string;
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
  iconName: string | null;
  showModeSelector: boolean;
  showSwap: boolean;
  showExamples: boolean;
  shareImagePath: string | null;
  shareImageUpdatedAt: string | null;
  primaryCategory: Pick<PublicCategory, "id" | "name" | "slug"> | null;
  categories: Array<Pick<PublicCategory, "id" | "name" | "slug">>;
  modes: PublicMode[];
  examples: PublicExample[];
}

export interface RuntimeTranslator {
  id: string;
  slug: string;
  promptSystem: string;
  promptInstructions: string;
  modelOverride: string | null;
  showModeSelector: boolean;
  modes: Array<{
    key: string;
    label: string;
    instruction: string;
  }>;
}

export interface TranslatorModeInput {
  key: string;
  label: string;
  description?: string;
  instruction: string;
  sortOrder: number;
}

export interface TranslatorExampleInput {
  label: string;
  value: string;
  sortOrder: number;
}

export interface TranslatorUpsertInput {
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  iconName?: string;
  promptSystem: string;
  promptInstructions: string;
  seoTitle?: string;
  seoDescription?: string;
  modelOverride?: string;
  isActive: boolean;
  isFeatured: boolean;
  showModeSelector: boolean;
  showSwap: boolean;
  showExamples: boolean;
  sortOrder: number;
  primaryCategoryId?: string | null;
  categoryIds: string[];
  modes: TranslatorModeInput[];
  examples: TranslatorExampleInput[];
}

export interface TranslatorListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  archivedAt: string | null;
  updatedAt: string;
  sortOrder: number;
  featuredRank: number | null;
  featuredSource: "AUTO" | "MANUAL";
  shareImagePath: string | null;
  shareImageUpdatedAt: string | null;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export interface CategoryUpsertInput {
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  iconKey?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface AdPlacementUpsertInput {
  name: string;
  key: string;
  description?: string;
  pageType: "ALL" | "HOMEPAGE" | "TRANSLATOR" | "CATEGORY";
  deviceType: "ALL" | "DESKTOP" | "MOBILE";
  placementType:
    | "HOMEPAGE_TOP"
    | "HOMEPAGE_BETWEEN_SECTIONS"
    | "TRANSLATOR_ABOVE_TOOL"
    | "TRANSLATOR_BELOW_TOOL"
    | "SIDEBAR_SLOT"
    | "FOOTER_SLOT"
    | "MOBILE_STICKY_SLOT"
    | "CUSTOM";
  providerType: "ADSENSE" | "CUSTOM_HTML";
  adSenseSlot?: string;
  codeSnippet?: string;
  categoryId?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminSession {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    role: Role;
  };
}

export interface AppSettings {
  platformName: string;
  homepageTitle: string;
  homepageSubtitle: string;
  footerDisclaimer: string;
  catalogIntro: string;
  defaultTranslatorSlug: string;
  featuredTranslatorsEnabled: boolean;
  autoFeaturedEnabled: boolean;
  autoFeaturedWindowDays: number;
  autoFeaturedLastRecalculatedAt: string | null;
  defaultModelOverride: string;
  discoveryPageSize: number;
  adsEnabled: boolean;
  adSenseClientId: string;
  customHeadCode: string;
}

export interface AutoFeaturedTranslatorSummary {
  translatorId: string;
  name: string;
  slug: string;
  rank: number;
  successCount: number;
  recentSuccessCount: number;
  totalTokens: number;
}

export interface DiscoveryQuery {
  q?: string;
  category?: string;
  page: number;
  pageSize: number;
}

export interface DiscoveryResult {
  translators: PublicTranslator[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: PublicCategory[];
  q?: string;
  category?: string;
}

export interface UsageSeriesPoint {
  date: string;
  translations: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface TranslatorRequestInput {
  requesterEmail?: string;
  requestedName: string;
  description: string;
  exampleInput?: string;
  desiredStyle?: string;
  suggestedCategory?: string;
  audience?: string;
  notes?: string;
  honeypot?: string;
  turnstileToken?: string;
}

export interface TranslatorDraftModeInput {
  key: string;
  label: string;
  description?: string;
  instruction: string;
  sortOrder: number;
}

export interface TranslatorDraftExampleInput {
  label: string;
  value: string;
  sortOrder: number;
}

export interface TranslatorDraft {
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  systemPrompt: string;
  promptInstructions: string;
  seoTitle?: string;
  seoDescription?: string;
  categorySuggestion?: string;
  modes: TranslatorDraftModeInput[];
  examples: TranslatorDraftExampleInput[];
}

export interface AdminTranslatorRequestListItem {
  id: string;
  requesterEmail: string | null;
  requestedName: string;
  suggestedCategory: string | null;
  status: TranslatorRequestStatus;
  createdAt: string;
}

export interface AdminTranslatorRequestDetail {
  id: string;
  requesterEmail: string | null;
  requestedName: string;
  description: string;
  exampleInput: string | null;
  desiredStyle: string | null;
  suggestedCategory: string | null;
  audience: string | null;
  notes: string | null;
  adminNotes: string | null;
  status: TranslatorRequestStatus;
  aiDraftJson: TranslatorDraft | null;
  aiDraftGeneratedAt: string | null;
  createdTranslatorId: string | null;
  createdTranslator: { id: string; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestFilters {
  q?: string;
  status?: "all" | TranslatorRequestStatus;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface UsageProtectionSettingsInput {
  usageProtectionEnabled: boolean;
  ipLimitPerMinute: number;
  ipLimitPerHour: number;
  ipLimitPerDay: number;
  globalDailyTokenCap: number;
  autoEmergencyShutdownEnabled: boolean;
  alertEmail?: string;
}

export interface UsageProtectionStateDto {
  id: string;
  usageProtectionEnabled: boolean;
  ipLimitPerMinute: number;
  ipLimitPerHour: number;
  ipLimitPerDay: number;
  globalDailyTokenCap: number;
  autoEmergencyShutdownEnabled: boolean;
  translationsEnabled: boolean;
  shutdownReason: string | null;
  shutdownTriggeredAt: string | null;
  alertEmail: string | null;
  lastShutdownEventId: string | null;
  updatedAt: string;
}

export interface UsageProtectionEventDto {
  id: string;
  type: "EMERGENCY_SHUTDOWN" | "MANUAL_REENABLE";
  reason: string;
  tokenUsageAtTrigger: number | null;
  tokenCapAtTrigger: number | null;
  alertEmail: string | null;
  alertSentAt: string | null;
  alertError: string | null;
  createdAt: string;
}

export interface UsageProtectionTopTranslator {
  translatorId: string;
  name: string;
  slug: string;
  requestCount: number;
  totalTokens: number;
}

export interface UsageProtectionDashboardData {
  state: UsageProtectionStateDto;
  today: {
    totalRequests: number;
    blockedRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    tokenCap: number;
    remainingTokens: number;
    blockedByReason: Array<{ code: string; count: number }>;
  };
  topTranslatorsByTokens: UsageProtectionTopTranslator[];
  lastShutdownEvent: UsageProtectionEventDto | null;
}
