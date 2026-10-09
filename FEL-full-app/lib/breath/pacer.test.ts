// The one breathing pacer (MIRROR-COACH P7, 2026-09-29). What this holds:
//   · the schedule math: every in / hold / out / pause as [start, end) on the host's clock, from a pacer spec;
//   · EQUALITY WITH THE DRILL CHART for WAKE_UP's Pressurize the System — its breathe / hold prompts, its STAND TALL
//     hold and its phase length are lib/drills' own numbers (read, never re-typed), and the schedule lands on them;
//   · EQUALITY WITH P6's TWO READERS: lib/coach/warmup.ts breathAt and lib/coach/cooldown.ts coolBreathAt used to be
//     their own copies of this arithmetic. Their old bodies are copied here VERBATIM as oracles (from 0aab5356) and the
//     rewired functions — which now call pacerAt — must agree with them at every quarter second;
//   · the pause / resume clock, and that P6's guided run IS that clock;
//   · the ring: it fills and empties without a jump, and under reduced motion it never changes size;
//   · the Mirror's breathe stage: its pacer ends on the very pose frame stepSquatSession hands over to the check.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WAKE_UP } from '@/lib/drills/drills';
import type { DrillPhase } from '@/lib/drills/chart';
import {
  CALM_OPACITY, PACER_AFTER_WORD, PACER_BEFORE_WORD, PACER_WORDS, RING_MIN_SCALE, breathFill, easeBreath, isRunnablePacer,
  pacerAt, pacerClockSec, pacerCycleSec, pacerEndSec, pacerFrom, pacerLengthSec, pacerSchedule, pacerView, pausePacerClock,
  resumePacerClock, ringLook, startPacerClock, type PacerSpec,
} from './pacer';
import { breathAt, guidedElapsed, pauseGuided, resumeGuided, startGuided } from '@/lib/coach/warmup';
import { RECOVERY_BREATH, coolBreathAt, coolBreathPacer, type CoolBreath } from '@/lib/coach/cooldown';
import {
  BREATH_CYCLES, BREATH_CYCLE_MS, SQUAT_BREATH_PACER, breathElapsedSec, initialSquatSession, squatBreathLine, stepSquatSession,
} from '@/lib/mirror/squatStage';

const PRESSURIZE = WAKE_UP.phases.find((p) => p.id === 'pressurize')!;
const WAKE_PACER = PRESSURIZE.pacer!;
/** Every quarter second over [from, to]. */
const grid = (from: number, to: number): number[] => Array.from({ length: Math.round((to - from) * 4) + 1 }, (_, i) => from + i / 4);

// ── the oracles: P6's two readers as they were at 0aab5356, verbatim (only renamed) ─────────────────────────────────

function oldBreathAt(pacer: DrillPhase['pacer'] | undefined, sec: number): { phase: 'in' | 'hold' | 'out'; left: number } | null {
  if (!pacer) return null;
  const into = sec - pacer.from;
  const cycle = pacer.inSec + pacer.holdSec + pacer.outSec;
  if (into < 0 || into >= cycle * pacer.rounds) return null;
  const c = into % cycle;
  if (c < pacer.inSec) return { phase: 'in', left: Math.ceil(pacer.inSec - c) };
  if (c < pacer.inSec + pacer.holdSec) return { phase: 'hold', left: Math.ceil(pacer.inSec + pacer.holdSec - c) };
  return { phase: 'out', left: Math.ceil(cycle - c) };
}

function oldCoolBreathAt(b: CoolBreath, sec: number): { phase: 'in' | 'hold' | 'out' | 'rest'; left: number; round: number } | null {
  const cycle = b.inSec + b.holdSec + b.outSec + b.restSec;
  if (!(sec >= 0) || cycle <= 0 || sec >= cycle * b.rounds) return null;
  const c = sec % cycle;
  const round = Math.floor(sec / cycle) + 1;
  const parts: ['in' | 'hold' | 'out' | 'rest', number][] = [['in', b.inSec], ['hold', b.holdSec], ['out', b.outSec], ['rest', b.restSec]];
  let from = 0;
  for (const [phase, len] of parts) {
    if (len > 0 && c < from + len) return { phase, left: Math.ceil(from + len - c), round };
    from += len;
  }
  return null;
}

// ── the schedule ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe('the schedule: a pacer spec in, every part of every breath out', () => {
  const spec: PacerSpec = { from: 5, inSec: 4, holdSec: 2, outSec: 6, rounds: 2 };

  it('in → hold → out per breath, on the host clock from `from`, back to back', () => {
    expect(pacerSchedule(spec)).toEqual([
      { phase: 'in', round: 1, start: 5, end: 9 }, { phase: 'hold', round: 1, start: 9, end: 11 }, { phase: 'out', round: 1, start: 11, end: 17 },
      { phase: 'in', round: 2, start: 17, end: 21 }, { phase: 'hold', round: 2, start: 21, end: 23 }, { phase: 'out', round: 2, start: 23, end: 29 },
    ]);
    expect(pacerCycleSec(spec)).toBe(12);
    expect(pacerLengthSec(spec)).toBe(24);
    expect(pacerEndSec(spec)).toBe(29);
  });

  it('leaves out a part of length 0 and adds the pause after the breath out when there is one', () => {
    const s = pacerSchedule({ from: 0, inSec: 4, holdSec: 0, outSec: 6, restSec: 2, rounds: 2 });
    expect(s.map((x) => x.phase)).toEqual(['in', 'out', 'rest', 'in', 'out', 'rest']);
    expect(s.at(-1)).toEqual({ phase: 'rest', round: 2, start: 22, end: 24 });
  });

  it('is contiguous and covers exactly [from, end): no gap, no overlap, for every spec shape', () => {
    for (const inSec of [1, 3, 4.5]) for (const holdSec of [0, 2]) for (const outSec of [2, 6]) for (const restSec of [undefined, 0, 1.5]) for (const rounds of [1, 3]) {
      const sp: PacerSpec = { from: 2, inSec, holdSec, outSec, rounds, ...(restSec === undefined ? {} : { restSec }) };
      const segs = pacerSchedule(sp);
      expect(segs[0].start).toBe(sp.from);
      expect(segs.at(-1)!.end).toBeCloseTo(pacerEndSec(sp), 9);
      for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeCloseTo(segs[i - 1].end, 9);
      expect(new Set(segs.map((x) => x.round)).size).toBe(rounds);
    }
  });

  it('pacerAt agrees with the schedule at every quarter second: the part, the breath, the whole seconds left', () => {
    const segs = pacerSchedule(spec);
    for (const t of grid(0, 32)) {
      const seg = segs.find((x) => t >= x.start && t < x.end) ?? null;
      const p = pacerAt(spec, t);
      if (!seg) { expect(p, `t=${t}`).toBeNull(); continue; }
      expect(p, `t=${t}`).toMatchObject({ phase: seg.phase, round: seg.round, rounds: 2, left: Math.ceil(seg.end - t) });
      expect(p!.intoSec).toBeCloseTo(t - seg.start, 9);
      expect(p!.partSec).toBe(seg.end - seg.start);
    }
  });

  it('counts down 4, 3, 2, 1 over a 4-second breath in (the ceil every reader used), then the hold starts at 2', () => {
    expect([5, 5.5, 6, 7, 8, 8.99].map((t) => pacerAt(spec, t)!.left)).toEqual([4, 4, 3, 2, 1, 1]);
    expect(pacerAt(spec, 9)).toMatchObject({ phase: 'hold', left: 2 });
  });

  it('a bad spec or a bad time is no pacer (null / empty), never NaN on the screen', () => {
    const bad: PacerSpec[] = [
      { from: 0, inSec: 0, holdSec: 0, outSec: 6, rounds: 3 }, { from: 0, inSec: 4, holdSec: 0, outSec: 0, rounds: 3 },
      { from: 0, inSec: 4, holdSec: -1, outSec: 6, rounds: 3 }, { from: 0, inSec: 4, holdSec: 0, outSec: 6, rounds: 0 },
      { from: 0, inSec: 4, holdSec: 0, outSec: 6, rounds: 2.5 }, { from: -1, inSec: 4, holdSec: 0, outSec: 6, rounds: 3 },
      { from: 0, inSec: Number.NaN, holdSec: 0, outSec: 6, rounds: 3 }, { from: 0, inSec: 4, holdSec: 0, outSec: 6, rounds: 3, restSec: -2 },
    ];
    for (const b of bad) {
      expect(isRunnablePacer(b)).toBe(false);
      expect(pacerSchedule(b)).toEqual([]);
      expect(pacerAt(b, 1)).toBeNull();
      expect(pacerView(b, 1)).toMatchObject({ state: 'after', count: null, fill: 0 });
    }
    expect(isRunnablePacer(null)).toBe(false);
    expect(pacerAt(spec, Number.NaN)).toBeNull();
    expect(pacerAt(spec, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('pacerFrom moves a spec along its host clock and changes nothing else', () => {
    const moved = pacerFrom(spec, 30);
    expect(moved).toEqual({ ...spec, from: 30 });
    expect(pacerSchedule(moved).map((x) => x.start - 30)).toEqual(pacerSchedule(spec).map((x) => x.start - 5));
  });
});

// ── the drill chart's own numbers ────────────────────────────────────────────────────────────────────────────────────

describe("equality with the drill chart: WAKE_UP's Pressurize the System (lib/drills, read-only)", () => {
  it('reads the drill chart spec as it is: from 6, in 4, hold 2, out 6, three breaths, no pause', () => {
    expect(WAKE_PACER).toEqual({ from: 6, inSec: 4, holdSec: 2, outSec: 6, rounds: 3 });
    expect(isRunnablePacer(WAKE_PACER)).toBe(true);
  });

  it("every breath in starts on one of the drill's own 'breathe' prompts, and every hold on its 'hold' prompts", () => {
    const segs = pacerSchedule(WAKE_PACER);
    const prompt = (id: string) => PRESSURIZE.prompts.filter((p) => p.id === id).map((p) => p.t);
    expect(segs.filter((s) => s.phase === 'in').map((s) => s.start)).toEqual(prompt('coach.drill.breathe'));
    expect(segs.filter((s) => s.phase === 'hold').map((s) => s.start)).toEqual(prompt('coach.drill.hold'));
    expect(prompt('coach.drill.breathe')).toEqual([6, 18, 30]);   // the numbers, spelled out once, from lib/drills
    expect(prompt('coach.drill.hold')).toEqual([10, 22, 34]);
  });

  it("the drill's STAND TALL hold starts with the first breath and lasts exactly as long as the pacer; the phase outlasts it", () => {
    const stand = PRESSURIZE.targets.find((t) => t.move === 'hold')!;
    expect(stand.t).toBe(WAKE_PACER.from);
    expect(stand.holdSec).toBe(pacerLengthSec(WAKE_PACER));
    expect(pacerEndSec(WAKE_PACER)).toBe(42);
    expect(pacerEndSec(WAKE_PACER)).toBeLessThanOrEqual(PRESSURIZE.durationSec);
  });

  it("P6's warm-up reader (breathAt, now the one pacer) matches its own old body at every quarter second of the phase", () => {
    for (const t of grid(-1, PRESSURIZE.durationSec + 1)) {
      expect(breathAt(WAKE_PACER, t), `t=${t}`).toEqual(oldBreathAt(WAKE_PACER, t));
      const p = pacerAt(WAKE_PACER, t);
      expect(p ? { phase: p.phase, left: p.left } : null, `t=${t}`).toEqual(oldBreathAt(WAKE_PACER, t));
    }
    expect(breathAt(undefined, 10)).toBeNull();
  });
});

describe("equality with P6's cool-down reader (coolBreathAt, now the one pacer)", () => {
  it('the recovery breath: identical to the old body at every quarter second, before, through and after its 120 s', () => {
    for (const t of grid(-2, 124)) {
      expect(coolBreathAt(RECOVERY_BREATH, t), `t=${t}`).toEqual(oldCoolBreathAt(RECOVERY_BREATH, t));
      const p = pacerAt(coolBreathPacer(RECOVERY_BREATH), t);
      expect(p ? { phase: p.phase, left: p.left, round: p.round } : null, `t=${t}`).toEqual(oldCoolBreathAt(RECOVERY_BREATH, t));
    }
  });
  it("a breath with a hold (the Mirror's 4-2-6) as a cool-down breath: identical too", () => {
    const mirror: CoolBreath = { inSec: 4, holdSec: 2, outSec: 6, restSec: 0, rounds: 3 };
    for (const t of grid(-1, 40)) expect(coolBreathAt(mirror, t), `t=${t}`).toEqual(oldCoolBreathAt(mirror, t));
  });
  it('coolBreathPacer is the same breath as a pacer spec, starting at the step\'s 0', () => {
    expect(coolBreathPacer(RECOVERY_BREATH)).toEqual({ from: 0, inSec: 4, holdSec: 0, outSec: 6, restSec: 2, rounds: 10 });
    expect(pacerLengthSec(coolBreathPacer(RECOVERY_BREATH))).toBe(120);
  });
});

// ── the clock ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('the pausable clock', () => {
  it('runs from its start, freezes while paused, and resumes where it stopped', () => {
    let c = startPacerClock(1_000);
    expect(pacerClockSec(c, 1_000)).toBe(0);
    expect(pacerClockSec(c, 4_000)).toBe(3);
    c = pausePacerClock(c, 4_000);
    expect(pacerClockSec(c, 9_000)).toBe(3);        // five seconds paused: still 3
    expect(pausePacerClock(c, 7_000)).toBe(c);        // a second pause changes nothing
    c = resumePacerClock(c, 9_000);
    expect(pacerClockSec(c, 9_000)).toBe(3);
    expect(pacerClockSec(c, 10_500)).toBe(4.5);
    expect(resumePacerClock(c, 11_000)).toBe(c);      // resuming a running clock changes nothing
    expect(pacerClockSec(c, 8_000)).toBe(3);          // a clock read before its start never runs backwards past its base
  });

  it('a paused pacer holds its breath where it was: the same part, the same count, the same ring', () => {
    const spec = SQUAT_BREATH_PACER;
    let c = startPacerClock(0);
    c = pausePacerClock(c, 5_200);                    // 5.2 s in: the hold, 1 s left
    const at = (now: number) => pacerView(spec, pacerClockSec(c, now));
    expect(at(5_200)).toMatchObject({ state: 'on', caption: PACER_WORDS.hold, count: 1 });
    expect(at(60_000)).toEqual(at(5_200));
    c = resumePacerClock(c, 60_000);
    expect(pacerView(spec, pacerClockSec(c, 61_000))).toMatchObject({ caption: PACER_WORDS.out, count: 6 });
  });

  it("P6's guided run IS this clock (the warm-up and the cool-down pause exactly as a pacer does)", () => {
    for (const [a, b] of [[startGuided, startPacerClock]] as const) expect(a(123)).toEqual(b(123));
    const g = pauseGuided(startGuided(0), 2_000);
    expect(g).toEqual(pausePacerClock(startPacerClock(0), 2_000));
    expect(guidedElapsed(resumeGuided(g, 7_000), 8_000)).toBe(pacerClockSec(resumePacerClock(g, 7_000), 8_000));
    expect(guidedElapsed(resumeGuided(g, 7_000), 8_000)).toBe(3);
  });
});

// ── the ring ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('the ring', () => {
  it('fills over the breath in, stays full through the hold, empties over the breath out, stays empty through a pause', () => {
    const s: PacerSpec = { from: 0, inSec: 4, holdSec: 2, outSec: 6, restSec: 2, rounds: 1 };
    const fill = (t: number) => breathFill(pacerAt(s, t));
    expect(fill(0)).toBe(0);
    expect(fill(2)).toBeCloseTo(0.5, 9);
    expect(fill(4)).toBe(1);
    expect(fill(5.9)).toBe(1);
    expect(fill(6)).toBe(1);
    expect(fill(9)).toBeCloseTo(0.5, 9);
    expect(fill(12)).toBe(0);
    expect(fill(13)).toBe(0);
    expect(breathFill(null)).toBe(0);
  });

  it('never jumps: 1/100 s apart, the fill moves by less than 0.01 across every boundary of every host spec', () => {
    for (const spec of [SQUAT_BREATH_PACER, WAKE_PACER, coolBreathPacer(RECOVERY_BREATH)]) {
      for (let t = spec.from; t < pacerEndSec(spec) - 0.01; t += 0.01) {
        expect(Math.abs(breathFill(pacerAt(spec, t + 0.01)) - breathFill(pacerAt(spec, t))), `t=${t.toFixed(2)}`).toBeLessThan(0.01);
      }
    }
  });

  it('rises through the breath in and falls through the breath out, never the other way', () => {
    for (let x = 0; x < 1; x += 0.05) expect(easeBreath(x + 0.05)).toBeGreaterThanOrEqual(easeBreath(x));
    expect(easeBreath(-1)).toBe(0);
    expect(easeBreath(2)).toBe(1);
  });

  it('full motion: grows from 0.6 to full size and brightens with it (the old CSS ring\'s 0.6 → 1, 0.5 → 1)', () => {
    expect(ringLook(0, false)).toEqual({ scale: RING_MIN_SCALE, opacity: 0.5 });
    expect(ringLook(1, false)).toEqual({ scale: 1, opacity: 1 });
    expect(ringLook(0.5, false).scale).toBeCloseTo(0.8, 9);
  });

  it('REDUCED MOTION: the ring never changes size — it paces by brightness alone', () => {
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const look = ringLook(f, true);
      expect(look.scale).toBe(1);
      expect(look.opacity).toBeGreaterThanOrEqual(CALM_OPACITY.min);
      expect(look.opacity).toBeLessThanOrEqual(CALM_OPACITY.max);
    }
    expect(ringLook(1, true).opacity).toBeGreaterThan(ringLook(0, true).opacity);   // it still paces
    expect(ringLook(Number.NaN, true)).toEqual({ scale: 1, opacity: CALM_OPACITY.min });
    // over a whole Mirror breath, reduced: one size throughout
    const sizes = new Set(grid(0, 36).map((t) => ringLook(pacerView(SQUAT_BREATH_PACER, t).fill, true).scale));
    expect([...sizes]).toEqual([1]);
  });
});

describe('the view: before, breathing, after', () => {
  it('before its first breath it counts down to it; after the last it says so; between, the part and its seconds', () => {
    expect(pacerView(WAKE_PACER, 0)).toEqual({ state: 'before', point: null, count: 6, caption: PACER_BEFORE_WORD, fill: 0 });
    expect(pacerView(WAKE_PACER, 4.5)).toMatchObject({ state: 'before', count: 2 });
    expect(pacerView(WAKE_PACER, 6)).toMatchObject({ state: 'on', count: 4, caption: PACER_WORDS.in, fill: 0 });
    expect(pacerView(WAKE_PACER, 11)).toMatchObject({ state: 'on', count: 1, caption: PACER_WORDS.hold, fill: 1 });
    expect(pacerView(WAKE_PACER, 42)).toEqual({ state: 'after', point: null, count: null, caption: PACER_AFTER_WORD, fill: 0 });
  });
});

// ── the Mirror's breathe stage ───────────────────────────────────────────────────────────────────────────────────────

describe("the Mirror's breathe-first stage runs the one pacer on its own pose clock", () => {
  it('the count is unchanged: in 4, hold 2, out 6, BREATH_CYCLES breaths — one cycle is BREATH_CYCLE_MS', () => {
    expect(SQUAT_BREATH_PACER).toEqual({ from: 0, inSec: 4, holdSec: 2, outSec: 6, rounds: BREATH_CYCLES });
    expect(BREATH_CYCLES).toBe(3);
    expect(pacerCycleSec(SQUAT_BREATH_PACER) * 1000).toBe(BREATH_CYCLE_MS);
    // the same breath as the drill chart's Pressurize, only from the stage's own 0
    expect({ ...WAKE_PACER, from: 0 }).toEqual(SQUAT_BREATH_PACER);
    // MIRROR-COACH P7 FIX (2026-09-29): BREATH_CYCLE_MS is derived from the spec now, so this still reads 12 s
    expect(BREATH_CYCLE_MS).toBe(12_000);
  });

  // MIRROR-COACH P7 FIX (2026-09-29, review): the harness line was hard-coded "4s · hold 2s · out slow 6s" beside the ring
  it("the stage's words come from the spec: today's line, and a changed spec changes the line with it", () => {
    expect(squatBreathLine()).toBe('In through the nose 4s · hold 2s · out slow 6s, 3 cycles.');
    expect(squatBreathLine({ from: 0, inSec: 5, holdSec: 0, outSec: 7, rounds: 4 })).toBe('In through the nose 5s · out slow 7s, 4 cycles.');
    const harness = readFileSync('app/play/mirror/_components/mirror-harness.tsx', 'utf8');
    expect(harness).toContain('{squatBreathLine()}');
    expect(harness).not.toMatch(/nose 4s · hold 2s/);
  });

  it('the last breath out ends on the very pose frame the stage hands over to the check (30 fps, a late first frame)', () => {
    let st = initialSquatSession();
    let prevSec = 0;
    let handedAt: number | null = null;
    for (let now = 2_345; now < 2_345 + 40_000; now += 1000 / 30) {
      const step = stepSquatSession(st, { nowMs: now, phase: 'standing', present: true, faults: [], hipDrop: 0 });
      const sec = breathElapsedSec(step.state, now);
      if (step.state.stage === 'breathe') {
        expect(pacerAt(SQUAT_BREATH_PACER, sec), `t=${sec}`).not.toBeNull();   // the ring is breathing the whole stage
        prevSec = sec;
      } else if (handedAt === null) {
        handedAt = sec;
        expect(pacerAt(SQUAT_BREATH_PACER, sec)).toBeNull();                   // …and done the frame the check starts
      }
      st = step.state;
    }
    expect(handedAt).not.toBeNull();
    expect(prevSec).toBeLessThan(pacerLengthSec(SQUAT_BREATH_PACER));
    expect(handedAt!).toBeGreaterThanOrEqual(pacerLengthSec(SQUAT_BREATH_PACER));
    expect(handedAt! - pacerLengthSec(SQUAT_BREATH_PACER)).toBeLessThan(1 / 30 + 1e-9);
  });

  it('breathElapsedSec reads 0 before the first frame and never runs backwards', () => {
    expect(breathElapsedSec({ breatheStartMs: null }, 5_000)).toBe(0);
    expect(breathElapsedSec({ breatheStartMs: 5_000 }, 4_000)).toBe(0);
    expect(breathElapsedSec({ breatheStartMs: 5_000 }, 11_500)).toBe(6.5);
    expect(breathElapsedSec({ breatheStartMs: 5_000 }, Number.NaN)).toBe(0);
  });
});
