// The Settle chip on Today's rest timers (MIRROR-COACH P7, 2026-09-29), rendered. The chip is the between-set breath
// preset (lib/breath/presets.ts BETWEEN_SET_SETTLE) and it lives on the REST timer only: a rest long enough to hold two
// breaths and the set-up time shows it, labelled with the settle a tap would start; a short rest, a work or hold timer,
// or an item with no rest shows none. (A tap starts the rest and the settle inside it on the rest's own clock — the
// arithmetic is presets.test.ts's settleChip / settleFor; this reads what the card paints.)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SETTLE_TAIL_SEC, SetTimer, WorkBreath, settleChipFor, settleShowing, workBreathAt } from './set-timer';
import { pauseRun, startRun, timersFor } from '@/lib/coach/setTimer';
import { BETWEEN_SET_SETTLE, POST_SESSION_BREATH, workBreathFor } from '@/lib/breath/presets';
import { pacerEndSec, pacerLengthSec } from '@/lib/breath/pacer';
import { OFF_DAY_ITEMS } from '@/lib/coach/offDay';

const html = (e: Parameters<typeof timersFor>[0]) => renderToStaticMarkup(createElement(SetTimer, { timers: timersFor(e), testId: 't' }));
// the chip's text after its icon, matched by attribute name (React writes the bare data-settle-chip as ="true")
const chip = (m: string) => m.match(/<button [^>]*data-settle-chip="[^"]*"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)</)?.[1] ?? null;

describe('SetTimer: the Settle chip rides the rest timer', () => {
  it('a 90 s rest offers "Settle · 40 s" beside the Rest button, not pressed, with the preset\'s line as its title', () => {
    const m = html({ restSeconds: 90 });
    expect(m).toContain('data-timer="rest"');
    expect(chip(m)).toBe('Settle · 40 s');
    expect(m).toContain('aria-pressed="false"');
    expect(m).toContain(`title="${BETWEEN_SET_SETTLE.lead}"`);
    expect(m).not.toMatch(/data-settle="/);   // nothing runs until a tap
  });

  it('a 45 s rest offers the three breaths that fit; a 30 s rest offers none', () => {
    expect(chip(html({ restSeconds: 45 }))).toBe('Settle · 30 s');
    expect(html({ restSeconds: 30 })).not.toContain('data-settle-chip');
  });

  it('never on a work or hold timer, nor on an item with no rest: the settle is for resting, never for a set', () => {
    expect(html({ workSeconds: 90 })).not.toContain('data-settle-chip');
    expect(html({ holdSeconds: 60 })).not.toContain('data-settle-chip');
    expect(html({ workSeconds: 60, holdSeconds: 10, restSeconds: 0 })).not.toContain('data-settle-chip');
    expect(html({ workSeconds: 60, restSeconds: 90 })).toContain('data-settle-chip');
  });
});

// MIRROR-COACH P7 review (2026-09-29): the chip was live while a SET's timer ran, and a tap started the rest — which
// replaced the set's run (start() swaps it; only Stop logs a timed set), so the settle cut into the set and the seconds
// worked were never logged. settleChipFor is the strip's own reading of its run; these hold the rule at every state.
describe('settleChipFor: the strip never offers the settle during a set', () => {
  const timers = timersFor({ workSeconds: 45, holdSeconds: 20, restSeconds: 90 });
  const work = timers.find((t) => t.kind === 'work')!;
  const hold = timers.find((t) => t.kind === 'hold')!;
  const rest = timers.find((t) => t.kind === 'rest')!;

  it('nothing running: the whole settle, live', () => {
    expect(settleChipFor(timers, null, 0)).toMatchObject({ show: true, spec: BETWEEN_SET_SETTLE.spec, why: null, restLive: null });
  });

  it('a work or hold timer running (or paused): shown, DISABLED, "set-running" — every 250 ms of the set', () => {
    for (const set of [work, hold]) {
      const run = startRun(set, 1_000);
      for (let ms = 0; ms < set.seconds * 1000; ms += 250) {
        expect(settleChipFor(timers, run, 1_000 + ms), `${set.kind} ${ms} ms`).toMatchObject({ show: true, spec: null, why: 'set-running' });
      }
      expect(settleChipFor(timers, pauseRun(run, 3_000), 60_000)).toMatchObject({ spec: null, why: 'set-running' });
    }
  });

  it("the set's timer done: live again (a tap starts the rest and the settle from 0)", () => {
    const run = startRun(work, 1_000);
    expect(settleChipFor(timers, run, 1_000 + work.seconds * 1000)).toMatchObject({ spec: BETWEEN_SET_SETTLE.spec, why: null, restLive: null });
  });

  it('a rest running: the settle from where the rest is; late in the rest, disabled as too short', () => {
    const run = startRun(rest, 0);
    expect(settleChipFor(timers, run, 20_000)).toMatchObject({ spec: { ...BETWEEN_SET_SETTLE.spec, from: 20, rounds: 4 }, why: null, restLive: 20 });
    expect(settleChipFor(timers, run, 60_000)).toMatchObject({ spec: null, why: 'rest-too-short', restLive: 60 });
    expect(settleChipFor(timers, run, 90_000)).toMatchObject({ spec: BETWEEN_SET_SETTLE.spec, why: null, restLive: null });   // rest over
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): "Stop settle" stayed pressed for the rest of the rest after the last breath
// out (on a 90 s rest, from 40 s to 90 s), over a ring that just said "Breathe normally".
describe('settleShowing: the settle ends when it ends', () => {
  const settle = BETWEEN_SET_SETTLE.spec;   // 40 s from the rest's 0
  it('on from its start to its last breath out and a short tail; then the chip lets go', () => {
    expect(settleShowing(settle, 0)).toBe(true);
    expect(settleShowing(settle, 39.9)).toBe(true);
    expect(settleShowing(settle, pacerEndSec(settle) + SETTLE_TAIL_SEC - 0.1)).toBe(true);   // "Breathe normally", briefly
    expect(settleShowing(settle, pacerEndSec(settle) + SETTLE_TAIL_SEC)).toBe(false);
    expect(settleShowing(settle, pacerEndSec(settle) + 3)).toBe(false);
    expect(settleShowing(settle, 80)).toBe(false);     // it used to read "Stop settle" here
  });
  it('no settle, or no live rest: off', () => {
    expect(settleShowing(null, 10)).toBe(false);
    expect(settleShowing(settle, null)).toBe(false);
  });
  it('a settle started 20 s into the rest ends 20 s later on the same clock', () => {
    const late = { ...settle, from: 20 };
    expect(settleShowing(late, 59)).toBe(true);
    expect(settleShowing(late, pacerEndSec(late) + SETTLE_TAIL_SEC)).toBe(false);
  });
  it('after it lets go, the chip is back to what the rest allows: on a 60 s rest too little is left; on a 90 s rest, three more breaths', () => {
    const at = (pacerEndSec(settle) + 3) * 1000;   // 43 s into the rest
    const t60 = timersFor({ restSeconds: 60 });
    expect(settleChipFor(t60, startRun(t60.find((t) => t.kind === 'rest')!, 0), at)).toMatchObject({ spec: null, why: 'rest-too-short' });
    const t90 = timersFor({ restSeconds: 90 });
    expect(settleChipFor(t90, startRun(t90.find((t) => t.kind === 'rest')!, 0), at)).toMatchObject({ spec: { ...settle, from: 43, rounds: 3 }, why: null });
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the off day's 4-6 Recovery Breath was "Work 3:00" and a bare clock
describe("a timed breath item's Work run draws the one pacer (workBreathAt, WorkBreath)", () => {
  const item = OFF_DAY_ITEMS.find((i) => i.catalogue.name === POST_SESSION_BREATH.name)!;
  const breath = workBreathFor({ name: item.catalogue.name, workSeconds: item.prescription.workSeconds }, item.catalogue)!;
  const timers = timersFor(item.prescription);
  const work = timers.find((t) => t.kind === 'work')!;
  it("the off day's breath: one Work timer of 180 s, and a pacer exactly that long", () => {
    expect(timers).toEqual([{ kind: 'work', seconds: 180, label: 'Work 3:00' }]);
    expect(pacerLengthSec(breath)).toBe(work.seconds);
  });
  it('while the Work run is live: the ring on the run\'s own clock; paused, the ring holds with the clock', () => {
    const run = startRun(work, 1_000);
    expect(workBreathAt(breath, run, 1_000 + 13_500)).toEqual({ spec: breath, sec: 13.5 });
    const paused = pauseRun(run, 1_000 + 20_000);
    expect(workBreathAt(breath, paused, 1_000 + 95_000)).toEqual({ spec: breath, sec: 20 });
  });
  it('none when the run is done, for any other run, or for an item that is not a breath', () => {
    const run = startRun(work, 0);
    expect(workBreathAt(breath, run, 180_000)).toBeNull();
    expect(workBreathAt(breath, startRun({ kind: 'rest', seconds: 90 }, 0), 1_000)).toBeNull();
    expect(workBreathAt(null, run, 1_000)).toBeNull();
    expect(workBreathAt(breath, null, 1_000)).toBeNull();
  });
  it('drawn: the one pacer (data-pacer="work-breath"), in and out on the breath\'s own timing, with the preset\'s name and cue', () => {
    const at = (sec: number) => renderToStaticMarkup(createElement(WorkBreath, { spec: breath, sec }));
    expect(at(1)).toContain('data-pacer="work-breath"');
    expect(at(1)).toContain('data-pacer-phase="in"');
    expect(at(5)).toContain('data-pacer-phase="out"');
    expect(at(11)).toContain('data-pacer-phase="rest"');
    expect(at(13)).toContain('breath 2 of 15');
    expect(at(1)).toContain(POST_SESSION_BREATH.name);
    expect(at(1)).toContain('aria-live="polite"');   // no host line of its own: the caption is the live region
  });
  it('the strip renders it only while a Work run is live (static: nothing running, no ring)', () => {
    expect(renderToStaticMarkup(createElement(SetTimer, { timers, breath }))).not.toContain('data-work-breath');
    const src = readFileSync('components/coach/set-timer.tsx', 'utf8');
    expect(src).toMatch(/const workBreath = workBreathAt\(breath, run, now\);/);
    expect(src).toMatch(/\{workBreath && <WorkBreath spec=\{workBreath\.spec\} sec=\{workBreath\.sec\} \/>\}/);
  });
});
