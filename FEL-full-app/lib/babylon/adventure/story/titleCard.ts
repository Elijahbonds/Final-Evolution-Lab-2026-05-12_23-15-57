// Look pass C2 (lane/look-world, 2026-11-24): the story's READY screen as a title card and the picker's silhouette cards
// (components/adventure/StoryTitleCard.tsx, CreatureSilhouette.tsx). The switch lives here, where the feel catalogue reads it.
import { feel } from '@/lib/feel-panel/feel';

/** story.titleCard: 1 = the title card and the silhouette cards; 0 = the control table and the dots, as before. */
export const STORY_TITLE_CARD = 1;

/** Whether the title card is on (the feel panel's value on this device; the default off the browser). */
export function storyTitleCardOn(): boolean {
  try { return feel('story.titleCard', STORY_TITLE_CARD) >= 0.5; } catch { return STORY_TITLE_CARD >= 0.5; }
}
