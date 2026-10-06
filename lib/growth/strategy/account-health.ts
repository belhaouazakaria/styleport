import {
  GrowthPinterestAnalyticsStatus,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  GrowthStrategyEvidenceQuality,
} from "@prisma/client";

import { PINTEREST_OAUTH_SCOPES } from "@/lib/growth/pinterest/config";
import {
  ACCOUNT_STRATEGY_ANALYTICS_FRESH_MS,
  ACCOUNT_STRATEGY_MIN_OBSERVATION_DAYS,
  ACCOUNT_STRATEGY_MIN_RELEVANT_PINS,
  ACCOUNT_STRATEGY_SYNC_FRESH_MS,
} from "@/lib/growth/strategy/constants";
import type {
  AccountHealthStatus,
  IntentAlignment,
  RoleReadiness,
  StrategyReasonCode,
} from "@/lib/growth/strategy/contracts";

export interface StrategyAccountInput {
  id: string;
  activeRole: GrowthPinterestPublicationRole;
  username: string;
  connectionStatus: GrowthPinterestConnectionStatus;
  grantedScopes: string[];
  refreshTokenExpiresAt: Date | null;
  lastSuccessfulApiCallAt: Date | null;
  lastAccountSyncAt: Date | null;
  lastBoardSyncAt: Date | null;
  analyticsStatus: GrowthPinterestAnalyticsStatus | null;
  lastAnalyticsSyncAt: Date | null;
  activePins: number;
  relevantPins: number;
  boardCount: number;
  observationDays: number;
}

function stale(value: Date | null, now: Date, maximumAgeMs: number) {
  return !value || now.getTime() - value.getTime() > maximumAgeMs;
}

export function requiredPinterestScopesComplete(scopes: string[]) {
  const granted = new Set(scopes);
  return PINTEREST_OAUTH_SCOPES.every((scope) => granted.has(scope));
}

export function evaluateAccountHealth(
  account: StrategyAccountInput | null,
  now: Date,
) {
  if (!account) {
    return {
      health: "NOT_CONNECTED" as AccountHealthStatus,
      readiness: "NOT_CONNECTED" as RoleReadiness,
      evidenceQuality: GrowthStrategyEvidenceQuality.NOT_APPLICABLE,
      reasonCodes: ["ROLE_NOT_CONNECTED"] as StrategyReasonCode[],
    };
  }

  const reasons: StrategyReasonCode[] = [];
  const scopesComplete = requiredPinterestScopesComplete(account.grantedScopes);
  if (
    account.connectionStatus ===
      GrowthPinterestConnectionStatus.REAUTH_REQUIRED ||
    (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now)
  ) {
    return {
      health: "REAUTH_REQUIRED" as AccountHealthStatus,
      readiness: "BLOCKED" as RoleReadiness,
      evidenceQuality: GrowthStrategyEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: ["ROLE_REAUTH_REQUIRED"] as StrategyReasonCode[],
    };
  }
  if (!scopesComplete) reasons.push("MISSING_REQUIRED_SCOPES");
  if (
    stale(account.lastAccountSyncAt, now, ACCOUNT_STRATEGY_SYNC_FRESH_MS) ||
    stale(account.lastSuccessfulApiCallAt, now, ACCOUNT_STRATEGY_SYNC_FRESH_MS)
  )
    reasons.push("ACCOUNT_SYNC_STALE");
  if (stale(account.lastBoardSyncAt, now, ACCOUNT_STRATEGY_SYNC_FRESH_MS))
    reasons.push("BOARD_SYNC_STALE");
  if (
    !account.analyticsStatus ||
    account.analyticsStatus === GrowthPinterestAnalyticsStatus.NEVER_SYNCED
  ) {
    reasons.push("ANALYTICS_MISSING");
  } else if (
    account.analyticsStatus !== GrowthPinterestAnalyticsStatus.FRESH ||
    stale(account.lastAnalyticsSyncAt, now, ACCOUNT_STRATEGY_ANALYTICS_FRESH_MS)
  ) {
    reasons.push("ANALYTICS_STALE");
  }
  if (
    account.analyticsStatus === GrowthPinterestAnalyticsStatus.PARTIAL ||
    account.analyticsStatus === GrowthPinterestAnalyticsStatus.BACKFILLING
  )
    reasons.push("INVENTORY_INCOMPLETE");
  if (account.activePins === 0) reasons.push("INVENTORY_EMPTY");
  if (
    account.activePins > 0 &&
    account.relevantPins < ACCOUNT_STRATEGY_MIN_RELEVANT_PINS
  )
    reasons.push("INSUFFICIENT_RELEVANT_PINS");
  if (account.boardCount === 0) reasons.push("BOARD_COVERAGE_LOW");
  if (account.observationDays < ACCOUNT_STRATEGY_MIN_OBSERVATION_DAYS)
    reasons.push("INSUFFICIENT_OBSERVATION_WINDOW");

  const hardAttention =
    account.connectionStatus === GrowthPinterestConnectionStatus.DEGRADED ||
    reasons.some((reason) =>
      [
        "MISSING_REQUIRED_SCOPES",
        "ACCOUNT_SYNC_STALE",
        "BOARD_SYNC_STALE",
        "ANALYTICS_STALE",
      ].includes(reason),
    );
  const insufficient = reasons.some((reason) =>
    [
      "ANALYTICS_MISSING",
      "INSUFFICIENT_OBSERVATION_WINDOW",
      "INVENTORY_EMPTY",
      "INVENTORY_INCOMPLETE",
      "INSUFFICIENT_RELEVANT_PINS",
      "BOARD_COVERAGE_LOW",
    ].includes(reason),
  );

  if (hardAttention) {
    return {
      health: "NEEDS_ATTENTION" as AccountHealthStatus,
      readiness: "PARTIAL" as RoleReadiness,
      evidenceQuality: GrowthStrategyEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: reasons,
    };
  }
  if (insufficient) {
    return {
      health: "INSUFFICIENT_DATA" as AccountHealthStatus,
      readiness: "INSUFFICIENT_DATA" as RoleReadiness,
      evidenceQuality: GrowthStrategyEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: reasons,
    };
  }
  return {
    health: "HEALTHY" as AccountHealthStatus,
    readiness: "READY" as RoleReadiness,
    evidenceQuality: GrowthStrategyEvidenceQuality.KNOWN,
    reasonCodes: reasons,
  };
}

const PLAYGROUND_TERMS =
  /\b(fun|funny|quiz|personality|decode|challenge|game|meme|play|viral|generation|slang)\b/i;

function pinMatchesRole(
  role: GrowthPinterestPublicationRole,
  pin: {
    destinationUrl: string | null;
    title: string | null;
    description: string | null;
  },
) {
  if (!pin.destinationUrl) return false;
  let path: string;
  try {
    path = new URL(pin.destinationUrl).pathname;
  } catch {
    return false;
  }
  if (role === GrowthPinterestPublicationRole.SAYTWIST)
    return path.startsWith("/translators/") || path.startsWith("/ideas/");
  if (role === GrowthPinterestPublicationRole.SAYTWIST_IDEAS)
    return path.startsWith("/ideas/");
  const metadata = `${pin.title || ""} ${pin.description || ""}`;
  return (
    (path.startsWith("/ideas/") || path.startsWith("/translators/")) &&
    PLAYGROUND_TERMS.test(metadata)
  );
}

export function evaluateIntentAlignment(
  role: GrowthPinterestPublicationRole,
  pins: Array<{
    destinationUrl: string | null;
    title: string | null;
    description: string | null;
  }>,
) {
  const consideredPins = pins.length;
  const alignedPins = pins.filter((pin) => pinMatchesRole(role, pin)).length;
  if (consideredPins < ACCOUNT_STRATEGY_MIN_RELEVANT_PINS) {
    return {
      status: "INSUFFICIENT_DATA" as IntentAlignment,
      consideredPins,
      alignedPins,
      reasons: [] as StrategyReasonCode[],
    };
  }
  const alignedPercent = (alignedPins / consideredPins) * 100;
  if (alignedPercent >= 70)
    return {
      status: "ALIGNED" as IntentAlignment,
      consideredPins,
      alignedPins,
      reasons: [] as StrategyReasonCode[],
    };
  if (alignedPercent >= 40)
    return {
      status: "MIXED" as IntentAlignment,
      consideredPins,
      alignedPins,
      reasons: ["INTENT_MIXED"] as StrategyReasonCode[],
    };
  return {
    status: "MISALIGNED" as IntentAlignment,
    consideredPins,
    alignedPins,
    reasons: ["INTENT_MISALIGNED"] as StrategyReasonCode[],
  };
}
