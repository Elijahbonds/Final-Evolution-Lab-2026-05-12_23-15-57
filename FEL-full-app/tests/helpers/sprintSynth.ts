// sprintSynth — synthetic sprinters with ground truth for the camera sprint timer (SPRINT-SPEED, 2026-10-25).
//
//   samozinoX       the model's distance from a standing start
//   lineSeq         a bare line-crossing sequence: signed distance d(t) = v (t − tc) + ½ a (t − tc)² + noise, sampled at
//                   a frame rate with a random phase and real (jittered) timestamps — the crossing core's bench
//   sideRun         a whole stick-figure sprinter filmed side-on by lib/pose/synth.ts's pinhole camera: 33 landmarks
//                   with rigid thigh and shank, a stride cycle, seeded image noise, frame timing jitter and drops. The
//                   truth (the start, the moment the torso point crosses a picture line) is read from the noise-free
//                   figure by bisection, so the test grades the reader against what the camera would really show
//   agilityRun      a 5-10-5 filmed square-on: turns with the outer foot reaching out, then back through the middle
//
// Test support (and the rig probe's synthetic feed). Pure, deterministic for a seed.
import { LANDMARK_COUNT, type Lm, type PoseFrame } from '@/lib/pose/landmarks';
import { makeCamera, mulberry32, project, type CameraSpec, type V3 } from '@/lib/pose/synth';

export const samozinoX = (u: number, vmax: number, tau: number): number => (u <= 0 ? 0 : vmax * (u + tau * Math.exp(-u / tau) - tau));
export const samozinoV = (u: number, vmax: number, tau: number): number => (u <= 0 ? 0 : vmax * (1 - Math.exp(-u / tau)));

export function gauss(rand: () => number): () => number {
  return () => {
    const u = Math.max(1e-12, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** A bare crossing: frames at `fps` around tc (ms), d in picture heights. */
export function lineSeq(o: { fps: number; tc: number; v: number; a?: number; sd?: number; jitterMs?: number; seed?: number; spanMs?: number }): { t: number; d: number }[] {
  const rand = mulberry32(o.seed ?? 1), n = gauss(rand);
  const dt = 1000 / o.fps, span = o.spanMs ?? 400;
  const phase = rand() * dt;
  const out: { t: number; d: number }[] = [];
  for (let t = o.tc - span + phase; t <= o.tc + span; t += dt) {
    const ts = t + (o.jitterMs ? n() * o.jitterMs : 0);
    // the TRUE position at the true capture time t; the timestamp carries jitter only when asked (a clock error)
    const u = (t - o.tc) / 1000;
    out.push({ t: ts, d: o.v * u + 0.5 * (o.a ?? 0) * u * u + (o.sd ? n() * o.sd : 0) });
  }
  return out;
}

// ── the stick figure ──

export interface FigureState { hipX: number; hipZ: number; phase: number; speed: number; facing: 1 | -1; lean: number; stance: 'run' | 'front' }

/** 33 world points (metres; y up) for a figure of height H. */
export function figure(s: FigureState, H: number, front?: { footOut?: { side: 1 | -1; m: number } }): V3[] {
  const P: V3[] = Array.from({ length: LANDMARK_COUNT }, () => [0, 0, 0]);
  const hipY = 0.53 * H, kneeY = 0.285 * H, ankY = 0.039 * H;
  const Lt = hipY - kneeY, Ls = kneeY - ankY;
  const shY = 0.818 * H, noseY = 0.94 * H;
  const f = s.facing;
  const set = (i: number, p: V3) => { P[i] = p; };
  if (s.stance === 'run') {
    const k = Math.min(1, s.speed / 6);
    const torsoX = s.hipX + f * s.lean * (shY - hipY);
    for (const [side, dz, ph] of [[0, 0.1, 0], [1, -0.1, Math.PI]] as const) {
      const a = s.phase + ph;
      const thigh = f * (0.15 + 0.55 * k) * Math.sin(a);
      const flex = (0.2 + 1.3 * k) * (0.5 + 0.5 * Math.sin(a + Math.PI / 2));
      const hip: V3 = [s.hipX, hipY, s.hipZ + dz];
      const knee: V3 = [hip[0] + Lt * Math.sin(thigh), hip[1] - Lt * Math.cos(thigh), hip[2]];
      const sh = thigh - f * flex;
      const ank: V3 = [knee[0] + Ls * Math.sin(sh), knee[1] - Ls * Math.cos(sh), hip[2]];
      const L = side === 0;
      set(L ? 23 : 24, hip); set(L ? 25 : 26, knee); set(L ? 27 : 28, ank);
      set(L ? 29 : 30, [ank[0] - f * 0.05, ank[1] - 0.03, hip[2]]);
      set(L ? 31 : 32, [ank[0] + f * 0.15, ank[1] - 0.04, hip[2]]);
      const shp: V3 = [torsoX, shY, s.hipZ + dz * 1.6];
      const arm = -f * 0.8 * k * Math.sin(a);
      const elb: V3 = [shp[0] + 0.3 * Math.sin(arm), shp[1] - 0.3 * Math.cos(arm), shp[2]];
      const wr: V3 = [elb[0] + f * 0.25 * Math.cos(arm), elb[1] + 0.1, shp[2]];
      set(L ? 11 : 12, shp); set(L ? 13 : 14, elb); set(L ? 15 : 16, wr);
      for (const i of L ? [17, 19, 21] : [18, 20, 22]) set(i, [wr[0] + f * 0.05, wr[1], wr[2]]);
    }
    const head: V3 = [torsoX + f * 0.08, noseY, s.hipZ];
    for (let i = 0; i <= 10; i++) set(i, [head[0] + (i === 0 ? f * 0.05 : 0), head[1] + (i > 0 && i < 7 ? 0.03 : i > 8 ? -0.05 : 0), head[2] + (i % 2 ? 0.05 : -0.05)]);
  } else {
    // square to the camera (+Z), moving along X: the subject's left on the image's right
    for (const [side, dx] of [[0, 0.15], [1, -0.15]] as const) {
      const L = side === 0;
      let footX = s.hipX + dx;
      if (front?.footOut && Math.sign(dx) === front.footOut.side) footX = s.hipX + front.footOut.side * front.footOut.m;
      const hip: V3 = [s.hipX + dx * 0.7, hipY, s.hipZ];
      const knee: V3 = [(hip[0] + footX) / 2, kneeY, s.hipZ + 0.05];
      const ank: V3 = [footX, ankY, s.hipZ];
      set(L ? 23 : 24, hip); set(L ? 25 : 26, knee); set(L ? 27 : 28, ank);
      set(L ? 29 : 30, [footX, ankY - 0.03, s.hipZ - 0.05]); set(L ? 31 : 32, [footX, ankY - 0.04, s.hipZ + 0.15]);
      const shp: V3 = [s.hipX + dx * 1.3, shY, s.hipZ];
      set(L ? 11 : 12, shp); set(L ? 13 : 14, [shp[0] + dx, shp[1] - 0.3, shp[2]]); set(L ? 15 : 16, [shp[0] + dx, shp[1] - 0.55, shp[2] + 0.1]);
      for (const i of L ? [17, 19, 21] : [18, 20, 22]) set(i, [shp[0] + dx, shp[1] - 0.6, shp[2] + 0.1]);
    }
    for (let i = 0; i <= 10; i++) set(i, [s.hipX + (i % 2 ? 0.04 : -0.04), noseY + (i > 0 && i < 7 ? 0.03 : 0), s.hipZ + 0.1]);
  }
  return P;
}

export interface FilmOptions {
  fps: number;
  camera?: Partial<CameraSpec>;
  /** Image noise σ, picture-width units (lib/pose/synth.ts DEFAULT_NOISE torso 0.002). */
  noise?: number;
  jitterMs?: number;
  dropP?: number;
  seed?: number;
}

/** Film a figure: state(tSeconds) → PoseFrames from t = fromS to toS, at `t0Ms` on the frames' clock. */
export function film(state: (t: number) => { s: FigureState; front?: Parameters<typeof figure>[2] }, H: number, fromS: number, toS: number, t0Ms: number, o: FilmOptions): { frames: PoseFrame[]; aspect: number; render: (t: number) => Lm[] } {
  const cam = makeCamera({ width: 1280, height: 720, hfovDeg: 66, distance: 6, heightM: 1.1, ...o.camera });
  const aspect = cam.spec.width / cam.spec.height;
  const rand = mulberry32(o.seed ?? 3), n = gauss(rand);
  const render = (t: number): Lm[] => {
    const st = state(t);
    return figure(st.s, H, st.front).map((p) => { const q = project(cam, p); return { x: q.x, y: q.y, z: 0, v: q.x < -0.02 || q.x > 1.02 ? 0.2 : 0.95 }; });
  };
  const frames: PoseFrame[] = [];
  const dt = 1 / o.fps;
  const phase = rand() * dt;
  for (let t = fromS + phase; t <= toS; t += dt) {
    if (o.dropP && rand() < o.dropP) continue;
    const img = render(t);
    const hipX = (img[23].x + img[24].x) / 2;
    const tMs = t0Ms + t * 1000 + (o.jitterMs ? n() * o.jitterMs : 0);
    if (hipX < -0.05 || hipX > 1.05) { frames.push({ t: tMs, present: false, image: [] }); continue; }
    const sd = o.noise ?? 0;
    frames.push({ t: tMs, present: true, image: img.map((l) => ({ ...l, x: l.x + (sd ? n() * sd : 0), y: l.y + (sd ? n() * sd * aspect : 0) })) });
  }
  return { frames, aspect, render };
}

/** The time (s) a continuous signal crosses zero in [lo, hi] (it must change sign there). */
export function bisect(f: (t: number) => number, lo: number, hi: number): number {
  let a = lo, b = hi, fa = f(a);
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** A sprinter from a standing start at t = 0 (s), at `startX` (m) running +X, Samozino speed. Before 0 they stand still. */
export function sprinter(o: { vmax: number; tau: number; startX: number; H?: number; facing?: 1 | -1; z?: number }) {
  const f = o.facing ?? 1;
  return (t: number) => {
    const u = Math.max(0, t);
    const x = o.startX + f * samozinoX(u, o.vmax, o.tau);
    const v = samozinoV(u, o.vmax, o.tau);
    // stride frequency rises with speed; the phase integrates it (≈ 1.2 → 2.3 Hz)
    const phase = 2 * Math.PI * (1.2 * u + (1.1 / o.vmax) * samozinoX(u, o.vmax, o.tau));
    return { s: { hipX: x, hipZ: o.z ?? 0, phase, speed: v, facing: f, lean: 0.25 * Math.exp(-u / o.tau), stance: 'run' as const } };
  };
}

/** A 5-10-5 run square to the camera: centre at x = 0, lines at ±4.572 m; `shortM` leaves turn `shortTurn` short. */
export function agilityRunState(o: { firstSide: 1 | -1; t1: number; t2: number; reach?: number; shortM?: number; shortTurn?: 1 | 2 }) {
  const L = 4.572, reach = o.reach ?? 0.55;
  const ext1 = o.firstSide * (L - reach - (o.shortTurn === 1 ? (o.shortM ?? 0) : 0));
  const ext2 = -o.firstSide * (L - reach - (o.shortTurn === 2 ? (o.shortM ?? 0) : 0));
  // rest to rest, hardest push at the start (a half cosine: displacement ∝ t² off the line, as a sprint start)
  const mj = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : (1 - Math.cos(Math.PI * u)) / 2);
  const t2End = o.t1 + o.t2;
  const pos = (t: number): number => {
    if (t <= 0) return 0;
    if (t <= o.t1) return ext1 * mj(t / o.t1);
    if (t <= t2End) return ext1 + (ext2 - ext1) * mj((t - o.t1) / o.t2);
    return ext2 - Math.sign(ext2) * samozinoX(t - t2End, 7, 0.55);
  };
  const footOut = (t: number): { side: 1 | -1; m: number } | undefined => {
    const near = (tt: number) => Math.abs(t - tt) < 0.18;
    if (near(o.t1)) return { side: o.firstSide, m: reach };
    if (near(t2End)) return { side: (-o.firstSide) as 1 | -1, m: reach };
    return undefined;
  };
  return {
    state: (t: number) => ({ s: { hipX: pos(t), hipZ: 0, phase: 0, speed: 0, facing: 1 as const, lean: 0, stance: 'front' as const }, front: { footOut: footOut(t) } }),
    /** The truth: when the hips come back through the centre (s). */
    finishS: () => bisect((t) => pos(t), t2End + 0.01, t2End + 3),
    turnsS: [o.t1, t2End] as const,
  };
}
