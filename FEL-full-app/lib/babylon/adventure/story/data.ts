/**
 * The story's data, loaded (Phase B): `lib/adventure/story/index.json` and its chapter files, as typed objects. Static
 * imports, so the bundle carries exactly the chapters the index lists and a missing file fails the build. Phase E adds
 * the generated manuscripts (`lib/adventure/story/manuscript/*.json`) to MANUSCRIPTS; until then there are none, and
 * every chapter is a placeholder.
 */

import indexJson from '@/lib/adventure/story/index.json';
import ch01 from '@/lib/adventure/story/chapters/01-first-gate.json';
import type { ManuscriptIds, StoryChapter, StoryIndex } from './format';

export const STORY_INDEX = indexJson as unknown as StoryIndex;

/** Chapter files by the index's `file` name. */
export const CHAPTER_FILES: Readonly<Record<string, StoryChapter>> = {
  '01-first-gate': ch01 as unknown as StoryChapter,
};

/**
 * Manuscript paragraph ids by manuscript name (Phase E: `import-autobiography.ts` writes `manuscript/<nn>-<slug>.json`
 * with paragraphs `p001`…; this map is filled from those files). None yet.
 */
export const MANUSCRIPTS: Readonly<Record<string, ManuscriptIds>> = {};

/** The chapters in the index's order. */
export function storyChapters(ix: StoryIndex = STORY_INDEX, files = CHAPTER_FILES): StoryChapter[] {
  return ix.chapters.map((e) => files[e.file]).filter((c): c is StoryChapter => !!c);
}

export function chapterById(id: string, ix: StoryIndex = STORY_INDEX, files = CHAPTER_FILES): StoryChapter | null {
  const e = ix.chapters.find((x) => x.id === id);
  return e ? files[e.file] ?? null : null;
}

/** The chapter after `id` in the index, or null at the end. */
export function nextChapterId(id: string | null, ix: StoryIndex = STORY_INDEX): string | null {
  if (!id) return ix.chapters[0]?.id ?? null;
  const i = ix.chapters.findIndex((x) => x.id === id);
  return i >= 0 ? ix.chapters[i + 1]?.id ?? null : null;
}
