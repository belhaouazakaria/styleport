/**
 * Phase 14 observation/recommendation workers require a short, DB-persisted lease
 * as well as their existing process rollout and GrowthSettings.enabled switches.
 * A missing deadline (including a pre-migration/default setting) never authorizes work.
 */
export const MAX_GROWTH_ACTIVATION_LEASE_MS = 5 * 60 * 1000;

export function isGrowthWorkerActivationValid(
  settings: { enabled: boolean; workerActivationExpiresAt?: Date | null },
  now = new Date(),
): boolean {
  if (!settings.enabled || !(settings.workerActivationExpiresAt instanceof Date)) return false;
  const remaining = settings.workerActivationExpiresAt.getTime() - now.getTime();
  return Number.isFinite(remaining) && remaining > 0 && remaining <= MAX_GROWTH_ACTIVATION_LEASE_MS;
}
