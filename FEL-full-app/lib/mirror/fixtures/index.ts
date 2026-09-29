// The Mirror's landmark fixtures as files (MIRROR-COACH P1 baseline, 2026-09-25) — the format, and the two frame
// shapes every Mirror consumer reads. Pure: no fs (load.ts reads them from disk for node).
//
// One file per fixture, lib/mirror/fixtures/<name>.json, written by `scripts/probes/_mirror-baseline.mts --write` from
// build.ts. Landmarks are stored as [x, y, z, visibility] rows in MediaPipe BlazePose order (lib/pose/landmarks.ts), x
// and y normalised to the 640×480 image with y DOWN, NOT mirrored: a subject facing the camera has their left shoulder
// on the image's RIGHT (x[11] > x[12]). Four decimals is 0.06 px at 640 wide; visibility keeps two.
import type { PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import type { PoseFrame as LibPoseFrame } from '@/lib/pose/landmarks';
import type { CameraSpec } from '@/lib/pose/synth';
import { FIXTURE_FORMAT, fixtureDef, filmFixture, FIXTURE_CAMERA, type FixturePattern, type FixtureTruth, type FixtureView } from './build';

export interface MirrorFixtureFrame {
  /** Capture time (ms) on the fixture's own clock, from 0. */
  t: number;
  present: boolean;
  /** 33 rows of [x, y, z, visibility] when present, else empty. */
  lm: number[][];
}

export interface MirrorFixture {
  format: typeof FIXTURE_FORMAT;
  name: string;
  pattern: FixturePattern;
  view: FixtureView;
  description: string;
  fps: number;
  camera: CameraSpec;
  /** What the body really did, from the 3-D joints (build.ts) — the grading key, never read from the image. */
  truth: FixtureTruth;
  frames: MirrorFixtureFrame[];
}

const round = (v: number, dp: number) => { const k = 10 ** dp; const r = Math.round(v * k) / k; return Object.is(r, -0) ? 0 : r; };

/** Build a fixture's file contents (what the probe writes). Deterministic. */
export function fixtureFile(name: string): MirrorFixture {
  const def = fixtureDef(name);
  const frames = filmFixture(name).map((f): MirrorFixtureFrame => ({
    t: round(f.t, 3),
    present: f.present,
    lm: f.present ? f.image.map((l) => [round(l.x, 4), round(l.y, 4), round(l.z, 4), round(l.v, 2)]) : [],
  }));
  return {
    format: FIXTURE_FORMAT, name: def.name, pattern: def.pattern, view: def.view, description: def.description,
    fps: def.clip().fps, camera: { ...FIXTURE_CAMERA }, truth: def.truth(), frames,
  };
}

/** The Mirror adapter's frame (what SquatAudit, the screen runner and the harness read). */
export function toAdapterFrames(fx: Pick<MirrorFixture, 'frames'>, t0 = 0): AdapterFrame[] {
  return fx.frames.map((f) => ({
    present: f.present, timestampMs: t0 + f.t,
    landmarks: f.lm.map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
  }));
}

/** lib/pose's frame (what movement play's detectors read). */
export function toPoseFrames(fx: Pick<MirrorFixture, 'frames'>, t0 = 0): LibPoseFrame[] {
  return fx.frames.map((f) => ({ t: t0 + f.t, present: f.present, image: f.lm.map(([x, y, z, v]) => ({ x, y, z, v })) }));
}

/** lib/pose frames (a jittered re-take from build.ts, say) → the adapter's frame. */
export function adapterFromPose(frames: readonly LibPoseFrame[], t0 = 0): AdapterFrame[] {
  return frames.map((f) => ({
    present: f.present, timestampMs: t0 + f.t,
    landmarks: f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })),
  }));
}

export { FIXTURES, FIXTURE_NAMES, fixtureDef, filmFixture, CLEAN_FILM } from './build';
export type { FixtureDef, FixturePattern, FixtureTruth, FixtureView } from './build';
