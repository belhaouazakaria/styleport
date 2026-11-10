/**
 * One Pinterest account per UTC day. Fixed registered publication roles keep
 * the rotation stable and prevent publishing to an unrelated connected account.
 * This is a planning function, NOT Pinterest publication authorization.
 */
export const ROTATION_ROLES = [
  "SAYTWIST", "SAYTWIST_IDEAS", "SAYTWIST_PLAYGROUND",
] as const;
export type RotationRole = typeof ROTATION_ROLES[number];

export type EligibleRotationAccount = {
  id: string;
  role: RotationRole;
  connected: boolean;
  hasWritableBoard: boolean;
};

export type DailyRotationPlan = {
  day: string;
  accountId: string | null;
  publicationRole: RotationRole | null;
  targetPins: number;
  original: number;
  source: number;
  accountCount: number;
  perPinOwnerApprovalRequired: true;
  status: "READY" | "NO_CONNECTED_ACCOUNTS";
};

export function utcDayIndex(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw Error("ROTATION_DAY_INVALID");
  }
  const timestamp = Date.parse(day + "T00:00:00.000Z");
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== day) {
    throw Error("ROTATION_DAY_INVALID");
  }
  return timestamp / 86_400_000;
}

export function planDailyRotation(
  day: string,
  accounts: readonly EligibleRotationAccount[],
): DailyRotationPlan {
  const dayIndex = utcDayIndex(day);
  const seenIds = new Set<string>();
  const seenRoles = new Set<RotationRole>();
  for (const account of accounts) {
    if (!/^[a-zA-Z0-9_-]{1,191}$/.test(account.id) ||
        !ROTATION_ROLES.includes(account.role) ||
        seenIds.has(account.id) ||
        seenRoles.has(account.role) ||
        typeof account.connected !== "boolean" ||
        typeof account.hasWritableBoard !== "boolean") {
      throw Error("ROTATION_ACCOUNT_INVALID");
    }
    seenIds.add(account.id);
    seenRoles.add(account.role);
  }
  const ready = accounts.filter(a => a.connected && a.hasWritableBoard).sort(
    (a,b) => ROTATION_ROLES.indexOf(a.role) - ROTATION_ROLES.indexOf(b.role));
  if (ready.length === 0) return {
    day, accountId: null, publicationRole: null, targetPins: 0,
    source: 0, original: 0, accountCount: 0,
    perPinOwnerApprovalRequired: true, status: "NO_CONNECTED_ACCOUNTS",
  };
  // Fixed historical UTC epoch index yields deterministic rotation even if
  // the host restarts. With 1 connected account, plan that one every day.
  const account = ready[dayIndex % ready.length];
  // 4, 5, 4, 5 ...; on five-Pin days rotate the extra editorial slot
  // between original and source to preserve balanced long-run allocation.
  const targetPins = dayIndex % 2 === 0 ? 4 : 5;
  const source = Math.floor(targetPins / 2) +
    (targetPins === 5 && Math.floor(dayIndex / 2) % 2 === 0 ? 1 : 0);
  return {
    day, accountId: account.id, publicationRole: account.role,
    targetPins, source, original: targetPins - source,
    accountCount: ready.length,
    perPinOwnerApprovalRequired: true, status: "READY",
  };
}

/**
 * Once a Pin has been owner-approved, the immutable approved snapshot controls
 * publishing. This predicate is for NEW approval/draft admission only.
 */
export function assertActiveRotationAccount(
  plan: DailyRotationPlan, accountId: string,
) {
  if (plan.status !== "READY" || plan.accountId !== accountId) {
    throw Error("ROTATION_ACCOUNT_NOT_SCHEDULED_TODAY");
  }
}
