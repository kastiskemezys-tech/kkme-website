'use client';

// ShaderGradient wrapped with ssr:false — requires WebGL canvas
import dynamic from 'next/dynamic';

const ShaderGradientCanvas = dynamic(
  () => import('@shadergradient/react').then(m => m.ShaderGradientCanvas as React.ComponentType<React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties }>),
  { ssr: false }
);

const ShaderGradient = dynamic(
  () => import('@shadergradient/react').then(m => m.ShaderGradient as React.ComponentType<Record<string, unknown>>),
  { ssr: false }
);

import React from 'react';

export function HeroGradient() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '320px',
        opacity: 0.18,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <ShaderGradientCanvas style={{ width: '100%', height: '100%' }}>
        <ShaderGradient
          type="waterPlane"
          animate="on"
          uTime={0.2}
          uSpeed={0.15}
          uStrength={1.2}
          uDensity={1.0}
          uFrequency={5.5}
          uAmplitude={3.2}
          color1="#7b5ea7"
          color2="#07070a"
          color3="#1a1035"
          lightType="3d"
          envPreset="dawn"
          grain="on"
          grainBlending={0.4}
          reflection={0.1}
          rotationX={0}
          rotationY={0}
          rotationZ={225}
          positionX={0}
          positionY={0}
          positionZ={0}
          cAzimuthAngle={180}
          cPolarAngle={90}
          cDistance={3.6}
          cameraZoom={1}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
