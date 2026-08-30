/**
 * HYDRAX - fixed-window rate limiter.
 *
 * `POST /api/v1/requests` is the only unauthenticated write endpoint in the
 * system. Without a limit, anyone who can reach the port can fill the database
 * with submissions, and the operator loses the ability to find the real ones.
 *
 * Deliberately in-memory and deliberately simple: one process, one farm, no
 * dependency. It is a speed bump against casual abuse and accidental retry
 * storms, not a defence against a distributed attacker — that belongs at the
 * reverse proxy, and docs/DEPLOYMENT.md says so.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the current window resets. */
  readonly retryAfterSeconds: number;
}

export class RateLimiter {
  readonly #windowMs: number;
  readonly #max: number;
  readonly #hits = new Map<string, { count: number; resetAt: number }>();

  constructor(max: number, windowMs: number) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  check(key: string, nowMs: number): RateLimitDecision {
    this.#sweep(nowMs);

    const entry = this.#hits.get(key);
    if (entry === undefined || nowMs >= entry.resetAt) {
      this.#hits.set(key, { count: 1, resetAt: nowMs + this.#windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    entry.count += 1;
    if (entry.count > this.#max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drops expired entries so the map cannot grow without bound. */
  #sweep(nowMs: number): void {
    if (this.#hits.size < 512) return;
    for (const [key, entry] of this.#hits) {
      if (nowMs >= entry.resetAt) this.#hits.delete(key);
    }
  }

  reset(): void {
    this.#hits.clear();
  }
}

/**
 * Best-effort client identity.
 *
 * X-Forwarded-For is honoured because this is expected to sit behind a reverse
 * proxy, but it is client-controlled and therefore spoofable — which is
 * precisely why the limiter is a speed bump rather than a security control.
 */
export function clientKey(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: string | undefined,
): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.length > 0) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return (remoteAddress ?? 'unknown').slice(0, 64);
}
