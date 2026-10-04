import { CLIP_DELETE_DAYS, GOALS, MAX_CLIP_BYTES, MAX_CLIP_SECONDS, MAX_CLIPS, PAIN_LINE, REVIEW_SLA_HOURS_DEFAULT, REVIEW_WARN_HOURS } from './constants';
import { mimeAllowed } from './storage';

export interface ClipCheck {
  seconds: number;
  bytes: number;
  mime: string;
}

export function clipRejected(clip: ClipCheck, already: number, opts?: { skipDuration?: boolean }): string | null {
  if (!opts?.skipDuration && already >= MAX_CLIPS) return '4th clip blocked';
  if (!mimeAllowed(clip.mime)) return 'That file has to be a video.';
  if (!opts?.skipDuration && (!Number.isFinite(clip.seconds) || clip.seconds <= 0 || clip.seconds > MAX_CLIP_SECONDS)) return 'Trim to 60 seconds or less.';
  if (!Number.isInteger(clip.bytes) || clip.bytes < 1 || clip.bytes > MAX_CLIP_BYTES) return 'Trim to 60 seconds or less.';
  return null;
}

export function noteOk(note: string): boolean {
  return note.length <= 300;
}

export function goalOk(goal: string): boolean {
  return (GOALS as readonly string[]).includes(goal);
}

/** A delivered review that was flagged for pain always starts with this line. It cannot be removed. */
export function reviewOpening(painYes: boolean, body: string): string {
  if (!painYes) return body;
  return body.startsWith(PAIN_LINE) ? body : `${PAIN_LINE}\n\n${body}`;
}

export function canDeliver(input: { hasRecording: boolean; drillCount: number }): boolean {
  return input.hasRecording && input.drillCount >= 1 && input.drillCount <= 3;
}

export function dueAt(submittedAt: Date, slaHours = REVIEW_SLA_HOURS_DEFAULT): Date {
  return new Date(submittedAt.getTime() + slaHours * 3_600_000);
}

export function reviewUrgency(due: Date, now: Date): 'ok' | 'soon' | 'overdue' {
  const left = due.getTime() - now.getTime();
  if (left <= 0) return 'overdue';
  if (left <= REVIEW_WARN_HOURS * 3_600_000) return 'soon';
  return 'ok';
}

export function originalDeleteAt(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + CLIP_DELETE_DAYS * 86_400_000);
}

export interface SweepRow {
  id: string;
  originalClipDeleteAt: Date | null;
  originalsDeletedAt: Date | null;
  clipPaths: string[];
  replyClipPath: string | null;
}

/** Originals past the delete clock. Annotated replies are not in the list. */
export function originalsDue(rows: SweepRow[], now: Date): { id: string; paths: string[] }[] {
  return rows
    .filter((r) => r.originalClipDeleteAt && !r.originalsDeletedAt && r.originalClipDeleteAt.getTime() <= now.getTime())
    .map((r) => ({ id: r.id, paths: r.clipPaths.filter((p) => p.includes('/originals/')) }));
}
