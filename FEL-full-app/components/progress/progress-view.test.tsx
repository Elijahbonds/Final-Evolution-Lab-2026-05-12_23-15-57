// PLAT-P03: My progress, drawn — a teen (nothing saved, the phone's jumps) and an adult who opted in (saved history and
// two combines). The page makes no network call and writes nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HISTORY_KEY } from '@/lib/jump/historyStore';
import { NOTHING_SAVED, type SavedProgress } from '@/lib/results/progressServer';
import { deviceRows, ProgressView, savedRows } from './progress-view';

const mem = new Map<string, string>();
const writes: string[] = [];
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string) => { writes.push(k); },
  removeItem: (k: string) => { writes.push(k); },
  key: () => null, length: 0, clear: () => {},
};
afterEach(() => { vi.unstubAllGlobals(); mem.clear(); writes.length = 0; });

describe('a teen: nothing saved, the phone\'s last 10 jumps', () => {
  it('reads the device copy, shows 10, makes 0 fetches and 0 writes', () => {
    const jumps = Array.from({ length: 12 }, (_, i) => ({ id: `jump-teen${String(i).padStart(4, '0')}`, at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), test: 'check', bestCm: 38 + i * 0.5, plusMinusCm: 1.4, jumps: 3, verified: false, manualFrames: false, source: 'live', fps: 60, rsi: null, contactMs: null, v0Mps: null, rsiMod: null }));
    mem.set(HISTORY_KEY, JSON.stringify(jumps));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', { localStorage: storage, fetch: fetchSpy });
    const rows = deviceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('device');
    expect(rows[0].history).toHaveLength(10);
    // the page itself, server-drawn (the phone's rows arrive after mount): nothing saved to show yet, and no call
    const html = renderToStaticMarkup(h(ProgressView, { saved: NOTHING_SAVED }));
    expect(html).toContain('data-progress="loading"');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});

describe('an adult who opted in: saved history and two combines with arrows', () => {
  const DAY = 86_400_000;
  const st = (best: number) => [{ id: 'cmj:standing', kind: 'cmj' as const, variant: 'standing', best, touchCm: null, attempts: [best], rank: 2, of: 14 }];
  const saved: SavedProgress = {
    canSave: true,
    jumps: [{ at: 10 * DAY, cm: 52 }, { at: 20 * DAY, cm: 57 }],
    readiness: [],
    sets: [],
    combines: { available: true, events: [{ id: 'b', name: 'Spring', createdAt: 60 * DAY, stations: st(58.4) }, { id: 'a', name: 'Winter', createdAt: 15 * DAY, stations: st(54.1) }] },
  };
  it('the saved jump row and the combine row both carry an arrow', () => {
    const rows = savedRows(saved);
    expect(rows.map((r) => r.source)).toEqual(['account', 'combine']);
    expect(rows.every((r) => r.vsLast === 'up')).toBe(true);
    expect(rows.find((r) => r.source === 'combine')!.history).toHaveLength(2);
  });
});
