// session — one camera run as the page holds it (SPRINT-SPEED, 2026-10-25): the test and its taps, the frames as they
// arrive, the start, when the run is over, the read, and the record kept on the phone.
//
//   gate      one phone on the finish line: the Go (or first movement) → the body point across the tapped line
//   flying    two lines in one wide frame, a known distance apart
//   trace     the camera far and side-on: hips tracked, scaled from two markers (or the athlete's height), Samozino's fit
//   agility   the 5-10-5 from a wide view square to the cones (beta)
//
// Frames carry only what the reads use (t, present, the 33 image points); nothing here is sent or kept but the numbers.
//
// Pure (no camera, no DOM): components/sprint/sprint-runner.tsx feeds it PoseService's frames.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { bodyPoint, heightAxisScale, heightScale, markerScale, markerScaleSdPct, type BodyPointKind, type Line, type Pt } from './geometry';
import { readFlying, readGateRun, GATE_TIPS, type FrameLike, type GateFlag } from './timing';
import { readTrace, type TraceRead } from './trace';
import { readAgility, type AgilityCones, type Turn } from './agility';
import { detectOnset, type StartRead } from './start';
import { newRunId, type SprintRecord, type SprintTest } from './store';
import { mph } from './copy';

export type StartMode = 'go' | 'movement';

export type RunConfig =
  | { test: 'gate'; label: string; distanceM: number; start: StartMode; point: BodyPointKind; line: Line }
  | { test: 'flying'; label: string; distanceM: number; cameraM: number | null; point: BodyPointKind; first: Line; second: Line }
  | {
    test: 'trace'; label: string; start: StartMode | 'none';
    /** Two markers on the running line `markerM` apart (the first one the start line when `startAtOrigin`), or the athlete's height. */
    markers: [Pt, Pt] | null; markerM: number; startAtOrigin: boolean; statureM: number | null;
    /** Only for the F-V numbers in newtons and watts; never kept. */
    massKg: number | null;
  }
  | { test: 'agility'; label: string; start: StartMode; cones: AgilityCones };

export type RunResult =
  | {
    ok: true; test: SprintTest; label: string;
    timeS: number | null; sdS: number | null;
    startKind: 'go' | 'movement' | 'phone' | null; reactionIncluded: boolean;
    splits: { label: string; s: number }[];
    trace: Extract<TraceRead, { ok: true }> | null;
    turns: Turn[] | null;
    poseHz: number;
    tips: string[];
  }
  | { ok: false; why: string };

/** The most frames a run keeps (≈ 45 s at 60 fps): a run left armed does not grow without end. */
const MAX_FRAMES = 2700;

export class SprintSession {
  readonly frames: FrameLike[] = [];
  private from = -Infinity;
  private go: StartRead | null = null;

  constructor(readonly cfg: RunConfig, readonly aspect: number) {}

  /** Armed at `t` (ms, the frames' clock): only what happens from here is the run. */
  arm(t: number): void { this.from = t; this.frames.length = 0; this.go = null; }
  get armedAt(): number { return this.from; }

  /** The Go left the phone: its start read (lib/sprint/start.ts goStart). */
  setGo(read: StartRead): void { this.go = read; }
  get goRead(): StartRead | null { return this.go; }

  push(f: Pick<PoseFrame, 't' | 'present' | 'image'>): void {
    this.frames.push({ t: f.t, present: f.present, image: f.present ? f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.v })) : [] });
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
  }

  /** Is the run over (so the page can read it without a Stop tap)? Cheap reads only. */
  over(): boolean {
    const c = this.cfg;
    if (c.test === 'gate') { const r = this.readGate(); return r.ok; }
    if (c.test === 'flying') return readFlying({ frames: this.frames, aspect: this.aspect, first: c.first, second: c.second, point: c.point, distanceM: c.distanceM, cameraM: c.cameraM, from: this.from }).ok;
    if (c.test === 'agility') return readAgility({ frames: this.frames, aspect: this.aspect, cones: c.cones, from: this.from, start: this.go }).ok;
    // trace: the body was seen moving across, and has been out of the picture for 0.6 s
    const seen = this.frames.filter((f) => f.present);
    if (seen.length < 20) return false;
    const last = this.frames[this.frames.length - 1];
    return !last.present && last.t - seen[seen.length - 1].t > 600;
  }

  private readGate() {
    const c = this.cfg as Extract<RunConfig, { test: 'gate' }>;
    const start = c.start === 'go' ? (this.go ? { kind: 'go' as const, read: this.go } : null) : { kind: 'movement' as const };
    if (!start) return { ok: false as const, why: 'The Go has not sounded yet.' };
    return readGateRun({ frames: this.frames, aspect: this.aspect, line: c.line, point: c.point, start, from: this.from });
  }

  /** The run's read. */
  read(): RunResult {
    const c = this.cfg;
    if (c.test === 'gate') {
      const r = this.readGate();
      if (!r.ok) return r;
      return {
        ok: true, test: 'gate', label: c.label, timeS: r.timeS, sdS: r.sdS, startKind: r.start.kind, reactionIncluded: r.start.reactionIncluded,
        splits: [], trace: null, turns: null, poseHz: r.poseHz, tips: r.flags.map((f: GateFlag) => GATE_TIPS[f]),
      };
    }
    if (c.test === 'flying') {
      const r = readFlying({ frames: this.frames, aspect: this.aspect, first: c.first, second: c.second, point: c.point, distanceM: c.distanceM, cameraM: c.cameraM, from: this.from });
      if (!r.ok) return r;
      return {
        ok: true, test: 'flying', label: c.label, timeS: r.timeS, sdS: r.sdS, startKind: null, reactionIncluded: false,
        splits: [{ label: 'speed m/s', s: Math.round(r.speedMps * 100) / 100 }, { label: 'mph', s: mph(r.speedMps) }],
        trace: null, turns: null, poseHz: r.poseHz,
        tips: r.poseHz > 0 && r.poseHz < 55 ? [GATE_TIPS.lowFps] : [],
      };
    }
    if (c.test === 'agility') {
      const r = readAgility({ frames: this.frames, aspect: this.aspect, cones: c.cones, from: this.from, start: c.start === 'go' ? this.go : null });
      if (!r.ok) return { ok: false, why: r.why };
      return {
        ok: true, test: 'agility', label: c.label, timeS: r.timeS, sdS: r.sdS, startKind: r.start.kind, reactionIncluded: r.start.reactionIncluded,
        splits: [{ label: `${r.turns[0].side} line`, s: Math.round(r.splitsS[0] * 100) / 100 }, { label: `${r.turns[1].side} line`, s: Math.round(r.splitsS[1] * 100) / 100 }],
        trace: null, turns: r.turns, poseHz: r.poseHz, tips: [],
      };
    }
    // trace
    let scale, scaleSdPct: number;
    if (c.markers) {
      const s = markerScale(c.markers[0], c.markers[1], c.markerM, this.aspect);
      if (!s.ok) return s;
      scale = s.scale; scaleSdPct = markerScaleSdPct(s.scale);
    } else if (c.statureM) {
      const h = heightScale(this.frames, c.statureM, this.aspect);
      if (!h.ok) return h;
      scale = heightAxisScale(h.mPerUnit, this.aspect); scaleSdPct = h.sdPct;
    } else return { ok: false, why: 'Tap two markers, or type the athlete\'s height, to scale the run.' };
    // the start, on the samples' clock (seconds from the arming)
    let startS: number | null = null;
    let startRead: StartRead | null = null;
    if (c.start === 'go' && this.go) startRead = this.go;
    else if (c.start === 'movement') {
      const on = detectOnset(this.frames.map((f) => ({ t: f.t, p: bodyPoint(f, 'hips') })), this.aspect, this.from);
      if (on.ok) startRead = on;
    }
    const t0Ms = Number.isFinite(this.from) ? this.from : (this.frames[0]?.t ?? 0);
    if (startRead) startS = (startRead.t - t0Ms) / 1000;
    const r = readTrace({
      frames: this.frames.filter((f) => f.t >= t0Ms), scale, point: 'hips', t0Ms, startS, startAtOrigin: !!c.markers && c.startAtOrigin,
      body: { massKg: c.massKg, heightM: c.statureM }, scaleSdPct,
    });
    if (!r.ok) return r;
    return {
      ok: true, test: 'trace', label: c.label, timeS: null, sdS: null, startKind: startRead?.kind ?? null, reactionIncluded: !!startRead?.reactionIncluded,
      splits: r.splits.map((s) => ({ label: `${s.m} m`, s: s.s })), trace: r, turns: null, poseHz: r.poseHz,
      tips: r.model ? [] : ['Only steady running was in view, so this is the top speed alone. To get the speed curve and the profile, have the start inside the picture.'],
    };
  }
}

/** A read as the record kept on the phone (numbers only). */
export function toRecord(r: Extract<RunResult, { ok: true }>, cfg: RunConfig, at: Date = new Date(), id: string = newRunId()): SprintRecord {
  const m = r.trace?.model ?? null;
  return {
    v: 1, id, at: at.toISOString(), test: r.test, label: r.label,
    distanceM: cfg.test === 'gate' || cfg.test === 'flying' ? cfg.distanceM : cfg.test === 'agility' ? 18.288 : null,
    timeS: r.timeS, sdS: r.sdS, startKind: r.startKind, reactionIncluded: r.reactionIncluded,
    splits: r.test === 'flying' ? [] : r.splits,
    topSpeed: r.trace?.topSpeed ?? (r.test === 'flying' && r.timeS ? cfg.test === 'flying' ? cfg.distanceM / r.timeS : null : null),
    topSpeedSd: r.trace?.topSpeedSd ?? (r.test === 'flying' && r.timeS && r.sdS && cfg.test === 'flying' ? (cfg.distanceM / r.timeS) * (r.sdS / r.timeS) : null),
    vmax: m?.vmax ?? null, vmaxSd: m?.vmaxSd ?? null, tau: m?.tau ?? null,
    f0PerKg: r.trace?.profile?.f0PerKg ?? null, pmaxPerKg: r.trace?.profile?.pmaxPerKg ?? null,
    poseHz: r.poseHz, method: 'camera',
  };
}
