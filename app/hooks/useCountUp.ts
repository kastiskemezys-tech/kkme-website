import { useEffect, useState } from 'react';

export function useCountUp(target: number, duration = 600, trigger = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger || target === 0) { setValue(target); return; }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, trigger]);
  return value;
}
