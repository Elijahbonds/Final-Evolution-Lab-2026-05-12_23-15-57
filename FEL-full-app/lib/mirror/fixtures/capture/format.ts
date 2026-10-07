// The owner-led capture, as fixtures (MIRROR PHASE 3, lane/capture, 2026-10-07).
//
// IN: the file /dev/pose-record downloads in its "Mirror capture" set: `fel-pose-takes/1`, origin 'owner-capture',
// child false, a capture block (alias, phone, adult, consent; lib/pose/captureProtocol.ts) and one take per protocol
// step, each a list of lib/pose PoseFrames. OUT: one fixture per session (person × phone), `fel-mirror-capture/1`,
// the frames as the Mirror's fixture rows ([x, y, z, visibility], lib/mirror/fixtures/index.ts), world points kept only
// where a grader reads them (the stand and the jump), and nothing free-form: the owner's notes, the clock times of day
// and the full user agent are not carried over. A file that is not numbers only, not adults only, not consented, or
// names a take the protocol does not have, is refused whole with its reasons.
//
// Pure: objects in, objects out (scripts/mirror-capture.ts does the reading and writing).
import type { PoseFrame } from '@/lib/pose/landmarks';
import { LANDMARK_COUNT } from '@/lib/pose/landmarks';
import { CAPTURE_FIXTURE_FORMAT, POSE_TAKE_FORMAT, captureFixtureProblems, isPictureOrVideo, poseTakeProblems } from '@/lib/pose/recordingsGuard';
import {
  CAPTURE_TAKES, captureMetaProblems, captureTake, type CaptureMeta, type CaptureMovement, type CaptureSide, type CaptureView,
} from '@/lib/pose/captureProtocol';

export { CAPTURE_FIXTURE_FORMAT };

/** One frame: capture ms from the take's start; `lm` 33 rows of [x, y, z, visibility] (empty: no body); `w` world rows. */
export interface CapturedFrame { t: number; lm: number[][]; w?: number[][] }

export interface CapturedTake {
  id: string;
  movement: CaptureMovement;
  label: string;
  view: CaptureView;
  side?: CaptureSide;
  reps: number;
  /** The picture the landmarks are normalised to. */
  video: { width: number; height: number };
  clock: string;
  /** Detections per second the phone achieved over the take, and its mean detect cost (ms): the frame-rate log. */
  detectFps: number;
  inferMs: number;
  /** The take asked the camera for 60 fps (the jump's opt-in). */
  highRate: boolean;
  /** GO, after the recorded 3-2-1 (ms from the take's start). */
  goT: number;
  frames: CapturedFrame[];
}

export interface CaptureFixture {
  format: typeof CAPTURE_FIXTURE_FORMAT;
  origin: 'owner-capture';
  child: false;
  capture: CaptureMeta;
  /** "Chrome 140 · Android": the browser and OS only. */
  device: string;
  model: string;
  /** The day it was recorded (no time of day). */
  recordedOn: string;
  takes: CapturedTake[];
}

/** The recorder's file, as far as the ingest reads it (components/dev/pose-recorder/recording.ts TakesFile). */
export interface RawTakesFile {
  format: string;
  origin?: string;
  child?: boolean;
  capture?: unknown;
  savedAt?: string;
  device?: string;
  model?: string;
  takes: {
    id: string; video?: { width: number; height: number }; clock?: string; detectFps?: number; inferMs?: number;
    highRate?: boolean; goT?: number; endT?: number; frames: PoseFrame[];
  }[];
}

const r = (v: number, dp: number) => { const k = 10 ** dp; const x = Math.round(v * k) / k; return Object.is(x, -0) ? 0 : x; };
/** Takes whose world points a grader reads: the front stand (T5's height ruler) and the jump. */
const KEEP_WORLD = new Set<CaptureMovement>(['jump']);
const keepWorld = (id: string, movement: CaptureMovement) => KEEP_WORLD.has(movement) || id === 'stand.front';

export interface IngestResult {
  fixture: CaptureFixture | null;
  /** Why the whole file was refused (empty when it was taken). */
  problems: string[];
  /** Protocol takes the file does not have (optional ones excluded): a session to finish, not a refusal. */
  missing: string[];
}

/** A recorder file → a session fixture, or the reasons it is refused. `name` is the file's name, checked too. */
export function ingestTakesFile(raw: unknown, name = 'capture.json'): IngestResult {
  const problems: string[] = [];
  if (isPictureOrVideo(name)) return { fixture: null, problems: [`${name} is a picture or a video: a capture is pose numbers only`], missing: [] };
  if (!raw || typeof raw !== 'object') return { fixture: null, problems: ['not a capture file'], missing: [] };
  const f = raw as RawTakesFile;
  if (f.format !== POSE_TAKE_FORMAT) return { fixture: null, problems: [`format must be ${POSE_TAKE_FORMAT} (the /dev/pose-record download)`], missing: [] };
  problems.push(...poseTakeProblems(raw));
  if (f.origin !== 'owner-capture') problems.push('origin must be owner-capture (recorded in the Mirror capture set)');
  problems.push(...captureMetaProblems(f.capture));
  const takes = Array.isArray(f.takes) ? f.takes : [];
  for (const tk of takes) if (!captureTake(tk?.id)) problems.push(`take ${String(tk?.id)} is not in the capture protocol`);
  if (!takes.length) problems.push('no takes');
  if (problems.length) return { fixture: null, problems, missing: [] };

  const meta = f.capture as CaptureMeta;
  const out: CapturedTake[] = [];
  for (const tk of takes) {
    const spec = captureTake(tk.id)!;
    const end = typeof tk.endT === 'number' ? tk.endT : Infinity;
    const world = keepWorld(spec.id, spec.movement);
    out.push({
      id: spec.id, movement: spec.movement, label: spec.label, view: spec.view, ...(spec.side ? { side: spec.side } : {}), reps: spec.reps,
      video: { width: tk.video?.width ?? 0, height: tk.video?.height ?? 0 },
      clock: typeof tk.clock === 'string' ? tk.clock : 'unknown',
      detectFps: typeof tk.detectFps === 'number' ? tk.detectFps : 0,
      inferMs: typeof tk.inferMs === 'number' ? tk.inferMs : 0,
      highRate: tk.highRate === true,
      goT: typeof tk.goT === 'number' ? tk.goT : 0,
      frames: tk.frames.filter((fr) => fr.t <= end).map((fr): CapturedFrame => {
        const body = fr.present && fr.image.length === LANDMARK_COUNT;
        return {
          t: r(fr.t, 1),
          lm: body ? fr.image.map((l) => [r(l.x, 4), r(l.y, 4), r(l.z, 3), r(l.v, 2)]) : [],
          ...(body && world && fr.world?.length === LANDMARK_COUNT ? { w: fr.world.map((p) => [r(p.x, 3), r(p.y, 3), r(p.z, 3)]) } : {}),
        };
      }),
    });
  }
  const order = new Map(CAPTURE_TAKES.map((s, i) => [s.id, i]));
  out.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const have = new Set(out.map((x) => x.id));
  const recordedOn = typeof f.savedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.savedAt) ? f.savedAt.slice(0, 10) : 'unknown';
  const fixture: CaptureFixture = {
    format: CAPTURE_FIXTURE_FORMAT, origin: 'owner-capture', child: false,
    capture: { protocol: meta.protocol, person: meta.person, device: meta.device, adult: true, consent: true },
    device: typeof f.device === 'string' ? f.device.slice(0, 40) : 'unknown', model: typeof f.model === 'string' ? f.model.slice(0, 60) : 'unknown',
    recordedOn, takes: out,
  };
  // the fixture is checked as it will be committed: what the guard would refuse is never written
  const after = captureFixtureProblems(fixture);
  if (after.length) return { fixture: null, problems: after, missing: [] };
  return { fixture, problems: [], missing: CAPTURE_TAKES.filter((s) => !s.optional && !have.has(s.id)).map((s) => s.id) };
}

/** Where a session's fixture goes, under the captured fixtures folder: `P2-android-mid-2026-10-09.json.gz`. */
export function captureFixtureName(fx: Pick<CaptureFixture, 'capture' | 'recordedOn'>): string {
  return `${fx.capture.person}-${fx.capture.device}-${fx.recordedOn}.json.gz`;
}

/** A captured take's frames as lib/pose PoseFrames (what the graders read). */
export function takeFrames(take: Pick<CapturedTake, 'frames'>): PoseFrame[] {
  return take.frames.map((f) => (f.lm.length
    ? {
      t: f.t, present: true,
      image: f.lm.map(([x, y, z, v]) => ({ x, y, z, v })),
      ...(f.w ? { world: f.w.map(([x, y, z]) => ({ x, y, z })) } : {}),
    }
    : { t: f.t, present: false, image: [] }));
}

/** Image width ÷ height the take's landmarks are normalised to (4:3 landscape when the recorder did not say). */
export const takeAspect = (take: Pick<CapturedTake, 'video'>): number =>
  take.video.width > 0 && take.video.height > 0 ? take.video.width / take.video.height : 4 / 3;
