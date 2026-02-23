import { S1Card } from '@/app/components/S1Card';
import { fetchS1 } from '@/lib/signals/s1';
import type { S1Signal } from '@/lib/signals/s1';

export default async function Home() {
  let s1: S1Signal | null = null;
  let s1Error: string | undefined;

  try {
    s1 = await fetchS1();
  } catch (err) {
    s1Error = String(err);
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 2rem',
        gap: '3.5rem',
      }}
    >
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

      <S1Card data={s1} error={s1Error} />
    </main>
  );
}
