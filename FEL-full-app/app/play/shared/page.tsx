import { notFound } from 'next/navigation';

/**
 * /play/shared on its own is not a page: Studio share links live under it (`/play/shared/[token]`, NEX-06, HELD). It 404s, and it
 * exists so every /play/* folder has a page.tsx (scripts/smokeTest.ts §5: a /play link never lands on a folder with no page).
 * STUDIO-EASY, 2026-10-28: the gap came in with the nexus-publish merge.
 */
export default function SharedIndex() {
  notFound();
}
