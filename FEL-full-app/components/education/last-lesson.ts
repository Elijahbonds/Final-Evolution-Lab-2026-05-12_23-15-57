// last-lesson — the lesson you were last in, kept on THIS DEVICE only (PLAT-P04, 2026-10-27: "open Learn and tap once:
// are you back in your lesson?").
//
// A place-marker, not progress: what you finished is the course's own record (/api/education/playbook, unchanged). This
// is only where you were, so Learn's Continue can take you straight back. It never leaves the device — nothing is sent,
// whoever is signed in, so a teen's learning stays on the device (owner rule) by construction. Every read and write
// survives a blocked or missing storage.

import { CHAPTERS } from '@/lib/education/course';

export const LAST_LESSON_KEY = 'fel.learn.lastLesson';

export interface LastLesson { chapter: number; lesson: string; at: number }

/** The record, or null when there is none, it is unreadable, or the book no longer has that lesson. */
export function parseLastLesson(raw: string | null | undefined): LastLesson | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<LastLesson>;
    const chapter = Number(j?.chapter);
    const lesson = typeof j?.lesson === 'string' ? j.lesson : '';
    const ch = CHAPTERS.find((c) => c.number === chapter);
    if (!ch || !ch.lessons.some((l) => l.key === lesson)) return null;
    return { chapter, lesson, at: Number(j?.at) || 0 };
  } catch {
    return null;
  }
}

export function readLastLesson(store: Pick<Storage, 'getItem'> | null): LastLesson | null {
  try { return parseLastLesson(store?.getItem(LAST_LESSON_KEY)); } catch { return null; }
}

export function writeLastLesson(store: Pick<Storage, 'setItem'> | null, rec: LastLesson): void {
  try { store?.setItem(LAST_LESSON_KEY, JSON.stringify(rec)); } catch { /* storage blocked: Continue falls back to progress */ }
}

/** The browser's storage, or null where it is blocked. */
export function deviceStore(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
