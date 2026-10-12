interface TimerClock {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
}

/** Schedule against a deadline so background throttling cannot reset the timer. */
export function scheduleSleepTimer(
  endsAt: number,
  onExpire: () => void,
  clock: TimerClock = {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (id) => clearTimeout(id),
  },
): () => void {
  let cancelled = false;
  let timeout: ReturnType<typeof setTimeout>;
  const check = () => {
    if (cancelled) return;
    const remaining = endsAt - clock.now();
    if (remaining <= 0) {
      cancelled = true;
      onExpire();
    } else {
      timeout = clock.setTimeout(check, Math.min(remaining, 2_147_483_647));
    }
  };
  timeout = clock.setTimeout(check, Math.max(0, Math.min(endsAt - clock.now(), 2_147_483_647)));
  return () => {
    cancelled = true;
    clock.clearTimeout(timeout);
  };
}
