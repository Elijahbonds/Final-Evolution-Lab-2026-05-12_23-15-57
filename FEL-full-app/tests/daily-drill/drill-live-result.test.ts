// DAILY-DRILL (2026-10-24): the drills page's camera screen, as today's drill uses it — the two props this lane added to
// DrillLive. onResult is told ONCE per result (a re-render of the done screen never reports it again, so a claim is
// never sent twice from one run), and keptLine replaces the "nothing is saved" line on the result card, because today's
// drill keeps one fact. Without them the screen is exactly the drills page's (tests/drills/drill-live.test.ts).
// The mocks are tests/drills/drill-live.test.ts's, unchanged.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

const h = vi.hoisted(() => ({
  view: null as unknown,
  body: null as unknown,
  calls: [] as string[],
  confirm: 0,
  listeners: new Set<() => void>(),
}));
vi.mock('@/app/play/drills/_components/use-live-drill', async () => {
  const React = await import('react');
  // one handle for the page's life, as the real hook keeps it in state
  const handle = {
    live: {
      open: async (d: { id: string }) => { h.calls.push(`open:${d.id}`); return true; },
      go: () => h.calls.push('go'),
      cameraBack: async () => { h.calls.push('cameraBack'); return true; },
      finish: () => h.calls.push('finish'),
      close: () => h.calls.push('close'),
    },
    dispose: () => h.calls.push('dispose'),
  };
  return { useLiveDrill: () => ({
    handle,
    // read like the real hook (an external store), so the test can make the screen re-render
    view: React.useSyncExternalStore((fn: () => void) => { h.listeners.add(fn); return () => { h.listeners.delete(fn); }; }, () => h.view),
  }) };
});
vi.mock('@/components/games/body-play', () => ({
  useBodyPlay: () => h.body,
  SelfView: () => null,
  SpaceCheckPanel: () => null,
}));
vi.mock('@/lib/move/bodyPlay', () => ({
  bodyPlay: { confirmGrownUp: async () => { h.confirm++; return true; }, collapse: () => {} },
}));

import { DrillLive, HIDE_WARMUP_OFFER_CSS, NOTHING_SAVED_LINE, PAUSED_LINE } from '@/app/play/drills/_components/drill-live';
import { WARMUP_HREF } from '@/lib/move/bodyPlayChoice';
import { DRILLS_PATH } from '@/lib/drills/route';
import { GrownUpStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { SpaceCheckPanel } from '@/components/games/body-play';
import { mount } from '@/tests/helpers/hookRuntime';
import { button, findAll, textOf } from '@/tests/helpers/driveRender';
import { LIVE_IDLE, type LiveDrillView } from '@/lib/drills/liveDrill';
import { SAFE_LANDING, WAKE_UP } from '@/lib/drills/drills';
import { DrillRunner } from '@/lib/drills/DrillRunner';

const settle = () => new Promise((r) => setTimeout(r, 0));
const view = (v: Partial<LiveDrillView>) => { h.view = { ...LIVE_IDLE, ...v }; };
/** Body play's view (lib/move/bodyPlay BODY_PLAY_OFF's shape; the module itself is stood in for here). */
const BODY_OFF = {
  key: null, stage: 'off', collapsed: false, checking: false,
  camera: { state: 'idle', why: null, aspect: 4 / 3, portrait: false, source: null },
  space: null, poseHz: null, jumpHeight: null, grownUp: 'clear',
};
const body = (v: Record<string, unknown>) => { h.body = { ...BODY_OFF, ...v }; };
const types = (tree: unknown, t: unknown) => findAll(tree as ReactNode, (el) => el.type === t);
const fnNamed = (tree: unknown, name: string) => findAll(tree as ReactNode, (el) => typeof el.type === 'function' && (el.type as { name?: string }).name === name);

beforeEach(() => {
  h.calls = []; h.confirm = 0; h.listeners.clear();
  body({ stage: 'checking', grownUp: 'clear' });
});

const complete = { status: 'complete', phases: [], accuracy: null } as never;

describe('DrillLive for today\'s drill', () => {
  it('reports a finished run once, however often the done screen re-renders; a new run reports again', async () => {
    view({ phase: 'done', drillId: SAFE_LANDING.id, result: complete });
    const seen: unknown[] = [];
    const onResult = (r: unknown) => { seen.push(r); };
    const m = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {}, onResult, keptLine: 'KEPT' }));
    await settle();
    expect(seen).toEqual([complete]);
    // the store ticks (a re-render with the same result): no second report
    for (const fn of h.listeners) fn();
    await settle();
    expect(seen).toHaveLength(1);
    // "Run it again" finishes with a NEW result object: reported
    const next = { status: 'complete', phases: [], accuracy: null } as never;
    view({ phase: 'done', drillId: SAFE_LANDING.id, result: next });
    for (const fn of h.listeners) fn();
    await settle();
    expect(seen).toEqual([complete, next]);
    m.unmount();
  });

  it('nothing is reported while the drill runs or sets up', async () => {
    view({ phase: 'setup', drillId: SAFE_LANDING.id });
    const seen: unknown[] = [];
    mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {}, onResult: (r) => { seen.push(r); } }));
    await settle();
    expect(seen).toEqual([]);
  });

  it('keptLine replaces the "nothing is saved" line on the result card; without it the drills page\'s line stands', async () => {
    view({ phase: 'done', drillId: SAFE_LANDING.id, result: complete });
    const withLine = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {}, keptLine: 'Only that you finished is kept.' }));
    await settle();
    const [card] = fnNamed(withLine.tree, 'ResultCard');
    const t = textOf((card.type as (p: unknown) => ReactNode)(card.props));
    expect(t).toContain('Only that you finished is kept.');
    expect(t).not.toContain(NOTHING_SAVED_LINE);
    const plain = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {} }));
    await settle();
    const [card2] = fnNamed(plain.tree, 'ResultCard');
    expect(textOf((card2.type as (p: unknown) => ReactNode)(card2.props))).toContain(NOTHING_SAVED_LINE);
  });
});
