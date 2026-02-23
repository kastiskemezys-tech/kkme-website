export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 8vw, 6rem)',
          letterSpacing: '0.25em',
          color: 'var(--text)',
          fontWeight: 400,
        }}
      >
        KKME
      </span>
    </main>
  );
}
