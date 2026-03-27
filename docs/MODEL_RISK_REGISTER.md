# KKME Model Risk Register
# Structured assessment of what the model does not know.

| ID | Module | Risk | Impact | Current mitigation | Residual risk | Visible |
|----|--------|------|--------|-------------------|---------------|---------|
| MR-01 | Reserve prices | Baltic clearing prices not fully observed — proxy range from BTD procurement data only | HIGH | Proxy badge + detail-only display + range not point estimate | HIGH | public |
| MR-02 | Pipeline timing | Static status weights (0.10–1.00), not hazard model — ignores slippage distributions | HIGH | Evidence-weighted stages (5 levels) + contradiction detection | HIGH | public |
| MR-03 | Dispatch stacking | Fixed capacity factor (80%), not LP optimizer — overstates revenue from multi-product stacking | HIGH | Disclosed assumption + sensitivity shown + stacking caveat | HIGH | public |
| MR-04 | Activation revenue | No observed Baltic activation data — assumed rates (18% aFRR, 10% mFRR) from EU comparators | HIGH | Assumptions documented + sensitivity to activation rate shown | HIGH | public |
| MR-05 | DRR distortion | TSO derogation exit timing unknown — DRR at zero price suppresses merchant FCR revenue until ~2028 | MEDIUM | Tracked in regime engine, expires ~2028-02, flagged on FCR card | MEDIUM | public |
| MR-06 | Market design | BBCM/PICASSO/MARI design changes not modeled — rule changes can shift value between products | MEDIUM | Event log maintained in intel feed, not quantified in model | HIGH | public |
| MR-07 | Cross-zonal | Reserve sharing and CZC allocation effects on local MCPs not modeled | MEDIUM | Interconnector flows observed (ENTSO-E A11) but not linked to reserve pricing | MEDIUM | internal |
| MR-08 | Coverage | LV/EE grid data missing — LT only from VERT.lt ArcGIS | MEDIUM | LT grid labeled as LT-only, not "Baltic" | MEDIUM | public |
| MR-09 | Li carbonate | No free real-time lithium carbonate source — CAPEX sensitivity relies on reference benchmarks | LOW | Clean Horizon + manual updates + shimmer skeleton for future | LOW | public |
| MR-10 | Model version | No formal versioning or regression testing — model changes not automatically validated | MEDIUM | CLAUDE.md tracks assumptions + model changelog maintained | MEDIUM | internal |
| MR-11 | Demand estimate | Effective demand (1190 MW) uses stacking factor (0.70) that is assumed, not observed | MEDIUM | TSO source cited + assumption documented in registry | MEDIUM | public |
| MR-12 | RTE degradation | Round-trip efficiency degradation not modeled year-by-year — fixed 87.5% | LOW | Augmentation at year 10 partially addresses | LOW | internal |

## Review schedule
- Monthly: review all HIGH residual risks
- Quarterly: full register review
- On event: market design changes (BBCM rule change, platform accession) trigger immediate review

## Escalation
- New HIGH risk → update VARIABLE_DICTIONARY.md gate + update UI display
- Risk downgraded → document evidence in MODEL_CHANGELOG.md
- Risk accepted → log in this register with rationale
