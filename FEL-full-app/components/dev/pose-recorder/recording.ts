// The owner's local pose recorder: the takes, the frame shape and the file. Pure, no DOM, so it is tested.
//
// OWNER'S DECISION (2026-09-24): their own moves are recorded to tune the movement-play detectors, as LANDMARK NUMBERS
// ONLY: no video, no image, kept on their Mac. The file this builds is the only thing the recorder ever produces, and
// the page hands it to the browser's download; nothing here or in the page talks to a server.

import { LANDMARK_NAMES, type PoseFrame } from '@/lib/pose/landmarks';

// Every recorded frame is the app's one PoseFrame (lib/pose/landmarks.ts): { t, present, image[33], world[33], arrive },
// so a detector reads the owner's recording exactly as it reads the camera and the synthetic fixtures.

/** What the adapter hands over per frame (structurally its PoseFrame with `world: true`). */
export interface AdapterFrame {
  landmarks: { x: number; y: number; z: number; visibility: number }[];
  present: boolean;
  world?: { x: number; y: number; z: number }[];
}

/** One guided take: what the page asks the owner to do, and for how long after GO. */
export interface TakeSpec {
  id: string;
  label: string;
  /** Said on screen, big enough to read from 3 m. */
  prompt: string;
  /** Seconds recorded after GO. The 3-2-1 before it is recorded too, as the standing-ready lead-in. */
  seconds: number;
}

/** The 3-2-1 is recorded: the detectors need the owner standing ready before the move, the same as a game gets. */
export const COUNTDOWN_MS = 3000;

// Lead hand = the front hand of the owner's stance. The file's `notes` says which stance and which hand dunks.
export const TAKES: TakeSpec[] = [
  { id: 'still', label: 'Stand still', prompt: 'Stand still, facing the camera, arms relaxed at your sides.', seconds: 3 },
  { id: 'jump2-x3', label: 'Two-foot jump ×3', prompt: 'Jump in place off both feet, three times. Land and settle before the next one.', seconds: 9 },
  { id: 'run-jump1', label: 'Run in place → one-foot jump', prompt: 'Run in place for 5 seconds, then jump off ONE foot and reach up.', seconds: 8 },
  { id: 'run-jump2', label: 'Run in place → two-foot jump', prompt: 'Run in place for 5 seconds, then jump off BOTH feet and reach up.', seconds: 8 },
  { id: 'dunk-windmill', label: 'Dunk jump: windmill', prompt: 'A few steps in place, jump, and swing a full windmill with your dunking arm at the top.', seconds: 7 },
  { id: 'dunk-tomahawk', label: 'Dunk jump: tomahawk', prompt: 'A few steps in place, jump, bring the ball back behind your head and hammer it down at the top.', seconds: 7 },
  { id: 'dunk-two-hand', label: 'Dunk jump: two-hand reach', prompt: 'A few steps in place, jump off both feet and reach up high with both hands.', seconds: 7 },
  { id: 'jumpshot-x3', label: 'Jump shot ×3', prompt: 'Three jump shots: dip, set point, release near the top, and HOLD the follow-through.', seconds: 12 },
  { id: 'jab-x3', label: 'Jab ×3', prompt: 'From your guard: three jabs with your lead hand. Back to guard after each.', seconds: 6 },
  { id: 'cross-x3', label: 'Cross ×3', prompt: 'From your guard: three crosses with your rear hand. Back to guard after each.', seconds: 6 },
  { id: 'hook-x3', label: 'Hook ×3', prompt: 'From your guard: three lead-hand hooks. Back to guard after each.', seconds: 6 },
  { id: 'uppercut-x3', label: 'Uppercut ×3', prompt: 'From your guard: three rear-hand uppercuts. Back to guard after each.', seconds: 6 },
  { id: 'front-kick-x3', label: 'Front kick ×3', prompt: 'Three front kicks. Put the foot back down after each one.', seconds: 9 },
  { id: 'slide-lr', label: 'Defensive slide', prompt: 'Get low in a defensive stance. Slide left two steps, then right two steps, then back to the middle.', seconds: 8 },
  { id: 'board-stance', label: 'Board stance', prompt: 'Stand sideways, three-quarters to the camera, knees soft. Lean to your toes, lean to your heels, crouch low, then a small hop.', seconds: 12 },
  { id: 'wings-tilt', label: 'Wings + tilt', prompt: 'Arms straight out like wings. Tilt left, back to level, tilt right, back to level.', seconds: 8 },
  { id: 'wheel-turn', label: 'Steering wheel', prompt: 'Hands on an invisible steering wheel. Turn left, back to centre, turn right, back to centre.', seconds: 8 },
  // MOVEMENT PLAY P4 (2026-09-25): the space check in the owner's own room, from where he will really play: its gate
  // replays this take (scripts/body/space.mts TAKES=<file>), and until one exists its real-camera row stays open.
  { id: 'space', label: 'Space check', prompt: 'At your play spot: stand still, reach both arms overhead for 2 seconds, lower them, stand still.', seconds: 8 },
];

/** Which clock the frame times came from (the adapter's onVideoFrames). 'capture' is the one to trust; 'mixed'
 *  means it changed mid-take, so the take's times are not one timeline. */
export type FrameClock = 'capture' | 'display' | 'now' | 'mixed';

export interface RecordedTake {
  id: string;
  label: string;
  prompt: string;
  /** Wall-clock start, ISO. */
  recordedAt: string;
  /** Short browser + OS, e.g. "Chrome 140 · macOS". */
  device: string;
  video: { width: number; height: number };
  clock: FrameClock;
  /** Detections per second actually achieved over the take (what the detectors will get on this device). */
  detectFps: number;
  /** Mean ms per detect() call on the main thread. */
  inferMs: number;
  /** t of GO (the end of the 3-2-1), and of the end of the take. */
  goT: number;
  endT: number;
  frames: PoseFrame[];
}

export interface TakesFile {
  format: 'fel-pose-takes/1';
  privacy: string;
  savedAt: string;
  device: string;
  model: string;
  /** The owner's own note: stance, dunking hand, where the camera sits. */
  notes: string;
  frameShape: string;
  /** MediaPipe's 33 names, in the order of every image[] and world[]. */
  landmarks: readonly string[];
  takes: RecordedTake[];
}

// Rounded well under MediaPipe's own jitter (1e-4 of a 1280 px frame is 0.13 px; 1e-4 m is 0.1 mm). A frame is then
// about 2.7 KB of JSON, so the whole guided set at 30 fps is roughly 15 MB instead of about 40 in float noise.
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r3 = (n: number) => Math.round(n * 1e3) / 1e3;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One adapter frame into a PoseFrame, times in ms from the take's start: `t` when the camera took the frame,
 * `arrive` when the landmarks came back (so arrive − t is the real camera + model latency on this device).
 */
export function toRecordedFrame(frame: AdapterFrame, t: number, arrive?: number): PoseFrame {
  const out: PoseFrame = { t: r1(t), present: false, image: [] };
  if (frame.present && frame.landmarks.length > 0) {
    out.present = true;
    out.image = frame.landmarks.map((p) => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z), v: r3(p.visibility) }));
    // world only when the model gave it; never invented from the image points
    if (frame.world?.length) out.world = frame.world.map((p) => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) }));
  }
  if (arrive !== undefined) out.arrive = r1(arrive);
  return out;
}

/** About how big the file will be, for the download button. */
export const BYTES_PER_FRAME = 2700;

/** Detections per second across the frames' own timestamps; 0 when there are too few to say. */
export function measureFps(frames: { t: number }[]): number {
  if (frames.length < 2) return 0;
  const span = frames[frames.length - 1].t - frames[0].t;
  return span > 0 ? r1(((frames.length - 1) * 1000) / span) : 0;
}

/** "Chrome 140 · macOS": enough to tell devices apart in a tuning file, not a fingerprint. */
export function shortUserAgent(ua: string): string {
  const pick = (re: RegExp, name: string) => { const m = ua.match(re); return m ? `${name} ${m[1]}` : null; };
  const browser = pick(/Edg\/(\d+)/, 'Edge') ?? pick(/OPR\/(\d+)/, 'Opera') ?? pick(/Firefox\/(\d+)/, 'Firefox')
    ?? pick(/CriOS\/(\d+)/, 'Chrome') ?? pick(/Chrome\/(\d+)/, 'Chrome')
    ?? pick(/Version\/(\d+(?:\.\d+)?).*Safari/, 'Safari') ?? 'Browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} · ${os}`;
}

/** The whole session as one file, takes in the guided order. */
export function buildTakesFile(
  takes: Record<string, RecordedTake>, meta: { device: string; model: string; notes: string; savedAt: Date },
): TakesFile {
  const order = new Map(TAKES.map((s, i) => [s.id, i]));
  return {
    format: 'fel-pose-takes/1',
    privacy: 'Landmark numbers only. No video or image. Recorded and saved on this device; nothing was uploaded.',
    savedAt: meta.savedAt.toISOString(),
    device: meta.device,
    model: meta.model,
    notes: meta.notes,
    frameShape:
      'lib/pose/landmarks.ts PoseFrame. t = capture ms from the take start (the 3-2-1 is recorded; goT marks GO); ' +
      'arrive = ms the landmarks came back; image = 33 {x,y 0..1 of the unmirrored frame, y down; z relative depth; ' +
      'v visibility}; world = 33 {x,y,z} metres, hip-centred, y down, z away from the camera. When present is ' +
      'false, image is empty and world absent.',
    landmarks: LANDMARK_NAMES,
    takes: Object.values(takes).sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99)),
  };
}

/** fel-pose-takes-2026-09-24-1530.json, in local time. */
export function takesFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `fel-pose-takes-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
