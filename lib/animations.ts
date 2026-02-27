'use client';

import { animate, stagger } from 'animejs';

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 1. NUMBER ROLL — odometer effect on KPI change
export function rollNumber(
  el: HTMLElement,
  from: number,
  to: number,
  decimals = 1,
  unit = '',
  duration = 600,
) {
  if (reduceMotion()) {
    el.textContent = to.toFixed(decimals) + unit;
    return;
  }
  const obj = { val: from };
  animate(obj, {
    val: to,
    duration,
    ease: 'outExpo',
    onUpdate: () => {
      el.textContent = obj.val.toFixed(decimals) + unit;
    },
    onComplete: () => {
      el.textContent = to.toFixed(decimals) + unit;
    },
  });
}

// 2. SPARKLINE DRAW-IN — on first mount only
export function drawSparkline(
  pathEl: SVGPolylineElement | null,
  duration = 800,
) {
  if (!pathEl || reduceMotion()) return;
  const bbox = pathEl.getBBox?.();
  const length = bbox ? Math.max(bbox.width, bbox.height, 50) * 2 : 200;
  pathEl.style.strokeDasharray = String(length);
  pathEl.style.strokeDashoffset = String(length);
  animate(pathEl, {
    strokeDashoffset: [length, 0],
    duration,
    ease: 'inOutSine',
    delay: 200,
  });
}

// 3. FRESHNESS PULSE — dot next to timestamp
export function freshnessPulse(dotEl: HTMLElement | null) {
  if (!dotEl || reduceMotion()) return;
  animate(dotEl, {
    scale: [1, 1.8, 1],
    opacity: [0.8, 0.3, 0.8],
    duration: 1000,
    ease: 'inOutSine',
  });
}

// 4. CARD ENTRANCE — staggered on page load
export function animateCards(selector = '.signal-card') {
  if (reduceMotion()) return;
  const els = document.querySelectorAll<HTMLElement>(selector);
  if (!els.length) return;
  animate(els, {
    translateY: [12, 0],
    opacity: [0, 1],
    duration: 500,
    delay: stagger(80, { start: 100 }),
    ease: 'outQuart',
  });
}

// 5. ARC FLOW ANIMATION — direction-aware dash animation for Baltic map arcs
export function animateArc(
  pathEl: SVGPathElement | null,
  direction: 'forward' | 'reverse' = 'forward',
  duration = 2500,
) {
  if (!pathEl || reduceMotion()) return;

  // Use actual path length when available, fall back to estimate
  const length  = (pathEl as SVGPathElement & { getTotalLength?: () => number }).getTotalLength?.() ?? 300;
  const dashLen = length * 0.22;

  pathEl.style.strokeDasharray = `${dashLen} ${length - dashLen}`;

  animate(pathEl, {
    // forward  (LT exports): offset 0→-length  (dashes travel LT→SE4/PL)
    // reverse  (LT imports): offset 0→+length  (dashes travel SE4/PL→LT)
    strokeDashoffset: direction === 'forward'
      ? [0, -length]
      : [0, length],
    duration,
    ease: 'linear',
    loop: true,
  });
}

// 6. VALUE CHANGE FLASH — brief color highlight
export function flashOnChange(
  el: HTMLElement | null,
  direction: 'up' | 'down' | 'neutral' = 'neutral',
) {
  if (!el || reduceMotion()) return;
  const color =
    direction === 'up'
      ? 'rgba(74,222,128,0.35)'
      : direction === 'down'
        ? 'rgba(239,68,68,0.25)'
        : 'rgba(123,94,167,0.25)';
  animate(el, {
    backgroundColor: [color, 'transparent'],
    duration: 800,
    ease: 'outQuart',
  });
}
