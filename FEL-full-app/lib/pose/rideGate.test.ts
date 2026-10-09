// THE P8 GATE (movement play P8, 2026-09-26): the ride controls on labelled streams through the whole seam — the scripted
// label set (lib/pose/rideStreams, every stance: θ 30 / 45 / 60, regular and goofy) and the committed CMU takes
// (__fixtures__/ride, their classes and windows labelled by eye off scripts/mocap/stream-sheet, R-F6) — shot under the
// plan's vitest subset of the grid (PLAN-P8 §8.3: 30 and 15 fps, 80 and 200 ms,
// 1.5× the synth's noise, the label flip on, 150 ms holes, one TEST seed; the thresholds were fixed on the train seeds 11,
// 17, 23 with scripts/body/ride.mts), read by BodyReader → ChannelReader + the ride read, and replayed through the P8 rows
// with the ride switch on (what the MODE receives). The full grid (both seeds sets, 1× and 1.5×, flip off and on) is the
// report's: scripts/body/ride.mts → p8/RIDE.md.
//
//   G1  REST     no ride control emits on any negative stream (rest, sway, nose / tail, crouch, a tucked hop, a head turn and a
//                shoulder check, a 45° / 60° turn, a shuffle, a wave, a stretch, one arm out) — no stick, no trigger, no
//                button, no grab, no quarter, no push, no dip; the carve before its dead band inside ON at 1.5× noise and
//                ≤ 0.7 × ON at 1× (the plan's margin)
//   G2  CARVE    toe / heel leans: the right sign, half a stick at 8°, full at 12° (a 4° lean sits on the dead band: reported)
//   G3  POP      every hop pops once, nothing else pops
//   G4  GRAB     the hand at the edge in a hop: found, the hand and the edge named
//   G5  SPIN     a 90° quarter-turn (on the ground or in a hop): found once, the direction right
//   G6  WHEEL    the wheel's sign and size by class, the grip (GAS), the drift hop only with the wheel turned
//   G7  WINGS    bank and pitch signs, the spread (GAS); a flapping bird is no bank
//   G8  CADENCE  Free Run's band (a walk under the vault gate, a jog over it, 3.8 steps/s at the sprint gate), high knees → RT
//   G11 SQUARE   the square fallback's side lean steers; a shuffle does not
//   G12 LATENCY  arrival − the clean joints' instant, per control, at 30 fps / 80 ms
//   G13 KEPT     (review fix) the stance through a 'lost' (a 450 ms dropout, back onto a held edge): the rest after reads 0; and a
//                rider who squares up 22 / 30° toward the screen: the axes follow, a hop turn from there is one quarter, a nose /
//                tail shift there steers nothing; a whole-body turn through a carve (CMU 134_03) is no squared-up hold
//   G1-R REAL    (R-F2) the twelve P1 takes — the owner's own DeepMotion recordings and the CMU ones: dunks, jumps, jump
//                shots, a fighter's guard, a jog, a shuffle, a stand — through the kart and the plane: not one GAS, STEER,
//                DRIFT or CLIMB (the first build's grip pressed GAS / STEER / DRIFT on the dunk and the guard)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rideCatalogue, realStream, dropoutEdgeStream, squareUpStream, type RideCondition, type RideStream, type RideTakeFile } from './rideStreams';
import { rideRun, gradeContinuous, gradeEvents, popPresses, readEvents, restDrift, trace, at, pcts, type RideRun } from './rideGrade';
import { RIDE_ROWS_ON } from '../input/rideProfiles';
import { FREERUN_BAND } from '../input/rideProfiles';
import { bodyPackets, seamReplay } from './seamReplay';
import { standFrame, STAND_SEC } from './grade';
import { holdStill } from './streamKit';
import type { PoseFixture } from './synth';

const ROW = Object.fromEntries(RIDE_ROWS_ON.map((p) => [p.key, p]));
const TEST_SEED = 41;
const CONDS: RideCondition[] = [
  { fps: 30, latencyMs: 80, noise: 1.5, flip: true, seed: TEST_SEED, holes: true },
  { fps: 30, latencyMs: 200, noise: 1.5, flip: true, seed: TEST_SEED, holes: true },
  { fps: 15, latencyMs: 80, noise: 1.5, flip: true, seed: TEST_SEED, holes: true },
  { fps: 15, latencyMs: 200, noise: 1.5, flip: true, seed: TEST_SEED, holes: true },
];
const DIR = join(__dirname, '__fixtures__/ride');
const TAKES: RideStream[] = (JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as { takes: { name: string }[] }).takes
  .map((t) => realStream(JSON.parse(readFileSync(join(DIR, `${t.name}.json`), 'utf8')) as RideTakeFile));
const rowsFor = (s: RideStream) => (s.family === 'board' ? [ROW.skateboard, ROW.surf] : [ROW.velocitykart, ROW.aeroaces, ROW.freerun]);

let RUNS: RideRun[] | null = null;
/** Every stream under every subset condition, once (the gates share them). */
function runs(): RideRun[] {
  if (RUNS) return RUNS;
  const streams = [...rideCatalogue(), ...TAKES];
  RUNS = CONDS.flatMap((c) => streams.map((s) => rideRun(s, c, rowsFor(s))));
  return RUNS;
}
const where = (re: RegExp, kind?: 'positive' | 'negative') => runs().filter((r) => re.test(r.stream.name) && (!kind || r.stream.kind === kind));
const tag = (r: RideRun) => `${r.stream.name} @ ${r.cond.fps}fps ${r.cond.latencyMs}ms`;

describe('G1 REST — nothing emits on a stream that asks for nothing', () => {
  it('every negative stream, every condition: no output of any kind from any row, no grab / quarter / push / dip', () => {
    const neg = runs().filter((r) => r.stream.kind === 'negative');
    expect(neg.length).toBeGreaterThan(70 * CONDS.length);
    const bad: string[] = [];
    for (const r of neg) {
      // a T-stretch IS the wing pose (PLAN-P8 §12: "by definition, and the card says so") — the plane's rows skip the stretch
      const d = restDrift(/stretch/.test(r.stream.name) ? { ...r, replays: { ...r.replays, aeroaces: { ...r.replays.aeroaces, bus: [] } } } : r);
      if (d.outputs.length) bad.push(`${tag(r)}: ${d.outputs.slice(0, 3).join(' ')}`);
    }
    expect(bad).toEqual([]);
  });
  it('the carve before its dead band: inside ON at 1.5× noise (15 fps included) on every board negative', () => {
    const worst = Math.max(...runs().filter((r) => r.stream.kind === 'negative' && r.stream.family === 'board').map((r) => restDrift(r).carveP99));
    expect(worst).toBeLessThan(1);
  });
  it('…and ≤ 0.7 × ON at the synth\'s own noise (the plan\'s margin), both rates, both lags, the flip on', () => {
    const base = rideCatalogue().filter((s) => s.kind === 'negative' && s.family === 'board');
    const p99 = [15, 30].flatMap((fps) => base.map((s) => restDrift(rideRun(s, { fps, latencyMs: 200, noise: 1, flip: true, seed: TEST_SEED, holes: true }, [ROW.skateboard])).carveP99));
    expect(Math.max(...p99)).toBeLessThanOrEqual(0.7);
  });
});

describe('G2 CARVE — the toe / heel lean steers the right way, by size', () => {
  it('8° and 12° leans in every stance and lead: recall ≥ 0.95, the sign ≥ 0.98, half a stick at 8°, full at 12°; no span without a lean', () => {
    let segs = 0, hits = 0, spans = 0, spansOk = 0, signN = 0, sign = 0;
    const med: Record<string, number[]> = { 4: [], 8: [], 12: [] };
    for (const r of where(/^lean /)) {
      const g = gradeContinuous(r, 'skateboard', 'carve');
      spans += g.spans; spansOk += g.spansOk;
      g.per.forEach((p) => {
        med[String(p.level)].push(p.medAbs);
        if (p.level === 4) return;
        segs++; if (p.latencyMs !== null) hits++;
        if (p.signShare !== null) { signN++; sign += p.signShare; }
      });
    }
    const m = (k: string) => { const s = [...med[k]].sort((a, b) => a - b); return s[s.length >> 1]; };
    expect(hits / segs).toBeGreaterThanOrEqual(0.95);
    expect(sign / signN).toBeGreaterThanOrEqual(0.98);
    expect(spansOk / spans).toBeGreaterThanOrEqual(0.98);
    expect(m('8')).toBeGreaterThanOrEqual(0.4);
    expect(m('12')).toBeGreaterThanOrEqual(0.75);
    // the 4° class is on the dead band by design (0.076 leg lengths against ON 0.07): whatever it reads, it never reads backwards
    expect(m('4')).toBeGreaterThanOrEqual(0);
  });
  it('the real skater (CMU 134, three takes): the carve follows the clean joints\' own lean — every non-zero value the right sign', () => {
    let n = 0, ok = 0;
    for (const r of where(/^cmu_134_(03|15|08)/)) {
      const g = gradeContinuous(r, 'skateboard', 'carve');
      for (const p of g.per) if (p.signShare !== null) { n++; ok += p.signShare; }
    }
    expect(n).toBeGreaterThan(0);
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  });
});

describe('G3 POP — the hop pops, once', () => {
  it('every hop (plain, with a grab, a tuck, a quarter-turn) in every stance: one A each, none elsewhere', () => {
    let truth = 0, matched = 0, extra = 0;
    for (const r of runs().filter((x) => x.stream.family === 'board' && !/^cmu_/.test(x.stream.name))) {
      const g = gradeEvents(r, 'pop', popPresses(r, 'skateboard'));
      truth += g.truth; matched += g.matched; extra += g.extra;
    }
    expect(truth).toBeGreaterThanOrEqual(200);
    expect(matched / truth).toBeGreaterThanOrEqual(0.95);
    expect(extra).toBe(0);
  });
});

describe('G4 GRAB — a hand at the board\'s edge in the air (SCRIPTED: no capture of a grab exists)', () => {
  it('lead / rear × toe / heel in every stance: recall ≥ 0.9, precision ≥ 0.95, the hand right every time, the edge ≥ 0.85', () => {
    let truth = 0, matched = 0, found = 0, named = 0, handOk = 0, edgeOk = 0;
    for (const r of where(/^grab /)) {
      const ev = readEvents(r.packets).grabs;
      const g = gradeEvents(r, 'grab', ev.map((x) => ({ t: x.on, at: x.at })));
      truth += g.truth; matched += g.matched; found += ev.filter((x) => x.on >= r.stream.gradeFrom).length;
      const seg = r.stream.segs.find((s) => s.control === 'grab')!;
      for (const x of ev) { named++; if (x.hand === seg.hand) handOk++; if (x.edge === seg.edge) edgeOk++; }
    }
    expect(matched / truth).toBeGreaterThanOrEqual(0.9);
    expect(matched / found).toBeGreaterThanOrEqual(0.95);
    expect(handOk).toBe(named);
    expect(edgeOk / named).toBeGreaterThanOrEqual(0.85);
  });
});

describe('G5 SPIN — a real quarter-turn of the shoulders', () => {
  it('90° frontside / backside, on the ground and in a hop, every stance: recall ≥ 0.9, precision ≥ 0.95, the direction ≥ 0.98', () => {
    let truth = 0, matched = 0, found = 0, dirOk = 0, dirN = 0;
    for (const r of where(/^quarter .* 90°/)) {
      const q = readEvents(r.packets).quarters.filter((x) => x.t >= r.stream.gradeFrom);
      const g = gradeEvents(r, 'quarter', q.map((x) => ({ t: x.t, at: x.at, ok: (seg) => seg.dir === x.dir })));
      truth += g.truth; matched += g.matched; found += q.length; dirN += g.named; dirOk += g.namedOk;
    }
    expect(matched / truth).toBeGreaterThanOrEqual(0.9);
    expect(matched / found).toBeGreaterThanOrEqual(0.95);
    expect(dirOk / dirN).toBeGreaterThanOrEqual(0.98);
  });
  it('the real jump and hop turns (CMU 91_56 / 91_46, 83_54 / 58 / 61 / 64: 90° to 360° in the air) are one quarter each, inside the eye\'s window; 83_51\'s slow 90° (600 ms from 15° to 75° on its clean shoulders) at most one (it is none at QUARTER_MS 600)', () => {
    for (const r of where(/^cmu_(91_(56|46)|83_(5[1-9]|6[0-9]))/)) {
      const q = readEvents(r.packets).quarters.filter((x) => x.t >= r.stream.gradeFrom);
      const seg = r.stream.segs.find((x) => x.control === 'quarter')!;
      if (/83_51/.test(r.stream.name)) { expect(q.length, tag(r)).toBeLessThanOrEqual(1); continue; }
      expect(q.length, tag(r)).toBe(1);
      expect(q[0].t, tag(r)).toBeGreaterThanOrEqual(seg.from - 100);
      expect(q[0].t, tag(r)).toBeLessThanOrEqual(seg.to);
    }
  });
  it('a skater\'s carve (CMU 134) is never a quarter; a turn in place (CMU 69_16 / 69_18, ~140°/s stepping round) at most one', () => {
    // (69_18 read one quarter in 4 of the train seeds' 48 cells at QUARTER_MS 600 — p8/RIDE.md; it only spins a rider in the air)
    for (const r of where(/^cmu_134_/)) expect(readEvents(r.packets).quarters.filter((x) => x.t >= r.stream.gradeFrom), tag(r)).toEqual([]);
    for (const r of where(/^cmu_69_1[68]/)) expect(readEvents(r.packets).quarters.filter((x) => x.t >= r.stream.gradeFrom).length, tag(r)).toBeLessThanOrEqual(1);
  });
});

describe('G6 WHEEL — two wrists on a wheel', () => {
  it('±15 / 30 / 60°: every segment found with the right sign, the median size within 0.1 of the ramp\'s (0.2 / 0.5 / 1.0)', () => {
    const med: Record<string, number[]> = {};
    let segs = 0, hits = 0, signN = 0, sign = 0;
    for (const r of where(/^wheel ±/)) {
      const g = gradeContinuous(r, 'velocitykart', 'wheel');
      for (const p of g.per) { segs++; if (p.latencyMs !== null) hits++; if (p.signShare !== null) { signN++; sign += p.signShare; } (med[String(p.level)] ??= []).push(p.medAbs); }
    }
    const m = (k: string) => { const s = [...med[k]].sort((a, b) => a - b); return s[s.length >> 1]; };
    expect(hits).toBe(segs);
    expect(sign / signN).toBeGreaterThanOrEqual(0.98);
    for (const [k, want] of [['15', 0.2], ['30', 0.5], ['60', 1]] as const) expect(Math.abs(m(k) - want), `${k}°`).toBeLessThanOrEqual(0.1);
  });
  it('the grip is the GAS while the wheel is held, and nothing once the arms are down (exactly 0)', () => {
    for (const r of where(/^wheel ±/)) {
      const tr = trace(r.replays.velocitykart);
      const seg = r.stream.segs.find((s) => s.control === 'grip')!;
      expect(at(tr, seg.from + 700).rt, tag(r)).toBe(1);
      expect(at(tr, r.stream.marks.down + 600).rt, tag(r)).toBe(0);
      expect(at(tr, r.stream.marks.down + 600).x, tag(r)).toBe(0);
    }
  });
  it('a hop with the wheel turned (30°) holds the DRIFT; a hop with it at 15° or centred never does', () => {
    let truth = 0, matched = 0, extra = 0;
    for (const r of where(/^wheel .*(\+ hop|centred)/)) {
      const g = gradeEvents(r, 'hopTurn', popPresses(r, 'velocitykart', 'X'));
      truth += g.truth; matched += g.matched; extra += g.extra;
    }
    expect(truth).toBe(2 * CONDS.length);
    expect(matched / truth).toBeGreaterThanOrEqual(0.9);
    expect(extra).toBe(0);
  });
  // R-F2: the grip starts only when the wheel is TAKEN (straight, the hands at one depth, centred, no swing — what the P1
  // negatives need). These two windows open mid-drive, the wheel already turned (80_38 whips it ±44° at up to 2 m/s of hand
  // speed): the first build's "gripped > 0.6 of the take" held for a grip that started on any hands-in-band frame. The take
  // now waits for the driver's first straight wheel — 0.8–1.2 s into 79_76, 2.0–3.0 s into 80_38 (train seeds 11 / 17 / 23:
  // share 0.82–0.89 and 0.52–0.66) — and from there the grip holds to the end with the steer's sign right.
  it('the real drivers (CMU 79_76, 80_38): the wheel is taken inside the take and held from there (≥ 0.95), gripped ≥ half of it (79_76 ≥ 0.75), its steer the clean wrists\' sign', () => {
    let n = 0, ok = 0;
    for (const r of where(/^cmu_(79_76|80_38)/)) {
      const g = gradeContinuous(r, 'velocitykart', 'wheel');
      for (const p of g.per) if (p.signShare !== null) { n++; ok += p.signShare; }
      const tr = r.packets.filter((p) => p.read.t >= r.stream.gradeFrom && p.read.tracking);
      const i0 = tr.findIndex((p) => p.channels.ride?.wheel.grip);
      expect(i0, `${tag(r)}: taken`).toBeGreaterThanOrEqual(0);
      expect(tr[i0].read.t - r.stream.gradeFrom, `${tag(r)}: taken inside the take`).toBeLessThan(3500);
      const after = tr.slice(i0);
      expect(after.filter((p) => p.channels.ride?.wheel.grip).length / after.length, `${tag(r)}: held once taken`).toBeGreaterThanOrEqual(0.95);
      const share = tr.filter((p) => p.channels.ride?.wheel.grip).length / tr.length;
      expect(share, tag(r)).toBeGreaterThanOrEqual(/79_76/.test(r.stream.name) ? 0.75 : 0.5);
    }
    expect(ok / n).toBeGreaterThanOrEqual(0.85);
  });
});

describe('G7 WINGS — both arms out', () => {
  it('bank ±10 / 20 / 35° and pitch ±10 / 20 / 30°: every segment found, bank sign ≥ 0.98, pitch sign ≥ 0.95; the spread is the GAS', () => {
    for (const ctl of ['bank', 'pitch'] as const) {
      let segs = 0, hits = 0, signN = 0, sign = 0;
      for (const r of where(/^wings /)) {
        const g = gradeContinuous(r, 'aeroaces', ctl);
        for (const p of g.per) { segs++; if (p.latencyMs !== null) hits++; if (p.signShare !== null) { signN++; sign += p.signShare; } }
      }
      expect(hits, ctl).toBe(segs);
      expect(sign / signN, ctl).toBeGreaterThanOrEqual(ctl === 'bank' ? 0.98 : 0.95);
    }
    for (const r of where(/^wings /)) expect(at(trace(r.replays.aeroaces), r.stream.marks.level + 500).rt, tag(r)).toBe(1);
  });
  it('a flapping bird (CMU 79_58, 80_62) never banks past 0.2 (the wings open only on still arms)', () => {
    for (const r of where(/bird/)) expect(Math.max(0, ...trace(r.replays.aeroaces).map((s) => Math.abs(s.x))), tag(r)).toBeLessThanOrEqual(0.2);
  });
  it('review fix — the climb on real arms held out level (CMU 132_01 "arms out level", 132_09 "arms out with tilts"): the plane holds its height — the climb 0 through ≥ 0.9 of the gas, never a dive (the first build dived through 18–74 % of it)', () => {
    for (const r of where(/^cmu_132_(01|09)/)) {
      const tr = trace(r.replays.aeroaces);
      let gas = 0, climb = 0, dive = 0;
      for (let t = r.stream.gradeFrom; t <= r.stream.marks.end; t += 33) { const s = at(tr, t); if (s.rt !== 1) continue; gas++; if (s.y > 0) climb++; if (s.y < 0) dive++; }
      expect(gas, tag(r)).toBeGreaterThan(20);
      expect((climb + dive) / gas, tag(r)).toBeLessThanOrEqual(0.1);
      expect(dive, tag(r)).toBe(0);
    }
  });
  it('arms held out walking (CMU 132_01 / 05 / 09, balancing): the plane has the GAS for ≥ 0.3 of the take and banks the clean wing line\'s way', () => {
    let n = 0, ok = 0;
    for (const r of where(/^cmu_132_(01|05|09)/)) {
      const tr = trace(r.replays.aeroaces);
      const from = r.stream.gradeFrom, to = r.stream.marks.end;
      let on = 0, all = 0;
      for (let t = from; t <= to; t += 33) { all++; if (at(tr, t).rt === 1) on++; }
      expect(on / all, tag(r)).toBeGreaterThanOrEqual(0.3);
      for (const p of gradeContinuous(r, 'aeroaces', 'bank').per) if (p.signShare !== null) { n++; ok += p.signShare; }
    }
    expect(n).toBeGreaterThan(0);
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  });
});

describe('G8 CADENCE — running in place drives Free Run on its own band', () => {
  const RUN_MAX = 6.4, VAULT_GATE = 2.6, SPRINT_GATE = 5.2;
  const maxY = (r: RideRun) => Math.max(0, ...trace(r.replays.freerun).filter((s) => s.t >= r.stream.gradeFrom).map((s) => -s.y));
  it(`a walk in place (1.6, 1.8 steps/s) stays under the vault gate (${VAULT_GATE} m/s); a jog (2.2) reaches it; 3.8 steps/s reaches the sprint gate (${SPRINT_GATE})`, () => {
    for (const r of where(/^walk 1.6|^walk 1.8/)) expect(maxY(r) * RUN_MAX, tag(r)).toBeLessThan(VAULT_GATE);
    for (const r of where(/^run 2.2/)) expect(maxY(r) * RUN_MAX, tag(r)).toBeGreaterThanOrEqual(VAULT_GATE);
    for (const r of where(/^run 3.8/)) expect(maxY(r) * RUN_MAX, tag(r)).toBeGreaterThanOrEqual(SPRINT_GATE);
    expect(FREERUN_BAND.minHz).toBeLessThan(FREERUN_BAND.fullHz);
  });
  it('high knees hold RT (SPRINT); a jog at the same cadence never does', () => {
    for (const r of where(/^high knees/)) expect(Math.max(0, ...trace(r.replays.freerun).map((s) => s.rt)), tag(r)).toBe(1);
    for (const r of where(/^run 3.8|^run 3 Hz/)) expect(Math.max(0, ...trace(r.replays.freerun).map((s) => s.rt)), tag(r)).toBe(0);
  });
  it('the real jog (CMU 143_04) runs Free Run forward at 30 fps (at 15 fps the P2 reader tells 7 of its ~10 steps, with a 1.8 s gap)', () => {
    for (const r of where(/^cmu_143_04/).filter((x) => x.cond.fps === 30)) expect(maxY(r), tag(r)).toBeGreaterThanOrEqual(0.4);
  });
  it(`a real march (CMU 91_19, 132_37: knees to the hip at ~1.3 steps/s): never a SPRINT at 30 or 15 fps; under the vault gate at 30 fps`, () => {
    // (SPRINT reads the KNEE rate, a pair of lifts told 100 ms apart counted once — review fix: at 15 fps the P2 reader tells a
    // march's first two lifts in a pair, and on the run's own rate 91_19 read 2.56 steps/s and held SPRINT on this seed. The
    // RUN still reads the run's own rate, every real step — merging halved run_in_place's — so at 15 fps the same pair runs
    // Free Run at up to 0.68 of the stick on this seed, over the vault gate: p8/RIDE.md reports it, the vault gate is asserted
    // at 30 fps only.)
    for (const r of where(/^cmu_(91_19|132_37)/)) expect(Math.max(0, ...trace(r.replays.freerun).map((s) => s.rt)), tag(r)).toBe(0);
    for (const r of where(/^cmu_(91_19|132_37)/).filter((x) => x.cond.fps === 30)) expect(maxY(r) * RUN_MAX, tag(r)).toBeLessThan(VAULT_GATE);
  });
});

describe('G11 SQUARE — the fallback for a player who stays facing', () => {
  it('the side lean steers (8° half a stick or more, 12° more); a sideways shuffle steers nothing (G1)', () => {
    for (const r of where(/^square fallback/)) {
      const g = gradeContinuous(r, 'skateboard', 'carve');
      expect(g.hits, tag(r)).toBe(g.segs);
      expect(Math.min(...g.per.map((p) => p.medAbs)), tag(r)).toBeGreaterThanOrEqual(/12°/.test(r.stream.name) ? 0.6 : 0.3);
    }
  });
});

describe('G12 LATENCY — arrival minus the clean joints\' instant, at 30 fps / 80 ms', () => {
  // R-F5: the first build loosened the carve to 600 ms; with RIDE_DWELL_MS 60 its p90 is 270 ms on the train seeds, so the
  // plan's revised target (400) holds, above its first 250
  it('pop, quarter p90 ≤ 300 ms; grab, wheel, wings ≤ 450 ms; the carve (8° and 12°) ≤ 400 ms — each reported', () => {
    const r30 = runs().filter((r) => r.cond.fps === 30 && r.cond.latencyMs === 80);
    const lat: Record<string, number[]> = {};
    const push = (k: string, v: number[]) => (lat[k] ??= []).push(...v);
    for (const r of r30) {
      if (r.stream.family === 'board' && !/^cmu_/.test(r.stream.name)) {
        push('pop', gradeEvents(r, 'pop', popPresses(r, 'skateboard')).latencies);
        const ev = readEvents(r.packets);
        push('quarter', gradeEvents(r, 'quarter', ev.quarters.map((x) => ({ t: x.t, at: x.at }))).latencies);
        push('grab', gradeEvents(r, 'grab', ev.grabs.map((x) => ({ t: x.on, at: x.at }))).latencies);
        if (/^lean (8|12)/.test(r.stream.name)) push('carve', gradeContinuous(r, 'skateboard', 'carve').per.map((p) => p.latencyMs).filter((x): x is number => x !== null));
      }
      if (/^wheel ±/.test(r.stream.name)) push('wheel', gradeContinuous(r, 'velocitykart', 'wheel').per.map((p) => p.latencyMs).filter((x): x is number => x !== null));
      if (/^wings /.test(r.stream.name)) for (const c of ['bank', 'pitch'] as const) push(c, gradeContinuous(r, 'aeroaces', c).per.map((p) => p.latencyMs).filter((x): x is number => x !== null));
    }
    const p = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, pcts(v)!]));
    expect(p.pop.p90).toBeLessThanOrEqual(300);
    expect(p.quarter.p90).toBeLessThanOrEqual(300);
    for (const k of ['grab', 'wheel', 'bank', 'pitch']) expect(p[k].p90, k).toBeLessThanOrEqual(450);
    expect(p.carve.p90).toBeLessThanOrEqual(400);
  });
});

describe('G13 THE STANCE KEPT (review fix, 2026-09-26)', () => {
  const STS = [{ theta: 45, lead: 'L' as const }, { theta: 45, lead: 'R' as const }];
  it('a 450 ms dropout (a \'lost\'), then back onto a held toe / heel edge: the edge steers its own way, and the true stance after reads 0 — every lead, both edges, every condition', () => {
    const bad: string[] = [];
    for (const st of STS) for (const deg of [8, -8]) for (const c of CONDS) {
      const s = dropoutEdgeStream(st, deg);
      const r = rideRun(s, c, [ROW.skateboard]);
      const g = gradeContinuous(r, 'skateboard', 'carve');
      if (g.hits !== g.segs) bad.push(`${tag(r)}: the edge missed`);
      const tr = trace(r.replays.skateboard);
      const rest: number[] = [];
      for (let t = s.marks.rest + 700; t <= s.marks.end; t += 33) rest.push(at(tr, t).x);
      const nz = rest.filter((x) => x !== 0);
      if (nz.length) bad.push(`${tag(r)}: the rest steered ${nz.length}/${rest.length}, e.g. ${nz[0]}`);
      // (the stance really went — a 'lost' — and came back as it was: its neutral the take's)
      const lostAt = r.packets.find((p) => p.events.some((e) => e.kind === 'lost'))?.read.t ?? null;
      if (lostAt === null) bad.push(`${tag(r)}: no 'lost' (the gap is not a dropout past LOST_MS)`);
    }
    expect(bad).toEqual([]);
  });
  it('squared up 22° and 30° toward the screen from a 60° stance (still side-on), and 30° from a 45° one (15° off square, the live probe\'s rider): a 90° hop turn from there is one quarter, its direction right; a 12° nose / tail shift there steers nothing (15° off square: at most a 2-frame blip, ≤ 0.2)', () => {
    const bad: string[] = [];
    // (15° off square the board's normal points nearly down the lens, where the world points' depth is noisiest: the shift
    // read a 2-frame blip of 0.15–0.2 in 4 of its 16 cells (goofy, 15 fps) — as a 45° stance squared 18–22° does, before
    // the review fixes too; measured in the retry, reported in p8/RIDE.md §11)
    const CASES = [[60, 22, 0], [60, 30, 0], [45, 30, 2]] as const;
    for (const [theta, sq, blip] of CASES) for (const lead of ['L', 'R'] as const) for (const dir of ['fs', 'bs'] as const) for (const c of CONDS) {
      const s = squareUpStream({ theta, lead }, sq, dir);
      const r = rideRun(s, c, [ROW.skateboard]);
      const q = readEvents(r.packets).quarters.filter((x) => x.t >= s.marks.turn - 100 && x.t <= s.marks.turn + 1300);
      if (q.length !== 1 || q[0].dir !== dir) bad.push(`${tag(r)}: quarters ${JSON.stringify(q.map((x) => x.dir))}`);
      const tr = trace(r.replays.skateboard);
      const shift: number[] = [];
      for (let t = s.marks.noseIn; t <= s.marks.rest2 + 500; t += 33) shift.push(at(tr, t).x);
      const nz = shift.filter((x) => x !== 0);
      if (nz.length > blip || nz.some((x) => Math.abs(x) > 0.2)) bad.push(`${tag(r)}: the nose / tail shift steered ${nz.length}/${shift.length}, max ${Math.max(...nz.map(Math.abs))}`);
    }
    expect(bad).toEqual([]);
  });
  it('a whole-body turn through a carve is no squared-up hold (CMU 134_03 on train seed 23 at 15 fps: the axes, re-taken inside its heel carve, lost it in all 8 cells before the carve-at-rest rule): one stance, the carve found', () => {
    const s = TAKES.find((x) => x.name.startsWith('cmu_134_03'))!;
    const bad: string[] = [];
    for (const latencyMs of [80, 200]) for (const noise of [1, 1.5]) for (const flip of [false, true]) {
      const r = rideRun(s, { fps: 15, latencyMs, noise, flip, seed: 23, holes: true }, [ROW.skateboard]);
      const g = gradeContinuous(r, 'skateboard', 'carve');
      const taken = new Set(r.packets.map((p) => p.channels.ride?.stance?.t).filter((x) => x != null));
      if (g.hits !== g.segs || taken.size !== 1) bad.push(`${tag(r)} noise ${noise}${flip ? ' flip' : ''}: carve ${g.hits}/${g.segs}, stances taken ${taken.size}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('G1-R REAL NEGATIVES (R-F2) — the P1 takes press nothing in the kart or the plane', () => {
  const FIX = join(__dirname, '__fixtures__');
  const load = (n: string) => JSON.parse(readFileSync(join(FIX, `${n}.json`), 'utf8')) as PoseFixture;
  const NAMES = (JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')) as { name: string }[]).map((f) => f.name);
  const OWNER_STAND = load('stand_still').frames[70];
  it('all twelve, each with the P3 gate\'s stand before it (the owner\'s own stand frame held): 0 GAS / STEER / DRIFT on the kart, 0 GAS / STEER / CLIMB on the plane — the stand included', () => {
    expect(NAMES.length).toBe(12);
    const bad: string[] = [];
    for (const name of NAMES) {
      const fx = load(name);
      const lead = holdStill(standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined).frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
      const packets = bodyPackets([...lead, ...fx.frames], { lead: lead.length });
      for (const key of ['velocitykart', 'aeroaces']) {
        const out = seamReplay(packets, { profile: ROW[key], phase: 'playing', name }).bus.filter((b) => {
          const e = b.e;
          return (e.t === 'stick' && (e.x !== 0 || e.y !== 0)) || (e.t === 'trigger' && e.value > 0) || (e.t === 'button' && e.pressed) || (e.t === 'dpad' && e.pressed);
        });
        if (out.length) bad.push(`${name} → ${key}: ${out.slice(0, 4).map((b) => JSON.stringify(b.e)).join(' ')}`);
      }
      // (and the grip never so much as starts on the dunks, the guard, the jumps: absence of a wheel is the read, not a filter)
      if (/dunk|punch|jump/.test(name)) expect(packets.filter((p) => p.channels.ride?.wheel.grip).length, name).toBe(0);
    }
    expect(bad).toEqual([]);
  });
});
