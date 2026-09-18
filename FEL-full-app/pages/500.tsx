export default function Custom500() {
  return (
    <main
      style={{
        minHeight: '100vh',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#05060a',
        color: '#f8fafc',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <section
        style={{
          maxWidth: 460,
          border: '1px solid rgba(34, 211, 238, 0.35)',
          borderRadius: 28,
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.95))',
          boxShadow: '0 24px 80px rgba(8, 145, 178, 0.18)',
          padding: 32,
        }}
      >
        <p style={{ margin: '0 0 12px', color: '#67e8f9', fontSize: 11, fontWeight: 900, letterSpacing: '0.32em' }}>
          FINAL EVOLUTION
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: 32, lineHeight: 1, fontWeight: 900 }}>
          SERVER RESET IN PROGRESS
        </h1>
        <p style={{ margin: '0 auto 24px', color: '#cbd5e1', fontSize: 15, lineHeight: 1.6 }}>
          The arena hit a server-side fault. Your progress and currency are safe; reload or return to the hub.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-flex',
            borderRadius: 999,
            background: '#22d3ee',
            color: '#020617',
            fontWeight: 900,
            padding: '12px 22px',
            textDecoration: 'none',
          }}
        >
          BACK TO HUB
        </a>
      </section>
    </main>
  );
}
