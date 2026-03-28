export type DataClass = 'observed' | 'derived' | 'modeled' | 'proxy' | 'reference' | 'reference_estimate' | 'editorial'
export type FreshnessClass = 'live' | 'recent' | 'stale' | 'reference'
export type ImpactState = 'strong_positive' | 'slight_positive' | 'mixed' | 'slight_negative' | 'strong_negative' | 'low_confidence'
export type Sentiment = 'positive' | 'caution' | 'negative' | 'neutral'
export type GeographyClass = 'baltic_blended' | 'lt_led' | 'connected_market' | 'europe_reference'

export function sentimentColor(s: Sentiment): string {
  switch (s) {
    case 'positive': return 'var(--teal)'
    case 'caution': return 'var(--amber)'
    case 'negative': return 'var(--rose)'
    default: return 'var(--text-tertiary)'
  }
}

export function impactToSentiment(impact: ImpactState): Sentiment {
  if (impact === 'strong_positive' || impact === 'slight_positive') return 'positive'
  if (impact === 'strong_negative' || impact === 'slight_negative') return 'negative'
  if (impact === 'mixed') return 'caution'
  return 'neutral'
}
