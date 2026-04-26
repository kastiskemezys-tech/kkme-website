// Ticker item formatting.
// Capacity payments (aFRR / mFRR / FCR) are €/MW/h — paid per MW reserved per hour.
// DA capture is energy — €/MWh.
// Mixing the two is the single fastest credibility leak; this module is the
// single source of truth so the ticker can't get it wrong.

export type ReserveProduct = 'afrr' | 'mfrr' | 'fcr';
export type EnergyProduct = 'da_capture';
export type TickerKind = ReserveProduct | EnergyProduct;

const RESERVE_KINDS: ReserveProduct[] = ['afrr', 'mfrr', 'fcr'];

export function unitForTickerKind(kind: TickerKind): '€/MW/h' | '€/MWh' {
  return (RESERVE_KINDS as TickerKind[]).includes(kind) ? '€/MW/h' : '€/MWh';
}

export function formatTickerItem(
  kind: TickerKind,
  label: string,
  value: number,
  decimals: number = 2,
): string {
  const unit = unitForTickerKind(kind);
  return `${label} €${value.toFixed(decimals)}${unit.replace('€', '')}`;
}
