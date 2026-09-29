// fightReader — the fight read, rule by rule (movement play P7). classifyBlow on hand-built paths; the reader end to end
// on scripted moves under a quiet camera (no noise, no holes: what each rule does, not how it holds up — that is the
// gate's, fightGate.test.ts, and FIGHT.md's).
import { describe, it, expect } from 'vitest';
import { classifyBlow, FightReader, type BlowPath, type V3, type FightEvent, type FightFrame } from './fightReader';
import { fightStream, readFight, type FightTake } from './fightGrade';
import { scriptTake } from './fightTakes';
import { BodyReader } from './BodyReader';
import {
  FightBody, stanceItem, blowItem, comboItem, kickItem, guardItem, evadeItem, stepItem, turnItem, mulberry32, type FightHand, type ScriptItem,
  chamberItem, clapItem, frontWaveItem, armSwingItem, standBody,
} from './fightKit';

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const path = (o: Partial<BlowPath>): BlowPath => ({
  p0: v(0.05, 0.05, 0.2), pMax: v(0.02, 0.03, 0.5), pNow: v(0.02, 0.03, 0.5), vPk: v(0, 0, 4), pv: 4,
  reach0: 0.4, reachMax: 0.95, sgn: 1, settled: false, ...o,
});

describe('classifyBlow: the class from the fist\'s fastest instant and its path', () => {
  it('a straight: out at the camera from in front of the shoulder, the arm reaching', () => {
    expect(classifyBlow(path({}))).toBe('straight');
  });
  it('a hook: across the face line at shoulder height, the arm bent — known only once the run is over', () => {
    const hook = path({ p0: v(0.02, -0.05, 0.25), pMax: v(-0.2, -0.04, 0.3), pNow: v(-0.2, -0.04, 0.3), vPk: v(-4, 0, 0.8), reach0: 0.5, reachMax: 0.72 });
    expect(classifyBlow({ ...hook, settled: false })).toBeNull();
    expect(classifyBlow({ ...hook, settled: true })).toBe('hook');
  });
  it('an uppercut: up from under the shoulder to the chin, bent, in front', () => {
    const up = path({ p0: v(0.02, -0.18, 0.18), pMax: v(0.0, 0.08, 0.22), pNow: v(0.0, 0.08, 0.22), vPk: v(-0.5, 3.5, 0.6), reach0: 0.45, reachMax: 0.6, settled: true });
    expect(classifyBlow(up)).toBe('uppercut');
  });
  it('a wide hook: swung ROUND from behind the shoulder to a long arm — its path bulged out and came back in — known once over', () => {
    const wide = path({ p0: v(0.1, -0.1, -0.2), pMax: v(0.0, -0.1, 0.45), pNow: v(0.0, -0.1, 0.45), vPk: v(-2, 0, 4), reach0: 0.6, reachMax: 0.95, bulge: 0.2, inBack: 0.2, outSwing: 0.15, elbowFwd: 0.3 });
    expect(classifyBlow({ ...wide, settled: false })).toBeNull();
    expect(classifyBlow({ ...wide, settled: true })).toBe('hook');
    // …but an arm held straight out to the side (a stretch) swinging in is not one
    expect(classifyBlow(path({ p0: v(0.45, 0.1, -0.1), pMax: v(0.1, 0.1, 0.4), vPk: v(-3, 0, 4), reach0: 0.95, reachMax: 1.0, settled: true, bulge: 0.2, inBack: 0.3 }))).toBeNull();
  });
  it('from behind the shoulder, straight out (no bulge): a straight from a CHAMBER once over — never a hook (the review, 2026-09-26)', () => {
    // karate's reverse punch from the hip: the elbow driven forward, the fist never swung out
    const hip = path({ p0: v(-0.03, -0.38, -0.1), pMax: v(0.06, -0.12, 0.45), pNow: v(0.06, -0.12, 0.45), vPk: v(0.3, 1.2, 5), pv: 5, reach0: 0.74, reachMax: 0.95, bulge: 0.01, inBack: 0.1, outSwing: 0, elbowFwd: 0.45 });
    expect(classifyBlow({ ...hip, settled: false })).toBeNull();
    expect(classifyBlow({ ...hip, settled: true })).toBe('straight');
    // a standing arm swing (a straight arm from behind to in front): neither
    expect(classifyBlow(path({ p0: v(-0.05, -0.45, -0.3), pMax: v(-0.05, -0.3, 0.45), pNow: v(-0.05, -0.3, 0.45), vPk: v(0, 1, 3), pv: 3, reach0: 0.99, reachMax: 0.99, settled: true, bulge: 0, inBack: 0, outSwing: 0, elbowFwd: 0.4 }))).toBeNull();
    // a jog's forearm pump from the ribs travels too little
    expect(classifyBlow({ ...hip, pMax: v(0.0, -0.3, 0.14), pNow: v(0.0, -0.3, 0.14), settled: true })).toBeNull();
  });
  it('a hook\'s forearm lies level: a hand swept across in front of the face with the forearm standing up is a wave', () => {
    const hook = path({ p0: v(0.02, -0.05, 0.25), pMax: v(-0.2, -0.04, 0.3), pNow: v(-0.2, -0.04, 0.3), vPk: v(-4, 0, 0.8), reach0: 0.5, reachMax: 0.72, settled: true });
    expect(classifyBlow({ ...hook, forearmUp: -0.05 })).toBe('hook');
    expect(classifyBlow({ ...hook, forearmUp: 0.16 })).toBeNull();
  });
  it('a retraction (back, down or out) is nothing', () => {
    expect(classifyBlow(path({ p0: v(0.02, 0.03, 0.5), pMax: v(0.02, 0.03, 0.5), pNow: v(0.05, 0.05, 0.2), vPk: v(0, 0, -4), reach0: 0.95, reachMax: 0.95, settled: true }))).toBeNull();
  });
  it('a raised hand out beside the head pushed forward is a wave\'s, not a straight', () => {
    expect(classifyBlow(path({ p0: v(0.15, 0.12, 0.2) }))).toBeNull();
    expect(classifyBlow(path({ p0: v(0.05, 0.12, 0.2) }))).toBe('straight');
  });
  it('nothing starts from over the head (a stretch\'s arms coming down)', () => {
    expect(classifyBlow(path({ p0: v(0.02, 0.35, 0.2), vPk: v(0, -1, 4) }))).toBeNull();
  });
  it('a slow push that barely reaches is not a straight (a slow straight needs more path)', () => {
    expect(classifyBlow(path({ pv: 2.2, vPk: v(0, 0, 2.1), reachMax: 0.77, pMax: v(0.02, 0.03, 0.39) }))).toBeNull();
    expect(classifyBlow(path({ pv: 2.2, vPk: v(0, 0, 2.1), reachMax: 0.85, pMax: v(0.02, 0.03, 0.42) }))).toBe('straight');
  });
});

// ── the reader end to end, a quiet camera ────────────────────────────────────────────────────────────────────────
const QUIET = { fps: 30, latencyMs: 80, noise: 0, blur: false, seed: 1, holes: false };
function readTake(t: FightTake): FightEvent[] {
  const st = fightStream(t, QUIET);
  return readFight(st.frames).map((x) => x.e).filter((e) => e.t >= st.from);
}
const kitTake = (lead: FightHand, build: (fb: FightBody, rng: () => number) => ScriptItem[], seed = 3): FightTake => {
  const fb = new FightBody(lead), rng = mulberry32(seed);
  return scriptTake('unit', 'positive', build(fb, rng));
};
const blows = (es: FightEvent[]) => es.filter((e): e is Extract<FightEvent, { kind: 'blow' }> => e.kind === 'blow').map((e) => `${e.name}${e.hand}`);

describe('the reader on scripted moves (30 fps, no noise)', () => {
  it('orthodox: a jab is the LEFT straight, a cross the RIGHT; a southpaw\'s jab is the right', () => {
    const orth = readTake(kitTake('L', (fb, r) => [stanceItem(fb, 1, r), blowItem(fb, 'jab', r, 'L'), stanceItem(fb, 0.8, r), blowItem(fb, 'cross', r, 'R'), stanceItem(fb, 0.8, r)]));
    expect(blows(orth)).toEqual(['jabL', 'crossR']);
    const south = readTake(kitTake('R', (fb, r) => [stanceItem(fb, 1, r), blowItem(fb, 'jab', r, 'R'), stanceItem(fb, 0.8, r), blowItem(fb, 'cross', r, 'L'), stanceItem(fb, 0.8, r)]));
    expect(blows(south)).toEqual(['jabR', 'crossL']);
  });
  it('hooks and uppercuts from either hand', () => {
    const es = readTake(kitTake('L', (fb, r) => [stanceItem(fb, 1, r), blowItem(fb, 'hook', r, 'L'), stanceItem(fb, 0.8, r), blowItem(fb, 'uppercut', r, 'R'), stanceItem(fb, 0.8, r)]));
    expect(blows(es)).toEqual(['hookL', 'uppercutR']);
  });
  it('a jab-cross-hook combination: three blows, named in order, each at its own onset', () => {
    const t = kitTake('L', (fb, r) => [stanceItem(fb, 1, r), comboItem(fb, ['jab', 'cross', 'hook'], r, [0.3, 0.32], ['L', 'R', 'L']), stanceItem(fb, 0.8, r)]);
    const es = readTake(t).filter((e) => e.kind === 'blow');
    expect(blows(es)).toEqual(['jabL', 'crossR', 'hookL']);
    expect(es[1].t - es[0].t).toBeGreaterThan(150);
    expect(es[2].t - es[1].t).toBeGreaterThan(150);
  });
  it('kicks: the front kick at the camera and the roundhouse across, each once', () => {
    const es = readTake(kitTake('L', (fb, r) => [stanceItem(fb, 1, r), kickItem(fb, 'front', r, 'R'), stanceItem(fb, 0.8, r), kickItem(fb, 'round', r, 'R'), stanceItem(fb, 0.8, r)]));
    expect(es.filter((e) => e.kind === 'legKick').map((e) => (e as Extract<FightEvent, { kind: 'legKick' }>).form)).toEqual(['front', 'round']);
    expect(es.filter((e) => e.kind === 'blow')).toEqual([]);
  });
  it('the guard raised from the hands down is a RAISE; let down, the guard is down', () => {
    const fb = new FightBody('L'), r = mulberry32(5);
    const es = readTake(scriptTake('unit', 'positive', [stanceItem(fb, 1, r, 'rest'), guardItem(fb, 'raise', r, 0.7), guardItem(fb, 'drop', r, 0.6)], false));
    const g = es.filter((e): e is Extract<FightEvent, { kind: 'guard' }> => e.kind === 'guard');
    expect(g.map((e) => (e.up ? (e.raise ? 'raise' : 'up') : 'down'))).toEqual(['raise', 'down']);
  });
  it('slips to either side and a duck', () => {
    const es = readTake(kitTake('L', (fb, r) => [stanceItem(fb, 1, r), evadeItem(fb, 'slip', r, 'L'), stanceItem(fb, 0.8, r), evadeItem(fb, 'slip', r, 'R'), stanceItem(fb, 0.8, r), evadeItem(fb, 'duck', r), stanceItem(fb, 0.8, r)]));
    expect(es.filter((e) => e.kind === 'evade').map((e) => { const x = e as Extract<FightEvent, { kind: 'evade' }>; return x.form === 'slip' ? `slip${x.side}` : 'duck'; })).toEqual(['slipL', 'slipR', 'duck']);
    expect(es.filter((e) => e.kind === 'blow')).toEqual([]);
  });
  it('a step in and back out', () => {
    const fb = new FightBody('L'), r = mulberry32(9);
    const a = stepItem(fb, 'in', r), b = stepItem(fb, 'out', r, a.end, 0.3);
    const es = readTake(scriptTake('unit', 'positive', [stanceItem(fb, 1.2, r), a.item, stanceItem(fb, 0.8, r, 'guard', a.end), b.item, stanceItem(fb, 0.8, r, 'guard', b.end)]));
    expect(es.filter((e) => e.kind === 'fightStep').map((e) => (e as Extract<FightEvent, { kind: 'fightStep' }>).dir)).toEqual(['in', 'out']);
  });
  it('a quarter-turn is a turn (the spin kick\'s start), never a strike', () => {
    const es = readTake(kitTake('L', (fb, r) => [stanceItem(fb, 1, r), turnItem(fb, 110, r), stanceItem(fb, 0.8, r)]));
    expect(es.some((e) => e.kind === 'turn')).toBe(true);
    expect(es.filter((e) => e.kind === 'blow' || e.kind === 'legKick')).toEqual([]);
  });
  it('a fight stance held — bobbing, guard up — is nothing a mode would take', () => {
    const es = readTake(kitTake('L', (fb, r) => [stanceItem(fb, 5, r)]));
    expect(es.filter((e) => e.kind !== 'guard' || e.raise)).toEqual([]);
  });
});

// ── the review's cases (2026-09-26) ─────────────────────────────────────────────────────────────────────────────────
describe('the review\'s cases, a quiet camera', () => {
  it('the guard raised from a LOW guard one hand after the other (0.15–0.3 s apart) is a RAISE, never two uppercuts', () => {
    for (const lag of [0.15, 0.2, 0.3]) for (const lowY of [0.22, 0.28]) {
      const fb = new FightBody('L'), r = mulberry32(Math.round(lag * 100 + lowY * 1000));
      const es = readTake(scriptTake('unit', 'positive', [stanceItem(fb, 1.2, r, { lowY }), guardItem(fb, 'raise', r, 0.8, { lowY, lag }), stanceItem(fb, 0.6, r)], false));
      expect(blows(es)).toEqual([]);
      expect(es.filter((e) => e.kind === 'guard' && e.up).map((e) => (e as Extract<FightEvent, { kind: 'guard' }>).raise)).toEqual([true]);
    }
  });
  it('straights from a chamber (the hip, the ribs, a hand cocked back) are crosses, not hooks', () => {
    for (const from of ['hip', 'rib', 'cocked'] as const) {
      const fb = new FightBody('L'), r = mulberry32(from.length * 7);
      const es = readTake(scriptTake('unit', 'positive', [chamberItem(fb, 'R', from, r, {}, 1.0), chamberItem(fb, 'R', from, r, {}, 0.6)]));
      expect(blows(es)).toEqual(['crossR', 'crossR']);
    }
  });
  it('claps, a wave in front of the face and arm swings: no blow', () => {
    const sb = standBody(), r = mulberry32(11);
    const es = readTake(scriptTake('unit', 'negative', [stanceItem(sb, 1, r, 'rest'), clapItem(sb, 6, r), stanceItem(sb, 0.6, r, 'rest'), frontWaveItem(sb, 3, r, 'R'),
      stanceItem(sb, 0.6, r, 'rest'), armSwingItem(sb, 4, r, 'together'), armSwingItem(sb, 4, r, 'opposite'), stanceItem(sb, 0.6, r, 'rest')], false));
    expect(blows(es)).toEqual([]);
  });
  it('blows are told in ONSET order: a cross thrown 0.15 s after a hook (told once over) waits for it', () => {
    let pairs = 0;
    for (const seed of [1, 2, 3]) {
      const t = kitTake('L', (fb, r) => [stanceItem(fb, 1, r), comboItem(fb, ['hook', 'cross'], r, [0.15], ['L', 'R']), stanceItem(fb, 0.8, r), comboItem(fb, ['uppercut', 'cross'], r, [0.15], ['L', 'R']), stanceItem(fb, 0.8, r)], seed);
      const bs = readTake(t).filter((e) => e.kind === 'blow');
      for (let i = 1; i < bs.length; i++) { pairs++; expect(bs[i].t).toBeGreaterThanOrEqual(bs[i - 1].t); }
    }
    expect(pairs).toBeGreaterThan(0);
  });
  it('a square stance names no lead after SQUARE_HOLD_MS: the orthodox default, whatever lead the stand had', () => {
    const r = new FightReader();
    const f = (t: number, dz: number): FightFrame => {
      const p = (x: number, y: number, z: number): V3 => ({ x, y, z });
      return {
        t, shoulder: [p(0.19, 0.45, 0), p(-0.19, 0.45, 0)], elbow: [p(0.21, 0.17, 0), p(-0.21, 0.17, 0)], wrist: [p(0.22, -0.08, 0), p(-0.22, -0.08, 0)],
        nose: p(0, 0.62, 0.05), crownY: 0.72, hip: [p(0.09, 0, 0), p(-0.09, 0, 0)], knee: [p(0.09, -0.43, 0), p(-0.09, -0.43, 0)],
        ankle: [p(0.1, -0.87, -dz / 2), p(-0.1, -0.87, dz / 2)], hipH: 0.95, hipRoom: p(0, 0.95, 0), feetRoom: null, contact: [true, true], airborne: false,
        inJump: false, squat: 0, bothOverhead: false, inStride: false, wristSeen: [true, true], armM: [0.53, 0.53], legM: 0.9, yawDeg: 0,
      };
    };
    let t = 0;
    for (; t < 600; t += 33) r.push(f(t, 0.15));   // the right foot 0.15 m ahead: a southpaw
    expect(r.state.lead).toBe('R');
    for (; t < 1600; t += 33) r.push(f(t, 0));      // then square
    expect(r.state.lead).toBe('L');
  });
  it('the decided horizon holds at a head move under way (a slip being judged) and runs with the frames when quiet', () => {
    const fb = new FightBody('L'), rr = mulberry32(4);
    const st = fightStream(scriptTake('unit', 'positive', [stanceItem(fb, 1.2, rr), evadeItem(fb, 'slip', rr, 'L'), stanceItem(fb, 1.0, rr)]), QUIET);
    const reader = new BodyReader();
    let maxLag = 0, quietLag = Infinity;
    for (const fr of st.frames) {
      const { read } = reader.read(fr);
      if (!read.fight) continue;
      const lag = fr.t - read.fight.decidedUntil;
      maxLag = Math.max(maxLag, lag);
      if (fr.t > st.frames[st.frames.length - 1].t - 300) quietLag = Math.min(quietLag, lag);
    }
    expect(maxLag).toBeGreaterThan(60);     // held back while the slip was being judged
    expect(quietLag).toBeLessThanOrEqual(1); // the newest frame once the head is still
  });
});
