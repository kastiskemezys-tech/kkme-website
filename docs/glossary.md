# KKME Glossary

Energy market and project-specific terms as used in this codebase.

| Term | Meaning in KKME context |
|------|------------------------|
| aFRR | Automatic Frequency Restoration Reserve. Baltic balancing product. Capacity price + activation energy price. Primary revenue stream for BESS. |
| mFRR | Manual Frequency Restoration Reserve. Slower balancing product. Lower activation frequency than aFRR. |
| FCR | Frequency Containment Reserve. Fastest response product. Limited Baltic market currently. |
| S/D ratio | Supply/demand ratio for Baltic balancing capacity. Supply = BESS fleet MW. Demand = TSO procurement volume. Below 1.0× = scarcity (good for BESS). Above 1.0× = compression (bad). |
| CPI | Competition Pressure Index. KKME-derived metric tracking fleet growth vs demand. NOT consumer price index. Range: 0.25–2.0. |
| BTD | Baltic Transparency Dashboard (api-baltic.transparency-dashboard.eu). Source for S2 balancing market data. |
| ENTSO-E | European Network of TSOs for Electricity. Source for day-ahead prices (A44 document type), generation/load, interconnector flows. |
| ISP | Imbalance Settlement Period. 15 minutes in the Baltics. The granularity at which prices are settled. |
| DA | Day-ahead (market). Prices set one day before delivery via auction. |
| COD | Commercial Operation Date. When a BESS project starts generating revenue. |
| DSCR | Debt Service Coverage Ratio. Cash flow / debt service. 1.20× = bankability floor in KKME model. |
| IRR | Internal Rate of Return. Project IRR (pre-leverage) is the primary metric. Equity IRR is secondary. |
| CAPEX | Capital expenditure. KKME tracks full-project CAPEX, not just cell cost. Three scenarios: low (€120/kWh), mid (€164/kWh), high (€262/kWh). |
| 2H / 4H | Battery duration. 2-hour or 4-hour storage at rated power. 50MW/100MWh = 2H. 50MW/200MWh = 4H. |
| Reference asset | Fixed 50MW BESS used as throughline for all economic analysis. Not configurable by user. |
| NordBalt | HVDC cable connecting Lithuania (Klaipeda) and Sweden (Nybro). 700 MW capacity. |
| LitPol | HVDC link connecting Lithuania and Poland. ~500 MW capacity. |
| EstLink | HVDC cables connecting Estonia and Finland. EstLink 1 (350 MW) + EstLink 2 (650 MW). |
| Litgrid | Lithuanian TSO (Transmission System Operator). Source for grid capacity data. |
| AST | Latvian TSO. |
| Elering | Estonian TSO. |
| VERT | Lithuanian energy regulatory authority (Valstybinė energetikos reguliavimo taryba). Source for permits and grid connection data via ArcGIS. |
| KV | Cloudflare Workers KV (Key-Value store). Where all signal data lives between worker cron runs and frontend fetches. |
| Proxy | Data classification: value derived from a related but not identical source. E.g., using LT data as a Baltic-wide proxy. Must be flagged in UI. |
| Observed | Data classification: directly measured value from authoritative source. Highest confidence. |
| Derived | Data classification: calculated from observed values using a defined formula. |
| Modeled | Data classification: output of a predictive model. Lowest confidence for forward-looking values. |
