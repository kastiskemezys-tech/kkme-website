'use client';

import { useState, useRef, useCallback } from 'react';
import { CALIBRATION_ANCHORS, CITY_ANCHORS } from '@/lib/baltic-places';

const IMG_SRC = '/hero/kkme-interconnect-dark.png';
const IMG_W = 1024;
const IMG_H = 1332;

type Mode = 'cables' | 'cities';

interface ClickedPoint {
  id: string;
  px: number;
  py: number;
}

const MODES = {
  cables: { anchors: CALIBRATION_ANCHORS, file: 'map-calibration.json', label: 'Cable endpoints + labels' },
  cities: { anchors: CITY_ANCHORS, file: 'map-calibration-cities.json', label: 'Cities' },
};

export default function MapCalibrate() {
  const [mode, setMode] = useState<Mode>('cables');
  const [current, setCurrent] = useState(0);
  const [clicksCables, setClicksCables] = useState<Record<string, ClickedPoint>>({});
  const [clicksCities, setClicksCities] = useState<Record<string, ClickedPoint>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);

  const config = MODES[mode];
  const anchors = config.anchors;
  const clicks = mode === 'cables' ? clicksCables : clicksCities;
  const setClicks = mode === 'cables' ? setClicksCables : setClicksCities;

  const handleClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || current >= anchors.length) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = IMG_W / rect.width;
    const scaleY = IMG_H / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top) * scaleY);
    const a = anchors[current];
    setClicks(prev => ({ ...prev, [a.id]: { id: a.id, px, py } }));
    if (current < anchors.length - 1) {
      setCurrent(current + 1);
    }
  }, [current, anchors, setClicks]);

  const goBack = () => { if (current > 0) setCurrent(current - 1); };

  const skip = () => {
    const a = anchors[current];
    if (!a) return;
    setSkipped(prev => new Set(prev).add(a.id));
    if (current < anchors.length - 1) setCurrent(current + 1);
  };

  const resetMode = () => {
    setClicks({});
    const modeSkipped = new Set<string>();
    skipped.forEach(id => {
      if (!anchors.find(a => a.id === id)) modeSkipped.add(id);
    });
    setSkipped(modeSkipped);
    setCurrent(0);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setCurrent(0);
  };

  const exportJSON = () => {
    const gcps = anchors
      .filter(a => clicks[a.id] && !skipped.has(a.id))
      .map(a => ({
        id: a.id,
        name: a.name,
        lat: a.lat,
        lng: a.lng,
        px: clicks[a.id].px,
        py: clicks[a.id].py,
      }));

    const result = {
      version: 1,
      image: 'kkme-interconnect-dark.png',
      imageWidth: IMG_W,
      imageHeight: IMG_H,
      capturedAt: new Date().toISOString(),
      ...(mode === 'cities' ? { kind: 'cities' } : {}),
      gcps,
    };

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = config.file;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clickedCount = anchors.filter(a => clicks[a.id] && !skipped.has(a.id)).length;
  const allClicks = { ...clicksCables, ...clicksCities };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '340px 1fr',
      height: '100vh',
      background: '#0a0a0e',
      color: '#e8e2d9',
      fontFamily: '"DM Mono", monospace',
    }}>
      {/* Sidebar */}
      <div style={{
        padding: '20px',
        borderRight: '1px solid rgba(232,226,217,0.1)',
        overflowY: 'auto',
        fontSize: '12px',
      }}>
        <h1 style={{ fontSize: '16px', marginBottom: '4px', fontWeight: 600 }}>
          Map Calibration
        </h1>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', marginTop: '8px' }}>
          {(['cables', 'cities'] as Mode[]).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              ...btnStyle,
              flex: 1,
              borderColor: mode === m ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.15)',
              color: mode === m ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.4)',
              fontWeight: mode === m ? 600 : 400,
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {MODES[m].label}
              {/* Show done count */}
              <span style={{ marginLeft: '4px', opacity: 0.5 }}>
                ({(m === 'cables' ? clicksCables : clicksCities) &&
                  Object.keys(m === 'cables' ? clicksCables : clicksCities).length}/{MODES[m].anchors.length})
              </span>
            </button>
          ))}
        </div>

        <p style={{ color: 'rgba(232,226,217,0.5)', marginBottom: '12px', fontSize: '11px' }}>
          {mode === 'cables'
            ? 'Click cable endpoint dots and country label centers.'
            : 'Click approximate city locations. No markers on map — use geography.'}
          {' '}{clickedCount}/{anchors.length} clicked.
        </p>

        {anchors.map((a, i) => {
          const isActive = i === current;
          const isClicked = !!clicks[a.id] && !skipped.has(a.id);
          const isSkipped = skipped.has(a.id);
          return (
            <div
              key={a.id}
              onClick={() => setCurrent(i)}
              style={{
                padding: '8px 10px',
                marginBottom: '4px',
                cursor: 'pointer',
                background: isActive ? 'rgba(0,180,160,0.12)' : 'transparent',
                borderLeft: isActive ? '2px solid rgb(0,180,160)' : '2px solid transparent',
                opacity: isSkipped ? 0.3 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: isActive ? 600 : 400, fontSize: '12px' }}>
                  {i + 1}. {a.name}
                </span>
                <span style={{
                  fontSize: '10px',
                  color: isClicked ? 'rgb(0,180,160)' : isSkipped ? 'rgb(214,88,88)' : 'rgba(232,226,217,0.3)',
                }}>
                  {isClicked ? '✓' : isSkipped ? 'skip' : '·'}
                </span>
              </div>
              {isActive && (
                <p style={{ fontSize: '11px', color: 'rgba(232,226,217,0.6)', marginTop: '4px', lineHeight: 1.4 }}>
                  {a.instruction}
                </p>
              )}
              {isClicked && clicks[a.id] && (
                <span style={{ fontSize: '10px', color: 'rgba(232,226,217,0.35)' }}>
                  ({clicks[a.id].px}, {clicks[a.id].py})
                </span>
              )}
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button onClick={goBack} style={btnStyle}>← Previous</button>
          <button onClick={skip} style={btnStyle}>Skip</button>
          <button onClick={resetMode} style={{ ...btnStyle, borderColor: 'rgba(214,88,88,0.4)' }}>
            Reset {mode}
          </button>
        </div>

        <button
          onClick={exportJSON}
          disabled={clickedCount < (mode === 'cables' ? 4 : 3)}
          style={{
            ...btnStyle,
            width: '100%',
            marginTop: '16px',
            borderColor: clickedCount >= 3 ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.1)',
            color: clickedCount >= 3 ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.3)',
            fontWeight: 600,
          }}
        >
          Export {config.file} ({clickedCount} GCPs)
        </button>
      </div>

      {/* Map area */}
      <div style={{ overflow: 'auto', position: 'relative', cursor: 'crosshair' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            ref={imgRef}
            src={IMG_SRC}
            width={IMG_W}
            height={IMG_H}
            onClick={handleClick}
            alt="Baltic interconnect map"
            style={{ display: 'block', maxWidth: 'none' }}
            draggable={false}
          />
          {/* Crosshairs for ALL clicked points (both modes) */}
          <svg
            width={IMG_W}
            height={IMG_H}
            viewBox={`0 0 ${IMG_W} ${IMG_H}`}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {Object.values(allClicks).map(pt => {
              if (skipped.has(pt.id)) return null;
              const isCable = !!CALIBRATION_ANCHORS.find(a => a.id === pt.id);
              const anchor = [...CALIBRATION_ANCHORS, ...CITY_ANCHORS].find(a => a.id === pt.id);
              const color = isCable ? 'rgb(0,180,160)' : 'rgb(212,160,60)';
              return (
                <g key={pt.id}>
                  <line x1={pt.px - 10} y1={pt.py} x2={pt.px + 10} y2={pt.py}
                    stroke={color} strokeWidth="1.5" />
                  <line x1={pt.px} y1={pt.py - 10} x2={pt.px} y2={pt.py + 10}
                    stroke={color} strokeWidth="1.5" />
                  <circle cx={pt.px} cy={pt.py} r="5"
                    fill="none" stroke={color} strokeWidth="1" />
                  <text x={pt.px + 9} y={pt.py - 7}
                    fill={color} fontSize="9" fontFamily="DM Mono, monospace">
                    {anchor?.name?.split(' ')[0] ?? pt.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(232,226,217,0.2)',
  color: 'rgba(232,226,217,0.7)',
  fontFamily: '"DM Mono", monospace',
  fontSize: '11px',
  padding: '6px 12px',
  cursor: 'pointer',
};
