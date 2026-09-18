'use client';

import { useEffect } from 'react';

function reportFatalError(error: Error & { digest?: string }) {
  try {
    fetch('/api/telemetry/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message ?? error).slice(0, 400),
        stack: String(error?.stack ?? '').slice(0, 1200),
        digest: error?.digest ?? null,
        path: typeof location !== 'undefined' ? location.pathname : '',
        at: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {
    // A crash reporter must never make the crash screen crash.
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportFatalError(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          background: '#05060a',
          color: '#f8fafc',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
              WE CAUGHT THE GLITCH
            </h1>
            <p style={{ margin: '0 auto 24px', color: '#cbd5e1', fontSize: 15, lineHeight: 1.6 }}>
              Your session and wallet are protected. Retry the last move or jump back to the hub.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  border: 0,
                  borderRadius: 999,
                  background: '#22d3ee',
                  color: '#020617',
                  cursor: 'pointer',
                  fontWeight: 900,
                  padding: '12px 22px',
                }}
              >
                RETRY
              </button>
              <button
                onClick={() => location.assign('/')}
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.7)',
                  borderRadius: 999,
                  background: 'transparent',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  fontWeight: 900,
                  padding: '12px 22px',
                }}
              >
                BACK TO HUB
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
