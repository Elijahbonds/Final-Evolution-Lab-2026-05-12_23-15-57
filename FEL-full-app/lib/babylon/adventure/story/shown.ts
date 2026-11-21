/**
 * What a player SEES of the story's words (lane/story, coordinator 2026-11-21: "Players must never see the literal bracket tags").
 *
 * The data keeps its marks — `[PLACEHOLDER]` on a name the owner has not given, `[DRAFT]` on words an agent wrote — so the owner and
 * the tests can find every one (format.ts validateChapter / validateStoryIndex hold the DATA). The screen shows the words plainly:
 * every place a story string reaches the screen (the HUD's spell and partner, the dialogue box, the start screen, the end card) goes
 * through `shown()`, and the dialogue box's PLACEHOLDER chip and the end card's DRAFT chip only show for the owner's review.
 *
 * Knob `story.showDraftTags`: 0 (default) = no tag and no chip anywhere a player looks; 1 = the tags and the chips are shown, for the
 * owner's review (the feel panel, or a `?playtest=1` run). Before this lane the chips always showed and the HUD showed the spell's
 * raw name ("[PLACEHOLDER] Fire Bolt"). Pure.
 */

import { feel } from '@/lib/feel-panel/feel';
import type { StoryDialogueSnapshot } from './uiBridge';
import type { ChapterEnding } from './progress';

/** story.showDraftTags: 0 = players see no `[PLACEHOLDER]` / `[DRAFT]` tag and no tag chip (new default); 1 = shown (owner review). */
export const STORY_SHOW_DRAFT_TAGS = 0;

export function showDraftTags(): boolean { return feel('story.showDraftTags', STORY_SHOW_DRAFT_TAGS) >= 0.5; }

const TAG = /\s*\[(?:PLACEHOLDER|DRAFT|TUNE)\]\s*/g;

/** A story string as the screen shows it: its bracket tags dropped (knob 0), or as written (knob 1). */
export function shown(text: string, tags: boolean = showDraftTags()): string {
  return tags ? text : text.replace(TAG, ' ').replace(/\s{2,}/g, ' ').trim();
}

export const shownOrNull = (text: string | null | undefined, tags: boolean = showDraftTags()): string | null => (text == null ? null : shown(text, tags));

/** The dialogue box's snapshot as shown: the speaker, the line and the choices plain; the PLACEHOLDER chip only for review. */
export function shownDialogue(d: StoryDialogueSnapshot, tags: boolean = showDraftTags()): StoryDialogueSnapshot {
  if (tags) return d;
  const text = shown(d.text, false);
  return {
    ...d, speaker: shown(d.speaker, false), text, shown: Math.min(text.length, Math.round((d.shown * text.length) / Math.max(1, d.text.length))), placeholder: false,
    choices: d.choices ? d.choices.map((c) => ({ ...c, text: shown(c.text, false) })) : null,
  };
}

/** The end card as shown: every word plain, the DRAFT chip only for review. */
export function shownEnding(e: ChapterEnding, tags: boolean = showDraftTags()): ChapterEnding {
  if (tags) return e;
  return {
    ...e, draft: false, chapterTitle: shown(e.chapterTitle, false), recap: shownOrNull(e.recap, false),
    next: e.next ? { ...e.next, chapterTitle: shown(e.next.chapterTitle, false) } : null,
    continued: e.continued ? { title: shown(e.continued.title, false), text: shown(e.continued.text, false) } : null,
  };
}
