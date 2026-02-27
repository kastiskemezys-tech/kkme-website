'use client';

// Full-page ambient ShaderGradient — fixed, z-index -2
import dynamic from 'next/dynamic';
import React from 'react';

const ShaderGradientCanvas = dynamic(
  () => import('@shadergradient/react').then(m => m.ShaderGradientCanvas as React.ComponentType<React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties }>),
  { ssr: false }
);

const ShaderGradient = dynamic(
  () => import('@shadergradient/react').then(m => m.ShaderGradient as React.ComponentType<Record<string, unknown>>),
  { ssr: false }
);

export function PageBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        opacity: 0.12,
        pointerEvents: 'none',
        zIndex: -2,
      }}
    >
      <ShaderGradientCanvas style={{ width: '100%', height: '100%' }}>
        <ShaderGradient
          type="waterPlane"
          animate="on"
          uTime={0.2}
          uSpeed={0.06}
          uStrength={0.6}
          uDensity={1.8}
          uFrequency={2.5}
          uAmplitude={1.8}
          color1="#2DD4A8"
          color2="#07070a"
          color3="#1a1035"
          lightType="3d"
          envPreset="dawn"
          grain="on"
          grainBlending={0.6}
          reflection={0.04}
          rotationX={0}
          rotationY={0}
          rotationZ={200}
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
