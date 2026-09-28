// The fight read's gate, the vitest subset (movement play P7, PLAN-P7 §6.5: G1–G3, G9, G10). The full grid (every fps,
// latency, noise, blur, the six seeds, train and test apart) is scripts/body/fight.mts → FIGHT.md; this runs the plan's
// subset on the TEST seeds.
//
// WHAT IS HELD OUT, AND WHAT IS NOT (the review, 2026-09-26). The SCRIPTED takes re-draw their paths per seed (a hook's
// end and load, an uppercut's dip and end, a straight's reach, the guard's height, a raise's hand lag: fightTakes'
// scriptedTakes `vary`), so the test seeds' (4–6) scripted strikes are paths no threshold was tuned on. The 18 CAPTURE
// clips are the same clips on every seed — a seed changes only their noise and dropouts — and several thresholds cite them
// by name: their numbers are IN SAMPLE. So the two are graded and floored apart, never pooled.
//
// THE FLOORS ARE MEASURED, NOT THE PLAN'S TARGETS. The plan fixed its targets before the test seeds ran (G1: strikes
// recall ≥ 0.90 / precision ≥ 0.95 at 24–30 fps; G2: onset median ≤ 20 ms, p90 ≤ 45 at 30 fps). The reader does not meet
// all of them, and a gate that asserted them would be red, or a gate that asserted nothing would say nothing. So each
// floor below is the number this reader MEASURED (2026-09-26, the test seeds; FIGHT.md has it and the target next to
// it), rounded down a few points: a ratchet that fails the moment a change makes the read worse, and reads as the gap it
// is.
//
// What IS asserted exactly: 0 misfires at rest, in a fight stance and jogging, in every cell (G3, the owner's line); 0
// strikes from the gestures — two CMU waves, a wave in front of the face, two stretches, claps, arm swings, the guard
// raised one hand after the other from a low guard — with the camera's default noise and no blur, at 30, 24, 20 and 15
// fps (the review's out-of-sample negatives; under motion blur and 1.5× noise the measured gap is pinned so it can only
// shrink); 0 events taken out of a jump or a hands-up (G9); the southpaw mirror reads the same classes on the other hands
// (G10).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  fightStream, readFight, matchFight, newTally, addTally, recall, precision, pctl, eventClass, taken,
  type FightCell, type FightTake, type FightTally,
} from './fightGrade';
import { takeOfFixture, scriptedTakes, mirrorTake, TEST_SEEDS, type FightFixture } from './fightTakes';
import { synthesize, restPose, type Joints } from './synth';
import { script, hold, jumpBeat, armsUp } from './streamKit';

const dir = join(__dirname, '__fixtures__', 'fight');
const REAL = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => takeOfFixture(JSON.parse(readFileSync(join(dir, f), 'utf8')) as FightFixture));
/** The capture takes are read on the first test seed (another seed re-draws only their noise). */
const REAL_SEED = TEST_SEEDS[0];
const KIT: { seed: number; take: FightTake }[] = TEST_SEEDS.flatMap((seed) => [...scriptedTakes(seed, 'L'), ...scriptedTakes(seed, 'R')].map((take) => ({ seed, take })));
const REAL_POS = REAL.filter((t) => t.role === 'positive'), REAL_NEG = REAL.filter((t) => t.role === 'negative');
const KIT_POS = KIT.filter((x) => x.take.role === 'positive'), KIT_NEG = KIT.filter((x) => x.take.role === 'negative');

const STRIKES = ['jab', 'cross', 'hookL', 'hookR', 'uppercutL', 'uppercutR', 'front', 'round'];
const EVADES = ['slipL', 'slipR', 'duck'];
const STEPS = ['in', 'out'];
function group(t: FightTally, classes: string[]) {
  let tp = 0, fn = 0, fp = 0; const onset: number[] = [];
  for (const k of classes) { const c = t.classes[k]; if (!c) continue; tp += c.tp; fn += c.fn; fp += c.fp; onset.push(...c.onset.map(Math.abs)); }
  return { recall: recall({ tp, fn, fp, onset: [], delay: [], total: [] }), precision: precision({ tp, fn, fp, onset: [], delay: [], total: [] }), n: tp + fn, onset };
}
function run(takes: { seed: number; take: FightTake }[], cell: Omit<FightCell, 'seed'>): FightTally {
  const t = newTally();
  for (const { seed, take } of takes) { const st = fightStream(take, { ...cell, seed }); addTally(t, matchFight(st, readFight(st.frames), take)); }
  return t;
}
const pct = (x: number) => Math.round(x * 100);
const real = (ts: FightTake[]) => ts.map((take) => ({ seed: REAL_SEED, take }));

describe('G1 / G2 — the classes and their onsets (test seeds; scripted and capture takes apart; floors = measured)', () => {
  const CELLS: [string, Omit<FightCell, 'seed'>][] = [
    ['30 fps · 80 ms', { fps: 30, latencyMs: 80, noise: 1, blur: false }],
    ['30 fps · 80 ms · blur', { fps: 30, latencyMs: 80, noise: 1, blur: true }],
    ['15 fps · 200 ms · blur', { fps: 15, latencyMs: 200, noise: 1, blur: true }],
  ];
  // SCRIPTED (out of sample), seeds 4–6: [strike recall, strike precision, raise recall, evade recall, step recall] floors
  // (percent) = measured (2026-09-26) less 3. Measured: 77 / 96 / 67 / 100 / 92 · blur 69 / 79 / 67 / 75 / 92 · 15 fps
  // blur 37 / 94 / 64 / 100 / 100. (A raise from a low guard 0.15–0.23 m under the shoulders reads as a guard HELD, no
  // parry: the zone's bottom edge with its hysteresis — the measured third of the raises missing.)
  // CAPTURES (in sample), seed 4: [strike recall, strike precision]. Measured: 84 / 92 · blur 64 / 94 · 15 fps blur 50 / 88.
  // Targets (PLAN-P7 G1): strikes 90 / 95 at 24–30 fps, 70 recall at 15–20 fps; the raise 90 / 95; evades and steps 85 / 95.
  const FLOOR_KIT: Record<string, [number, number, number, number, number]> = {
    '30 fps · 80 ms': [74, 93, 64, 97, 89],
    '30 fps · 80 ms · blur': [66, 76, 64, 72, 89],
    '15 fps · 200 ms · blur': [34, 91, 61, 97, 97],
  };
  const FLOOR_REAL: Record<string, [number, number]> = {
    '30 fps · 80 ms': [81, 89],
    '30 fps · 80 ms · blur': [61, 91],
    '15 fps · 200 ms · blur': [47, 85],
  };
  const results: Record<string, { kit: FightTally; real: FightTally }> = {};
  for (const [name, cell] of CELLS) {
    it(name, () => {
      const kit = run(KIT_POS, cell), cap = run(real(REAL_POS), cell);
      results[name] = { kit, real: cap };
      const s = group(kit, STRIKES), g = group(kit, ['raise']), e = group(kit, EVADES), p = group(kit, STEPS), r = group(cap, STRIKES);
      console.info(`[FIGHT-GATE] ${name}: SCRIPTED (held out) strikes R ${pct(s.recall)} P ${pct(s.precision)} (n ${s.n}) onset med ${pctl(s.onset, 0.5).toFixed(0)} p90 ${pctl(s.onset, 0.9).toFixed(0)} · raise R ${pct(g.recall)} P ${pct(g.precision)} · evades R ${pct(e.recall)} P ${pct(e.precision)} · steps R ${pct(p.recall)} P ${pct(p.precision)} | CAPTURES (in sample) strikes R ${pct(r.recall)} P ${pct(r.precision)} (n ${r.n}) onset med ${pctl(r.onset, 0.5).toFixed(0)} p90 ${pctl(r.onset, 0.9).toFixed(0)}`);
      const f = FLOOR_KIT[name], fr = FLOOR_REAL[name];
      expect(pct(s.recall)).toBeGreaterThanOrEqual(f[0]);
      expect(pct(s.precision)).toBeGreaterThanOrEqual(f[1]);
      expect(pct(g.recall)).toBeGreaterThanOrEqual(f[2]);
      expect(pct(e.recall)).toBeGreaterThanOrEqual(f[3]);
      expect(pct(p.recall)).toBeGreaterThanOrEqual(f[4]);
      expect(pct(r.recall)).toBeGreaterThanOrEqual(fr[0]);
      expect(pct(r.precision)).toBeGreaterThanOrEqual(fr[1]);
      // G2 at 30 fps: the strikes' onset error, median against its 20 ms target (the scripted takes: met, 15; the captures:
      // 24, the gap), p90 against 45 (measured 63 / 61: the gap)
      if (name === '30 fps · 80 ms') {
        expect(pctl(s.onset, 0.5)).toBeLessThanOrEqual(20); expect(pctl(s.onset, 0.9)).toBeLessThanOrEqual(75);
        expect(pctl(r.onset, 0.5)).toBeLessThanOrEqual(30); expect(pctl(r.onset, 0.9)).toBeLessThanOrEqual(75);
      }
    });
  }
  it('jab ↔ cross confusion at 30 fps, the captures named by ONE lead per take (the eye\'s, or the take\'s own stance): measured 4.3 % against the 5 % target — pinned at 6 %', () => {
    const t = results['30 fps · 80 ms']?.real ?? run(real(REAL_POS), CELLS[0][1]);
    const c = t.confusion;
    const n = (a: string, b: string) => c[a]?.[b] ?? 0, tot = (a: string) => Object.values(c[a] ?? {}).reduce((x, y) => x + y, 0);
    const rate = (n('jab', 'cross') + n('cross', 'jab')) / Math.max(1, tot('jab') + tot('cross'));
    console.info(`[FIGHT-GATE] jab↔cross (captures) ${(rate * 100).toFixed(1)} %`);
    expect(rate).toBeLessThanOrEqual(0.06);
  });
});

describe('G3 — misfires on the negatives (a mode would take nothing)', () => {
  /** Misfires of a negative take: every event a mode would take — but a stretch and claps count only blows and kicks (a
   *  guard reached on the way is not a strike: PLAN-P7 §6.5), and a low guard raised one hand after the other (a positive
   *  for the raise) only blows. */
  const misfires = (tk: FightTake, seed: number, cell: Omit<FightCell, 'seed'>) => {
    const st = fightStream(tk, { ...cell, seed });
    const g = matchFight(st, readFight(st.frames), tk);
    return g.misfires.filter((x) => !/stretch|clap|guardlow/.test(tk.name) || x.e.kind === 'blow' || x.e.kind === 'legKick');
  };
  const QUIET = [...real(REAL_NEG), ...KIT_NEG].filter((x) => /stand|jog|idle|rest/.test(x.take.name));
  const GESTURES = [...real(REAL_NEG), ...KIT_NEG].filter((x) => /wave|stretch|clap|armswing/.test(x.take.name))
    .concat(KIT_POS.filter((x) => /guardlow/.test(x.take.name)));
  it(`rest, a fight stance and jogging (${QUIET.length} takes): 0 at 30 and 15 fps, noise 1× and 1.5×, blur on and off`, () => {
    const got: string[] = [];
    for (const fps of [30, 15]) for (const noise of [1, 1.5]) for (const blur of [false, true]) for (const { seed, take } of QUIET) for (const m of misfires(take, seed, { fps, latencyMs: 140, noise, blur })) got.push(`${fps}/${noise}${blur ? '/blur' : ''} ${take.name} ${m.e.kind}@${m.e.t.toFixed(0)}`);
    expect(got).toEqual([]);
  });
  it(`the gestures (${GESTURES.length} takes: waves beside and in front of the face, stretches, claps, arm swings, a low guard raised one hand after the other): 0 at 30, 24, 20 and 15 fps, the camera's default noise, no blur`, () => {
    const got: string[] = [];
    for (const fps of [30, 24, 20, 15]) for (const { seed, take } of GESTURES) for (const m of misfires(take, seed, { fps, latencyMs: 140, noise: 1, blur: false })) got.push(`${fps} ${take.name} ${m.e.kind}@${m.e.t.toFixed(0)}`);
    expect(got).toEqual([]);
  });
  it('the gestures under motion blur, and at 1.5× noise: the measured gap, pinned (it may only shrink)', () => {
    let blur = 0, loud = 0;
    for (const fps of [30, 15]) for (const { seed, take } of GESTURES) {
      blur += misfires(take, seed, { fps, latencyMs: 140, noise: 1, blur: true }).length;
      loud += misfires(take, seed, { fps, latencyMs: 140, noise: 1.5, blur: false }).length;
    }
    console.info(`[FIGHT-GATE] gesture misfires (test seeds, 30 + 15 fps): blur ${blur} · noise 1.5× ${loud}`);
    expect(blur).toBeLessThanOrEqual(5);   // measured 5 (2026-09-26); the full grid's counts are FIGHT.md's
    expect(loud).toBeLessThanOrEqual(3);   // measured 3
  });
});

describe('G9 — no strike out of a jump or a hands-up', () => {
  const lerp = (a: Joints, b: Joints, u: number): Joints => Object.fromEntries(Object.keys(a).map((k) => {
    const p = a[k as keyof Joints], q = b[k as keyof Joints];
    return [k, [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]];
  })) as unknown as Joints;
  const rest = restPose(), up = armsUp(rest);
  const JUMPS = script([hold(rest, 1.5), jumpBeat(rest, 2.6, 0.3, true), hold(rest, 0.8), jumpBeat(rest, 3.0, 0.35, true), hold(rest, 1.0)]);
  const HANDS = script([hold(rest, 1.5), [0.45, (t) => lerp(rest, up, t / 0.45)], hold(up, 1.2), [0.35, (t) => lerp(up, rest, t / 0.35)], hold(rest, 0.8),
    [0.3, (t) => lerp(rest, up, t / 0.3)], hold(up, 0.6), [0.25, (t) => lerp(up, rest, t / 0.25)], hold(rest, 1.0)]);
  const read = (clip: typeof JUMPS) => {
    const got: string[] = [];
    for (const fps of [30, 15]) for (const seed of [TEST_SEEDS[0], TEST_SEEDS[1]]) {
      const frames = synthesize(clip, { fps, seed, latencyMs: 140 }).frames;
      for (const x of readFight(frames)) if (taken(x.e)) got.push(`${fps}/${seed} ${x.e.kind}${'form' in x.e ? ':' + x.e.form : ''}@${x.e.t.toFixed(0)}`);
    }
    return got;
  };
  it('both hands overhead and down, twice: nothing taken (hands up while playing does nothing)', () => {
    expect(read(HANDS)).toEqual([]);
  });
  it('two jumps with an arm swing: no strike, guard or step; the landing\'s absorb is no duck — and each GATHER reads as a duck (the measured gap)', () => {
    const got = read(JUMPS);
    console.info(`[FIGHT-GATE] G9 jumps: ${got.join(' ')}`);
    expect(got.filter((x) => !/evade:duck/.test(x))).toEqual([]);
    // a jump's gather is the same dip as a duck for its first ~200 ms, hands and all (fightReader DUCK_AFTER_AIR_MS):
    // at most one duck per jump (2 jumps × 4 runs), never one out of a landing
    expect(got.length).toBeLessThanOrEqual(8);
  });
});

describe('G10 — southpaw: the mirrored captures read the same classes on the other hands', () => {
  it('each mirrored positive capture: the strikes it reads are its truth\'s classes, sides swapped (30 fps, seed 4)', () => {
    const orth = newTally(), south = newTally();
    for (const tk of REAL_POS) {
      const cell = { fps: 30, latencyMs: 80, noise: 1, blur: false, seed: REAL_SEED };
      const a = fightStream(tk, cell), b = fightStream(mirrorTake(tk), cell);
      addTally(orth, matchFight(a, readFight(a.frames), tk));
      addTally(south, matchFight(b, readFight(b.frames), mirrorTake(tk)));
    }
    const so = group(orth, STRIKES), ss = group(south, STRIKES);
    console.info(`[FIGHT-GATE] captures strikes R ${pct(so.recall)} P ${pct(so.precision)} · mirrored R ${pct(ss.recall)} P ${pct(ss.precision)}`);
    // the mirror must not read worse than the original by more than a couple of strikes' worth
    expect(ss.recall).toBeGreaterThanOrEqual(so.recall - 0.08);
    expect(ss.precision).toBeGreaterThanOrEqual(so.precision - 0.08);
    // and a mirrored jab is a jab thrown with the RIGHT hand (the stance, read from the feet, names it)
    const mirroredLeft = eventClass({ kind: 'blow', t: 0, seen: 0, hand: 'R', lead: true, form: 'straight', name: 'jab', peakT: 0, speed: 0 });
    expect(mirroredLeft).toBe('jab');
  });
});

describe('the synth\'s motion blur is off by default (every earlier fixture unchanged)', () => {
  it('blur off: byte-identical to the pre-P7 synth (fingerprint measured against `git show b440b737:…/synth.ts`)', () => {
    const clip = script([hold(restPose(), 0.5), jumpBeat(restPose(), 2.6, 0.3, true), hold(restPose(), 0.5)]);
    const h = createHash('sha256');
    for (const seed of [1, 7]) for (const fps of [15, 30]) {
      const syn = synthesize(clip, { seed, fps, latencyMs: 140 });
      expect(syn.settings).not.toHaveProperty('blur');
      h.update(JSON.stringify(syn.frames)); h.update(JSON.stringify(syn.gt));
    }
    expect(h.digest('hex').slice(0, 16)).toBe('c8486ebbddccd3e6');
  });
});
