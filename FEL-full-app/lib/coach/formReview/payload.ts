// lib/coach/formReview/payload.ts — COACH-VIDEO-REVIEW (2026-10-24): what leaves the phone, and nothing else.
//
// PRIVACY FIRST, BY CONSTRUCTION. The default — and today the only — thing a client sends their coach is POSE DATA: the
// rep boundaries, each rep's faults, and the keypoint tracks of a few reps (the flagged ones, and the best one beside
// them for the coach to compare). No video, no image, no audio: the camera picture never leaves the page (the Mirror's
// rule, Form Check's own header: "the owner's choice is no video upload").
//
// The shape is closed. parseSubmission() accepts exactly the fields below, at their types and sizes, and refuses
// anything else — a `video`, a `clip`, a data: URL or any other field is a 400, not something quietly dropped — so the
// server can never be handed media through this door, whatever a client sends. The browser builds its body with
// buildSubmission(), which can only produce this shape.
//
// TRACKS. 17 joints (the face reduced to the nose, as app/play/mirror/assess/_components/skeleton.ts draws it), image
// x and y in thousandths of the frame and visibility in tenths, at TRACK_FPS — about 1 KB a second of one rep. Scores and
// flags are NOT taken from the client: the server recomputes them from the reps' faults (./score.ts), so the coach's
// queue and the client's screen agree by construction.
//
// Pure.

import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { isFault, isReviewMovement, type FaultSide, type ReviewMovement } from './movements';
import { MAX_SET_REPS, type RepWindow } from './reader';
import type { RepFlag, ScoredRep } from './score';

/** The joints a track keeps, MediaPipe indices (skeleton.ts JOINTS: the nose, the arms, the legs and feet). */
export const TRACK_JOINTS: readonly number[] = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const PER = 3;
/** Frames per second kept in a track (enough to replay a rep; a third of the camera's 30 is not). TUNE(elijah) (new) */
export const TRACK_FPS = 20;
/** At most this many frames of one rep (6 s at TRACK_FPS). */
export const MAX_TRACK_FRAMES = 120;
/** Tracks for at most this many reps: up to three flagged and the best one. */
export const MAX_TRACKED_REPS = 4;
/** The whole body, as JSON. A 4-rep submission of 3-second reps measures ~25 KB. */
export const MAX_SUBMISSION_BYTES = 96 * 1024;
/** The longest set accepted (10 minutes). */
export const MAX_SET_MS = 600_000;

export interface PoseTrack {
  rep: number;
  /** Where the track starts, ms from the set's first frame, and the step between frames. */
  t0: number;
  dt: number;
  /** One row per frame: TRACK_JOINTS × [x‰, y‰, visibility×10], or [] when no body was in the frame. */
  frames: number[][];
}

export interface SubmittedRep {
  n: number;
  startMs: number;
  endMs: number;
  faults: string[];
  sides: Record<string, FaultSide>;
  read: boolean;
}

export interface FormReviewSubmission {
  v: 1;
  programId: string;
  /** The program slot this set was for (SessionExercise.id), or null for the program's exercise in general. */
  sessionExerciseId: string | null;
  movement: ReviewMovement;
  /** The camera frame's width ÷ height, so a replay is drawn the shape it was filmed. */
  aspect: number;
  durationMs: number;
  reps: SubmittedRep[];
  tracks: PoseTrack[];
}

const SUBMISSION_KEYS = ['v', 'programId', 'sessionExerciseId', 'movement', 'aspect', 'durationMs', 'reps', 'tracks'] as const;
const REP_KEYS = ['n', 'startMs', 'endMs', 'faults', 'sides', 'read'] as const;
const TRACK_KEYS = ['rep', 't0', 'dt', 'frames'] as const;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ── building (the phone) ──────────────────────────────────────────────────────────────────────────────────────────

const q = (v: number, k: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v * k)));

function encodeFrame(f: PoseFrame): number[] {
  if (!f.present || f.image.length < 33) return [];
  const row: number[] = [];
  for (const i of TRACK_JOINTS) {
    const l = f.image[i];
    row.push(q(l.x, 1000, -500, 1500), q(l.y, 1000, -500, 1500), q(l.v, 10, 0, 10));
  }
  return row;
}

/** One rep's track, resampled to TRACK_FPS on the frames' own clock (the nearest frame at each step). */
export function trackOf(frames: readonly PoseFrame[], rep: Pick<RepWindow, 'n' | 'startMs' | 'endMs'>, setStartMs: number): PoseTrack {
  const dt = Math.round(1000 / TRACK_FPS);
  const inRep = frames.filter((f) => f.t >= rep.startMs && f.t <= rep.endMs);
  const out: number[][] = [];
  let j = 0;
  for (let t = rep.startMs; t <= rep.endMs && out.length < MAX_TRACK_FRAMES; t += dt) {
    while (j + 1 < inRep.length && Math.abs(inRep[j + 1].t - t) <= Math.abs(inRep[j].t - t)) j++;
    out.push(inRep.length ? encodeFrame(inRep[j]) : []);
  }
  return { rep: rep.n, t0: Math.round(rep.startMs - setStartMs), dt, frames: out };
}

/** Which reps get a track: the flagged ones (worst first, at most three), then the best read rep for comparison. */
export function trackedReps(reps: readonly ScoredRep[], flags: readonly RepFlag[]): number[] {
  const picked = flags.slice(0, MAX_TRACKED_REPS - 1).map((f) => f.rep);
  const best = reps
    .filter((r) => r.score !== null && !picked.includes(r.n))
    .reduce<ScoredRep | null>((a, b) => (!a || (b.score ?? -1) > (a.score ?? -1) ? b : a), null);
  if (best) picked.push(best.n);
  return picked;
}

export function buildSubmission(input: {
  programId: string;
  sessionExerciseId: string | null;
  movement: ReviewMovement;
  aspect: number;
  frames: readonly PoseFrame[];
  reps: readonly ScoredRep[];
  flags: readonly RepFlag[];
}): FormReviewSubmission {
  const t0 = input.frames.length ? input.frames[0].t : 0;
  const tEnd = input.frames.length ? input.frames[input.frames.length - 1].t : 0;
  const rel = (ms: number) => Math.max(0, Math.round(ms - t0));
  const tracked = new Set(trackedReps(input.reps, input.flags));
  return {
    v: 1,
    programId: input.programId,
    sessionExerciseId: input.sessionExerciseId,
    movement: input.movement,
    aspect: Math.round(Math.max(0.3, Math.min(3, input.aspect || 4 / 3)) * 1000) / 1000,
    durationMs: rel(tEnd),
    reps: input.reps.map((r) => ({ n: r.n, startMs: rel(r.startMs), endMs: rel(r.endMs), faults: [...r.faults], sides: { ...r.sides }, read: r.read })),
    tracks: input.reps.filter((r) => tracked.has(r.n)).map((r) => trackOf(input.frames, r, t0)),
  };
}

// ── reading (the server, and the coach's replay) ──────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

export type ParseResult = { ok: true; value: FormReviewSubmission } | { ok: false; error: string };

/**
 * The server's door: exactly the submission shape, or a refusal naming the first thing wrong. Nothing outside the shape
 * gets through — an extra field anywhere (a `video`, a `clip`, an image) is `unexpected_field`.
 */
export function parseSubmission(raw: unknown, rawBytes?: number): ParseResult {
  const no = (error: string): ParseResult => ({ ok: false, error });
  if (rawBytes !== undefined && rawBytes > MAX_SUBMISSION_BYTES) return no('too_large');
  if (!isObj(raw)) return no('bad_body');
  if (!onlyKeys(raw, SUBMISSION_KEYS)) return no('unexpected_field');
  if (raw.v !== 1) return no('bad_version');
  if (typeof raw.programId !== 'string' || !ID_RE.test(raw.programId)) return no('bad_program');
  if (raw.sessionExerciseId !== null && (typeof raw.sessionExerciseId !== 'string' || !ID_RE.test(raw.sessionExerciseId))) return no('bad_exercise');
  if (!isReviewMovement(raw.movement)) return no('bad_movement');
  const movement = raw.movement;
  if (typeof raw.aspect !== 'number' || !Number.isFinite(raw.aspect) || raw.aspect < 0.3 || raw.aspect > 3) return no('bad_aspect');
  if (!int(raw.durationMs, 0, MAX_SET_MS)) return no('bad_duration');
  const duration = raw.durationMs;
  if (!Array.isArray(raw.reps) || raw.reps.length < 1 || raw.reps.length > MAX_SET_REPS) return no('bad_reps');
  const reps: SubmittedRep[] = [];
  for (let i = 0; i < raw.reps.length; i++) {
    const r = raw.reps[i];
    if (!isObj(r) || !onlyKeys(r, REP_KEYS)) return no('unexpected_field');
    if (r.n !== i + 1) return no('bad_reps');
    if (!int(r.startMs, 0, duration) || !int(r.endMs, 0, duration) || r.endMs < r.startMs) return no('bad_reps');
    if (typeof r.read !== 'boolean') return no('bad_reps');
    if (!Array.isArray(r.faults) || r.faults.length > 8 || !r.faults.every((f) => typeof f === 'string' && isFault(movement, f))) return no('bad_faults');
    const faults = [...new Set(r.faults as string[])];
    if (!r.read && faults.length) return no('bad_faults');
    if (!isObj(r.sides) || !Object.entries(r.sides).every(([k, v]) => faults.includes(k) && (v === 'left' || v === 'right' || v === 'both'))) return no('bad_faults');
    reps.push({ n: r.n, startMs: r.startMs, endMs: r.endMs, faults, sides: { ...(r.sides as Record<string, FaultSide>) }, read: r.read });
  }
  if (!Array.isArray(raw.tracks) || raw.tracks.length > MAX_TRACKED_REPS) return no('bad_tracks');
  const tracks: PoseTrack[] = [];
  const width = TRACK_JOINTS.length * PER;
  for (const t of raw.tracks) {
    if (!isObj(t) || !onlyKeys(t, TRACK_KEYS)) return no('unexpected_field');
    if (!int(t.rep, 1, reps.length) || tracks.some((x) => x.rep === t.rep)) return no('bad_tracks');
    if (!int(t.t0, 0, duration) || !int(t.dt, 10, 200)) return no('bad_tracks');
    if (!Array.isArray(t.frames) || t.frames.length > MAX_TRACK_FRAMES) return no('bad_tracks');
    for (const row of t.frames) {
      if (!Array.isArray(row) || (row.length !== 0 && row.length !== width)) return no('bad_tracks');
      for (let k = 0; k < row.length; k++) if (!int(row[k], k % PER === 2 ? 0 : -500, k % PER === 2 ? 10 : 1500)) return no('bad_tracks');
    }
    tracks.push({ rep: t.rep, t0: t.t0, dt: t.dt, frames: (t.frames as number[][]).map((r) => [...r]) });
  }
  const value: FormReviewSubmission = {
    v: 1, programId: raw.programId, sessionExerciseId: raw.sessionExerciseId as string | null, movement,
    aspect: raw.aspect, durationMs: duration, reps, tracks,
  };
  if (rawBytes === undefined && JSON.stringify(value).length > MAX_SUBMISSION_BYTES) return no('too_large');
  return { ok: true, value };
}

/** A stored track back to 33 landmarks a frame (joints not kept read visibility 0, so nothing draws them). */
export function decodeTrack(track: Pick<PoseTrack, 'frames'>): Lm[][] {
  return track.frames.map((row) => {
    const img: Lm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
    if (row.length !== TRACK_JOINTS.length * PER) return img;
    TRACK_JOINTS.forEach((j, k) => { img[j] = { x: row[k * PER] / 1000, y: row[k * PER + 1] / 1000, z: 0, v: row[k * PER + 2] / 10 }; });
    return img;
  });
}
