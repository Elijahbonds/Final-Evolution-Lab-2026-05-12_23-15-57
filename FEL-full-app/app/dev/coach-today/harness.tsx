'use client';
// The dev harness's client half (MIRROR-COACH P2, 2026-09-25): reset the seed when asked, then render the real
// TodayView (/coach's Today tab) — or, with ?view=training, the real /training step-through (ClientSessionView) —
// pointed at ./api (the same loadToday / saveClientLog the real routes run). The message thread is off: it has its own
// route and nothing to prove here.
import { useEffect, useState } from 'react';
import { TodayView } from '@/app/coach/_components/today-view';
import { ClientSessionView } from '@/components/training/client-view/ClientSessionView';

const API = { today: '/dev/coach-today/api?op=today', log: '/dev/coach-today/api?op=log', messages: null };

export function TodayHarness({ reset, view }: { reset: boolean; view: 'today' | 'training' }) {
  const [ready, setReady] = useState(!reset);
  useEffect(() => { if (reset) void fetch('/dev/coach-today/api?op=reset').then(() => setReady(true)); }, [reset]);
  if (!ready) return <div className="text-white/40 text-sm">Resetting…</div>;
  return view === 'training' ? <div data-testid="training"><ClientSessionView api={API} /></div> : <TodayView api={API} />;
}
