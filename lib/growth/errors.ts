export class NonRetryableGrowthJobError extends Error {}

export class PinterestConfigurationError extends NonRetryableGrowthJobError {}

export class RetryableGrowthJobError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

export class PinterestTokenRequestError extends Error {
  constructor(readonly status: number) {
    super(`Pinterest token request failed with HTTP ${status}.`);
  }
}
