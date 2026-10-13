/**
 * Audiobook resume position. The player keeps this in localStorage; the
 * server never sees it. A bad value is ignored rather than throwing the player.
 */

export interface ResumeStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface ResumePoint {
  fileId: string;
  positionSec: number;
}

const MAX_POSITION_SEC = 24 * 60 * 60;

export function resumeKey(bookSlug: string): string {
  return `fel-press:${bookSlug}`;
}

export function readResume(store: ResumeStore, bookSlug: string): ResumePoint | null {
  const raw = store.get(resumeKey(bookSlug));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResumePoint>;
    if (typeof parsed.fileId !== 'string' || parsed.fileId.length === 0 || parsed.fileId.length > 80) return null;
    if (typeof parsed.positionSec !== 'number' || !Number.isFinite(parsed.positionSec)) return null;
    if (parsed.positionSec < 0 || parsed.positionSec > MAX_POSITION_SEC) return null;
    return { fileId: parsed.fileId, positionSec: parsed.positionSec };
  } catch {
    return null;
  }
}

export function writeResume(store: ResumeStore, bookSlug: string, point: ResumePoint): void {
  if (!point.fileId || !Number.isFinite(point.positionSec) || point.positionSec < 0) return;
  store.set(resumeKey(bookSlug), JSON.stringify({
    fileId: point.fileId,
    positionSec: Math.min(point.positionSec, MAX_POSITION_SEC),
  }));
}
