import { useState } from "react";

// === KKME Design Tokens ===
const T = {
  bg: "#07070a",
  bgElevated: "rgba(232,226,217,0.04)",
  textPrimary: "rgba(232,226,217,0.88)",
  textSecondary: "rgba(232,226,217,0.65)",
  textTertiary: "rgba(232,226,217,0.45)",
  textMuted: "rgba(232,226,217,0.30)",
  textGhost: "rgba(232,226,217,0.15)",
  teal: "rgb(0,180,160)",
  amber: "rgb(212,160,60)",
  rose: "rgb(214,88,88)",
  borderCard: "rgba(232,226,217,0.10)",
  borderHighlight: "rgba(232,226,217,0.20)",
};

// === Mock Data (matches real /s3 response) ===
const MOCK = {
  cost_profiles: {
    "2h": {
      capex_range_kwh: [230, 280],
      capex_range_kw: [460, 560],
      breakdown: {
        dc_block: { range_kwh: [80, 110], mid_kwh: 95, label: "DC block", scope: "equipment-only" },
        pcs: { range_kw: [35, 55], mid_kw: 45, label: "PCS / inverter", scope: "equipment-only" },
        bos_civil: { range_kwh: [25, 45], mid_kwh: 35, label: "BOS + civil", scope: "installed excl. grid" },
        hv_grid: { range_kwh: [12, 50], label: "HV grid connection", scope: "grid-scope-dependent" },
        soft_costs: { range_kwh: [10, 22], mid_kwh: 15, label: "EPC + perm. + cont.", scope: "installed" },
      },
    },
    "4h": {
      capex_range_kwh: [160, 210],
      capex_range_kw: [640, 840],
      breakdown: {
        dc_block: { range_kwh: [70, 100], mid_kwh: 85, label: "DC block", scope: "equipment-only" },
        pcs: { range_kw: [35, 55], mid_kw: 45, label: "PCS / inverter", scope: "equipment-only" },
        bos_civil: { range_kwh: [22, 40], mid_kwh: 30, label: "BOS + civil", scope: "installed excl. grid" },
        hv_grid: { range_kwh: [12, 50], label: "HV grid connection", scope: "grid-scope-dependent" },
        soft_costs: { range_kwh: [8, 18], mid_kwh: 12, label: "EPC + perm. + cont.", scope: "installed" },
      },
    },
  },
  cost_drivers: [
    { driver: "Battery hardware", direction: "easing", symbol: "↓", magnitude: "moderate", component: "dc_block", detail: "LFP cell prices declining ~15% YoY. China overcapacity. Not fully passing through to EU turnkey." },
    { driver: "Electrical / PCS", direction: "constrained", symbol: "→", magnitude: "weak", component: "pcs", detail: "Grid-forming requirements adding compliance cost. Supply adequate." },
    { driver: "HV grid equipment", direction: "constrained", symbol: "↑", magnitude: "strong", component: "hv_grid", detail: "HV equipment lead times 10–16mo. Critical path. Prices elevated since 2021." },
    { driver: "Financing", direction: "easing", symbol: "↓", magnitude: "moderate", component: "lcos", detail: "Euribor falling from 2023 peak. Improves LCOS and project IRR." },
  ],
  uncertainty: { range_pct: "±15–30%", primary_driver: "grid scope + project size" },
  trend: { direction: "easing", twelve_month: "↓ equipment · ↑ grid · ↓ financing" },
  market_bands: {
    developer_optimized: { range_kwh: [120, 160] },
    eu_turnkey_typical: { range_kwh: [160, 220] },
    institutional_tso: { range_kwh: [220, 500] },
    observed_floor: 110, observed_ceiling: 500,
  },
  lead_times: { hv_equipment_months: [10, 16], battery_plus_shipping_months: [5, 8], total_rtb_to_cod_months: [12, 18], critical_path: "HV equipment procurement" },
  scale_effect: { large_over_80mw: "−10–20%", small_under_20mw: "+15–30%" },
  lcos_reference: { range_eur_mwh: [80, 130], assumptions: { cycles_per_year: [300, 365], rte_pct: [85, 88], wacc_pct: [6, 9], augmentation: "Y8–12" } },
  confidence: { level: "benchmark-heavy" },
  transactions: [
    { project: "Ignitis 3-site", country: "LT", mw: 291, mwh: 582, eur_kwh_approx: 224, scope: "all-in", year: 2025, integrator: "Rolls-Royce", cost_driver: "Scale + full substation" },
    { project: "AST Latvia", country: "LV", mw: 80, mwh: 160, eur_kwh_approx: 490, scope: "all-in", year: 2025, integrator: null, cost_driver: "TSO premium + smaller scale" },
    { project: "Utilitas", country: "EE", mw: 10, mwh: 20, eur_kwh_approx: 350, scope: "partial", year: 2024, integrator: null, cost_driver: "Small scale / pilot" },
  ],
  technology: {
    chemistry: "LFP", calendar_life_years: [15, 25], cycle_life: [6000, 10000],
    rte_percent: [85, 88], degradation_annual_pct: [0.4, 0.8], eol_capacity_pct: 70,
    warranty_typical: "15yr → 70% SoH", lifetime_throughput_gwh_per_mw: [12, 30],
    augmentation: "Y8–12 (10–15% DC block)", degradation_shape: "non-linear",
    degradation_note: "Slow early (Y1–5), linear mid-life (Y5–15), accelerates late.",
  },
  key_players: {
    cells_dc: [
      { name: "CATL", hq: "CN", positioning: "Premium pricing, highest bankability" },
      { name: "BYD", hq: "CN", positioning: "Vertically integrated, aggressive" },
      { name: "EVE Energy", hq: "CN", positioning: "Mid-tier, fast EU entry" },
      { name: "Hithium", hq: "CN", positioning: "Aggressive pricing, newer entrant" },
    ],
    pcs: [
      { name: "Sungrow", hq: "CN", positioning: "Dominant EU utility, cost-efficient" },
      { name: "Huawei", hq: "CN", positioning: "Distributed string architecture" },
      { name: "Power Electronics", hq: "ES", positioning: "European, grid-forming, premium" },
    ],
    integrators: [
      { name: "Rolls-Royce", hq: "UK", positioning: "Ignitis project. Premium reliability." },
      { name: "Fluence", hq: "US", positioning: "Gridstack. Strong bankability." },
      { name: "Wärtsilä", hq: "FI", positioning: "Nordic presence. O&M bundling." },
    ],
    hv_equipment: [
      { name: "Hitachi Energy", hq: "JP/CH", positioning: "Major supplier. Long lead times." },
      { name: "Siemens Energy", hq: "DE", positioning: "European supply chain. Constrained." },
    ],
  },
  euribor_3m: 2.01, hicp_yoy: 1.9, euribor_real_3m: 0.11,
  lithium_eur_t: 20789, china_system_eur_kwh: 68, europe_system_eur_kwh: 164,
  data_freshness: {
    ecb_euribor: { last_update: "2026-03-28", cadence: "daily", status: "current" },
    lithium_proxy: { last_update: "2026-03-28", cadence: "daily", status: "current", confidence: "proxy" },
    capex_reference: { last_update: "2025-12", cadence: "quarterly", status: "current" },
    nrel_anchor: { last_update: "2025-06", cadence: "annual", status: "structural anchor" },
  },
  policy_flags: [
    { name: "Grid-forming requirements", impact: "PCS cost ↑", status: "emerging" },
    { name: "EU Batteries Regulation", impact: "Compliance cost", status: "in force" },
    { name: "Baltic balancing cost shift", impact: "Net revenue ↓", status: "active 2026" },
  ],
  supplier_spread: { premium_bankable: "+10–25%", mainstream: "baseline", aggressive_new_entrant: "−10–20%" },
  contract_structure: { turnkey_epc: "+10–20%", multi_contract: "baseline" },
  price_lag: { battery_cell_months: [3, 6], hv_equipment_months: [6, 16] },
};

// === Shared Styles ===
const mono = "'DM Mono', 'Fira Code', 'SF Mono', monospace";
const serif = "'Cormorant Garamond', 'Georgia', serif";
const display = "'Unbounded', 'DM Mono', monospace";

const Pill = ({ children, style }) => (
  <span style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, border: `1px solid ${T.borderCard}`, borderRadius: 3, padding: "2px 6px", ...style }}>{children}</span>
);

// === Drawer Component ===
function Drawer({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${T.borderCard}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer", padding: "10px 0", fontFamily: mono, fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", userSelect: "none" }}
      >
        {open ? "▾" : "▸"} {title}
      </div>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

// === Breakdown Bar ===
function BreakdownBar({ label, rangeKwh, midKwh, scope, maxVal, isHV, unit = "€/kWh" }) {
  const low = rangeKwh[0];
  const high = rangeKwh[1];
  const barColor = isHV ? T.amber : T.teal;
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
      <div style={{ width: 130, flexShrink: 0, fontFamily: mono, fontSize: 10, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ width: 85, flexShrink: 0, fontFamily: mono, fontSize: 10, color: T.textPrimary, textAlign: "right" }}>~€{low}–{high}</div>
      <div style={{ flex: 1, position: "relative", height: 10 }}>
        {/* Background track */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 3, height: 4, background: "rgba(232,226,217,0.04)", borderRadius: 2 }} />
        {/* Range band */}
        <div style={{
          position: "absolute",
          left: `${(low / maxVal) * 100}%`,
          width: `${((high - low) / maxVal) * 100}%`,
          top: 1, height: 8,
          background: isHV ? "rgba(212,160,60,0.2)" : "rgba(0,180,160,0.15)",
          borderRadius: 2,
        }} />
        {/* Mid marker (not for HV — no sensible midpoint) */}
        {midKwh && (
          <div style={{
            position: "absolute",
            left: `${(midKwh / maxVal) * 100}%`,
            top: 0, width: 2, height: 10,
            background: barColor,
            borderRadius: 1,
          }} />
        )}
      </div>
      <div style={{ width: 90, flexShrink: 0, fontFamily: mono, fontSize: 9, color: T.textMuted, textAlign: "right" }}>{scope}</div>
    </div>
  );
}

// === Main Card ===
export default function S3CardReference() {
  const [duration, setDuration] = useState("4h");
  const [gridScope, setGridScope] = useState("heavy");
  const [expandedChip, setExpandedChip] = useState(null);

  const d = MOCK;
  const profile = d.cost_profiles[duration];
  const bd = profile.breakdown;

  // Compute displayed CAPEX range based on grid scope
  const capexRange = gridScope === "light"
    ? [profile.capex_range_kwh[0] - 15, profile.capex_range_kwh[1] - 20]
    : profile.capex_range_kwh;
  const kwRange = gridScope === "light"
    ? [profile.capex_range_kw[0] - 60, profile.capex_range_kw[1] - 80]
    : profile.capex_range_kw;

  // Max value for bar scale
  const maxBarVal = 120;

  // Duration for PCS conversion
  const H = duration === "2h" ? 2 : 4;
  const pcsKwhEquiv = bd.pcs.mid_kw / H;

  const chipColor = (dir) => dir === "easing" ? T.teal : dir === "constrained" || dir === "increasing" ? T.amber : T.textSecondary;
  const magnitudeDots = (m) => m === "weak" ? "●" : m === "moderate" ? "●●" : "●●●";

  return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: "24px 16px", fontFamily: mono }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {/* === CARD === */}
        <div style={{ border: `1px solid ${T.borderCard}`, padding: 24, background: T.bg }}>

          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>
              BESS COST & TECHNOLOGY
            </div>
            <Pill style={{ color: T.textMuted }}>{d.confidence.level}</Pill>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, marginBottom: 16 }}>
            Installed cost reference · scope-adjusted range
          </div>

          {/* TOGGLES */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 0 }}>
              {["2h", "4h"].map(d => (
                <button key={d} onClick={() => setDuration(d)} style={{
                  background: "none", border: "none", cursor: "pointer", padding: "4px 10px",
                  fontFamily: mono, fontSize: 11,
                  color: duration === d ? T.teal : T.textMuted,
                  borderBottom: duration === d ? `1px solid ${T.teal}` : "1px solid transparent",
                }}>{d}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 14, background: T.borderCard }} />
            <div style={{ display: "flex", gap: 0 }}>
              {["Light", "Heavy"].map(s => {
                const val = s.toLowerCase();
                return (
                  <button key={s} onClick={() => setGridScope(val)} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "4px 10px",
                    fontFamily: mono, fontSize: 11,
                    color: gridScope === val ? T.teal : T.textMuted,
                    borderBottom: gridScope === val ? `1px solid ${T.teal}` : "1px solid transparent",
                  }}>{s}</button>
                );
              })}
            </div>
          </div>

          {/* HERO CAPEX */}
          <div style={{ marginBottom: 2 }}>
            <span style={{ fontFamily: display, fontSize: 32, color: T.textPrimary, fontWeight: 400, letterSpacing: "-0.02em" }}>
              €{capexRange[0]}–{capexRange[1]}
            </span>
            <span style={{ fontFamily: mono, fontSize: 14, color: T.textSecondary, marginLeft: 4 }}>/kWh</span>
            <span style={{ fontFamily: mono, fontSize: 16, color: T.teal, marginLeft: 12 }}>↘</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, color: T.textSecondary, marginBottom: 2 }}>
            €{kwRange[0]}–{kwRange[1]} /kW @ POI
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, marginBottom: 12 }}>
            installed · ex-VAT · {duration} LFP · EU turnkey · grid-{gridScope}
          </div>

          {/* MARKET SEGMENTATION BAND */}
          <div style={{ margin: "0 0 12px", padding: "10px 0", borderTop: `1px solid ${T.borderCard}`, borderBottom: `1px solid ${T.borderCard}` }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              OBSERVED MARKET SPREAD
            </div>
            <div style={{ position: "relative", height: 20, marginBottom: 4 }}>
              {/* Background */}
              <div style={{ position: "absolute", left: 0, right: 0, top: 7, height: 6, background: "rgba(232,226,217,0.04)", borderRadius: 3 }} />
              {/* Developer band */}
              <div style={{
                position: "absolute",
                left: `${((120 - 110) / 390) * 100}%`, width: `${((160 - 120) / 390) * 100}%`,
                top: 5, height: 10, background: "rgba(0,180,160,0.2)", borderRadius: 2,
              }} />
              {/* EU turnkey (highlighted) */}
              <div style={{
                position: "absolute",
                left: `${((160 - 110) / 390) * 100}%`, width: `${((220 - 160) / 390) * 100}%`,
                top: 3, height: 14, background: "rgba(0,180,160,0.35)",
                border: `1px solid ${T.teal}`, borderRadius: 2,
              }} />
              {/* Institutional band */}
              <div style={{
                position: "absolute",
                left: `${((220 - 110) / 390) * 100}%`, width: `${((500 - 220) / 390) * 100}%`,
                top: 5, height: 10, background: "rgba(212,160,60,0.12)", borderRadius: 2,
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, lineHeight: 1.3 }}>
              <span style={{ color: T.textMuted }}>€120–160{"\n"}developer</span>
              <span style={{ color: T.teal, fontWeight: 500 }}>€160–220 ←{"\n"}EU turnkey</span>
              <span style={{ color: T.textMuted }}>€220–500+{"\n"}institutional</span>
            </div>
          </div>

          {/* UNCERTAINTY + TREND */}
          <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, marginBottom: 3 }}>
            {d.uncertainty.range_pct} · grid scope strongest · supplier ±10–15%
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: T.textSecondary }}>12M: </span>
            <span style={{ color: T.teal }}>↓</span><span style={{ color: T.textSecondary }}> equipment · </span>
            <span style={{ color: T.amber }}>↑</span><span style={{ color: T.textSecondary }}> grid · </span>
            <span style={{ color: T.teal }}>↓</span><span style={{ color: T.textSecondary }}> financing</span>
          </div>

          {/* LEAD TIMES + SCALE */}
          <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, marginBottom: 2 }}>
            Lead time: ~{d.lead_times.total_rtb_to_cod_months[0]} mo RTB→COD · HV {d.lead_times.hv_equipment_months[0]}–{d.lead_times.hv_equipment_months[1]} mo · battery {d.lead_times.battery_plus_shipping_months[0]}–{d.lead_times.battery_plus_shipping_months[1]} mo
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, marginBottom: 14 }}>
            Scale: {d.scale_effect.large_over_80mw} above 80MW · {d.scale_effect.small_under_20mw} below 20MW
          </div>

          {/* DRIVER CHIPS */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            {d.cost_drivers.map((drv, i) => (
              <div key={i}
                onClick={() => setExpandedChip(expandedChip === i ? null : i)}
                style={{
                  background: T.bgElevated, border: `1px solid ${T.borderCard}`, borderRadius: 4,
                  padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  transition: "border-color 0.2s",
                  borderColor: expandedChip === i ? chipColor(drv.direction) : T.borderCard,
                }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: chipColor(drv.direction) }}>
                  {drv.symbol} {drv.driver}
                </span>
                <span style={{ fontFamily: mono, fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>
                  {magnitudeDots(drv.magnitude)}
                </span>
              </div>
            ))}
          </div>
          {/* Expanded chip detail */}
          {expandedChip !== null && (
            <div style={{ fontFamily: serif, fontSize: 12, fontStyle: "italic", color: T.textMuted, marginBottom: 10, lineHeight: 1.5, paddingLeft: 4 }}>
              {d.cost_drivers[expandedChip].detail}
            </div>
          )}
          {expandedChip === null && <div style={{ height: 10 }} />}

          {/* BREAKDOWN */}
          <div style={{ borderTop: `1px solid ${T.borderCard}`, paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              BREAKDOWN · mid-case · ranges vary by scope & supplier
            </div>
            <BreakdownBar label={bd.dc_block.label} rangeKwh={bd.dc_block.range_kwh} midKwh={bd.dc_block.mid_kwh} scope={bd.dc_block.scope} maxVal={maxBarVal} />
            <BreakdownBar label={bd.bos_civil.label} rangeKwh={bd.bos_civil.range_kwh} midKwh={bd.bos_civil.mid_kwh} scope={bd.bos_civil.scope} maxVal={maxBarVal} />
            <BreakdownBar label={bd.pcs.label} rangeKwh={[Math.round(bd.pcs.range_kw[0] / H), Math.round(bd.pcs.range_kw[1] / H)]} midKwh={Math.round(pcsKwhEquiv)} scope={bd.pcs.scope} maxVal={maxBarVal} unit="€/kW" />
            <div style={{ fontFamily: mono, fontSize: 9, fontStyle: "italic", color: T.textMuted, marginLeft: 130, marginBottom: 6, marginTop: -2 }}>
              PCS: €{bd.pcs.range_kw[0]}–{bd.pcs.range_kw[1]}/kW · fixed per MW, shown as €/kWh for {duration}
            </div>
            <BreakdownBar label={bd.hv_grid.label} rangeKwh={bd.hv_grid.range_kwh} midKwh={null} scope={bd.hv_grid.scope} maxVal={maxBarVal} isHV />
            <BreakdownBar label={bd.soft_costs.label} rangeKwh={bd.soft_costs.range_kwh} midKwh={bd.soft_costs.mid_kwh} scope={bd.soft_costs.scope} maxVal={maxBarVal} />
          </div>

          {/* LCOS REFERENCE */}
          <div style={{ borderTop: `1px solid ${T.borderCard}`, paddingTop: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>LCOS (reference)</span>
              <span style={{ fontFamily: display, fontSize: 18, color: T.textPrimary }}>€{d.lcos_reference.range_eur_mwh[0]}–{d.lcos_reference.range_eur_mwh[1]}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: T.textSecondary }}>/MWh delivered</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              <Pill>{d.lcos_reference.assumptions.cycles_per_year[0]}–{d.lcos_reference.assumptions.cycles_per_year[1]} cycles/yr</Pill>
              <Pill>{d.lcos_reference.assumptions.rte_pct[0]}–{d.lcos_reference.assumptions.rte_pct[1]}% RTE</Pill>
              <Pill>{d.lcos_reference.assumptions.wacc_pct[0]}–{d.lcos_reference.assumptions.wacc_pct[1]}% WACC</Pill>
              <Pill>aug {d.lcos_reference.assumptions.augmentation}</Pill>
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted }}>
              Full computation → <span style={{ color: T.teal, cursor: "pointer" }}>Revenue Engine</span>
            </div>
          </div>

          {/* CROSS-LINKS */}
          <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, display: "flex", gap: 16, marginBottom: 16 }}>
            <span>Grid constraint → <span style={{ color: T.teal }}>S4</span></span>
            <span>Revenue impact → <span style={{ color: T.teal }}>Revenue Engine</span></span>
          </div>

          {/* === DRAWERS === */}

          {/* Transaction Evidence */}
          <Drawer title="Baltic transaction evidence">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 10 }}>
                <thead>
                  <tr style={{ color: T.textTertiary, textAlign: "left" }}>
                    <th style={{ padding: "4px 6px 4px 0", fontWeight: 400 }}>Project</th>
                    <th style={{ padding: "4px 6px", fontWeight: 400 }}>Ctry</th>
                    <th style={{ padding: "4px 6px", fontWeight: 400 }}>Size</th>
                    <th style={{ padding: "4px 6px", fontWeight: 400, textAlign: "right" }}>~€/kWh</th>
                    <th style={{ padding: "4px 6px", fontWeight: 400 }}>Year</th>
                    <th style={{ padding: "4px 6px", fontWeight: 400 }}>Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {d.transactions.map((tx, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.borderCard}` }}>
                      <td style={{ padding: "5px 6px 5px 0", color: T.textSecondary }}>{tx.project}</td>
                      <td style={{ padding: "5px 6px", color: T.textMuted }}>{tx.country}</td>
                      <td style={{ padding: "5px 6px", color: T.textSecondary, whiteSpace: "nowrap" }}>{tx.mw}MW/{tx.mwh}MWh</td>
                      <td style={{ padding: "5px 6px", color: T.textPrimary, textAlign: "right", fontWeight: 500 }}>{tx.eur_kwh_approx}</td>
                      <td style={{ padding: "5px 6px", color: T.textMuted }}>{tx.year}</td>
                      <td style={{ padding: "5px 6px", color: T.textMuted, fontStyle: "italic", fontSize: 9 }}>{tx.cost_driver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontFamily: serif, fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.5 }}>
              Scope drives Baltic variance. Grid + substation can add 50–200% vs equipment-only. Do not average across transactions.
            </div>
          </Drawer>

          {/* Technology Profile */}
          <Drawer title="Technology profile · LFP">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontFamily: mono, fontSize: 10, marginBottom: 10 }}>
              {[
                ["Calendar life", `${d.technology.calendar_life_years[0]}–${d.technology.calendar_life_years[1]} yr`],
                ["Cycle life", `${d.technology.cycle_life[0].toLocaleString()}–${d.technology.cycle_life[1].toLocaleString()}`],
                ["Round-trip eff.", `${d.technology.rte_percent[0]}–${d.technology.rte_percent[1]}%`],
                ["Degradation", `${d.technology.degradation_annual_pct[0]}–${d.technology.degradation_annual_pct[1]}%/yr · ${d.technology.degradation_shape}`],
                ["End-of-life", `${d.technology.eol_capacity_pct}% SoH`],
                ["Warranty", d.technology.warranty_typical],
                ["Throughput", `${d.technology.lifetime_throughput_gwh_per_mw[0]}–${d.technology.lifetime_throughput_gwh_per_mw[1]} GWh/MW`],
                ["Augmentation", d.technology.augmentation],
              ].map(([label, val], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${T.borderCard}` }}>
                  <span style={{ color: T.textTertiary }}>{label}</span>
                  <span style={{ color: T.textPrimary, textAlign: "right" }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: serif, fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
              {d.technology.degradation_note} LFP dominant for utility-scale. Sodium-ion emerging, unproven at grid scale.
            </div>
          </Drawer>

          {/* Key Players */}
          <Drawer title="Key players · watchlist">
            {Object.entries({ "CELLS / DC BLOCK": d.key_players.cells_dc, "PCS / INVERTER": d.key_players.pcs, "INTEGRATORS": d.key_players.integrators, "HV EQUIPMENT": d.key_players.hv_equipment }).map(([group, players]) => (
              <div key={group} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{group}</div>
                {players.map((p, i) => (
                  <div key={i} style={{ fontFamily: mono, fontSize: 10, marginBottom: 2 }}>
                    <span style={{ color: T.textSecondary }}>{p.name}</span>
                    <span style={{ color: T.textMuted }}> · {p.hq} · {p.positioning}</span>
                  </div>
                ))}
              </div>
            ))}
          </Drawer>

          {/* Project Variables */}
          <Drawer title="Project variables">
            {[
              { header: "CONTRACT STRUCTURE", items: [`Turnkey EPC: ${d.contract_structure.turnkey_epc} vs multi-contract. Most Baltic projects use turnkey.`, `Multi-contract: ${d.contract_structure.multi_contract} (lower cost, higher integration risk).`] },
              { header: "SUPPLIER SPREAD", items: [`Premium bankable: ${d.supplier_spread.premium_bankable}`, `Mainstream: ${d.supplier_spread.mainstream}`, `Aggressive: ${d.supplier_spread.aggressive_new_entrant}`] },
              { header: "PRICE LAG", items: [`Battery: upstream → turnkey in ${d.price_lag.battery_cell_months[0]}–${d.price_lag.battery_cell_months[1]} months.`, `HV equipment: upstream → project cost in ${d.price_lag.hv_equipment_months[0]}–${d.price_lag.hv_equipment_months[1]} months.`, "Lithium ↓ today ≠ CAPEX ↓ today."] },
              { header: "POLICY", items: d.policy_flags.map(f => `${f.name}: ${f.impact}. ${f.status}.`) },
            ].map(({ header, items }) => (
              <div key={header} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{header}</div>
                {items.map((item, i) => (
                  <div key={i} style={{ fontFamily: mono, fontSize: 10, color: T.textSecondary, marginBottom: 2 }}>{item}</div>
                ))}
              </div>
            ))}
          </Drawer>

          {/* Raw Inputs */}
          <Drawer title="Raw inputs">
            <div style={{ fontFamily: mono, fontSize: 10 }}>
              {[
                ["Li carbonate", `€${(d.lithium_eur_t / 1000).toFixed(0)}k/t → stable`, T.textPrimary],
                ["Euribor 3M", `${d.euribor_3m}% nominal`, T.textPrimary],
                ["HICP YoY", `${d.hicp_yoy}%`, T.textPrimary],
                ["Real rate", `${d.euribor_real_3m}%`, T.textPrimary],
                ["China system", `~€${d.china_system_eur_kwh}/kWh (equipment-only, DDP)`, T.textSecondary],
                ["EU reference", `~€${d.europe_system_eur_kwh}/kWh (installed, BNEF Dec 2025)`, T.textSecondary],
              ].map(([label, val, color], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${T.borderCard}` }}>
                  <span style={{ color: T.textTertiary }}>{label}</span>
                  <span style={{ color }}>{val}</span>
                </div>
              ))}
            </div>
          </Drawer>

          {/* Methodology */}
          <Drawer title="Methodology & sources">
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textSecondary, marginBottom: 10, lineHeight: 1.6 }}>
              Installed CAPEX ex-VAT. Includes BOS. Grid scope selectable (light/heavy). Excludes: land, developer margin, financing during construction. Normalisation: €/kWh_DC and €/kW_AC @ POI. Duration-specific.
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>DATA FRESHNESS</div>
            <div style={{ fontFamily: mono, fontSize: 10 }}>
              {Object.entries(d.data_freshness).map(([key, f]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: `1px solid ${T.borderCard}` }}>
                  <span style={{ color: T.textTertiary }}>{key.replace(/_/g, " ")}</span>
                  <span style={{ color: f.status === "current" ? T.teal : f.status === "structural anchor" ? T.textMuted : T.amber, fontSize: 9 }}>
                    {f.status} · {f.cadence}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: T.textMuted, marginTop: 10 }}>
              Confidence: observed 20% · benchmark 50% · modeled 30%
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, color: T.textMuted, marginTop: 8 }}>
              BNEF Dec 2025 · NREL ATB 2025 · IEA Grid Supply Chain · ECB Data Portal · tradingeconomics.com · SMM
            </div>
          </Drawer>

          {/* MODEL INPUT FOOTER */}
          <div style={{ fontFamily: mono, fontSize: 11, color: T.textGhost, marginTop: 16, paddingTop: 8, borderTop: `1px solid ${T.borderCard}` }}>
            MODEL INPUT → CAPEX reference · Financing cost
          </div>

        </div>
      </div>
    </div>
  );
}
