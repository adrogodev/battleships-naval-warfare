import { useEffect, useState } from "react";

/** Whole seconds left until `deadline` (epoch ms), ticking while a deadline is set. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
