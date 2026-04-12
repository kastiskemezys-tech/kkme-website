import { useCallback, useEffect, useRef, useState } from 'react';

export type SignalStatus = 'loading' | 'success' | 'error';

export interface SignalState<T> {
  status:        SignalStatus;
  data:          T | null;
  isStale:       boolean;
  isDefault:     boolean;
  isRefreshing:  boolean;
  ageHours:      number | null;
  defaultReason: string | null;
}

const FETCH_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS   = 2_000;

export function useSignal<T>(
  url: string,
  options?: { refreshInterval?: number },
): SignalState<T> {
  const [status, setStatus]           = useState<SignalStatus>('loading');
  const [data, setData]               = useState<T | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoaded = useRef(false);

  const doFetch = useCallback(async (attempt: number, background: boolean): Promise<void> => {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    if (background) setIsRefreshing(true);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as T;
      setData(d);
      setStatus('success');
      hasLoaded.current = true;
    } catch (_err) {
      clearTimeout(timer);
      if (background) {
        // Background refresh failure: keep existing data, don't set error
      } else if (attempt === 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        await doFetch(2, false);
        return;
      } else {
        setStatus('error');
      }
    } finally {
      if (background) setIsRefreshing(false);
    }
  }, [url]);

  // Initial mount fetch
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await doFetch(1, false);
    };
    if (!cancelled) run();
    return () => { cancelled = true; };
  }, [doFetch]);

  // Background polling
  useEffect(() => {
    const interval = options?.refreshInterval;
    if (!interval || interval <= 0) return;

    const id = setInterval(() => {
      if (hasLoaded.current) doFetch(1, true);
    }, interval);

    return () => clearInterval(id);
  }, [doFetch, options?.refreshInterval]);

  // Read resilience fields from the response
  const raw           = data as Record<string, unknown> | null;
  const isStale       = raw?._stale       === true;
  const isDefault     = raw?._serving     === 'static_defaults';
  const ageHours      = typeof raw?._age_hours === 'number'  ? (raw._age_hours as number)  : null;
  const defaultReason = typeof raw?._default_reason === 'string' ? (raw._default_reason as string) : null;

  return { status, data, isStale, isDefault, isRefreshing, ageHours, defaultReason };
}
