// MIRROR-COACH P7 (2026-09-29): the Dial-Up Breath on Today's key-set card, rendered (components/coach/ramp-breath.tsx).
// The lane's dev server is down and its database offline, so a server render is the card's first paint: NOTHING until
// the server says eligible; the offer; the one-screen explanation with the stop line; the run on the phase's one pacer
// with the stop line on screen the whole time. And Today mounts it on the flagged key set only, never on an off day,
// never from the dev harnesses, and closes it once a set row has anything in it.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RAMP_API, RampBreath, RampExplain, RampOffer, RampRun, rampBusy, rampLineAt, rampShown, type RampPhase } from './ramp-breath';
import { TODAY_API, keySetUnderWay, rampEndpointFor } from '@/app/coach/_components/today-view';
import { emptySetDraft } from '@/lib/coach/setLog';
import { liveRunKind, settleChipFor } from './set-timer';
import { pauseRun, startRun, timersFor } from '@/lib/coach/setTimer';
import { SETTLE_WHY_LINE } from '@/lib/breath/presets';
import {
  RAMP_INTERRUPTED_LINE, RAMP_NAME, RAMP_OFFER, RAMP_OFFER_BUTTON, RAMP_PACER, RAMP_PHASE_LINES, RAMP_RUN_SEC, RAMP_SKIP_BUTTON, RAMP_START_BUTTON, RAMP_STOP_LINE,
  rampExplainLines,
} from '@/lib/breath/rampGate';

const text = (m: string) => m.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const html = (el: Parameters<typeof createElement>[0], props: Record<string, unknown>) => text(renderToStaticMarkup(createElement(el as never, props as never)));

describe('RampBreath: the server decides, so the first paint is nothing', () => {
  it('renders nothing before the server answers — with an endpoint, and without one (the dev harness)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect(html(RampBreath, { sessionExerciseId: 'se-1', endpoint: RAMP_API })).toBe('');
    expect(html(RampBreath, { sessionExerciseId: 'se-1', endpoint: null })).toBe('');
    vi.unstubAllGlobals();
  });
  it('the only thing it sends is the exercise id: no day, no answers, no "eligible" of its own', () => {
    const src = readFileSync('components/coach/ramp-breath.tsx', 'utf8');
    expect(src).toContain('new URLSearchParams({ sessionExerciseId })');
    expect(src).toContain('JSON.stringify({ sessionExerciseId })');
    // it shows the offer only on the server's explicit yes
    expect(src).toMatch(/if \(j\?\.eligible === true\)/);
    // and it runs only the pacer the server sent back after a 200
    expect(src).toMatch(/if \(!r\.ok \|\| !isRunnablePacer\(j\.pacer\)\)/);
  });
});

describe('the offer and the one-screen explanation', () => {
  it('the offer names the breath in FEL\'s words and opens the explanation', () => {
    const m = html(RampOffer, { onOpen: () => {} });
    expect(m).toContain(RAMP_NAME);
    expect(m).toContain(RAMP_OFFER);
    expect(m).toContain(RAMP_OFFER_BUTTON);
    expect(m).toContain('data-ramp-open');
  });
  it('the explanation: every line, the uses left, the stop line, Start and Not today', () => {
    const m = html(RampExplain, { usesLeft: 1, onStart: () => {}, onSkip: () => {} });
    for (const l of rampExplainLines(1)) expect(m).toContain(l.text);
    expect(m).toContain('1 of 2 left this week');
    expect(m).toContain(RAMP_STOP_LINE);
    expect(m).toContain(RAMP_START_BUTTON);
    expect(m).toContain(RAMP_SKIP_BUTTON);
    expect(m.indexOf(RAMP_STOP_LINE)).toBeLessThan(m.indexOf(RAMP_START_BUTTON));   // read before Start, not after
  });
});

describe('the run: the one pacer, what to do now, and the stop line the whole time', () => {
  const at = (sec: number) => html(RampRun, { spec: RAMP_PACER, sec, onStop: () => {} });
  it('get ready (before the first breath): stand clear of the bar', () => {
    const m = at(0.5);
    expect(m).toContain(RAMP_PHASE_LINES.before);
    expect(m).toContain('data-pacer="ramp"');
    expect(m).toContain('data-pacer-state="before"');
    expect(m).toContain(RAMP_STOP_LINE);
  });
  it('each breath: a sharp sniff in, a hard puff out, on the pacer\'s own clock', () => {
    const inn = at(3.2), out = at(4.4);
    expect(inn).toContain(RAMP_PHASE_LINES.in);
    expect(inn).toContain('data-pacer-phase="in"');
    expect(out).toContain(RAMP_PHASE_LINES.out);
    expect(out).toContain('data-pacer-phase="out"');
    for (const m of [inn, out]) { expect(m).toContain(RAMP_STOP_LINE); expect(m).toContain('data-ramp-stop'); }
  });
  it('after the last breath out: breathe normally, then set up', () => {
    expect(rampLineAt(RAMP_PACER, RAMP_RUN_SEC)).toBe(RAMP_PHASE_LINES.after);
    expect(rampLineAt(RAMP_PACER, RAMP_RUN_SEC - 0.1)).toBe(RAMP_PHASE_LINES.out);
    expect(at(RAMP_RUN_SEC + 1)).toContain(RAMP_STOP_LINE);
  });
});

describe('Today mounts it on the flagged key set only', () => {
  it('rampEndpointFor: the key set on a training day, only when the view has an endpoint', () => {
    expect(rampEndpointFor({ isKeySet: true }, 'training', TODAY_API)).toBe(RAMP_API);
    expect(rampEndpointFor({ isKeySet: false }, 'training', TODAY_API)).toBeNull();
    expect(rampEndpointFor({ isKeySet: null }, 'training', TODAY_API)).toBeNull();
    expect(rampEndpointFor({ isKeySet: true }, 'recovery', TODAY_API)).toBeNull();
    // the dev harnesses pass an api without `ramp`: never offered there
    expect(rampEndpointFor({ isKeySet: true }, 'training', { ramp: undefined })).toBeNull();
  });
  it("Today's endpoint is the route that exists", () => {
    expect(TODAY_API.ramp).toBe('/api/breath/ramp');
    expect(existsSync('app/api/breath/ramp/route.ts')).toBe(true);
  });
  // MIRROR-COACH P7 FIX (2026-09-29): `started` is typed rows OR any of the card's timers started (keySetUnderWay), and
  // the card tells the timer when the Dial-Up is running (one breath at a time) — held below, and by the pure helpers
  it("the card mounts it right under the key set's header, closed as soon as the set is under way, and hands off to the set", () => {
    const src = readFileSync('app/coach/_components/today-view.tsx', 'utf8');
    const card = src.slice(src.indexOf('function ExerciseCard('));
    expect(card).toMatch(/\{rampEndpoint && <RampBreath sessionExerciseId=\{e\.id\} endpoint=\{rampEndpoint\} started=\{keySetUnderWay\(draft\.sets, timerUsed\)\} onDone=\{toTheSet\} onRunningChange=\{setRampBusy\} \/>\}/);
    // every run the card's timer starts latches the set as under way; the timer is told while the Dial-Up runs
    expect(card).toMatch(/const onRunChange = useCallback\(\(kind: string \| null\) => \{ if \(kind\) setTimerUsed\(true\); \}, \[\]\);/);
    expect(card).toMatch(/<SetTimer [^>]*onRunChange=\{onRunChange\} settleBlocked=\{rampBusy\} breath=\{e\.breath \?\? null\} \/>/);
    // before the set-up line and the sets: the breath comes before unracking
    expect(card.indexOf('<RampBreath ')).toBeLessThan(card.indexOf('Before the first rep'));
    expect(card.indexOf('<RampBreath ')).toBeLessThan(card.indexOf('<SetLogger '));
    expect(src).toContain('rampEndpoint={rampEndpointFor(e, today.session.kind, api)}');
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the offer stayed live after an untyped set 1 while the rest ran, and on a
// timed key set it could be started while the Work or Hold timer ran — `started` read only typed rows, and the server's
// set_started gate reads only SAVED sets. And the settle and the Dial-Up could run side by side. The card's state flow
// is held here through its pure pieces (there is no DOM in this suite); the headless proof
// (~/Claude/outbox/finish-release/painfree/p7/review-fix/) clicks the real card.
describe('the set is under way the moment any of the key set\'s timers starts (keySetUnderWay)', () => {
  const empty = [emptySetDraft(), emptySetDraft(), emptySetDraft()];
  it('no typed row and no timer: not under way — the offer may show', () => {
    expect(keySetUnderWay(empty, false)).toBe(false);
  });
  it('an untyped set 1 with the Rest timer started (scenario A): under way', () => {
    expect(keySetUnderWay(empty, true)).toBe(true);
  });
  it('a typed row alone: under way (the P7 rule, kept)', () => {
    expect(keySetUnderWay([{ ...emptySetDraft(), reps: '5' }, emptySetDraft()], false)).toBe(true);
  });
  it('what the timer reports as a run starting: work, hold and rest are all a start; a run ending reports null', () => {
    const timers = timersFor({ workSeconds: 40, holdSeconds: 20, restSeconds: 90 });
    for (const t of timers) {
      const run = startRun(t, 1_000);
      expect(liveRunKind(run, 1_500), t.kind).toBe(t.kind);
      expect(liveRunKind(pauseRun(run, 2_000), 60_000), `${t.kind} paused`).toBe(t.kind);
      expect(liveRunKind(run, 1_000 + t.seconds * 1000), `${t.kind} done`).toBeNull();
    }
    expect(liveRunKind(null, 0)).toBeNull();
  });
  it('SetTimer reports every start, every stop and every run that runs out (static: the three call sites)', () => {
    const src = readFileSync('components/coach/set-timer.tsx', 'utf8');
    expect(src).toMatch(/setNow\(t\); setRun\(startRun\(spec, t\)\); setSettle\(null\);\n\s+runChange\.current\?\.\(spec\.kind\);/);
    expect(src).toMatch(/setRun\(null\); setSettle\(null\);\n\s+runChange\.current\?\.\(null\);/);
    expect(src).toMatch(/if \(runView\(run, t\)\.done\) \{[\s\S]{0,160}runChange\.current\?\.\(null\);/);
  });
});

describe('RampBreath once the set is under way (rampShown)', () => {
  const ALL: RampPhase[] = ['hidden', 'offer', 'explain', 'starting', 'running', 'done', 'stopped', 'interrupted', 'refused'];
  it('before the set: every phase shows as itself', () => {
    for (const p of ALL) expect(rampShown(p, false), p).toBe(p);
  });
  it('under way: the offer, the explanation and a Start in flight all go; a running breath is cut; what is left after a breath stays', () => {
    expect(rampShown('offer', true)).toBe('hidden');
    expect(rampShown('explain', true)).toBe('hidden');
    expect(rampShown('starting', true)).toBe('hidden');     // was shown before this fix: the explain panel, Start busy
    expect(rampShown('running', true)).toBe('interrupted'); // was left running before this fix
    for (const p of ['done', 'stopped', 'interrupted', 'refused', 'hidden'] as RampPhase[]) expect(rampShown(p, true), p).toBe(p);
  });
  it('a Start whose answer lands after the set started runs nothing, and a running breath is stopped (static: the component)', () => {
    const src = readFileSync('components/coach/ramp-breath.tsx', 'utf8');
    expect(src).toMatch(/if \(startedRef\.current\) \{ setPhase\('hidden'\); return; \}/);
    expect(src).toMatch(/if \(started && phase === 'running'\) \{ setClock\(null\); setPhase\('interrupted'\); \}/);
    expect(src).toMatch(/switch \(rampShown\(phase, started\)\)/);
  });
  it('an interrupted breath says so in its own words, beside the stop line (static: the after-panel)', () => {
    const src = readFileSync('components/coach/ramp-breath.tsx', 'utf8');
    expect(src).toMatch(/shown === 'interrupted' \? RAMP_INTERRUPTED_LINE/);
    expect(RAMP_INTERRUPTED_LINE).toMatch(/set has started/);
    expect(RAMP_INTERRUPTED_LINE).toMatch(/Breathe normally/);
  });
});

describe('ONE BREATH AT A TIME on the key set\'s card', () => {
  it('while the Dial-Up is starting or running it owns the card (rampBusy); otherwise it does not', () => {
    expect(rampBusy('starting')).toBe(true);
    expect(rampBusy('running')).toBe(true);
    for (const p of ['hidden', 'offer', 'explain', 'done', 'stopped', 'interrupted', 'refused'] as RampPhase[]) expect(rampBusy(p), p).toBe(false);
  });
  it('the settle chip beside it stays in place, disabled, and says why, while the Dial-Up runs', () => {
    const timers = timersFor({ restSeconds: 90 });
    expect(settleChipFor(timers, null, 0, true)).toMatchObject({ show: true, spec: null, why: 'other-breath' });
    expect(settleChipFor(timers, null, 0, false)).toMatchObject({ show: true, why: null });
    expect(SETTLE_WHY_LINE['other-breath']).toMatch(/Dial-Up Breath first/);
  });
  it("the other way round cannot happen: a settle starts the rest, and a started rest puts the set under way", () => {
    const src = readFileSync('components/coach/set-timer.tsx', 'utf8');
    expect(src).toMatch(/if \(restLive === null\) \{ start\(restSpec\); setSettle\(chip\.spec\); return; \}/);
    expect(keySetUnderWay([emptySetDraft()], true)).toBe(true);
  });
});

describe('the Dial-Up ring counts breaths, and only the host line is a live region', () => {
  const at = (sec: number) => html(RampRun, { spec: RAMP_PACER, sec, onStop: () => {} });
  const ringNumber = (m: string) => m.match(/data-pacer-count="breath"[^>]*>([^<]*)</)?.[1] ?? null;
  it('the number in the ring is the breath number (it read "1" throughout before — every part is one second)', () => {
    expect(ringNumber(at(3.2))).toBe('1');
    expect(ringNumber(at(4.6))).toBe('1');
    expect(ringNumber(at(5.2))).toBe('2');
    expect(ringNumber(at(11.5))).toBe('5');
    expect(ringNumber(at(1))).toBe('2');   // before the first breath: the get-ready count, 2 s to go
  });
  it('exactly one aria-live region: the host line ("Sharp sniff in"), not the ring\'s caption too', () => {
    const m = at(3.2);
    expect(m.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(m).toMatch(/aria-live="polite" data-ramp-now/);
  });
});
