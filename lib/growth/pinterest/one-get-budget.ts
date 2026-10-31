/**
 * A narrow per-invocation fail-closed ceiling for an explicitly approved
 * one-GET diagnostic. It is NOT a cross-process or recurring API rate limiter.
 * Each approval authorizes exactly one claim, including failed/429 requests.
 */
export class PinterestOneGetBudget {
  private attempted = 0;
  private stopped = false;

  claim() {
    if (this.stopped || this.attempted !== 0) throw new Error("PINTEREST_LOCAL_BUDGET_EXHAUSTED");
    this.attempted = 1; // Reserve before the network call, including ambiguous timeout.
  }

  observe(status: number) {
    if (this.stopped || this.attempted !== 1 || !Number.isInteger(status)) {
      this.stopped = true;
      throw new Error("PINTEREST_LOCAL_BUDGET_STATE_INVALID");
    }
    if (status === 429) {
      this.stopped = true;
      throw new Error("PINTEREST_RATE_LIMITED");
    }
    if (status < 200 || status >= 300) {
      this.stopped = true;
      throw new Error("PINTEREST_REQUEST_REJECTED");
    }
    this.stopped = true; // A successful GET never replenishes the local allowance.
  }

  get requestsReserved() { return this.attempted; }
}
