'use client';

import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  type ChartTooltipData,
  fmtTooltipDate,
  fmtTooltipTime,
  fmtTooltipValue,
} from '@/app/lib/chartTooltip';

export interface ChartTooltipProps extends ChartTooltipData {
  /** Whether the tooltip is visible. */
  visible: boolean;
  /** X coordinate in viewport space (e.g. from `event.clientX` or `rect.left + caretX`). */
  x: number;
  /** Y coordinate in viewport space. */
  y: number;
  /** Optional alignment override; auto flips at viewport edges by default. */
  side?: 'top' | 'bottom' | 'auto';
}

const HORIZONTAL_OFFSET = 14;
const VERTICAL_OFFSET = 14;
const EDGE_GUARD = 16;

/**
 * Sitewide chart tooltip primitive. Mounts via portal so it can overflow chart
 * bounding boxes without clipping. Auto-flips at viewport edges. Single fade
 * token (120ms) per the operator's mandate that tooltips feel intentional, not
 * spring-loaded.
 *
 * Headline row:   date (or label, if no date) + optional time
 * Value row:      large numeric value + unit
 * Secondary rows: small monospace key/value pairs
 * Source footer:  italic, smallest font
 */
export function ChartTooltip({
  visible,
  x,
  y,
  side = 'auto',
  date,
  time,
  value,
  unit,
  label,
  secondary,
  source,
}: ChartTooltipProps) {
  const [mounted, setMounted] = useState(false);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'top' | 'bottom' | 'right' | 'left' }>(
    { left: x, top: y, placement: 'top' },
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Edge-aware repositioning. Runs synchronously after layout so the tooltip
  // never paints with the wrong placement.
  useLayoutEffect(() => {
    if (!visible) return;
    const tip = tipRef.current;
    if (!tip) return;
    const rect = tip.getBoundingClientRect();
    const vw = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 768 : window.innerHeight;

    let placement: 'top' | 'bottom' | 'right' | 'left' = side === 'bottom' ? 'bottom' : 'top';
    if (side === 'auto') {
      // Default: above the cursor. Flip to below if it would clip the top edge.
      if (y - rect.height - VERTICAL_OFFSET < EDGE_GUARD) placement = 'bottom';
    }

    let left = x - rect.width / 2;
    let top: number;
    if (placement === 'top') {
      top = y - rect.height - VERTICAL_OFFSET;
    } else {
      top = y + VERTICAL_OFFSET;
    }

    // Horizontal clamping
    if (left < EDGE_GUARD) left = EDGE_GUARD;
    if (left + rect.width > vw - EDGE_GUARD) left = vw - rect.width - EDGE_GUARD;
    // Vertical clamping (bottom)
    if (top + rect.height > vh - EDGE_GUARD) top = vh - rect.height - EDGE_GUARD;
    if (top < EDGE_GUARD) top = EDGE_GUARD;

    setPos({ left, top, placement });
  }, [visible, x, y, side, date, time, value, unit, label, secondary, source]);

  if (!mounted || typeof document === 'undefined') return null;

  // Headline: prefer date if present; fall back to label.
  // headlineSub renders below the value: when both date+label exist it shows the
  // label; when only label-as-headline, it stays empty so callers can use the
  // `secondary` slot for descriptive sub-text.
  const headline = date != null ? fmtTooltipDate(date) : label;
  const headlineSub = date != null && label ? label : undefined;
  const valueText = fmtTooltipValue(value, unit);
  const timeText = time ? fmtTooltipTime(time) : null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={tipRef}
          role="tooltip"
          initial={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            pointerEvents: 'none',
            zIndex: 9999,
            background: 'var(--bg-card-highlight)',
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
            border: '1px solid var(--border-highlight)',
            borderRadius: 4,
            boxShadow: 'var(--tooltip-shadow)',
            padding: '10px 12px',
            minWidth: 128,
            maxWidth: 280,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
          }}
        >
          {/* Headline row — date / label, prominent */}
          {headline && (
            <div
              style={{
                fontSize: 10.5,
                lineHeight: 1.2,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                marginBottom: 5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>{headline}</span>
              {timeText && (
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{timeText}</span>
              )}
            </div>
          )}
          {/* Value row — the headline metric */}
          <div
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: 17,
              lineHeight: 1.05,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-primary)',
            }}
          >
            {valueText}
          </div>
          {/* Headline-sub: when a date AND label both exist, label sits below the value */}
          {headlineSub && (
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
                marginTop: 2,
              }}
            >
              {headlineSub}
            </div>
          )}
          {/* Secondary rows — key/value list */}
          {secondary && secondary.length > 0 && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: 10,
                rowGap: 3,
                fontSize: 10.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {secondary.map((s, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {typeof s.value === 'number'
                      ? fmtTooltipValue(s.value, s.unit ?? '')
                      : s.unit
                        ? `${s.value} ${s.unit}`
                        : s.value}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Source footer — italic, smallest font */}
          {source && (
            <div
              style={{
                marginTop: 6,
                fontFamily: "'Cormorant Garamond', serif",
                fontStyle: 'italic',
                fontSize: 10,
                color: 'var(--text-muted)',
                lineHeight: 1.3,
              }}
            >
              {source}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Hook helper for inline-SVG callers ────────────────────────────────────

export interface ChartTooltipState {
  data: ChartTooltipData | null;
  visible: boolean;
  x: number;
  y: number;
}

const HIDDEN: ChartTooltipState = { data: null, visible: false, x: 0, y: 0 };

export function useChartTooltipState(): {
  state: ChartTooltipState;
  show: (data: ChartTooltipData, x: number, y: number) => void;
  hide: () => void;
  setState: (state: ChartTooltipState) => void;
} {
  const [state, setState] = useState<ChartTooltipState>(HIDDEN);
  return {
    state,
    show: (data, x, y) => setState({ data, visible: true, x, y }),
    hide: () => setState(HIDDEN),
    setState,
  };
}

/**
 * Convenience wrapper: render a `ChartTooltip` directly from a
 * `useChartTooltipState()` return. Removes prop-spreading boilerplate at every
 * consumer.
 */
export function ChartTooltipPortal({ tt }: { tt: { state: ChartTooltipState } }) {
  return (
    <ChartTooltip
      visible={tt.state.visible}
      x={tt.state.x}
      y={tt.state.y}
      value={tt.state.data?.value ?? 0}
      unit={tt.state.data?.unit ?? ''}
      date={tt.state.data?.date}
      time={tt.state.data?.time}
      label={tt.state.data?.label}
      secondary={tt.state.data?.secondary}
      source={tt.state.data?.source}
    />
  );
}
