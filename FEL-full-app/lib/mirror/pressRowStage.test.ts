// The press/row's faults reach the coach (MIRROR-COACH P9, 2026-09-30).
//
// Before P9 the cue engine's elbowFlare, shrug and trunkOffset cards could never fire: only the squat fed decide(). These
// tests hold the pure step (lib/mirror/pressRowStage.ts) on its own, and then the whole path the harness runs — the REAL
// KinematicEngine reading synthetic landmark frames, the REAL RepCounter counting its phases, stepPressRowCues, and the
// production CueEngine — so "press/row faults produce cues" is measured end to end, not asserted from the mapping.
// The geometry is synthetic (a 2-D stick arm), not a recording: it proves the wiring and the gates, not the thresholds.
import { describe, expect, it } from 'vitest';
import {
  PRESS_ROW_FAULTS, PRESS_ROW_FAULT_LABEL, PRESS_ROW_FAULT_ZONE, PRESS_ROW_PERSIST_FRAMES,
  initialPressRowCues, pressRowFrameFaults, stepPressRowCues, type PressRowCueState, type PressRowFault,
} from './pressRowStage';
import { CUES, CueEngine, FAULT_PRIORITY, fadeReviewLines, type CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { KinematicEngine, type MovementPhase } from '@/lib/babylon/nexus/neuro-mirror/rules/kinematic-engine';
import { RepCounter } from '@/lib/babylon/nexus/neuro-mirror/rules/rep-counter';
import { DEFAULT_THRESHOLDS, type ZoneState } from '@/lib/babylon/nexus/neuro-mirror/rules/config';
import { PATTERN_ZONES, type ZoneId } from '@/lib/babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import type { PoseFrame, PoseLandmark } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { DEFAULT_NOISE, mulberry32 } from '@/lib/pose/synth';

const zonesWith = (over: Partial<Record<ZoneId, ZoneState>> = {}): Record<ZoneId, ZoneState> =>
  ({ posterior_chain: 'stable', lat_rhomboid: 'stable', upper_traps: 'stable', rib_thoracic: 'stable', lumbo_pelvic: 'stable', ...over });

describe('the mapping: a zone\'s fault state, nothing weaker', () => {
  it('each press/row fault is one zone\'s fault state, in the cue engine\'s priority order', () => {
    expect(PRESS_ROW_FAULT_ZONE).toEqual({ elbowFlare: 'posterior_chain', shrug: 'upper_traps', trunkOffset: 'rib_thoracic' });
    expect(PRESS_ROW_FAULTS).toEqual(FAULT_PRIORITY.filter((f) => (PRESS_ROW_FAULTS as readonly string[]).includes(f)));
    for (const f of PRESS_ROW_FAULTS) expect(CUES[f].cue.length).toBeGreaterThan(0);
    expect(pressRowFrameFaults(zonesWith({ posterior_chain: 'fault', upper_traps: 'fault' }))).toEqual(['elbowFlare', 'shrug']);
    expect(pressRowFrameFaults(zonesWith({ posterior_chain: 'fault', rib_thoracic: 'fault' }))).toEqual(['elbowFlare', 'trunkOffset']);
    // (a shrug on a lean frame is the lean — P9 fix, tested below)
  });

  it('a warning (drift) or an unavailable read is never a fault; lumbo_pelvic is the same read as rib_thoracic, not a second fault', () => {
    expect(pressRowFrameFaults(zonesWith({ posterior_chain: 'warning', upper_traps: 'warning', rib_thoracic: 'warning' }))).toEqual([]);
    expect(pressRowFrameFaults(zonesWith({ posterior_chain: 'unavailable', lat_rhomboid: 'fault', lumbo_pelvic: 'fault' }))).toEqual([]);
  });

  it('the labels say "working" — the engine reads one arm — and claim no muscle', () => {
    for (const f of ['elbowFlare', 'shrug'] as PressRowFault[]) expect(PRESS_ROW_FAULT_LABEL[f]).toMatch(/^Working /);
    for (const l of Object.values(PRESS_ROW_FAULT_LABEL)) expect(l).not.toMatch(/\blats?\b|\btraps?\b|rhomboid|muscle|rib|injur|risk/i);
  });
});

describe('the step: gates, reps, repeats', () => {
  const frame = (nowMs: number, over: Partial<Parameters<typeof stepPressRowCues>[1]> = {}) =>
    ({ nowMs, present: true, phase: 'pull' as MovementPhase, zones: zonesWith({ posterior_chain: 'fault' }), reps: 0, ...over });
  const run = (inputs: ReturnType<typeof frame>[], s: PressRowCueState = initialPressRowCues()) => {
    const steps = [];
    for (const i of inputs) { const st = stepPressRowCues(s, i); s = st.state; steps.push(st); }
    return { steps, state: s };
  };

  it(`a fault must hold ${PRESS_ROW_PERSIST_FRAMES} camera frames in a row before it is handed to the coach`, () => {
    // (P9 fix: a frame with a body after the first pull is handed over — [] while the fault is still under the gate)
    const { steps } = run([frame(0), frame(33), frame(66), frame(100)]);
    expect(steps.map((s) => s.cueFaults)).toEqual([[], [], ['elbowFlare'], ['elbowFlare']]);
    // a one-frame blip, then clean: never a fault
    const blip = run([frame(0), frame(33, { zones: zonesWith() }), frame(66), frame(100, { zones: zonesWith() })]);
    expect(blip.steps.every((s) => s.cueFaults !== null && s.cueFaults.length === 0)).toBe(true);
  });

  it('nothing is cued before the first pull (walking in, picking up the handle)', () => {
    const { steps, state } = run([0, 33, 66, 100, 133].map((t) => frame(t, { phase: 'hold' })));
    expect(steps.every((s) => s.cueFaults === null)).toBe(true);
    expect(state.started).toBe(false);
    // the first pull frame starts it — the fault's run was already counting
    const on = stepPressRowCues(state, frame(166));
    expect(on.state.started).toBe(true);
    expect(on.cueFaults).toEqual(['elbowFlare']);
  });

  it('a body out of frame reads no fault and breaks the run', () => {
    const { steps } = run([frame(0), frame(33), frame(66, { present: false }), frame(100), frame(133)]);
    // no fault reaches the coach (the run restarts after the gap); nobody in frame is null, not a clean []
    expect(steps.map((s) => s.cueFaults)).toEqual([[], [], null, [], []]);
  });

  it('a rise in the compositor\'s rep count closes the rep with the faults it showed (this frame included); a clean rep closes with []', () => {
    const faulty = run([frame(0), frame(33), frame(66), frame(100, { reps: 1 })]);
    expect(faulty.steps[3].repFaults).toEqual(['elbowFlare']);
    expect(faulty.state.repFaults).toEqual([]);
    const clean = run([frame(0, { zones: zonesWith() }), frame(33, { zones: zonesWith(), reps: 1 })]);
    expect(clean.steps[1].repFaults).toEqual([]);
    // a fall is a new session's counter: nothing closes
    const fresh = stepPressRowCues({ ...initialPressRowCues(), reps: 5, repFaults: ['shrug'] }, frame(0, { reps: 0, zones: zonesWith() }));
    expect(fresh.repFaults).toBeNull();
    expect(fresh.state.repFaults).toEqual([]);
  });

  it('a repeated camera frame changes nothing and asks for nothing; the same input twice gives the same step (pure)', () => {
    const { state } = run([frame(0), frame(33), frame(66)]);
    const again = stepPressRowCues(state, frame(66));
    expect(again).toEqual({ state, cueFaults: null, repFaults: null });
    const a = stepPressRowCues(state, frame(100, { reps: 1 }));
    const b = stepPressRowCues(state, frame(100, { reps: 1 }));
    expect(a).toEqual(b);
    expect(state.repFaults).toEqual(['elbowFlare']);                // prev untouched
  });
});

// ── end to end: landmarks → KinematicEngine → RepCounter → stepPressRowCues → CueEngine ──────────────────────────────
//
// A front-view body: shoulders at y 0.35, hips at y 0.60 (torso 0.25 of the frame), the right arm (the one the engine
// reads) swinging through a rep — extended (170°) → pulled (90°) → pressed back out — at 30 fps. Three shapes put one
// fault each past the engine's FAULT line (config.ts DEFAULT_THRESHOLDS); the clean shape stays inside every line.
// MIRROR-COACH P9 fix (2026-09-30): the near-threshold shapes sit at 80 % of each fault line (config.ts DEFAULT_THRESHOLDS)
// — the elbow at a flare ratio of 0.256 (line 0.32), the working shoulder 12° up (line 15°), the shoulders 0.196 of the
// torso off the hips (line 0.25); `trunkTiltDeg` rotates everything above the hips about the hip midpoint (a real side
// lean: the shoulder line tilts with it), and `cameraRollDeg` rotates the whole body about the frame's centre (a phone
// propped a little crooked).
type Shape = {
  flare?: boolean; shrug?: boolean; lean?: boolean;
  nearFlare?: boolean; nearShrug?: boolean; nearLean?: boolean;
  trunkTiltDeg?: number; cameraRollDeg?: number;
};
const FPS_MS = 1000 / 30;

function rotate(lm: PoseLandmark[], idx: readonly number[], deg: number, c: { x: number; y: number }) {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  for (const i of idx) {
    const dx = lm[i].x - c.x, dy = lm[i].y - c.y;
    lm[i] = { ...lm[i], x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  }
}

function landmarks(elbowDeg: number, s: Shape): PoseLandmark[] {
  const lm: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const dx = s.lean ? 0.08 : s.nearLean ? 0.05 : 0;               // shoulders shifted sideways off the hips
  const ls = { x: 0.6 + dx, y: 0.35 };
  // the working shoulder riding up (16.7° on a 0.1 half-width), or 12° (80 % of the 15° line)
  const rs = { x: 0.4 + dx, y: s.shrug ? 0.29 : s.nearShrug ? 0.35 - 2 * 0.1 * Math.tan((12 * Math.PI) / 180) : 0.35 };
  // the elbow: below and outside the shoulder, or raised above the shoulder line (the flare read)
  const re = s.flare ? { x: rs.x - 0.1, y: rs.y - 0.09 } : s.nearFlare ? { x: rs.x - 0.1, y: rs.y - 0.256 * 0.25 } : { x: rs.x - 0.04, y: rs.y + 0.12 };
  // the wrist: the shoulder→elbow line turned by the elbow angle about the elbow, forearm 0.11 long
  const ux = (rs.x - re.x), uy = (rs.y - re.y), n = Math.hypot(ux, uy);
  const a = (elbowDeg * Math.PI) / 180;
  const wx = re.x + 0.11 * ((ux / n) * Math.cos(a) - (uy / n) * Math.sin(a));
  const wy = re.y + 0.11 * ((ux / n) * Math.sin(a) + (uy / n) * Math.cos(a));
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 1 }; };
  set(11, ls.x, ls.y); set(12, rs.x, rs.y);
  set(13, ls.x + 0.04, ls.y + 0.12); set(15, ls.x + 0.05, ls.y + 0.23);
  set(14, re.x, re.y); set(16, wx, wy);
  set(23, 0.57, 0.6); set(24, 0.43, 0.6);
  if (s.trunkTiltDeg) rotate(lm, [11, 12, 13, 14, 15, 16], s.trunkTiltDeg, { x: 0.5, y: 0.6 });
  if (s.cameraRollDeg) rotate(lm, [11, 12, 13, 14, 15, 16, 23, 24], s.cameraRollDeg, { x: 0.5, y: 0.5 });
  return lm;
}

/**
 * lib/pose/synth.ts's DEFAULT_NOISE landmark jitter (MediaPipe lite at 640×480, its estimate): σ 0.002 of the image
 * width on the torso, 0.004 on the limbs, y scaled to the 4:3 frame. Seeded, so a failure names its seed.
 */
function jitter(seed: number) {
  const rand = mulberry32(seed);
  const gauss = () => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const TORSO = new Set([11, 12, 23, 24]);
  return (lm: PoseLandmark[]) => lm.map((p, i) => {
    const sd = TORSO.has(i) ? DEFAULT_NOISE.imageTorso : DEFAULT_NOISE.imageLimb;
    return { ...p, x: p.x + gauss() * sd, y: p.y + gauss() * sd * (640 / 480) };
  });
}

/** The elbow angle over one rep: hold out, pull in, hold, press out, hold (seconds). */
function repAngles(): number[] {
  const out: number[] = [];
  const seg = (sec: number, from: number, to: number) => {
    const n = Math.round((sec * 1000) / FPS_MS);
    for (let i = 0; i < n; i++) out.push(from + ((to - from) * i) / n);
  };
  seg(0.6, 170, 170); seg(1.0, 170, 90); seg(0.3, 90, 90); seg(1.0, 90, 170); seg(0.6, 170, 170);
  return out;
}

/** Films `reps` reps of one shape. A set filmed in parts passes the last part's `endMs` on as `startMs` (one clock). */
function filmSet(shape: Shape, reps: number, ce = new CueEngine({ clearByRep: true }), seed: number | null = null, startMs = 1_000) {
  const kin = new KinematicEngine(DEFAULT_THRESHOLDS);
  const counter = new RepCounter();
  const noise = seed === null ? (lm: PoseLandmark[]) => lm : jitter(seed);
  let st = initialPressRowCues();
  let t = startMs;
  const spoken: CueEvent[] = [];
  const repBook: PressRowFault[][] = [];
  for (let r = 0; r < reps; r++) {
    for (const deg of repAngles()) {
      const frame: PoseFrame = { landmarks: noise(landmarks(deg, shape)), timestampMs: t, present: true };
      const res = kin.evaluate(frame);
      counter.feed(res.phase, t);
      const zones = {} as Record<ZoneId, ZoneState>;
      for (const z of PATTERN_ZONES) zones[z] = res.zones[z].state;
      // the harness's order: this frame's cue, then the rep it closed
      const step = stepPressRowCues(st, { nowMs: t, present: true, phase: res.phase, zones, reps: counter.state.reps });
      st = step.state;
      if (step.cueFaults) { const evt = ce.decide(t, step.cueFaults); if (evt) spoken.push(evt); }
      if (step.repFaults) { ce.endRep(step.repFaults); repBook.push(step.repFaults); }
      t += FPS_MS;
    }
  }
  return { spoken, repBook, reps: counter.state.reps, ce, endMs: t };
}

describe('end to end: the real kinematic engine\'s reads become the coach\'s cues', () => {
  it('a clean press/row: reps counted, no fault read, nothing said (the control)', () => {
    const r = filmSet({}, 4);
    expect(r.reps).toBe(4);
    expect(r.repBook).toEqual([[], [], [], []]);
    expect(r.spoken).toEqual([]);
  });

  it('the elbow rising past the shoulder line → the elbowFlare card, in its external words', () => {
    const r = filmSet({ flare: true }, 3);
    expect(r.reps).toBe(3);
    expect(r.repBook.every((rep) => rep.includes('elbowFlare'))).toBe(true);
    expect(r.spoken[0]).toEqual({ fault: 'elbowFlare', text: CUES.elbowFlare.cue, level: 'cue' });
    expect(r.spoken[0].text).toMatch(/handle/);
  });

  it('the working shoulder riding up on the pull → the shrug card (read in the pull only)', () => {
    const r = filmSet({ shrug: true }, 3);
    expect(r.repBook.every((rep) => rep.includes('shrug'))).toBe(true);
    expect(r.spoken.some((e) => e.fault === 'shrug' && e.text === CUES.shrug.cue)).toBe(true);
  });

  it('the shoulders drifting sideways off the hips → the trunkOffset card', () => {
    const r = filmSet({ lean: true }, 3);
    expect(r.repBook.every((rep) => rep.includes('trunkOffset'))).toBe(true);
    expect(r.spoken[0]).toMatchObject({ fault: 'trunkOffset', level: 'cue' });
  });

  it('two at once on one frame: the elbow (higher priority) gets the voice; filmed, both are cued in the set', () => {
    const both = zonesWith({ posterior_chain: 'fault', rib_thoracic: 'fault' });
    let st = initialPressRowCues();
    let handed: PressRowFault[] | null = null;
    for (const t of [0, 33, 66]) { const step = stepPressRowCues(st, { nowMs: t, present: true, phase: 'pull', zones: both, reps: 0 }); st = step.state; handed = step.cueFaults; }
    expect(handed).toEqual(['elbowFlare', 'trunkOffset']);
    expect(new CueEngine().decide(66, handed!)?.fault).toBe('elbowFlare');
    // filmed, the sideways lean reads from the first frame and the flare only once the elbow is in its band, so the trunk
    // is cued first and the elbow pre-empts it (cue-engine.ts: a higher-priority fault is not held down by a lower one)
    const r = filmSet({ flare: true, lean: true }, 2);
    expect(new Set(r.spoken.map((e) => e.fault))).toEqual(new Set(['elbowFlare', 'trunkOffset']));
  });

  it('the press/row fades like the squat: a set that fixed the elbow is followed by a quieter one', () => {
    // set 1: the elbow flares on the first rep only, then 4 clean reps — it landed
    const ce2 = new CueEngine({ clearByRep: true });
    const s1a = filmSet({ flare: true }, 1, ce2);
    const s1b = filmSet({}, 4, ce2, null, s1a.endMs);
    expect(s1a.spoken[0]?.fault).toBe('elbowFlare');
    // MIRROR-COACH P9 fix: the coach now SEES the clean reps (clean frames are handed over as []), so the fixed elbow
    // gets its one confirmation — and nothing else is said
    expect(s1b.spoken).toEqual([{ fault: 'elbowFlare', text: 'There it is. Own it.', level: 'confirm' }]);
    const report = ce2.endSet();
    expect(report.faults.find((f) => f.fault === 'elbowFlare')).toMatchObject({ landed: true, next: 'everyThird' });
    expect(fadeReviewLines(report, (f) => PRESS_ROW_FAULT_LABEL[f as PressRowFault] ?? f))
      .toEqual(['Fixed and kept: working elbow rising toward shoulder height stayed away for the last 3+ reps. Next set it gets a cue every third time it shows.']);
    // set 2: one flared rep is the first to show it at every third — the coach lets it go
    ce2.reset();
    const s2 = filmSet({ flare: true }, 1, ce2, null, s1b.endMs + 30_000);
    expect(s2.spoken).toEqual([]);
    expect(ce2.levelOf('elbowFlare')).toBe('everyThird');
  });
});

// ── MIRROR-COACH P9 FIX (2026-09-30, code review): the press/row cues under LANDMARK JITTER ─────────────────────────────
//
// The review: the press/row spoke on thresholds its config calls placeholders, proven only on noise-free stick frames
// with every fault far past its line; the knee cue waited for a jittered proof (cue-engine.test.ts) and this had none.
// These film each shape through the real KinematicEngine → RepCounter → stepPressRowCues → CueEngine with
// lib/pose/synth.ts's DEFAULT_NOISE jitter, over SEEDS seeds. PRESS_ROW_CUE_VERIFIED (cue-engine.ts) stands on them.
/** Noise-free reads: `held` — ten frames still at 120° (the smoothed angle settles in band); `pulling` — the elbow
 *  closing 160° → 110° over ten frames, read on the last (the pull phase, where the shrug is read). */
function held(shape: Shape) {
  const kin = new KinematicEngine(DEFAULT_THRESHOLDS);
  let r = kin.evaluate({ landmarks: landmarks(120, shape), timestampMs: 0, present: true });
  for (let i = 1; i <= 10; i++) r = kin.evaluate({ landmarks: landmarks(120, shape), timestampMs: i * FPS_MS, present: true });
  return r;
}
function pulling(shape: Shape) {
  const kin = new KinematicEngine(DEFAULT_THRESHOLDS);
  let r = kin.evaluate({ landmarks: landmarks(160, shape), timestampMs: 0, present: true });
  for (let i = 1; i <= 10; i++) r = kin.evaluate({ landmarks: landmarks(160 - i * 5, shape), timestampMs: i * FPS_MS, present: true });
  return r;
}

describe('under landmark jitter (lib/pose/synth.ts DEFAULT_NOISE), over many seeds', () => {
  const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7);
  const saidAcross = (shape: Shape, reps = 4) => {
    const out: { seed: number; said: CueEvent[] }[] = [];
    for (const seed of SEEDS) out.push({ seed, said: filmSet(shape, reps, new CueEngine({ clearByRep: true }), seed).spoken });
    return out;
  };
  const cuesOnly = (said: CueEvent[]) => said.filter((e) => e.level !== 'confirm');

  it('the control: a clean set under jitter says nothing, on every seed', () => {
    for (const { seed, said } of saidAcross({})) expect(said, `seed ${seed}`).toEqual([]);
  });

  it.each([
    ['the elbow at 80 % of the flare line', { nearFlare: true }],
    ['the working shoulder 12° up (the shrug line is 15°)', { nearShrug: true }],
    ['the shoulders 0.196 of the torso off the hips (the lean line is 0.25)', { nearLean: true }],
    ['all three at 80 % at once', { nearFlare: true, nearShrug: true, nearLean: true }],
    ['a phone propped 5° crooked (the whole body rolled)', { cameraRollDeg: 5 }],
  ] as [string, Shape][])('just inside the line — %s — says nothing, on every seed', (_label, shape) => {
    for (const { seed, said } of saidAcross(shape)) expect(said, `seed ${seed}`).toEqual([]);
  });

  it.each([
    ['elbowFlare', { flare: true }],
    ['shrug', { shrug: true }],
    ['trunkOffset', { lean: true }],
  ] as [PressRowFault, Shape][])('past the line, %s is still cued under the same jitter, on every seed', (fault, shape) => {
    for (const { seed, said } of saidAcross(shape, 3)) expect(cuesOnly(said).some((e) => e.fault === fault), `seed ${seed}`).toBe(true);
  });

  it('the near-threshold shapes really are near: noise-free, each reads the WARNING on its zone (drift), never the fault', () => {
    expect(held({ nearLean: true }).zones.rib_thoracic.state).toBe('warning');
    const flare = held({ nearFlare: true });
    expect(flare.zones.posterior_chain).toEqual({ state: 'warning', note: 'Estimated elbow flare rising' });   // in band: the flare's own warning
    const pull = pulling({ nearShrug: true });
    expect(pull.phase).toBe('pull');
    expect(pull.zones.upper_traps.state).toBe('warning');
    // …and the full shapes read the fault, so "near" is measured against a line the same geometry does cross
    expect(held({ lean: true }).zones.rib_thoracic.state).toBe('fault');
    expect(held({ flare: true }).zones.posterior_chain.state).toBe('fault');
    expect(pulling({ shrug: true }).zones.upper_traps.state).toBe('fault');
  });
});

describe('a side lean is cued as the lean, not a shrug (P9 fix: pressRowFrameFaults)', () => {
  it('the geometry: a 16° whole-trunk lean reads the shrug line AND the lean line on the same pull frame', () => {
    const r = pulling({ trunkTiltDeg: 16 });
    expect(r.phase).toBe('pull');
    expect(r.zones.upper_traps.state).toBe('fault');         // the raw read: the tilted shoulder line
    expect(r.zones.rib_thoracic.state).toBe('fault');
    const zones = {} as Record<ZoneId, ZoneState>;
    for (const z of PATTERN_ZONES) zones[z] = r.zones[z].state;
    expect(pressRowFrameFaults(zones)).toEqual(['trunkOffset']);
  });

  it.each([15, 16, 18])('filmed at %i° (and under jitter): the lean card, never the shrug card', (deg) => {
    const clean = filmSet({ trunkTiltDeg: deg }, 3);
    expect(clean.spoken[0]).toMatchObject({ fault: 'trunkOffset', level: 'cue' });
    expect(clean.spoken.some((e) => e.fault === 'shrug')).toBe(false);
    for (const seed of [11, 12, 13, 14, 15]) {
      const r = filmSet({ trunkTiltDeg: deg }, 3, new CueEngine({ clearByRep: true }), seed);
      expect(r.spoken.some((e) => e.fault === 'shrug'), `seed ${seed}`).toBe(false);
      expect(r.spoken.some((e) => e.fault === 'trunkOffset'), `seed ${seed}`).toBe(true);
    }
  });

  it('a shrug with no lean is still a shrug; a lean frame drops only the shrug', () => {
    expect(pressRowFrameFaults(zonesWith({ upper_traps: 'fault' }))).toEqual(['shrug']);
    expect(pressRowFrameFaults(zonesWith({ upper_traps: 'fault', rib_thoracic: 'warning' }))).toEqual(['shrug']);
    expect(pressRowFrameFaults(zonesWith({ posterior_chain: 'fault', upper_traps: 'fault', rib_thoracic: 'fault' }))).toEqual(['elbowFlare', 'trunkOffset']);
  });
});

describe('the coach sees clean frames (P9 fix): a fixed fault is confirmed, and a return is a fresh cue', () => {
  it('clean frames after the first pull are handed over as [] — before it, or with nobody in frame, null', () => {
    const clean = zonesWith();
    const pre = stepPressRowCues(initialPressRowCues(), { nowMs: 0, present: true, phase: 'hold', zones: clean, reps: 0 });
    expect(pre.cueFaults).toBeNull();
    const on = stepPressRowCues(pre.state, { nowMs: 33, present: true, phase: 'pull', zones: clean, reps: 0 });
    expect(on.cueFaults).toEqual([]);
    const away = stepPressRowCues(on.state, { nowMs: 66, present: false, phase: 'hold', zones: clean, reps: 0 });
    expect(away.cueFaults).toBeNull();
  });

  it('elbow flare on rep 1, three clean reps, flare again on rep 5: a CUE (it was "Stronger:" from the first onset)', () => {
    const ce = new CueEngine({ clearByRep: true });
    const a = filmSet({ flare: true }, 1, ce);
    const b = filmSet({}, 3, ce, null, a.endMs);
    const c = filmSet({ flare: true }, 1, ce, null, b.endMs);
    expect(a.spoken).toEqual([{ fault: 'elbowFlare', text: CUES.elbowFlare.cue, level: 'cue' }]);
    expect(b.spoken).toEqual([{ fault: 'elbowFlare', text: 'There it is. Own it.', level: 'confirm' }]);
    expect(c.spoken[0]).toMatchObject({ fault: 'elbowFlare', level: 'cue' });
    expect([...a.spoken, ...b.spoken, ...c.spoken].some((e) => e.level === 'escalate' || e.level === 'regress')).toBe(false);
  });

  it('flare for a rep, twenty seconds of clean reps, flare again: the base cue, then escalation only if it SURVIVES', () => {
    const ce = new CueEngine({ clearByRep: true });
    const first = filmSet({ flare: true }, 1, ce);
    const clean = filmSet({}, 6, ce, null, first.endMs);       // ~21 s clean
    const back = filmSet({ flare: true }, 6, ce, null, clean.endMs);   // and it stays for ~21 s
    expect(back.spoken[0]).toMatchObject({ level: 'cue' });
    expect(back.spoken.map((e) => e.level)).toContain('escalate');   // surviving the repeat window still escalates
  });

  it('the old wiring, for the record: null on clean frames and a frame-timed engine escalated the returning flare', () => {
    // the pre-fix harness: decide() only on fault frames, no endRep clearance
    const ce = new CueEngine();
    const kin = new KinematicEngine(DEFAULT_THRESHOLDS);
    const counter = new RepCounter();
    let st = initialPressRowCues();
    let t = 1_000;
    const said: CueEvent[] = [];
    const shapes: Shape[] = [{ flare: true }, {}, {}, {}, {}, {}, {}, { flare: true }];
    for (const shape of shapes) {
      for (const deg of repAngles()) {
        const res = kin.evaluate({ landmarks: landmarks(deg, shape), timestampMs: t, present: true });
        counter.feed(res.phase, t);
        const zones = {} as Record<ZoneId, ZoneState>;
        for (const z of PATTERN_ZONES) zones[z] = res.zones[z].state;
        const step = stepPressRowCues(st, { nowMs: t, present: true, phase: res.phase, zones, reps: counter.state.reps });
        st = step.state;
        if (step.cueFaults?.length) { const e = ce.decide(t, step.cueFaults); if (e) said.push(e); }
        t += FPS_MS;
      }
    }
    expect(said.map((e) => e.level)).toEqual(['cue', 'escalate']);
  });
});
