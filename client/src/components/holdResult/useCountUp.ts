// Count-up animation hook. Eases a number from 0 → target once on mount using
// requestAnimationFrame. Honors prefers-reduced-motion: when reduced, it
// returns the final value immediately with no animation. Fires once — re-renders
// do not restart it (the ref guard).

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

export function useCountUp(
  target: number,
  durationMs = 800,
  delayMs = 0,
): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (reduce) {
      setValue(target);
      return;
    }

    let raf = 0;
    let startTime = 0;
    const delayTimer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!startTime) startTime = now;
        const progress = Math.min((now - startTime) / durationMs, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setValue(Math.round(eased * target));
        if (progress < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      window.clearTimeout(delayTimer);
      if (raf) cancelAnimationFrame(raf);
    };
    // Intentionally run once on mount; target is captured by the ref guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}
