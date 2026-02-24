import { S1Card } from '@/app/components/S1Card';
import { SignalPlaceholder } from '@/app/components/SignalPlaceholder';
import { DigestCard } from '@/app/components/DigestCard';
import { TechTracker } from '@/app/components/TechTracker';
import { Contact } from '@/app/components/Contact';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '4rem 2rem 6rem 2rem',
      }}
    >
      {/* 1. KKME wordmark */}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 8vw, 6rem)',
          letterSpacing: '0.25em',
          color: 'var(--text)',
          fontWeight: 400,
        }}
      >
        KKME
      </h1>

      {/* 2. KKME statement — verbatim from KKME.md */}
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
          lineHeight: 1.7,
          color: 'rgba(232, 226, 217, 0.7)',
          maxWidth: '580px',
          textAlign: 'center',
          margin: '0 auto 4rem auto',
        }}
      >
        KKME builds infrastructure Europe actually needs — energy storage, grid
        capacity, compute, the physical layer underneath everything. Operating
        in Baltic and Nordic markets where the bottlenecks are real and most
        people are still waiting for someone else to go first. New technologies
        get used when they work, not when they&apos;re fashionable. The thesis
        compounds. The assets grow.
      </p>

      {/* 3. S1 — live signal */}
      <ErrorBoundary>
        <S1Card />
      </ErrorBoundary>

      {/* 4–7. S2–S5 placeholders */}
      <SignalPlaceholder
        index="S2"
        label="S2 — Balancing Market Tension"
        description="FCR-D capacity prices · Litgrid / Nord Pool · weekly"
      />
      <SignalPlaceholder
        index="S3"
        label="S3 — Lithium Cell Price"
        description="LFP spot + China OEM pulse · Trading Economics · weekly"
      />
      <SignalPlaceholder
        index="S4"
        label="S4 — Grid Connection Scarcity"
        description="BESS free capacity · Litgrid FeatureServer · monthly"
      />
      <SignalPlaceholder
        index="S5"
        label="S5 — DC Power Viability"
        description="Baltic DC pipeline · ENTSO-E + DataCenterDynamics · monthly"
      />

      {/* 8. Daily digest */}
      <ErrorBoundary>
        <DigestCard />
      </ErrorBoundary>

      {/* 9. Technology thesis tracker */}
      <TechTracker />

      {/* 10. Contact */}
      <Contact />
    </main>
  );
}
