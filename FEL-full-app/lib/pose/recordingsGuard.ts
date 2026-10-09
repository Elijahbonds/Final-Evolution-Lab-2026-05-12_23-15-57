// recordingsGuard — what a committed pose recording is allowed to be (BODY-PLAY-WORKS).
//
// The repo is public. A recording added here is landmark numbers only: no video, no image, and never a
// recording of a real child. It is synthetic, taken from the game's own clips, or one of the owner's existing
// adult captures. The owner's live recorder still saves its file on their machine; this is the check for
// anything that file's shape, committed.
//
// MIRROR PHASE 3 (2026-10-07): the owner-led capture (the owner and two adults, two phones, numbers only, never video,
// no minors) adds a capture block to the recorder's file and its own fixture format after the ingest
// (lib/mirror/fixtures/capture/format.ts). Both are checked here: aliases, never names; adults only; consent stated;
// numbers only; and the fixture carries no free text at all (no notes, no time of day), only the keys listed below.
//
// Pure.
import { captureMetaProblems } from './captureProtocol';

export const POSE_TAKE_FORMAT = 'fel-pose-takes/1';

/** Where a committed take is allowed to have come from. */
export const POSE_TAKE_ORIGINS = ['synthetic', 'game-clip', 'owner-capture'] as const;
export type PoseTakeOrigin = (typeof POSE_TAKE_ORIGINS)[number];

const DATA_MEDIA = /data:(?:image|video)\//i;
const CHILD = /\b(?:child|children|minor|under-?\s*18|toddler|infant)\b/i;

function isOrigin(x: unknown): x is PoseTakeOrigin {
  return typeof x === 'string' && (POSE_TAKE_ORIGINS as readonly string[]).includes(x);
}

function numbersOnly(points: unknown, label: string, problems: string[]): void {
  if (!Array.isArray(points)) return;
  for (const p of points) {
    if (!p || typeof p !== 'object') { problems.push(`${label}: a point is not numbers`); return; }
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${label}: ${k} is not a number`);
    }
  }
}

/**
 * Problems with one committed take file. Empty means it is pose numbers only, from an allowed origin, and
 * marked as not a child. A file that is not this format is refused: this checker is for recordings, not for
 * every JSON in the tree.
 */
export function poseTakeProblems(file: unknown): string[] {
  const problems: string[] = [];
  if (!file || typeof file !== 'object') return ['not a pose-take object'];
  const f = file as Record<string, unknown>;
  if (f.format !== POSE_TAKE_FORMAT) problems.push(`format must be ${POSE_TAKE_FORMAT}`);
  if (!isOrigin(f.origin)) problems.push(`origin must be ${POSE_TAKE_ORIGINS.join(', ')}`);
  if (f.child !== false) problems.push('child must be false');
  const notes = typeof f.notes === 'string' ? f.notes : '';
  const subject = typeof f.subject === 'string' ? f.subject : '';
  if (CHILD.test(notes) || CHILD.test(subject)) problems.push('notes name a child');
  if (DATA_MEDIA.test(JSON.stringify(file))) problems.push('embedded image or video');
  // a capture-set recording: an alias, a phone, adults only, consent stated (lib/pose/captureProtocol.ts)
  if (f.capture !== undefined) problems.push(...captureMetaProblems(f.capture));
  const takes = Array.isArray(f.takes) ? f.takes : [];
  for (const take of takes) {
    if (!take || typeof take !== 'object') { problems.push('a take is not an object'); continue; }
    const frames = (take as { frames?: unknown }).frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (!frame || typeof frame !== 'object') { problems.push('a frame is not pose numbers'); continue; }
      const fr = frame as { image?: unknown; world?: unknown };
      numbersOnly(fr.image, 'image', problems);
      numbersOnly(fr.world, 'world', problems);
      if (problems.length > 12) return problems;
    }
  }
  return problems;
}

export const CAPTURE_FIXTURE_FORMAT = 'fel-mirror-capture/1';
const FIXTURE_KEYS = new Set(['format', 'origin', 'child', 'capture', 'device', 'model', 'recordedOn', 'takes']);
const FIXTURE_TAKE_KEYS = new Set(['id', 'movement', 'label', 'view', 'side', 'reps', 'video', 'clock', 'detectFps', 'inferMs', 'highRate', 'goT', 'frames']);
const FIXTURE_FRAME_KEYS = new Set(['t', 'lm', 'w']);

function rowsNumbersOnly(rows: unknown, width: number, label: string, problems: string[]): void {
  if (rows === undefined) return;
  if (!Array.isArray(rows)) { problems.push(`${label}: not rows of numbers`); return; }
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== width || row.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      problems.push(`${label}: a row is not ${width} numbers`);
      return;
    }
  }
}

/**
 * Problems with one ingested capture fixture (`fel-mirror-capture/1`). Empty means: pose numbers only, from the
 * owner-led capture, adults only with consent stated, an alias and not a name, and no key the format does not list
 * (so no note, name or time of day can ride along).
 */
export function captureFixtureProblems(file: unknown): string[] {
  const problems: string[] = [];
  if (!file || typeof file !== 'object') return ['not a capture fixture'];
  const f = file as Record<string, unknown>;
  if (f.format !== CAPTURE_FIXTURE_FORMAT) problems.push(`format must be ${CAPTURE_FIXTURE_FORMAT}`);
  if (f.origin !== 'owner-capture') problems.push('origin must be owner-capture');
  if (f.child !== false) problems.push('child must be false');
  problems.push(...captureMetaProblems(f.capture));
  for (const k of Object.keys(f)) if (!FIXTURE_KEYS.has(k)) problems.push(`unexpected key ${k}`);
  if (DATA_MEDIA.test(JSON.stringify(file))) problems.push('embedded image or video');
  if (typeof f.device === 'string' && CHILD.test(f.device)) problems.push('device names a child');
  const takes = Array.isArray(f.takes) ? f.takes : [];
  for (const take of takes) {
    if (!take || typeof take !== 'object') { problems.push('a take is not an object'); continue; }
    for (const k of Object.keys(take)) if (!FIXTURE_TAKE_KEYS.has(k)) problems.push(`unexpected take key ${k}`);
    const frames = (take as { frames?: unknown }).frames;
    if (!Array.isArray(frames)) { problems.push('a take has no frames'); continue; }
    for (const frame of frames) {
      if (!frame || typeof frame !== 'object') { problems.push('a frame is not pose numbers'); continue; }
      for (const k of Object.keys(frame)) if (!FIXTURE_FRAME_KEYS.has(k)) problems.push(`unexpected frame key ${k}`);
      const fr = frame as { t?: unknown; lm?: unknown; w?: unknown };
      if (typeof fr.t !== 'number' || !Number.isFinite(fr.t)) problems.push('a frame time is not a number');
      rowsNumbersOnly(fr.lm, 4, 'lm', problems);
      rowsNumbersOnly(fr.w, 3, 'w', problems);
      if (problems.length > 12) return problems;
    }
  }
  return problems;
}

/** True when a path is a picture or a video. Pose numbers are not either. */
export function isPictureOrVideo(name: string): boolean {
  return /\.(?:mp4|webm|mov|mkv|avi|m4v|png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name);
}
