'use client';

// HOTFIX (2026-09-24): the root crash screen. Only /play was wrapped in the branded boundary (app/play/layout.tsx), so
// a crash on /, /try, /profile or /kitchens — or in the root layout itself (the rail, the tab bar, the providers) —
// showed Next's default error page. This is what Next renders when the root layout is gone: the /play boundary's
// recovery screen and the same /api/telemetry/crash report. It replaces the root layout while it is up, so it brings
// its own <html>/<body>. Next only uses it in a production build; dev keeps the overlay.
//
// HOTFIX (2026-09-24): NO STYLESHEETS, on purpose. Next 14.2 builds the CSS a global-error.tsx imports but never links
// it, and a server-render crash serves a bare shell with no stylesheet at all, so anything here that leans on Tailwind
// or globals.css renders as black default text on white. Everything on this screen is styled inline (CrashScreen too).
// Checked against a real `next build` + `next start`, for a server-render crash and for a crash after hydration.
//
// HOTFIX (2026-09-24): its own <head> with the viewport tag. The root layout's head goes with the root layout, and
// without `width=device-width` a phone lays this screen out 980 px wide and shows it zoomed out to fit.
//
// RETRY reloads rather than calling reset(): a root crash is often a server-render crash, and reset() re-renders the
// same payload it failed on. It is also what the /play boundary's RETRY does. When a client-side <Link> navigation
// crashed on its first render, the URL has not moved yet (Next pushes it when the new page commits, and this screen
// replaced the router first), so RETRY reloads the page the player came from — one that just rendered — and the report
// names that page as its `path` (see reportCrash; `caughtBy: 'root'` and the stack's page chunk tell the two apart).
//
// HOTFIX (2026-09-24): always the generic copy. Every mode crash is caught by the /play boundary first, so whatever
// reaches this screen is not a mode's session, even while the URL still says /play.

import { useEffect } from 'react';
import { CrashScreen, GENERIC_CRASH_COPY, reportCrash } from '@/components/reliability/global-error-boundary';

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[FEL-BOUNDARY] root crash:', error);
    reportCrash(error, 'root');
  }, [error]);

  return (
    <html lang="en" style={{ colorScheme: 'dark', background: '#05060a' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Final Evolution Lab</title>
      </head>
      <body style={{ margin: 0, minHeight: '100vh', background: '#05060a', color: '#f1f5f9' }}>
        <CrashScreen onRetry={() => location.reload()} copy={GENERIC_CRASH_COPY} />
      </body>
    </html>
  );
}
