'use client';

// GlobalErrorBoundary (M31) — any component crash renders the branded recovery
// screen (retry / back to hub), never a white or black page. Wraps every /play
// route (app/play/layout.tsx) and can wrap the hub shell.

import React from 'react';

interface State { error: Error | null }

export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode; onHome?: () => void }, State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[FEL-BOUNDARY] route crash:', error, info.componentStack);
    // fire-and-forget crash report so broken builds are visible server-side
    fetch('/api/telemetry/crash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message ?? error).slice(0, 400),
        stack: String(error?.stack ?? '').slice(0, 1200),
        path: typeof location !== 'undefined' ? location.pathname : '',
        at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05060a] p-6 text-center text-slate-100"
        style={{ fontFamily: 'var(--fel-font-display, ui-monospace)' }}>
        <p className="text-[11px] font-black tracking-[0.4em] text-cyan-300">FINAL EVOLUTION</p>
        <h1 className="text-2xl font-black">THAT ONE&apos;S ON US</h1>
        <p className="max-w-sm text-sm text-slate-400">
          Something glitched. Your progress and currency are safe — sessions only
          count when they finish.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { this.setState({ error: null }); location.reload(); }}
            className="rounded-2xl bg-cyan-400 px-8 py-3 font-black text-black">
            RETRY
          </button>
          <button
            onClick={() => (this.props.onHome ? this.props.onHome() : location.assign('/'))}
            className="rounded-2xl border border-slate-600 px-8 py-3 font-black">
            BACK TO HUB
          </button>
        </div>
      </div>
    );
  }
}
