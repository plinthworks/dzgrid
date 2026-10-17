/**
 * Cancelling a request without naming the platform: a real AbortController
 * fits (`() => new AbortController()`), and so does a test's fake. The core
 * never creates one itself.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

export interface AbortHandle {
  readonly signal: AbortSignalLike;
  abort(reason?: unknown): void;
}
