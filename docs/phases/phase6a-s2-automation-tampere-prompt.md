# Phase 6A — Automate S2 Activation Clearing + Fix Light Mode Map

Self-contained Claude Code prompt. YOLO mode. Expected duration: 3–4 hours.

**Context:** Two issues:

1. **S2 activation clearing data is stale (Mar 28).** The `POST /s2/activation` endpoint has never been automated — it was always a manual curl push. The worker already fetches `price_procured_reserves` from BTD every 4h via `computeS2()`. We need to extend the worker to also compute and store monthly activation clearing aggregates automatically.

2. **Light mode hero map shows Tampere.** On `origin/main`, HeroBalticMap.tsx still uses `/hero/kkme-interconnect-light.png` (old PNG with baked-in labels like Tampere, Bothnian Sea). Phase 5B generated `background-light.svg` and `countries-light.svg` and updated the component to use them, but if this didn't land on main cleanly, fix it now.

**Branch:** `git checkout main && git pull origin main && git checkout -b phase-6a-s2-auto-tampere`

**Reference:** `docs/investigations/s2-activation-pipeline-audit.md` (full pipeline audit)

---

## Step 0: Context

1. `git checkout main && git pull origin main && git checkout -b phase-6a-s2-auto-tampere`
2. Read `docs/handover.md`
3. Read `docs/investigations/s2-activation-pipeline-audit.md`
4. `grep -n "computeS2\|s2_activation\|fetchBTDDataset\|async scheduled" workers/fetch-s1.js | head -30`
5. Check if light mode layers exist: `ls -la public/design-assets/Map/Layers/background-light.svg public/design-assets/Map/Layers/countries-light.svg 2>/dev/null`
6. Check current HeroBalticMap light mode: `grep -n "interconnect-light\|background-light" app/components/HeroBalticMap.tsx`

---

## Task 1: Tampere fix (quick — do this first)

### Check if light SVG layers exist

```bash
ls -la public/design-assets/Map/Layers/background-light.svg public/design-assets/Map/Layers/countries-light.svg 2>/dev/null
```

**If they DON'T exist**, generate them:

```python
# Extract PNGs from dark SVGs
import xml.etree.ElementTree as ET
import base64

def extract_png(svg_path, out_path):
    tree = ET.parse(svg_path)
    for el in tree.getroot().iter():
        tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
        if tag == 'image':
            href = el.get('{http://www.w3.org/1999/xlink}href', el.get('href', ''))
            if 'base64' in href:
                data = base64.b64decode(href.split(',',1)[1])
                open(out_path,'wb').write(data)
                return

extract_png('public/design-assets/Map/Layers/background-black.svg', '/tmp/bg-dark.png')
extract_png('public/design-assets/Map/Layers/countries.svg', '/tmp/countries-dark.png')
```

Then invert with Pillow (NOT ImageMagick — Pillow handles alpha better):

```python
from PIL import Image, ImageOps
import numpy as np

# Light theme cream: rgb(245, 242, 237)
CREAM = (245, 242, 237)

for name in ['bg', 'countries']:
    img = Image.open(f'/tmp/{name}-dark.png')
    if img.mode == 'RGBA':
        r, g, b, a = img.split()
        rgb = Image.merge('RGB', (r, g, b))
        rgb_inv = ImageOps.invert(rgb)
        # Tint towards cream
        arr = np.array(rgb_inv, dtype=np.float32)
        cream = np.array(CREAM, dtype=np.float32)
        arr = arr * 0.85 + cream * 0.15
        rgb_tinted = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
        result = Image.merge('RGBA', (*rgb_tinted.split(), a))
    else:
        result = ImageOps.invert(img)
        arr = np.array(result, dtype=np.float32)
        cream = np.array(CREAM, dtype=np.float32)
        arr = arr * 0.85 + cream * 0.15
        result = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    result.save(f'/tmp/{name}-light.png')
```

Re-embed as SVG:

```python
def create_svg(png_path, svg_path, width=1024, height=1332):
    with open(png_path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('ascii')
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     version="1.2" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <image width="{width}" height="{height - 1}"
         href="data:image/png;base64,{data}" />
</svg>'''
    open(svg_path, 'w').write(svg)

create_svg('/tmp/bg-light.png', 'public/design-assets/Map/Layers/background-light.svg')
create_svg('/tmp/countries-light.png', 'public/design-assets/Map/Layers/countries-light.svg')
```

### Update HeroBalticMap.tsx light mode

Find the light mode block (around line 390). Replace old PNG with designed layers:

```tsx
// BEFORE:
) : (
  <img
    src="/hero/kkme-interconnect-light.png"
    width={MAP_WIDTH} height={MAP_HEIGHT}
    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    alt="Baltic interconnect map"
  />
)}

// AFTER:
) : (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <img
      src="/design-assets/Map/Layers/background-light.svg"
      alt="Baltic map background"
      width={MAP_WIDTH} height={MAP_HEIGHT}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
    />
    <img
      src="/design-assets/Map/Layers/countries-light.svg"
      alt=""
      width={MAP_WIDTH} height={MAP_HEIGHT}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
    />
  </div>
)}
```

**Verify:** `npm run dev`, switch to light mode — no Tampere, no Bothnian Sea baked in.

---

## Task 2: Automate S2 activation clearing in worker cron

### Data source

BTD endpoint: `price_procured_reserves` — already fetched by `computeS2()`.

The `balancing_energy_prices` dataset has activation clearing prices but the audit found `rows: 0` in recent queries. Use `price_procured_reserves` instead — it has the same ISP-level data needed for P50 computation.

**BTD response structure** (verified):
```
GET /api/v1/export?id=price_procured_reserves&start_date=...&end_date=...&output_format=json
{
  data: {
    timeseries: [
      { from: "2026-04-10T00:00:00+00:00", to: "2026-04-10T00:15:00+00:00",
        values: [0.37, 0.79, 35.4, 7.06, 35.4, 0.37, 0.79, 35.4, 7.06, 35.4, 0.37, 0.79, 35.4, 7.06, 35.4] }
    ],
    columns: [
      { index: 0, label: "Symetric",  group_level_0: "Estonia", group_level_1: "FCR reserves" },
      { index: 1, label: "Upward",    group_level_0: "Estonia", group_level_1: "aFRR reserves" },
      { index: 2, label: "Downward",  group_level_0: "Estonia", group_level_1: "aFRR reserves" },
      { index: 3, label: "Upward",    group_level_0: "Estonia", group_level_1: "mFRR reserves" },
      { index: 4, label: "Downward",  group_level_0: "Estonia", group_level_1: "mFRR reserves" },
      { index: 5, label: "Symetric",  group_level_0: "Latvia",  group_level_1: "FCR reserves" },
      ... same pattern for Latvia (5-9), Lithuania (10-14)
    ]
  }
}
```

For Lithuania activation clearing: columns 11 (aFRR upward) and 13 (mFRR upward) are the relevant ones.

### Implementation

Add a new function `computeS2Activation()` in `workers/fetch-s1.js`:

```javascript
/**
 * Compute monthly activation clearing price aggregates from BTD.
 * Fetches 6 months of price_procured_reserves data, groups by month,
 * computes P50/avg/P90/count for aFRR and mFRR per country.
 * Stores as KV key 's2_activation'.
 */
async function computeS2Activation() {
  // Fetch 6 months of data
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  start.setDate(1); // Start from 1st of month

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const raw = await fetchBTDDataset('price_procured_reserves', startStr, endStr);
  if (!raw) return null;

  const data = raw.data || raw;
  const timeseries = data.timeseries;
  const columns = data.columns;
  if (!timeseries || !columns || timeseries.length === 0) {
    console.log('[S2/activation] No timeseries data from BTD');
    return null;
  }

  // Identify column indices by country and product
  // Pattern: each country has 5 columns: FCR sym, aFRR up, aFRR down, mFRR up, mFRR down
  const countryMap = {};
  for (const col of columns) {
    const country = col.group_level_0;
    if (!countryMap[country]) countryMap[country] = {};
    const product = col.group_level_1 || '';
    const direction = col.label;
    if (product.includes('aFRR') && direction === 'Upward') {
      countryMap[country].afrr_up_idx = col.index;
    } else if (product.includes('mFRR') && direction === 'Upward') {
      countryMap[country].mfrr_up_idx = col.index;
    }
  }

  // Group by month, collect non-null values
  const monthlyData = {}; // { 'Estonia': { '2026-04': { afrr: [...], mfrr: [...] } } }

  for (const isp of timeseries) {
    const month = isp.from.slice(0, 7); // "2026-04"
    const values = isp.values;

    for (const [country, indices] of Object.entries(countryMap)) {
      if (!monthlyData[country]) monthlyData[country] = {};
      if (!monthlyData[country][month]) monthlyData[country][month] = { afrr: [], mfrr: [] };

      const afrrVal = values[indices.afrr_up_idx];
      const mfrrVal = values[indices.mfrr_up_idx];

      if (afrrVal != null && afrrVal > 0) monthlyData[country][month].afrr.push(afrrVal);
      if (mfrrVal != null && mfrrVal > 0) monthlyData[country][month].mfrr.push(mfrrVal);
    }
  }

  // Compute P50, avg, P90, count for each country/month
  function stats(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      avg: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1],
      count: arr.length,
      total_periods: arr.length, // approximate — some ISPs may have null
      activation_rate: 1.0, // placeholder — would need volume data to compute accurately
    };
  }

  // Build the payload matching the existing s2_activation shape
  const months = [...new Set(
    Object.values(monthlyData).flatMap(c => Object.keys(c))
  )].sort();

  // Build per-country flat data (latest month for hero display)
  const countries = {};
  for (const [country, monthMap] of Object.entries(monthlyData)) {
    const latestMonth = months[months.length - 1];
    const latest = monthMap[latestMonth];
    if (latest) {
      const afrrStats = stats(latest.afrr);
      const mfrrStats = stats(latest.mfrr);
      countries[country] = {
        afrr_p50: afrrStats?.p50 ?? null,
        afrr_rate: afrrStats ? 1.0 : 0,
        mfrr_p50: mfrrStats?.p50 ?? null,
        mfrr_rate: mfrrStats ? 1.0 : 0,
      };
    }
  }

  // Build Lithuania compression trajectory (for the S2Card chart)
  const ltData = monthlyData['Lithuania'] || {};
  const compression = {
    afrr_lt_p50: months.map(m => ltData[m] ? stats(ltData[m].afrr)?.p50 ?? 0 : 0),
    afrr_lt_avg: months.map(m => ltData[m] ? stats(ltData[m].afrr)?.avg ?? 0 : 0),
    months: months,
  };

  // Build lt_monthly_afrr and lt_monthly_mfrr
  const lt_monthly_afrr = {};
  const lt_monthly_mfrr = {};
  for (const month of months) {
    if (ltData[month]) {
      lt_monthly_afrr[month] = stats(ltData[month].afrr);
      lt_monthly_mfrr[month] = stats(ltData[month].mfrr);
    }
  }

  const payload = {
    lt: countries['Lithuania'] || { afrr_p50: null, mfrr_p50: null },
    lv: countries['Latvia'] || { afrr_p50: null, mfrr_p50: null },
    ee: countries['Estonia'] || { afrr_p50: null, mfrr_p50: null },
    compression,
    lt_monthly_afrr,
    lt_monthly_mfrr,
    countries,
    data_class: 'observed',
    period: `${months[0]} to ${months[months.length - 1]}`,
    source: 'baltic.transparency-dashboard.eu',
    stored_at: new Date().toISOString(),
  };

  return payload;
}
```

### Wire into the worker cron

In the `async scheduled()` handler, add activation update to the **daily 09:30 UTC** cron (after the existing S2 fetch). This runs once per day, which is sufficient for monthly aggregates:

Find the `if (event.cron === '30 9 * * *')` block (around line 5334). After the existing S2 update logic, add:

```javascript
// Also update monthly activation clearing (once daily is sufficient)
try {
  const actPayload = await withTimeout(computeS2Activation(), 60000);
  if (actPayload) {
    await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(actPayload));
    console.log(`[S2/activation] updated: period=${actPayload.period}, lt_afrr_p50=${actPayload.lt?.afrr_p50}`);
  } else {
    console.log('[S2/activation] BTD unavailable — keeping cached data');
  }
} catch (e) {
  console.error('[S2/activation]', String(e));
}
```

### Also update the s2_activation_parsed reader

Check how the worker reads `s2_activation` to build `s2_activation_parsed`. Search for `s2_activation_parsed` usage and make sure the new payload shape matches what's expected. The key consumers:

```bash
grep -n "s2_activation_parsed\|s2_activation" workers/fetch-s1.js | head -20
```

The worker likely reads KV key `s2_activation` and stores it in a `kv` object as `s2_activation_parsed`. Make sure the `computeS2Activation()` output matches the expected shape:
- `lt.afrr_p50`, `lt.mfrr_p50` — used for hero display
- `compression.afrr_lt_p50`, `compression.months` — used for chart
- `lt_monthly_afrr[month].avg/.p50/.p90/.count` — used for detailed view
- `data_class`, `period`, `source` — metadata

### Add a staleness watchdog to daily digest

In `sendDailyDigest()`, add a check:

```javascript
// Check activation data freshness
const actRaw = await env.KKME_SIGNALS.get('s2_activation');
if (actRaw) {
  const act = JSON.parse(actRaw);
  const storedAt = new Date(act.stored_at);
  const ageDays = (Date.now() - storedAt.getTime()) / 86400000;
  if (ageDays > 3) {
    warnings.push(`⚠️ S2 activation data is ${Math.floor(ageDays)} days old (stored ${act.stored_at})`);
  }
}
```

### Immediate data push

After implementing the automation, trigger it manually to populate fresh data NOW:

```bash
# Deploy the updated worker
npx wrangler deploy

# Trigger the cron manually (if wrangler supports it)
# OR call the endpoint directly if there's a manual trigger
curl -X POST "https://kkme-fetch-s1.kastis-kemezys.workers.dev/admin/trigger-activation" \
  -H "X-Update-Secret: $UPDATE_SECRET"
```

If there's no admin trigger endpoint, add one:

```javascript
// ── POST /admin/trigger-activation ──────────────────────────────────────
if (request.method === 'POST' && url.pathname === '/admin/trigger-activation') {
  const secret = request.headers.get('X-Update-Secret');
  if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
  const payload = await computeS2Activation();
  if (!payload) return jsonResp({ error: 'BTD unavailable' }, 502);
  await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(payload));
  return jsonResp({ ok: true, period: payload.period, lt_afrr_p50: payload.lt?.afrr_p50 });
}
```

---

## Task 3: Verification

1. **Deploy worker:** `npx wrangler deploy`
2. **Trigger activation update:** Call the admin trigger endpoint or wait for 09:30 UTC cron
3. **Check the data:** `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2/activation | python3 -m json.tool | head -20`
   - `stored_at` should be today
   - `period` should include 2026-04
   - `lt.afrr_p50` should be a number (not null)
4. **Check S2Card:** `npm run dev`, verify the card shows current month data
5. **Check light mode hero:** No Tampere, halftone cream map
6. **Build:** `npx next build` — must succeed

---

## Step 4: Commit

```bash
git add -A
git commit -m "phase6a: automate S2 activation clearing in worker cron, fix light-mode map (remove old PNG)"
git push -u origin phase-6a-s2-auto-tampere
```

Compare URL: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-6a-s2-auto-tampere`

**Report:** S2 activation data freshness, S2Card screenshot showing current month, hero light mode screenshot.
