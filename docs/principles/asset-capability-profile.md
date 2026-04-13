# Reference Asset Capability Profile
# Placeholder — used before dispatch LP exists.
# Defines what a representative BESS can physically do.

## Reference asset: 50 MW / 100 MWh (2H)

| Parameter | Value | Unit | Source |
|-----------|-------|------|--------|
| Rated power | 50 | MW | reference |
| Rated energy | 100 | MWh | reference |
| Duration | 2.0 | hours | computed |
| Round-trip efficiency | 87.5 | % | manufacturer typical (LFP) |
| Min SoC for up-reserve | 10 | % | operational constraint |
| Max SoC for down-reserve | 90 | % | operational constraint |
| Response time (FCR) | < 1 | seconds | LFP capability |
| Response time (aFRR) | < 30 | seconds | LFP capability |
| Response time (mFRR) | < 12.5 | minutes | product requirement |
| Max cycles/day | 2.0 | cycles | degradation budget |
| Annual degradation | 2.5 | %/year | LFP typical |
| Augmentation year | 10 | year | industry practice |
| Augmentation cost | €25/kWh | | industry trajectory |

## Alternate configurations (for comparison)

### 50 MW / 120 MWh (2.4H)
Same as above but with 120 MWh energy capacity.
Duration: 2.4 hours. Slightly more flexibility for reserve + arbitrage stacking.

### 50 MW / 200 MWh (4H)
Duration: 4.0 hours. More suited for mFRR sustained delivery and deeper arbitrage cycles.
Higher CAPEX (€/kW basis) but better revenue capture from longer-duration products.

## Service eligibility

| Service | Eligible | Duration constraint | SoC constraint | Exclusivity |
|---------|----------|-------------------|----------------|------------|
| FCR | yes (if not DRR-blocked) | symmetric headroom needed (~10 MW equivalent) | 40-60% SoC optimal | can stack with aFRR |
| aFRR up | yes | 2h sustained delivery possible | > 20% SoC | exclusive with mFRR up in same MTU |
| aFRR down | yes | 2h sustained absorption possible | < 80% SoC | exclusive with mFRR down in same MTU |
| mFRR up | yes | 15-min delivery | > 10% SoC | exclusive with aFRR up in same MTU |
| mFRR down | yes | 15-min absorption | < 90% SoC | exclusive with aFRR down in same MTU |
| DA arbitrage | yes | limited by duration (2h) | depends on reserve commitment | residual capacity only |

## Stacking conflicts (why fixed capacity factor is wrong)

The model currently assumes 80% of theoretical maximum revenue is capturable.
This is known to be a simplification. Real conflicts include:

1. **aFRR up + mFRR up** compete for same discharge headroom
2. **FCR symmetric** reserves SoC midband (~10% each direction), reducing arbitrage flexibility
3. **Activation during committed capacity** drains SoC, reducing next-hour optionality
4. **DA arbitrage requires uncommitted energy**, which shrinks with more reserve commitment
5. **Duration limit (2H)** means full-power discharge empties asset in 2 hours — cannot serve multiple products sequentially within 4h block

This is why a fixed 80% capacity factor is unrealistic (MR-03).
A dispatch LP must resolve these conflicts. Until then, model risk is HIGH.

## Operational constraints not yet modeled
- Thermal limits in high ambient temperature (derate to ~90% in summer peaks)
- Grid connection constraints (transformer limits, reactive power requirements)
- Maintenance windows (typically 5-10 days/year planned, plus unplanned)
- Firmware/software update periods
- Grid code compliance requirements (frequency response, fault ride-through)
