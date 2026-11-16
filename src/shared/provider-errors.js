export class ProviderError extends Error {
  constructor(code, message, { retryable = false, status = 0 } = {}) {
    super(message || code || "PROVIDER_ERROR");
    this.name = "ProviderError";
    this.code = code || "PROVIDER_ERROR";
    this.retryable = retryable;
    this.status = status;
  }
}

export function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}
