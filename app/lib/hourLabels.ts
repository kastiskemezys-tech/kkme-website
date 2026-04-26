// Phase 7.6.14 — UTC → Baltic local hour conversion.
// ENTSO-E A44 publishes hourly DA prices indexed from 00:00 UTC. The Baltic
// market clock runs on EET (UTC+2) in winter and EEST (UTC+3) under EU DST
// (last Sunday of March → last Sunday of October). The cards previously
// displayed UTC indices unlabelled, so a peak at 02:00 EET appeared as "h0".
// Helper resolves the offset via Intl, so we never hard-code DST cutovers.
// Per audit: every "h{N}" reference site-wide should label the timezone.

const VILNIUS_TZ = 'Europe/Vilnius';

function toMs(input: string | Date | number | null | undefined): number | null {
  if (input == null) return Date.now();
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

function hourInTimezone(d: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone,
  }).format(d);
  // en-GB sometimes returns "24" at midnight; normalise to 0-23.
  const h = parseInt(formatted, 10);
  return Number.isFinite(h) ? h % 24 : 0;
}

/** Returns the Baltic offset (2 = EET, 3 = EEST) at the given instant. */
export function eetOffsetHours(refIso?: string | Date | number | null): 2 | 3 {
  const ms = toMs(refIso);
  if (ms == null) return 2; // safe winter default for unparseable input
  const d = new Date(ms);
  const utcH = hourInTimezone(d, 'UTC');
  const localH = hourInTimezone(d, VILNIUS_TZ);
  const diff = ((localH - utcH) + 24) % 24;
  return diff === 3 ? 3 : 2;
}

/** UTC hour index (0-23) → Baltic local hour (0-23) on the given date. */
export function utcHourToEet(
  utcHour: number,
  refIso?: string | Date | number | null,
): number {
  if (!Number.isFinite(utcHour)) return 0;
  const offset = eetOffsetHours(refIso);
  return ((Math.round(utcHour) % 24) + offset + 24) % 24;
}

/**
 * Canonical Baltic local hour label. We render "h{N} EET" even during EEST
 * because Baltic markets colloquially refer to local time as "EET clock".
 */
export function formatHourEET(
  utcHour: number,
  refIso?: string | Date | number | null,
): string {
  return `h${utcHourToEet(utcHour, refIso)} EET`;
}
