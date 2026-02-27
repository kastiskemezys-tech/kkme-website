// 24 radiating lines from centre — amber, very faint, decorative behind KKME wordmark
export function HeroRays() {
  const cx = 400;
  const cy = 180;
  const r1 = 70;   // inner radius (clears the wordmark)
  const r2 = 360;  // outer radius

  const rays = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
    return {
      x1: cx + Math.cos(angle) * r1,
      y1: cy + Math.sin(angle) * r1,
      x2: cx + Math.cos(angle) * r2,
      y2: cy + Math.sin(angle) * r2,
    };
  });

  return (
    <svg
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px',
        height: '360px',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'visible',
      }}
      viewBox="0 0 800 360"
      aria-hidden="true"
    >
      {rays.map((ray, i) => (
        <line
          key={i}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke="rgba(212,160,60,0.055)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
