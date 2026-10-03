// recordingsGuard — what a committed pose recording is allowed to be (BODY-PLAY-WORKS).
//
// The repo is public. A recording added here is landmark numbers only: no video, no image, and never a
// recording of a real child. It is synthetic, taken from the game's own clips, or one of the owner's existing
// adult captures. The owner's live recorder still saves its file on their machine; this is the check for
// anything that file's shape, committed.
//
// Pure.

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

/** True when a path is a picture or a video. Pose numbers are not either. */
export function isPictureOrVideo(name: string): boolean {
  return /\.(?:mp4|webm|mov|mkv|avi|m4v|png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name);
}
