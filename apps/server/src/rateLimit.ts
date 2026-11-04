/**
 * Sliding-window log: at most `messages` accepted messages in any `windowMs` interval.
 * Rejected messages are not recorded, so a client that slows down recovers within one window.
 */
export interface RateLimiter {
  tryAcquire(): boolean;
}

export function createRateLimiter(
  messages: number,
  windowMs: number,
  now: () => number,
): RateLimiter {
  const accepted: number[] = [];
  return {
    tryAcquire() {
      const current = now();
      while (accepted.length > 0 && (accepted[0] as number) <= current - windowMs) accepted.shift();
      if (accepted.length >= messages) return false;
      accepted.push(current);
      return true;
    },
  };
}
