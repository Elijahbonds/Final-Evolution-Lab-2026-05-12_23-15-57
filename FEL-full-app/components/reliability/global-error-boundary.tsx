'use client';

// GlobalErrorBoundary (M31) — any component crash renders the branded recovery
// screen (retry / back to hub), never a white or black page. Wraps every /play
// route (app/play/layout.tsx) and can wrap the hub shell.
//
// HOTFIX (2026-09-24): the screen and the reporter are exported so app/global-error.tsx
// shows this screen when a crash takes down the root layout itself. Before it, a crash
// on /, /try, /profile or /kitchens got Next's default error page, because only /play
// was wrapped.
//
// HOTFIX (2026-09-24): the screen is styled INLINE, not with Tailwind classes. When the
// root layout is gone its stylesheets can be gone too — Next 14.2 never links the CSS
// that global-error.tsx imports, and a server-render crash serves a bare shell with no
// stylesheet at all — so a class-styled screen came up as black default text on white.
// Inline styles are the only styling that is certain to be there. The values are the
// Tailwind ones the screen used before, so /play looks the same as it did.

import React from 'react';

/** Which catcher took the crash: the route boundary (GlobalErrorBoundary, today mounted by app/play/layout.tsx) or the
 *  root screen (app/global-error.tsx, which only comes up when the root layout itself is gone). */
export type CrashCatcher = 'boundary' | 'root';

/**
 * Fire-and-forget crash report so broken builds are visible server-side.
 *
 * HOTFIX (2026-09-24): `path` is the URL at the moment the report is sent, which is not always the route that crashed.
 * Next 14.2 pushes a client-side navigation's new URL when the new page COMMITS, and a root crash replaces the router
 * before that commit — so when a <Link> navigation crashes while rendering and the root screen catches it, `path` is
 * the page the player came FROM (measured in a real `next start`: a crash thrown in /zz-adv-render reported
 * /play/zz-adv-nav). The stack's `app/<route>/page-*.js` chunk still names the route that crashed, and `caughtBy`
 * says which catcher sent the report, so the two can be told apart in the log. Only the pathname is sent, never the
 * query string (a Stripe checkout return carries its session id there, a camp consent link its token).
 */
export function reportCrash(error: Error & { digest?: string }, caughtBy: CrashCatcher): void {
  try {
    fetch('/api/telemetry/crash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message ?? error).slice(0, 400),
        stack: String(error?.stack ?? '').slice(0, 1200),
        // a server-render crash reaches the client with its message stripped in production; the digest is the
        // only thing that ties it to the server log line
        digest: error?.digest ?? null,
        path: typeof location !== 'undefined' ? location.pathname : '',
        caughtBy,
        at: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {
    // a crash reporter must never make the crash screen crash
  }
}

/** The /play reassurance: a mode only books progress and currency when a session finishes. */
export const PLAY_CRASH_COPY =
  'Something glitched. Your progress and currency are safe — sessions only count when they finish.';
/** Everywhere else (shop, wallet, profile, checkout return…) "sessions" means nothing, so this promises nothing. */
export const GENERIC_CRASH_COPY = 'Something glitched on this page. Retry, or head back to the hub.';

// HOTFIX (2026-09-24): the copy is chosen by WHERE the screen is mounted, never by reading the URL. The session
// reassurance is only true inside a mode, so the /play layout opts in (copy={PLAY_CRASH_COPY}) and everything else —
// the root screen included — gets GENERIC_CRASH_COPY, which claims nothing. Reading location.pathname during render
// picked the wrong copy whenever a client-side navigation crashed in the new page's first render, because Next pushes
// the new URL when the new page commits and that crash comes before it: hub -> a crashing mode showed the generic copy,
// and a /play page -> a crashing non-mode page showed the /play promise where it means nothing (both measured in a
// real `next start`). Whatever reaches the root screen while the URL still says /play is a crash the /play boundary
// did not catch (the root layout, the /play layout itself, or a non-mode page navigated to from a mode), so the
// generic copy is the true one there too.

// Tailwind 3.3 values of the classes this screen used (slate-100/400/600, cyan-300/400, text-2xl, max-w-sm, …), plus
// the preflight resets it silently relied on (zero margins, button font/border/background), written out so the
// screen renders the same with or without any stylesheet on the page.
const S = {
  root: {
    boxSizing: 'border-box', display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 16, margin: 0, padding: 24, textAlign: 'center', lineHeight: 1.5,
    background: '#05060a', color: '#f1f5f9',
    // theme.css's display font when it is loaded (the /play boundary); a system monospace when it is not
    fontFamily:
      "var(--fel-font-display, 'Chakra Petch', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
  },
  brand: { margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.4em', color: '#67e8f9' },
  title: { margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 900 },
  copy: { margin: 0, maxWidth: 384, fontSize: 14, lineHeight: '20px', color: '#94a3b8' },
  row: { display: 'flex', gap: 8 },
  retry: {
    boxSizing: 'border-box', margin: 0, padding: '12px 32px', border: 0, borderRadius: 16, cursor: 'pointer',
    background: '#22d3ee', color: '#000', fontFamily: 'inherit', fontSize: '100%', lineHeight: 'inherit',
    fontWeight: 900,
  },
  home: {
    boxSizing: 'border-box', margin: 0, padding: '12px 32px', border: '1px solid #475569', borderRadius: 16,
    cursor: 'pointer', background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: '100%',
    lineHeight: 'inherit', fontWeight: 900,
  },
} satisfies Record<string, React.CSSProperties>;

export function CrashScreen({ onRetry, onHome, copy = GENERIC_CRASH_COPY }: {
  onRetry: () => void;
  onHome?: () => void;
  /** What the screen promises. Defaults to GENERIC_CRASH_COPY; only a mode's own boundary passes PLAY_CRASH_COPY. */
  copy?: string;
}) {
  return (
    <div style={S.root} data-fel-crash-screen="">
      <p style={S.brand}>FINAL EVOLUTION</p>
      <h1 style={S.title}>THAT ONE&apos;S ON US</h1>
      <p style={S.copy}>{copy}</p>
      <div style={S.row}>
        <button type="button" onClick={onRetry} style={S.retry}>
          RETRY
        </button>
        <button type="button" onClick={() => (onHome ? onHome() : location.assign('/'))} style={S.home}>
          BACK TO HUB
        </button>
      </div>
    </div>
  );
}

interface State { error: Error | null }

export class GlobalErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    onHome?: () => void;
    /** The screen's copy (see CrashScreen). app/play/layout.tsx passes PLAY_CRASH_COPY; the default promises nothing. */
    copy?: string;
  }, State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[FEL-BOUNDARY] route crash:', error, info.componentStack);
    reportCrash(error, 'boundary');
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <CrashScreen
        onRetry={() => { this.setState({ error: null }); location.reload(); }}
        onHome={this.props.onHome}
        copy={this.props.copy}
      />
    );
  }
}
