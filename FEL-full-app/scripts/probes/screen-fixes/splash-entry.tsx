// SCREEN-FIXES (2026-11-10): the shared start screen (components/games/boot-splash.tsx SplashCard) on a bare page, with the
// app's CSS and fonts (scripts/a11y/rig.mts buildRig, production font loading). It walks the card through the phases a mode
// gives it while the arena loads: 'loading' from the first frame, then 'ready' at READY_AT ms, as the harness does. Every
// layout shift is recorded from before the mount (window.__CLS) with what moved and from where to where, for
// scripts/probes/screen-fixes/splash-cls.mts. `?mode=<modeId>` picks the mode (default dunkContest: the court pickers).
import { createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SplashCard } from '@/components/games/boot-splash';
import type { ModePhase } from '@/lib/babylon';

type Rect = { x: number; y: number; width: number; height: number };
type Shift = { v: number; t: number; input: boolean; src: string[]; rects: string[] };
const w = window as unknown as { __PATH: string; __CLS: Shift[]; __SESSION: unknown; __READY_AT: number; __readyT?: number };
w.__PATH = '/play/dunk'; w.__SESSION = null; w.__CLS = [];
try {
  new PerformanceObserver((list) => {
    const rc = (r?: Rect) => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : '?';
    for (const e of list.getEntries() as unknown as { value: number; startTime: number; hadRecentInput: boolean; sources?: { node?: Element | null; previousRect?: Rect; currentRect?: Rect }[] }[]) {
      w.__CLS.push({ v: e.value, t: Math.round(e.startTime), input: e.hadRecentInput,
        src: (e.sources ?? []).map((s) => s.node ? `${s.node.nodeName}.${String((s.node as HTMLElement).className ?? '').slice(0, 70)} "${(s.node.textContent ?? '').slice(0, 36)}"` : '?'),
        rects: (e.sources ?? []).map((s) => `${rc(s.previousRect)} -> ${rc(s.currentRect)}`) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
} catch { /* no layout-shift entries in this browser */ }

const q = new URLSearchParams(location.search);
const MODE = q.get('mode') ?? 'dunkContest';
const READY_AT = Number(q.get('readyAt') ?? 3000);
w.__READY_AT = READY_AT;

function Stage() {
  const [phase, setPhase] = useState<ModePhase>('loading');
  useEffect(() => { const t = setTimeout(() => { w.__readyT = Math.round(performance.now()); setPhase('ready'); }, READY_AT); return () => clearTimeout(t); }, []);
  return h('div', { 'data-phase': phase, style: { position: 'fixed', inset: 0 } },
    h(SplashCard, { modeId: MODE, title: 'FLIGHT NIGHT', goal: 'OUTSCORE THE FIELD', phase, onStart: () => {}, onRetry: () => {} }));
}
createRoot(document.getElementById('root')!).render(h(Stage));
