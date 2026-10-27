// TODAY-DRILL (owner playtest 2026-10-27): the Today's drill flow, rendered. Before: why today, what it improves, what
// you need, the steps, the demo and the cues — everything open for a first-timer with Start at the end, Start near the
// top for a returning player. During: the step of how many, the rep, ONE cue, rest and next, and Pause / Stop / "This
// hurts: stop" always on screen. "This hurts" ends the camera and opens the EXISTING pain check-in (one pain path).
// After: what we saw / what it means / what's next, with the claim's credits and streak.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ view: null as unknown, calls: [] as string[] }));
vi.mock('@/app/play/drills/_components/use-live-drill', () => ({
  useLiveDrill: () => ({
    handle: {
      live: {
        open: async () => true, go: () => h.calls.push('go'), cameraBack: async () => true,
        finish: () => h.calls.push('finish'), pause: () => h.calls.push('pause'), close: () => h.calls.push('close'),
      },
      dispose: () => {},
    },
    view: h.view,
  }),
}));
vi.mock('@/components/games/body-play', () => ({
  useBodyPlay: () => ({ stage: 'checking', grownUp: 'clear', collapsed: false, camera: { state: 'live' } }),
  SelfView: () => createElement('div', { 'data-selfview': '' }),
  SpaceCheckPanel: () => createElement('div', { 'data-space': '' }),
}));
vi.mock('@/lib/move/bodyPlay', () => ({ bodyPlay: { confirmGrownUp: async () => true, collapse: () => {} } }));

import { TodayDrillRun } from '@/app/train/today-drill/_components/today-drill-run';
import { DrillResultView, DrillRunning, HurtPanel } from '@/app/train/today-drill/_components/today-drill-live';
import { DrillLive } from '@/app/play/drills/_components/drill-live';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drillDemoLoop } from '@/lib/library/surfaceDemo';
import { drive, findAll, textOf } from '@/tests/helpers/driveRender';
import { LIVE_IDLE, type LiveDrillView } from '@/lib/drills/liveDrill';
import { DrillRunner, type DrillResult } from '@/lib/drills/DrillRunner';
import { composeDailyDrill } from '@/lib/daily-drill/compose';
import { viewFrom } from '@/lib/daily-drill/load';
import { HURT_LABEL, PAUSE_LABEL, STOP_LABEL } from '@/lib/daily-drill/guide';
import { NOW, OPEN, YOUTH, hooper, jumper, newAdult, teen } from '@/tests/helpers/dailyDrillRows';

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const intro = (v: ReturnType<typeof viewFrom>) => decode(renderToStaticMarkup(createElement(TodayDrillRun, { view: v, dobYear: 1994 })));
/** Words a reader sees: the markup's text, counted the way the phone rig counts them. */
const wordCount = (html: string) => (decode(html.replace(/<[^>]+>/g, ' ')).match(/[A-Za-z0-9][A-Za-z0-9'’.%-]*/g) ?? []).length;
const live = (v: Partial<LiveDrillView>) => { h.view = { ...LIVE_IDLE, ...v }; };

beforeEach(() => { h.calls = []; live({ phase: 'setup' }); });

describe('before: purpose first, then what to do', () => {
  it('a first-timer: the book label, the short why, what it improves, the chips, the one-line explainer, steps, cues', () => {
    const out = intro(viewFrom('u1', { ...hooper(), recentDrills: 0 }, OPEN, NOW));
    expect(out).toContain('data-daily-newcomer="1"');
    expect(out).toContain('New: one short drill a day, from your lowest score.');
    expect(out).toMatch(/<h1[^>]*>Soft landings<\/h1>/);
    expect(out).toContain('Safe Landing Check');                                       // the book name, a small label
    expect(out).toContain('Shooting is your lowest score (40%). Today: soft landings.');
    expect(out).toContain('Steady landings on every jump.');
    for (const c of ['time', 'phone', 'floor', 'shoes', 'above']) expect(out).toContain(`data-daily-need="${c}"`);
    expect(out).toContain('6 min');
    expect(out).toContain('data-daily-steps="2"');
    expect(out).toContain('data-daily-cues="2"');
    expect(out).toContain('+10 Lab Credits');
    expect(out).toContain('aria-label="Day 4 of your streak"');
  });

  it('owner 2026-10-27: less text — a first-timer reads ≤ 110 words before Start, a returning player ≤ 40', () => {
    const cases = [
      [{ ...hooper(), recentDrills: 0 }, OPEN, 110], [{ ...jumper(), recentDrills: 0 }, OPEN, 110], [newAdult(), OPEN, 110],
      [hooper(), OPEN, 40], [jumper(), OPEN, 40], [teen(), YOUTH, 40],
    ] as const;
    for (const [rows, acc, max] of cases) {
      const v = viewFrom('u1', rows, acc, NOW);
      const n = wordCount(intro(v)) - wordCount(v.plan!.heldNote ?? '') - (v.plan!.heldHref ? 3 : 0);
      expect(n, `${v.plan!.key} newcomer=${v.newcomer}: ${n} words`).toBeLessThanOrEqual(max);
    }
  });

  it('a returning player: no explainer, steps or improves line — the demo, the chips, the cues and Start', () => {
    const out = intro(viewFrom('u1', hooper(), OPEN, NOW));
    expect(out).toContain('data-daily-newcomer="0"');
    expect(out).not.toContain('data-daily-explainer');
    expect(out).not.toContain('data-daily-steps');
    expect(out).toContain('data-daily-demo');
    expect(out).toContain('data-daily-cues="2"');
  });

  it('owner 2026-10-27: nothing behind a tap, and the next action is ONE big button, always on screen', () => {
    for (const rows of [hooper(), { ...hooper(), recentDrills: 0 }]) {
      const out = intro(viewFrom('u1', rows, OPEN, NOW));
      expect(out).not.toContain('<details');
      expect((out.match(/data-daily-start=/g) ?? []).length).toBe(1);
      expect(out).toContain('data-daily-start-bar');
      expect(out).toContain('bottom-[calc(4rem+env(safe-area-inset-bottom))]');   // above the phone's tab bar
      expect(out).not.toContain('Watch the 3D demo');                              // no "watch" tap: it plays by itself
    }
  });

  it('the demo is #462\'s shared stage (AvatarDemo + useAutoOpen + drillDemoLoop), for the day\'s drill', () => {
    const out = intro(viewFrom('u1', { ...jumper(), recentDrills: 0 }, OPEN, NOW));
    expect(out).toContain('data-daily-demo="pogo-bilateral"');
    expect(drillDemoLoop('pogo-bilateral')).toBe('ex_pogo');
    const src = readFileSync(join(__dirname, '../../app/train/today-drill/_components/today-drill-run.tsx'), 'utf8');
    expect(src).toMatch(/from '@\/components\/library\/avatar-demo'/);
    expect(src).toMatch(/from '@\/components\/library\/use-auto-open'/);
    expect(src).not.toMatch(/exercise-avatar-canvas|exercise-stage/);
  });

  it('Start opens the camera screen with today\'s own running and result screens', () => {
    const v = viewFrom('u1', hooper(), OPEN, NOW);
    const { tree } = drive(() => TodayDrillRun({ view: v, dobYear: 1994 }) as ReactElement, [
      (t) => findAll(t, (el) => el.type === 'button' && 'data-daily-start' in el.props)[0].props.onClick(),
    ]);
    const [dl] = findAll(tree, (el) => el.type === DrillLive);
    expect(dl.props.keptLine).toContain('Only the fact that you finished');
    expect(typeof dl.props.renderRunning).toBe('function');
    expect(typeof dl.props.renderResult).toBe('function');
  });
});

describe('during: one step, one cue, the rep, rest and next; Pause / Stop / This hurts always there', () => {
  const v = viewFrom('u1', jumper(), OPEN, NOW);
  const drill = composeDailyDrill(v.plan!)!;
  const at = (sec: number) => { const r = new DrillRunner(drill, {}); r.tick(0, true); return r.tick(sec * 1000, true); };
  const slot = (run: ReturnType<typeof at>) => ({ view: { ...LIVE_IDLE, phase: 'playing' as const, run }, drill, end: () => h.calls.push('end'), pause: () => h.calls.push('pause'), leave: () => h.calls.push('leave') });
  const html = (el: ReactNode) => decode(renderToStaticMarkup(el as ReactElement));

  it('a hop set: Step 4 of 8, its plain name, the rep counter, one cue, next = Rest', () => {
    const t = 240 + 9;   // the warm-up is 4 minutes; 9 s into set 1
    const out = html(createElement(DrillRunning, { slot: slot(at(t)), drillId: v.plan!.drillId, onHurt: () => {} }));
    expect(out).toContain('data-daily-step-of="4/8"');
    expect(out).toContain('Hops: set 1');
    expect(out).toMatch(/data-daily-rep="\d+\/20"/);
    expect((out.match(/data-daily-cue/g) ?? []).length).toBe(1);
    expect(out).toContain('Next: Rest');
    for (const l of [PAUSE_LABEL, STOP_LABEL, HURT_LABEL]) expect(out).toContain(l);
  });

  it('a rest: the big Rest and its countdown, and what is next', () => {
    const out = html(createElement(DrillRunning, { slot: slot(at(240 + 17 + 10)), drillId: v.plan!.drillId, onHurt: () => {} }));
    expect(out).toContain('data-daily-rest');
    expect(out).toContain('Next: Hops: set 2');
    expect(out).not.toContain('data-daily-cue');
  });

  it('the buttons do what they say: pause, stop (a result), this hurts', () => {
    let hurt = 0;
    const el = DrillRunning({ slot: slot(at(250)), drillId: v.plan!.drillId, onHurt: () => { hurt++; } });
    const press = (attr: string) => findAll(el, (x) => x.type === 'button' && attr in x.props)[0].props.onClick();
    press('data-daily-pause'); press('data-daily-stop'); press('data-daily-hurt');
    expect(h.calls).toEqual(['pause', 'end']);
    expect(hurt).toBe(1);
  });

  it('DrillLive hands the running slot the controller\'s own pause and finish, and hides its leave link while it runs', () => {
    live({ phase: 'playing', run: at(250) });
    const seen: string[] = [];
    const out = decode(renderToStaticMarkup(createElement(DrillLive, {
      drill, onLeave: () => {},
      renderRunning: (s) => { s.pause(); s.end(); seen.push('running'); return createElement('div', { 'data-mine': '' }); },
    })));
    expect(seen).toEqual(['running']);
    expect(h.calls).toEqual(['pause', 'finish']);
    expect(out).toContain('data-mine');
    expect(out).not.toContain('Leave the drill');
  });

  it('"This hurts: stop" turns the camera off and opens the existing pain check-in, already open', () => {
    const v2 = viewFrom('u1', hooper(), OPEN, NOW);
    live({ phase: 'playing', run: null });
    let dl: { props: Record<string, any> } | null = null;
    const { html: out } = drive(() => TodayDrillRun({ view: v2, dobYear: 1994 }) as ReactElement, [
      (t) => findAll(t, (el) => el.type === 'button' && 'data-daily-start' in el.props)[0].props.onClick(),
      (t) => {
        dl = findAll(t, (el) => el.type === DrillLive)[0];
        const running = dl.props.renderRunning({ view: h.view, drill: dl.props.drill, end: () => {}, pause: () => {}, leave: () => { h.calls.push('close'); dl!.props.onLeave(); } });
        running.props.onHurt();
      },
    ]);
    expect(h.calls).toContain('close');
    const d = decode(out);
    expect(d).toContain('data-daily-hurt-panel');
    expect(d).toContain('Stopped. Rest now.');
    expect(d).toContain(`data-pain-checkin="${v2.plan!.name}"`);
    expect(d).toContain('Pain, 0–10');          // the chip's own form, opened (painRule decides; no copy of ours)
    expect(d).not.toMatch(/data-daily-claim="(done|sending)"/);
  });

  it('the hurt panel is the pain chip with kind "during": one pain path', () => {
    const el = HurtPanel({ drillName: 'Safe Landing Check' });
    const [chip] = findAll(el, (x) => typeof x.type === 'function' && (x.type as { name?: string }).name === 'PainCheckInChip');
    expect(chip.props).toMatchObject({ exerciseName: 'Safe Landing Check', kind: 'during', initiallyOpen: true });
  });
});

describe('after: what we saw / what it means / what is next', () => {
  it('three plain rows, the credits and streak as the claim paid them, the estimate and kept lines', () => {
    const v = viewFrom('u1', hooper(), OPEN, NOW);
    const drill = composeDailyDrill(v.plan!)!;
    const result: DrillResult = {
      drillId: drill.id, status: 'complete', counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 }, accuracy: 0.8, stars: null, score: 0,
      phases: drill.phases.map((p) => ({ id: p.id, name: p.name, targets: p.targets.length, counts: { PERFECT: p.targets.length, GREAT: 0, GOOD: 0, MISS: 0 }, accuracy: 1, stars: null, score: 0, maxCombo: 0, meanDeltaMs: null, holds: { held: 9, broken: 1 }, cadence: null, attempts: 1, finished: true })),
    };
    const out = decode(renderToStaticMarkup(createElement(DrillResultView, {
      slot: { result, drill, again: () => {}, leave: () => {} }, drillId: v.plan!.drillId, refs: v.plan!.phases, tomorrow: v.tomorrow.line,
      claim: { state: 'done', amount: 30, streakDays: 4 },
    })));
    expect(out).toContain('Done for today');
    expect(out).toContain('+30 Lab Credits. Streak: 4 days.');
    expect(out).toContain('What we saw');
    expect(out).toContain('Camera saw 20 of 20 on time, 9 of 10 held still.');
    expect(out).toContain('What it means');
    expect(out).toContain('What’s next');
    expect(out).toContain('Tomorrow: likely soft landings again.');
    expect(out).toContain('camera estimate');
    expect(out).toContain('Only the fact that you finished');
    expect(textOf(null)).toBe('');
  });
});
