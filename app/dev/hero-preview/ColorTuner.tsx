'use client'
import { useEffect, useState } from 'react'

type Swatch = {
  name: string
  cssVar: string
  kind: 'color' | 'range'
  default?: string
  min?: number
  max?: number
  step?: number
}

const SWATCHES: Swatch[] = [
  { name: 'Accent Teal', cssVar: '--accent-teal', kind: 'color' },
  { name: 'Accent Rose', cssVar: '--accent-rose', kind: 'color' },
  { name: 'Accent Amber', cssVar: '--accent-amber', kind: 'color' },
  { name: 'Hero Background', cssVar: '--hero-bg', kind: 'color' },
  { name: 'Text Primary', cssVar: '--text-primary', kind: 'color' },
  { name: 'Text Secondary', cssVar: '--text-secondary', kind: 'color' },
  { name: 'Text Tertiary', cssVar: '--text-tertiary', kind: 'color' },
  { name: 'Dot Fill', cssVar: '--project-dot-fill', kind: 'color' },
  { name: 'Particle Opacity', cssVar: '--particle-opacity', kind: 'range', min: 0, max: 1, step: 0.05 },
]

function rgbToHex(rgb: string): string {
  // Handle various CSS color formats
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (match) {
    const [, r, g, b] = match
    return '#' + [r, g, b].map(v => parseInt(v).toString(16).padStart(2, '0')).join('')
  }
  if (rgb.startsWith('#')) return rgb.slice(0, 7)
  return '#000000'
}

export function ColorTuner() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const initial: Record<string, string> = {}
    const computed = getComputedStyle(document.documentElement)
    for (const s of SWATCHES) {
      const raw = computed.getPropertyValue(s.cssVar).trim()
      initial[s.cssVar] = s.kind === 'color' ? rgbToHex(raw) : raw || '0'
    }
    setValues(initial)
  }, [])

  const handleChange = (cssVar: string, newValue: string) => {
    setValues(prev => ({ ...prev, [cssVar]: newValue }))
    document.documentElement.style.setProperty(cssVar, newValue)
  }

  const exportValues = () => {
    const lines = SWATCHES.map(s => `  ${s.cssVar}: ${values[s.cssVar]};`)
    const css = `:root[data-theme="YOUR_THEME"] {\n${lines.join('\n')}\n}`
    if (navigator.clipboard) navigator.clipboard.writeText(css)
    console.log(css)
    alert('CSS copied to clipboard and logged to console')
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed', top: 80, right: 16, zIndex: 9999,
          padding: '8px 12px', background: 'rgba(0,0,0,0.85)',
          color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          fontFamily: 'DM Mono, monospace', fontSize: 10,
          cursor: 'pointer', borderRadius: 2,
        }}
      >
        TUNER
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 80, right: 16, width: 260,
      padding: 16, background: 'rgba(10,10,10,0.94)',
      color: '#fff', fontFamily: 'DM Mono, monospace',
      fontSize: 10, borderRadius: 2, zIndex: 9999,
      maxHeight: '80vh', overflowY: 'auto',
      border: '1px solid rgba(255,255,255,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ letterSpacing: '0.1em', opacity: 0.7 }}>COLOR TUNER</span>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
        >
          —
        </button>
      </div>
      {SWATCHES.map(s => (
        <div key={s.cssVar} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>{s.name}</span>
            <span style={{ opacity: 0.5, fontSize: 9 }}>{values[s.cssVar]}</span>
          </div>
          {s.kind === 'color' ? (
            <input
              type="color"
              value={values[s.cssVar] || '#000000'}
              onChange={e => handleChange(s.cssVar, e.target.value)}
              style={{ width: '100%', height: 24, border: 'none', padding: 0, cursor: 'pointer' }}
            />
          ) : (
            <input
              type="range"
              min={s.min} max={s.max} step={s.step}
              value={parseFloat(values[s.cssVar] || '0')}
              onChange={e => handleChange(s.cssVar, e.target.value)}
              style={{ width: '100%' }}
            />
          )}
        </div>
      ))}
      <button
        onClick={exportValues}
        style={{
          width: '100%', marginTop: 8, padding: '8px 0',
          background: 'transparent', color: '#fff',
          border: '1px solid rgba(255,255,255,0.3)',
          fontFamily: 'inherit', fontSize: 10, cursor: 'pointer',
          letterSpacing: '0.1em',
        }}
      >
        EXPORT CSS
      </button>
    </div>
  )
}
