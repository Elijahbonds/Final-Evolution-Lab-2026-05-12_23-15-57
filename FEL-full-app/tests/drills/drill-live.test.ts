// Mirror & coaching plan Phase 6 (2026-10-07): the drill's camera screen, MOUNTED (tests/helpers/hookRuntime.ts, Phase 1's
// test-only hooks runtime), with its controller and body play stood in for. The controller itself is tested whole in
// lib/drills/liveDrill.test.ts; this pins what the screen does with it: the drill opens once on mount (a re-render never
// reopens it, so never restarts the camera), an under-18 / unknown age sees the Mirror's grown-up step before anything
// else, a hidden tab's pause shows the camera-off card whose button is the only way the camera comes back, the result
// says nothing is saved, and leaving lets go of everything.
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

import { DrillLive, NOTHING_SAVED_LINE, PAUSED_LINE } from '@/app/play/drills/_components/drill-live';
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
  view({ phase: 'setup', drillId: SAFE_LANDING.id });
  body({ stage: 'checking', grownUp: 'clear' });
});

describe('the drill screen', () => {
  it('opens the drill once, on mount; re-renders (a new view every tick, a new drill object) never reopen it', async () => {
    // a trimmed drill (lib/drills/gate.ts drillToRun) is a new object whenever the parent recomputes it
    const m = mount(() => DrillLive({ drill: { ...SAFE_LANDING }, onLeave: () => {} }));
    await settle();
    for (let i = 0; i < 3; i++) {
      view({ phase: 'setup', drillId: SAFE_LANDING.id, handsUp01: i / 10 });
      h.listeners.forEach((fn) => fn());
      await settle();
    }
    expect(m.renders).toBeGreaterThanOrEqual(4);
    expect(h.calls).toEqual(['open:safe-landing']);
    m.unmount();
  });

  it('setup: body play\'s own space check panel; its start is the controller\'s go()', async () => {
    const m = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {} }));
    await settle();
    const [panel] = types(m.tree, SpaceCheckPanel);
    expect(panel).toBeTruthy();
    expect(panel.props.variant).toBe('ready');
    panel.props.onStart();
    expect(h.calls).toContain('go');
  });

  it('an under-18 or unknown age: the Mirror\'s grown-up step, before the space check; Continue is body play\'s confirm', async () => {
    body({ stage: 'off', grownUp: 'ask' });
    const m = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {} }));
    await settle();
    const [step] = types(m.tree, GrownUpStep);
    expect(step).toBeTruthy();
    expect(types(m.tree, SpaceCheckPanel)).toHaveLength(0);
    step.props.onContinue();
    await settle();
    expect(h.confirm).toBe(1);
  });

  it('a hidden tab\'s pause: the camera-off card; only its button brings the camera back', async () => {
    const r = new DrillRunner(WAKE_UP);
    view({ phase: 'paused', drillId: WAKE_UP.id, run: r.tick(0, true) });
    body({ stage: 'off', grownUp: 'clear' });
    const m = mount(() => DrillLive({ drill: WAKE_UP, onLeave: () => {} }));
    await settle();
    expect(textOf(m.tree as ReactNode)).toContain(PAUSED_LINE);
    expect(textOf(m.tree as ReactNode)).toContain('Your place is kept: Release the Locks.');
    expect(h.calls).not.toContain('cameraBack');
    button(m.tree as ReactNode, /Turn the camera on/).props.onClick();
    expect(h.calls).toContain('cameraBack');
  });

  it('paused with the camera back on: the space check again, as body play\'s paused panel (RESUME)', async () => {
    view({ phase: 'paused', drillId: SAFE_LANDING.id });
    body({ stage: 'set', grownUp: 'clear' });
    const m = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => {} }));
    await settle();
    expect(types(m.tree, SpaceCheckPanel)[0].props.variant).toBe('paused');
  });

  it('done: the result says nothing is saved or sent; leaving closes the controller', async () => {
    const r = new DrillRunner(SAFE_LANDING);
    view({ phase: 'done', drillId: SAFE_LANDING.id, result: r.result() });
    let left = 0;
    const m = mount(() => DrillLive({ drill: SAFE_LANDING, onLeave: () => { left++; } }));
    await settle();
    const [card] = fnNamed(m.tree, 'ResultCard');
    expect(card).toBeTruthy();
    // the card is a child component (not rendered by the runtime): render it as the page would
    const cardTree = (card.type as (p: unknown) => ReactNode)(card.props);
    expect(textOf(cardTree)).toContain(NOTHING_SAVED_LINE);
    button(cardTree, /Back to the drill/).props.onClick();
    expect(h.calls).toContain('close');
    expect(left).toBe(1);
  });
});
