// dunk-flagship Phase 10: THE REAL DUNK HOST on a bare page (no server): components/games/dunk-babylon.tsx as /try mounts it (continuous,
// guest), with the app's CSS and theme (scripts/a11y/rig.mts buildRig). The page records every layout shift (window.__CLS) from before the
// mount, so the probe (_dunk-host-cls.mts) can read what moved while the host booted, played a dunk and showed the judges.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import DunkBabylon from '@/components/games/dunk-babylon';
import { prqGrade } from '@/lib/prq';

type Shift = { v: number; t: number; input: boolean; src: string[]; rects: string[] };
const w = window as unknown as { __PATH: string; __CLS: Shift[]; __SESSION: unknown };
w.__PATH = '/try'; w.__SESSION = null; w.__CLS = [];
try {
  new PerformanceObserver((list) => {
    type Rect = { x: number; y: number; width: number; height: number };
    const rc = (r?: Rect) => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : '?';
    for (const e of list.getEntries() as unknown as { value: number; startTime: number; hadRecentInput: boolean; sources?: { node?: Element | null; previousRect?: Rect; currentRect?: Rect }[] }[]) {
      w.__CLS.push({ v: e.value, t: Math.round(e.startTime), input: e.hadRecentInput,
        src: (e.sources ?? []).map((s) => s.node ? `${s.node.nodeName}.${String((s.node as HTMLElement).className ?? '').slice(0, 80)} "${(s.node.textContent ?? '').slice(0, 40)}"` : '?'),
        rects: (e.sources ?? []).map((s) => `${rc(s.previousRect)} -> ${rc(s.currentRect)}`) });   // where each moved from and to (CSS px)
    }
  }).observe({ type: 'layout-shift', buffered: true });
} catch { /* no layout-shift entries in this browser */ }
createRoot(document.getElementById('root')!).render(h('div', { style: { position: 'fixed', inset: 0 } }, h(DunkBabylon, { grade: prqGrade(50), prq: 50, onEnd: () => {}, continuous: true, guest: true })));
