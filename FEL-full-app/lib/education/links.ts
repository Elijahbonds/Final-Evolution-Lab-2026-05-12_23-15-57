// links — the three education surfaces, linked. Pure, so every href is tested rather than trusted.
//
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5: /education (the game-mechanics tracks), /education/playbook
// (the owner's book, a chapter at a time) and /learn (the Knowledge Feed, whose Playbook pack is built from that book)
// did not link to each other, and no lesson led to the camera. These are the hrefs that join them:
//   /education            → a Playbook card (the course, and its quick cards in the feed)
//   /education/playbook/n → "Next chapter" opens n+1 (course.ts nextChapterHref); a lesson that teaches a Mirror
//                           movement offers "Check it on camera" (lessonMovement.ts cameraHref)
//   /learn Playbook card  → the chapter it came from, and the camera when that chapter teaches a movement

import { CHAPTERS, chapterByNumber } from './course';
import { cameraHref, MOVEMENT_LABEL, movementsForChapter, type MirrorMovementId } from './lessonMovement';

export const EDUCATION_PATH = '/education';
export const PLAYBOOK_PATH = '/education/playbook';
export const LEARN_PATH = '/learn';

export function chapterHref(n: number): string {
  return chapterByNumber(n) ? `${PLAYBOOK_PATH}/${n}` : PLAYBOOK_PATH;
}

/**
 * The chapter a Knowledge Feed Playbook card was built from, or null. The pack's ids are lib/knowledge/playbookPack.ts's:
 * `playbook.ch<N>-remember-<i>` and `playbook.ch<N>-thesis` (the recap card spans the book and names no chapter).
 */
export function playbookCardChapter(cardId: string): number | null {
  const m = /^playbook\.ch(\d+)-/.exec(cardId);
  if (!m) return null;
  const n = Number(m[1]);
  return CHAPTERS.some((c) => c.number === n) ? n : null;
}

export interface CardLinks {
  chapter: { href: string; label: string };
  camera: { href: string; label: string; movement: MirrorMovementId } | null;
}

/** The links under a Playbook card in the feed: its chapter, and the camera when the chapter teaches a movement. */
export function playbookCardLinks(cardId: string): CardLinks | null {
  // The recap spans the book: it opens the course.
  if (cardId === 'playbook.recap') return { chapter: { href: PLAYBOOK_PATH, label: 'Open the Playbook' }, camera: null };
  const n = playbookCardChapter(cardId);
  if (n === null) return null;
  const movement = movementsForChapter(n)[0];
  return {
    chapter: { href: chapterHref(n), label: `Read chapter ${n}` },
    camera: movement ? { href: cameraHref(movement), label: `Check it on camera: ${MOVEMENT_LABEL[movement]}`, movement } : null,
  };
}
