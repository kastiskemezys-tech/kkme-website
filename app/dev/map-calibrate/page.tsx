'use client';

import { useState, useRef, useCallback } from 'react';
import { CALIBRATION_ANCHORS, CITY_ANCHORS, CABLES_TO_CALIBRATE } from '@/lib/baltic-places';
import type { CableId } from '@/lib/baltic-places';

const IMG_SRC = '/hero/kkme-interconnect-dark.png';
const IMG_W = 1024;
const IMG_H = 1332;

type Mode = 'anchors' | 'cities' | 'cables';
type ClickedPoint = { id: string; px: number; py: number };
type CableWaypoint = { px: number; py: number };

const ANCHOR_MODES = {
  anchors: { anchors: CALIBRATION_ANCHORS, file: 'map-calibration.json', label: 'Anchors' },
  cities: { anchors: CITY_ANCHORS, file: 'map-calibration-cities.json', label: 'Cities' },
};

export default function MapCalibrate() {
  const [mode, setMode] = useState<Mode>('anchors');
  const [current, setCurrent] = useState(0);
  const [clicksAnchors, setClicksAnchors] = useState<Record<string, ClickedPoint>>({});
  const [clicksCities, setClicksCities] = useState<Record<string, ClickedPoint>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  // Cable waypoints state
  const [currentCable, setCurrentCable] = useState(0);
  const [cableWaypoints, setCableWaypoints] = useState<Record<CableId, CableWaypoint[]>>({
    nordbalt: [], litpol: [], estlink: [], fennoskan: [],
  });
  const [cableFinished, setCableFinished] = useState<Set<CableId>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);

  // --- Pixel calc ---
  const getPixel = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    return {
      px: Math.round((e.clientX - rect.left) * (IMG_W / rect.width)),
      py: Math.round((e.clientY - rect.top) * (IMG_H / rect.height)),
    };
  }, []);

  // --- Anchor/city click handler ---
  const handleAnchorClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const pt = getPixel(e);
    if (!pt) return;
    const config = ANCHOR_MODES[mode as 'anchors' | 'cities'];
    if (!config) return;
    const anchors = config.anchors;
    if (current >= anchors.length) return;
    const a = anchors[current];
    const setter = mode === 'anchors' ? setClicksAnchors : setClicksCities;
    setter(prev => ({ ...prev, [a.id]: { id: a.id, ...pt } }));
    if (current < anchors.length - 1) setCurrent(current + 1);
  }, [current, mode, getPixel]);

  // --- Cable waypoint click handler ---
  const handleCableClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const pt = getPixel(e);
    if (!pt) return;
    const cable = CABLES_TO_CALIBRATE[currentCable];
    if (!cable || cableFinished.has(cable.id)) return;
    if (cableWaypoints[cable.id].length >= cable.maxWaypoints) return;
    setCableWaypoints(prev => ({
      ...prev,
      [cable.id]: [...prev[cable.id], pt],
    }));
  }, [currentCable, cableFinished, cableWaypoints, getPixel]);

  const handleImgClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (mode === 'cables') handleCableClick(e);
    else handleAnchorClick(e);
  }, [mode, handleCableClick, handleAnchorClick]);

  // --- Cable controls ---
  const finishCable = () => {
    const cable = CABLES_TO_CALIBRATE[currentCable];
    if (!cable) return;
    setCableFinished(prev => new Set(prev).add(cable.id));
    if (currentCable < CABLES_TO_CALIBRATE.length - 1) setCurrentCable(currentCable + 1);
  };
  const undoLastWaypoint = () => {
    const cable = CABLES_TO_CALIBRATE[currentCable];
    if (!cable) return;
    setCableWaypoints(prev => ({
      ...prev,
      [cable.id]: prev[cable.id].slice(0, -1),
    }));
  };
  const resetCurrentCable = () => {
    const cable = CABLES_TO_CALIBRATE[currentCable];
    if (!cable) return;
    setCableWaypoints(prev => ({ ...prev, [cable.id]: [] }));
    setCableFinished(prev => { const s = new Set(prev); s.delete(cable.id); return s; });
  };

  // --- Exports ---
  const exportAnchors = () => {
    const config = ANCHOR_MODES[mode as 'anchors' | 'cities'];
    if (!config) return;
    const clicks = mode === 'anchors' ? clicksAnchors : clicksCities;
    const gcps = config.anchors
      .filter(a => clicks[a.id] && !skipped.has(a.id))
      .map(a => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng, px: clicks[a.id].px, py: clicks[a.id].py }));
    download(config.file, {
      version: 1, image: 'kkme-interconnect-dark.png', imageWidth: IMG_W, imageHeight: IMG_H,
      capturedAt: new Date().toISOString(), ...(mode === 'cities' ? { kind: 'cities' } : {}), gcps,
    });
  };

  const exportCables = () => {
    download('map-cable-waypoints.json', {
      version: 1, image: 'kkme-interconnect-dark.png', imageWidth: IMG_W, imageHeight: IMG_H,
      capturedAt: new Date().toISOString(), kind: 'cable_waypoints',
      cables: Object.fromEntries(
        CABLES_TO_CALIBRATE.map(c => [c.id, { waypoints: cableWaypoints[c.id] }])
      ),
    });
  };

  function download(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // --- Collect all crosshairs for rendering ---
  const allClicks = { ...clicksAnchors, ...clicksCities };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '360px 1fr',
      height: '100vh', background: '#0a0a0e', color: '#e8e2d9',
      fontFamily: '"DM Mono", monospace',
    }}>
      {/* Sidebar */}
      <div style={{ padding: '20px', borderRight: '1px solid rgba(232,226,217,0.1)', overflowY: 'auto', fontSize: '12px' }}>
        <h1 style={{ fontSize: '16px', marginBottom: '8px', fontWeight: 600 }}>Map Calibration</h1>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '16px' }}>
          {(['anchors', 'cities', 'cables'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setCurrent(0); }} style={{
              ...btnStyle, flex: 1, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
              borderColor: mode === m ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.15)',
              color: mode === m ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.4)',
              fontWeight: mode === m ? 600 : 400,
            }}>
              {m === 'anchors' ? 'Anchors' : m === 'cities' ? 'Cities' : 'Cables'}
            </button>
          ))}
        </div>

        {/* Anchor/city mode sidebar */}
        {(mode === 'anchors' || mode === 'cities') && (() => {
          const config = ANCHOR_MODES[mode];
          const clicks = mode === 'anchors' ? clicksAnchors : clicksCities;
          const clickedCount = config.anchors.filter(a => clicks[a.id] && !skipped.has(a.id)).length;
          return (
            <>
              <p style={{ color: 'rgba(232,226,217,0.5)', marginBottom: '12px', fontSize: '11px' }}>
                {clickedCount}/{config.anchors.length} clicked.
              </p>
              {config.anchors.map((a, i) => {
                const isActive = i === current;
                const isClicked = !!clicks[a.id] && !skipped.has(a.id);
                return (
                  <div key={a.id} onClick={() => setCurrent(i)} style={{
                    padding: '6px 10px', marginBottom: '3px', cursor: 'pointer',
                    background: isActive ? 'rgba(0,180,160,0.12)' : 'transparent',
                    borderLeft: isActive ? '2px solid rgb(0,180,160)' : '2px solid transparent',
                    opacity: skipped.has(a.id) ? 0.3 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: isActive ? 600 : 400 }}>{i + 1}. {a.name}</span>
                      <span style={{ fontSize: '10px', color: isClicked ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.3)' }}>
                        {isClicked ? '✓' : '·'}
                      </span>
                    </div>
                    {isActive && <p style={{ fontSize: '11px', color: 'rgba(232,226,217,0.6)', marginTop: '4px', lineHeight: 1.4 }}>{a.instruction}</p>}
                    {isClicked && clicks[a.id] && <span style={{ fontSize: '10px', color: 'rgba(232,226,217,0.35)' }}>({clicks[a.id].px}, {clicks[a.id].py})</span>}
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button onClick={() => current > 0 && setCurrent(current - 1)} style={btnStyle}>← Prev</button>
                <button onClick={() => {
                  const a = config.anchors[current];
                  if (a) { setSkipped(p => new Set(p).add(a.id)); if (current < config.anchors.length - 1) setCurrent(current + 1); }
                }} style={btnStyle}>Skip</button>
              </div>
              <button onClick={exportAnchors} disabled={clickedCount < 3} style={{
                ...btnStyle, width: '100%', marginTop: '12px', fontWeight: 600,
                borderColor: clickedCount >= 3 ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.1)',
                color: clickedCount >= 3 ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.3)',
              }}>
                Export {config.file} ({clickedCount} GCPs)
              </button>
            </>
          );
        })()}

        {/* Cable waypoints mode sidebar */}
        {mode === 'cables' && (
          <>
            <p style={{ color: 'rgba(232,226,217,0.5)', marginBottom: '12px', fontSize: '11px' }}>
              Click along each cable from start to end, following the drawn bends.
            </p>
            {CABLES_TO_CALIBRATE.map((cable, i) => {
              const isActive = i === currentCable;
              const pts = cableWaypoints[cable.id] ?? [];
              const done = cableFinished.has(cable.id);
              return (
                <div key={cable.id} onClick={() => setCurrentCable(i)} style={{
                  padding: '8px 10px', marginBottom: '4px', cursor: 'pointer',
                  background: isActive ? 'rgba(0,180,160,0.12)' : 'transparent',
                  borderLeft: isActive ? '2px solid rgb(0,180,160)' : '2px solid transparent',
                  opacity: done ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: isActive ? 600 : 400 }}>{cable.name}</span>
                    <span style={{ fontSize: '10px', color: done ? 'rgb(0,180,160)' : 'rgba(232,226,217,0.3)' }}>
                      {pts.length} / {cable.minWaypoints}–{cable.maxWaypoints} {done ? '✓' : ''}
                    </span>
                  </div>
                  {isActive && !done && (
                    <p style={{ fontSize: '11px', color: 'rgba(232,226,217,0.6)', marginTop: '4px', lineHeight: 1.4 }}>
                      {cable.instruction}
                    </p>
                  )}
                  {pts.length > 0 && (
                    <div style={{ fontSize: '10px', color: 'rgba(232,226,217,0.3)', marginTop: '2px' }}>
                      {pts.map((p, j) => `(${p.px},${p.py})`).join(' → ')}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button onClick={finishCable} disabled={cableWaypoints[CABLES_TO_CALIBRATE[currentCable]?.id]?.length < 2}
                style={{ ...btnStyle, borderColor: 'rgb(0,180,160)', color: 'rgb(0,180,160)' }}>
                Finish cable
              </button>
              <button onClick={undoLastWaypoint} style={btnStyle}>Undo</button>
              <button onClick={resetCurrentCable} style={{ ...btnStyle, borderColor: 'rgba(214,88,88,0.4)' }}>Reset</button>
            </div>
            <button onClick={exportCables}
              disabled={Object.values(cableWaypoints).every(pts => pts.length < 2)}
              style={{
                ...btnStyle, width: '100%', marginTop: '12px', fontWeight: 600,
                borderColor: 'rgb(0,180,160)', color: 'rgb(0,180,160)',
              }}>
              Export cable waypoints
            </button>
          </>
        )}
      </div>

      {/* Map area */}
      <div style={{ overflow: 'auto', position: 'relative', cursor: 'crosshair' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img ref={imgRef} src={IMG_SRC} width={IMG_W} height={IMG_H}
            onClick={handleImgClick} alt="Baltic interconnect map"
            style={{ display: 'block', maxWidth: 'none' }} draggable={false} />

          <svg width={IMG_W} height={IMG_H} viewBox={`0 0 ${IMG_W} ${IMG_H}`}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            {/* Anchor/city crosshairs */}
            {Object.values(allClicks).map(pt => {
              if (skipped.has(pt.id)) return null;
              const isCable = !!CALIBRATION_ANCHORS.find(a => a.id === pt.id);
              const anchor = [...CALIBRATION_ANCHORS, ...CITY_ANCHORS].find(a => a.id === pt.id);
              const color = isCable ? 'rgb(0,180,160)' : 'rgb(212,160,60)';
              return (
                <g key={pt.id}>
                  <line x1={pt.px - 8} y1={pt.py} x2={pt.px + 8} y2={pt.py} stroke={color} strokeWidth="1.5" />
                  <line x1={pt.px} y1={pt.py - 8} x2={pt.px} y2={pt.py + 8} stroke={color} strokeWidth="1.5" />
                  <text x={pt.px + 8} y={pt.py - 6} fill={color} fontSize="9" fontFamily="DM Mono, monospace">
                    {anchor?.name?.split(' ')[0] ?? pt.id}
                  </text>
                </g>
              );
            })}

            {/* Cable waypoint markers and connecting lines */}
            {CABLES_TO_CALIBRATE.map(cable => {
              const pts = cableWaypoints[cable.id] ?? [];
              const colors: Record<string, string> = {
                nordbalt: '#4af', litpol: '#fa4', estlink: '#4fa', fennoskan: '#f4a',
              };
              const color = colors[cable.id] ?? '#fff';
              if (pts.length === 0) return null;
              return (
                <g key={cable.id}>
                  {/* Connecting lines */}
                  {pts.length > 1 && (
                    <polyline
                      points={pts.map(p => `${p.px},${p.py}`).join(' ')}
                      fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 3" opacity="0.7"
                    />
                  )}
                  {/* Numbered markers */}
                  {pts.map((p, j) => (
                    <g key={j}>
                      <circle cx={p.px} cy={p.py} r="8" fill={color} opacity="0.8" />
                      <text x={p.px} y={p.py + 4} textAnchor="middle" fill="#000"
                        fontSize="10" fontWeight="bold" fontFamily="DM Mono, monospace">
                        {j + 1}
                      </text>
                    </g>
                  ))}
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
