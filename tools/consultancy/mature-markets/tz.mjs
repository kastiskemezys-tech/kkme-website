// Local wall clock → UTC instant, without pulling in a tz library.
//
// Reserve products are defined on the market's local calendar day ("the 12:00-16:00 block",
// "ISP 37 of 2022-06-22"), so storing them as if the local day started at 00:00 UTC would
// be off by one or two hours all year and would put two different instants under one label
// across a DST boundary. Both errors are invisible in a daily aggregate and wrong in an
// hourly one.
//
// Method: guess the UTC instant using a candidate offset, ask Intl what the local wall
// clock actually is at that instant, and correct. Two iterations converge for every real
// zone. Around the spring-forward gap the requested wall clock does not exist; we return
// the instant at which local time first passes it, and the caller can detect the case
// because the resulting window is shorter than the nominal product length.

const FORMATTERS = new Map();

function formatter(zone) {
  let f = FORMATTERS.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    FORMATTERS.set(zone, f);
  }
  return f;
}

/** Wall-clock minutes since local midnight of `isoDate`, as seen at UTC instant `ms`. */
function localMinutesAt(zone, isoDate, ms) {
  const parts = formatter(zone).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const date = `${String(g('year')).padStart(4, '0')}-${String(g('month')).padStart(2, '0')}-${String(g('day')).padStart(2, '0')}`;
  const dayDiff = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${isoDate}T00:00:00Z`)) / 86400000;
  return dayDiff * 1440 + g('hour') * 60 + g('minute') + g('second') / 60;
}

/**
 * @param {string} zone      IANA zone, e.g. 'Europe/Berlin'
 * @param {string} isoDate   local calendar day, 'YYYY-MM-DD'
 * @param {number} minutes   wall-clock minutes after local midnight (may exceed 1440)
 * @returns {string}         ISO-8601 UTC instant, second precision
 */
export function wallClockToUtc(zone, isoDate, minutes) {
  let ms = Date.parse(`${isoDate}T00:00:00Z`) + minutes * 60000;
  for (let i = 0; i < 3; i++) {
    const actual = localMinutesAt(zone, isoDate, ms);
    const drift = actual - minutes;
    if (Math.abs(drift) < 1 / 120) break;   // within half a second
    ms -= drift * 60000;
  }
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const berlinWallClockToUtc = (isoDate, minutes) => wallClockToUtc('Europe/Berlin', isoDate, minutes);
export const stockholmWallClockToUtc = (isoDate, minutes) => wallClockToUtc('Europe/Stockholm', isoDate, minutes);
export const londonWallClockToUtc = (isoDate, minutes) => wallClockToUtc('Europe/London', isoDate, minutes);
export const brisbaneWallClockToUtc = (isoDate, minutes) => wallClockToUtc('Australia/Brisbane', isoDate, minutes);
