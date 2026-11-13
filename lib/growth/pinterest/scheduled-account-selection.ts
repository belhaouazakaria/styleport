/**
 * Shared bounded selection policy for Phase 14's one-account-at-a-time
 * Pinterest scheduled workers. Supports the three explicit SayTwist roles
 * without increasing HTTP requests, waking the generic worker, or changing
 * Growth/Pinterest publishing permissions.
 */
const ROLE_ORDER = [
  "SAYTWIST",
  "SAYTWIST_IDEAS",
  "SAYTWIST_PLAYGROUND",
] as const;

export const MAX_SCHEDULED_PINTEREST_ACCOUNTS = ROLE_ORDER.length;

export type ScheduledPinterestAccount = {
  id: string;
  activeRole: string | null;
  encryptedCredentials: string | null;
  grantedScopes: readonly string[];
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

export function assertScheduledPinterestAccounts(
  accounts: readonly { id: string; activeRole: string | null }[],
): void {
  if (accounts.length === 0 ||
      accounts.length > MAX_SCHEDULED_PINTEREST_ACCOUNTS ||
      new Set(accounts.map(a => a.id)).size !== accounts.length ||
      new Set(accounts.map(a => a.activeRole)).size !== accounts.length ||
      accounts.some(a => !a.activeRole ||
        !ROLE_ORDER.includes(a.activeRole as typeof ROLE_ORDER[number]))) {
    throw Error("SCHEDULED_PINTEREST_ACCOUNT_SCOPE_INVALID");
  }
}

export function isScheduledPinterestAccountReady(
  account: ScheduledPinterestAccount,
  requiredScopes: readonly string[],
  now: Date,
  accessTokenMinimumMs: number,
): boolean {
  return Boolean(
    account.encryptedCredentials &&
    requiredScopes.every(scope => account.grantedScopes.includes(scope)) &&
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt.getTime() > now.getTime() + accessTokenMinimumMs &&
    (!account.refreshTokenExpiresAt ||
      account.refreshTokenExpiresAt.getTime() > now.getTime()),
  );
}

export function chooseLeastRecentlyServed<T extends {
  id: string; activeRole: string | null;
}>(
  candidates: readonly { account: T; lastServedAt: Date | null }[],
): T | null {
  return [...candidates].sort((a, b) => {
    const aAt = a.lastServedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bAt = b.lastServedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (aAt !== bAt) return aAt - bAt;
    const ai = ROLE_ORDER.indexOf(a.account.activeRole as typeof ROLE_ORDER[number]);
    const bi = ROLE_ORDER.indexOf(b.account.activeRole as typeof ROLE_ORDER[number]);
    return ai !== bi ? ai - bi : a.account.id.localeCompare(b.account.id);
  })[0]?.account ?? null;
}

/** Inventory and detailed Pin metrics both use the single maintenance slot. */
export function latestMaintenanceActivity(
  inventoryAt: Date | null,
  pinAnalyticsAt: Date | null,
): Date | null {
  if (!inventoryAt) return pinAnalyticsAt;
  if (!pinAnalyticsAt) return inventoryAt;
  return inventoryAt > pinAnalyticsAt ? inventoryAt : pinAnalyticsAt;
}
