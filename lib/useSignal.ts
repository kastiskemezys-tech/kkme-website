import { useEffect, useState } from 'react';

export type SignalStatus = 'loading' | 'success' | 'error';

export interface SignalState<T> {
  status:        SignalStatus;
  data:          T | null;
  isStale:       boolean;
  isDefault:     boolean;
  ageHours:      number | null;
  defaultReason: string | null;
}

const FETCH_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS   = 2_000;

export function useSignal<T>(url: string): SignalState<T> {
  const [status, setStatus] = useState<SignalStatus>('loading');
  const [data, setData]     = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as T;
        if (!cancelled) { setData(d); setStatus('success'); }
      } catch (_err) {
        clearTimeout(timer);
        if (cancelled) return;
        if (attempt === 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          if (!cancelled) await load(2);
        } else {
          setStatus('error');
        }
      }
    };

    load(1);
    return () => { cancelled = true; };
  }, [url]);

  // Read resilience fields from the response
  const raw           = data as Record<string, unknown> | null;
  const isStale       = raw?._stale       === true;
  const isDefault     = raw?._serving     === 'static_defaults';
  const ageHours      = typeof raw?._age_hours === 'number'  ? (raw._age_hours as number)  : null;
  const defaultReason = typeof raw?._default_reason === 'string' ? (raw._default_reason as string) : null;

  return { status, data, isStale, isDefault, ageHours, defaultReason };
}
