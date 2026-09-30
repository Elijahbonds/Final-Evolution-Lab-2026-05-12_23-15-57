'use client';

// The Quick Screen's crash catcher (SCREEN-FIX-2 amend 4, 2026-09-29): the app's own recovery screen, with NO crash
// report. The app's catchers (components/reliability/global-error-boundary.tsx, mounted for every /play route by
// app/play/layout.tsx, and app/global-error.tsx at the root) POST the crash to /api/telemetry/crash; the screen sends
// nothing at all, a crash included. This boundary sits closest to the screen's pages (app/screen/layout.tsx,
// app/play/mirror/assess/layout.tsx), so a crash in them is caught here first and never reaches the /play one. A crash
// that takes down the root layout is app/global-error.tsx's, which skips the report on the screen's paths.
//
// Its "back" goes to the screen's start (/screen), never to the hub: a younger athlete never leaves the screen (S-11).
import React from 'react';
import { CrashScreen, GENERIC_CRASH_COPY } from '@/components/reliability/global-error-boundary';
import { SCREEN_HOME } from '@/lib/screen/routes';

interface State { error: Error | null }

export class ScreenErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error): void {
    // the console only (this device): no report leaves the screen
    console.error('[FEL-SCREEN] crash, not reported:', error);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <CrashScreen
        onRetry={() => { this.setState({ error: null }); location.reload(); }}
        onHome={() => location.assign(SCREEN_HOME)}
        copy={GENERIC_CRASH_COPY}
      />
    );
  }
}
