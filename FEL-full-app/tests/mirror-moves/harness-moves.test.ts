// MIRROR-MOVES P2 (2026-10-07; plan Phase 2, "every live movement talks"): the real Mirror harness, MOUNTED
// (tests/helpers/hookRuntime.ts, Phase 1's rig), with the camera, the pose runtime and the voice faked:
//
//   - `initialPattern` (page.tsx's `?pattern=`) opens that tab, for every tab;
//   - the hip hinge and the push-up are live tabs: the safety-first framing before Start, a side-on set graded rep by rep,
//     the coach speaking between reps (with the reply to a repeated fault), the review;
//   - the lunge speaks;
//   - the page still repaints at most ~10 times a second on the new tabs;
//   - a minor's hinge/push-up set sends nothing — and neither does an adult's (these tabs keep their sets on the page).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

const rig = vi.hoisted(() => ({
  sessions: [] as { opts: { analysis?: string; onReady?: () => void; onFrame?: (info: unknown) => void }; disposed: boolean }[],
  spoken: [] as string[],
}));
vi.mock('@/lib/babylon/nexus/neuro-mirror', () => {
  const zero = () => ({ posterior_chain: 0, lat_rhomboid: 0, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 });
  return {
    NeuroMirror: {
      async session(opts: { onReady?: () => void; onFrame?: (info: unknown) => void }) {
        const s = { opts, disposed: false };
        rig.sessions.push(s);
        queueMicrotask(() => opts.onReady?.());
        return {
          ready: () => true,
          summary: () => ({
            patternId: 'split_stance_press_row', startedAtMs: 0, durationMs: 1000, timeInStableMs: zero(), faultCounts: zero(),
            avgFrameMs: 10, reps: 0, avgTempo: null,
          }),
          dispose: () => { s.disposed = true; },
        };
      },
    },
  };
});
// the voice: what the coach would say, captured (the harness's speak() → speakNatural)
// (each line "ends" at once: a protected line — a stage line, the turn line — lets the coach speak again when it ends)
vi.mock('@/lib/babylon/audio/voice/speakNatural', () => ({
  speakNatural: (text: string, opts?: { onend?: () => void }) => { rig.spoken.push(text); opts?.onend?.(); },
}));

import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';
import { SideRepFraming, SideRepReviewCard } from '@/app/play/mirror/_components/side-rep-panels';
import { mount, type Mounted } from '@/tests/helpers/hookRuntime';
import { button, findAll, textOf } from '@/tests/helpers/driveRender';
import { MIRROR_TABS, type MirrorTab } from '@/lib/mirror/patternParam';
import { adapterFromPose, toAdapterFrames } from '@/lib/mirror/fixtures';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { hingeSet, pushupSet } from '@/lib/mirror/fixtures/sideRepBuild';
import { HINGE_CUES } from '@/lib/mirror/hingeAudit';
import { LUNGE_CUES } from '@/lib/mirror/lungeAudit';
import { HINGE_FRAMING } from '@/lib/mirror/hingeStage';
import { PUSHUP_FRAMING } from '@/lib/mirror/pushupStage';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

const BUDGET_HZ = 10;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  rig.sessions = [];
  rig.spoken = [];
  const track = { stop: vi.fn() };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn() });
  // the cue bubble clears itself on a window timer (and the camera listens for pagehide)
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: () => {}, removeEventListener: () => {},
  });
  fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setImmediate(r));
  }
}
const fakeVideo = { srcObject: null as unknown, play: async () => {}, videoWidth: 960, videoHeight: 720 };
const fakeCanvas = { getContext: () => null, width: 0, height: 0, clientWidth: 0, clientHeight: 0 };
function attachRefs(node: ReactNode) {
  if (Array.isArray(node)) { node.forEach(attachRefs); return; }
  if (!isValidElement(node)) return;
  const ref = (node as unknown as { ref?: { current: unknown } | null }).ref;
  if (ref && typeof ref === 'object' && 'current' in ref && ref.current == null) ref.current = node.type === 'canvas' ? fakeCanvas : fakeVideo;
  attachRefs((node.props as { children?: ReactNode }).children);
}
const ZONES = { posterior_chain: 'stable', lat_rhomboid: 'stable', upper_traps: 'stable', rib_thoracic: 'stable', lumbo_pelvic: 'stable' };
/** Camera frames, the way the compositor hands them on (the pose's own clock). */
async function feed(frames: readonly PoseFrame[], every = 1) {
  const s = rig.sessions[rig.sessions.length - 1];
  for (let i = 0; i < frames.length; i++) {
    vi.advanceTimersByTime(1000 / 30);
    s.opts.onFrame?.({ phase: 'hold', frameMs: 9, zones: ZONES, reps: { reps: 0, last: null, avg: null, phase: 'hold' }, pose: frames[i] });
    if (i % every === 0) await settle(1);
  }
  vi.advanceTimersByTime(300);
  await settle();
}
async function start(m: Mounted) {
  attachRefs(m.tree as ReactNode);
  button(m.tree as ReactNode, /^Start session$/).props.onClick();
  await settle();
}
const tree = (m: Mounted) => m.tree as ReactNode;
const text = (m: Mounted) => textOf(tree(m));
const selectedTab = (m: Mounted) => findAll(tree(m), (el) => el.props.role === 'tab' && el.props['aria-selected'] === true);
const ofType = (m: Mounted, type: unknown) => findAll(tree(m), (el) => el.type === type);
const SQUATTY = { backM: 0.05, dropM: 0.30, trunkDeg: 30 };

describe('initialPattern (page.tsx\'s ?pattern=) opens that tab', () => {
  it.each(MIRROR_TABS.map((t) => [t]))('%s', (tab) => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false, initialPattern: tab as MirrorTab }));
    const on = selectedTab(m);
    expect(on).toHaveLength(1);
    expect(textOf(on[0].props.children)).toBe({
      pressRow: 'Press / Row', squat: 'Squat', lunge: 'Lunge', hinge: 'Hinge', pushup: 'Push-up', jump: 'Jump', screen: 'Screen',
    }[tab as MirrorTab]);
    m.unmount();
  });

  it('no initialPattern: the default tab, as before', () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false }));
    expect(textOf(selectedTab(m)[0].props.children)).toBe('Press / Row');
    m.unmount();
  });
});

describe('the hip hinge, live', () => {
  it('before Start: the safety-first framing (side-on, the phone at hip height, bodyweight, stop if it hurts)', () => {
    const m = mount(() => MirrorHarness({ youth: 'minor', canSaveScan: false, initialPattern: 'hinge' }));
    const card = ofType(m, SideRepFraming);
    expect(card).toHaveLength(1);
    const html = renderToStaticMarkup(SideRepFraming(card[0].props as { lines: readonly string[] }));
    expect(card[0].props.lines).toBe(HINGE_FRAMING);
    expect(html).toMatch(/side-on/i);
    expect(html).toMatch(/hip height/);
    expect(html).toMatch(/Bodyweight only/);
    expect(html).toMatch(/stop the set if anything hurts/);
    expect(text(m)).toContain('Hip Hinge');
    m.unmount();
  });

  it('a knee-dominant set: counted, the coach speaks between reps (cue, then the reply), the review says it is still showing — and nothing is sent, even for an adult who opted in', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: true, initialPattern: 'hinge' }));
    await start(m);
    expect(ofType(m, SideRepFraming)).toHaveLength(0);         // the framing card is for before Start
    await feed(adapterFromPose(hingeSet({ reps: 11, rep: () => SQUATTY }), 1000), 10);
    const card = HINGE_CUES.find((c) => c.faultId === 'hingeRatio')!;
    expect(rig.spoken).toContain('Good. 3 slow reps first — the check.');
    expect(rig.spoken).toContain('Now the work set: 8 reps. I will cue between reps.');
    expect(rig.spoken).toContain(card.cue);
    expect(rig.spoken).toContain(card.reply);
    expect(rig.spoken.indexOf(card.cue)).toBeLessThan(rig.spoken.indexOf(card.reply!));
    const review = ofType(m, SideRepReviewCard);
    expect(review).toHaveLength(1);
    const html = renderToStaticMarkup(SideRepReviewCard(review[0].props as Parameters<typeof SideRepReviewCard>[0]));
    expect(html).toMatch(/Still showing in the last 3 reps/);
    expect(html).toMatch(/Knees doing the work/);
    expect(html).toMatch(/estimated/);
    expect(html).not.toMatch(/diagnos|injur|pain/i);
    button(tree(m), /^End session$/).props.onClick();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(text(m)).not.toContain('Session summary');           // the press/row zone summary is not this tab's
    m.unmount();
  });

  it('End mid-set: the review shows what was read so far', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false, initialPattern: 'hinge' }));
    await start(m);
    await feed(adapterFromPose(hingeSet({ reps: 4 }), 1000), 10);
    expect(ofType(m, SideRepReviewCard)).toHaveLength(0);
    button(tree(m), /^End session$/).props.onClick();
    await settle();
    const review = ofType(m, SideRepReviewCard);
    expect(review).toHaveLength(1);
    expect(review[0].props.state.checkReps).toHaveLength(3);
    expect(review[0].props.state.workReps).toHaveLength(1);
    m.unmount();
  });
});

describe('the push-up, live', () => {
  it('a minor\'s clean set: framing before Start (phone on the floor), counted to the review, no correction cued, zero requests', async () => {
    const m = mount(() => MirrorHarness({ youth: 'minor', canSaveScan: false, initialPattern: 'pushup' }));
    expect(ofType(m, SideRepFraming)[0].props.lines).toBe(PUSHUP_FRAMING);
    expect(PUSHUP_FRAMING.join(' ')).toMatch(/phone on the floor/i);
    await start(m);
    await feed(adapterFromPose(pushupSet({ reps: 11 }), 1000), 10);
    const review = ofType(m, SideRepReviewCard);
    expect(review).toHaveLength(1);
    expect(review[0].props.cueLog).toEqual([]);
    expect(review[0].props.state.workReps).toHaveLength(8);
    button(tree(m), /^End session$/).props.onClick();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
    m.unmount();
  });
});

describe('the lunge speaks', () => {
  it('a caving front knee: the lunge\'s knee card is said, and shown over the stage', async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false, initialPattern: 'lunge' }));
    await start(m);
    const fx = readFixture('lunge_right_front_knee_in');
    const one = toAdapterFrames(fx);
    const span = fx.frames[fx.frames.length - 1].t + 1000 / 30;
    await feed(Array.from({ length: 3 }, (_, i) => one.map((f) => ({ ...f, timestampMs: f.timestampMs + 1000 + i * span }))).flat(), 10);
    const card = LUNGE_CUES.find((c) => c.faultId === 'kneeIn')!;
    expect(rig.spoken).toContain(card.cue);
    m.unmount();
  });
});

describe.each([['hinge'], ['pushup']] as const)('%s, live: the frame budget', (tab) => {
  it(`3 s of 30 Hz camera frames mid-set re-render the page at most ~${BUDGET_HZ} times a second`, async () => {
    const m = mount(() => MirrorHarness({ youth: 'adult', canSaveScan: false, initialPattern: tab }));
    await start(m);
    const frames = adapterFromPose(tab === 'hinge' ? hingeSet({ reps: 3 }) : pushupSet({ reps: 3 }), 1000);
    await feed(frames.slice(0, 60));                             // setup done, into the check
    const before = m.renders;
    await feed(frames.slice(60, 150));
    const renders = m.renders - before;
    expect(renders).toBeLessThanOrEqual(3 * BUDGET_HZ + 6);      // ten a second, plus the events (a rep, a stage)
    m.unmount();
  });
});
