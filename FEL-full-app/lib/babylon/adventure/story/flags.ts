/**
 * The story's gates on the toolkit (owner, 2026-10-06 round 2: "Flight first unlocks after Chapter 1's boss (first
 * fusion is the Ch1 finale)"). Two flags in `save.story.flags`, both written by the Chapter 1 finale and read by the
 * party systems through the host (A4's handoff: "add a flightUnlocked gate from save.story.flags; A3's beginFusion sets
 * grantsFlight only when true, and partner.mountCanFly checks it too"):
 *
 *   fusionUnlocked   the fuse button fuses. Before it, the first fusion has not happened, so the button never fuses
 *                    (it still mounts a rideable partner, as A1's riding reads it).
 *   flightUnlocked   a fusion grants flight (`fusion.grantsFlight`), and a flying mount may take off with a rider.
 *
 * Pure. A mode that is not the story (the test yard, the BR) passes no gate and keeps the toolkit whole.
 */

import type { AdventureSave } from '../contracts';

export const FLAG_FUSION_UNLOCKED = 'fusionUnlocked';
export const FLAG_FLIGHT_UNLOCKED = 'flightUnlocked';
/** Set when a chapter is finished: `chapter.<id>.done`. */
export const chapterDoneFlag = (chapterId: string): string => `chapter.${chapterId}.done`;

type Flags = AdventureSave['story']['flags'];

export const flightUnlockedIn = (flags: Flags): boolean => flags[FLAG_FLIGHT_UNLOCKED] === true;
export const fusionUnlockedIn = (flags: Flags): boolean => flags[FLAG_FUSION_UNLOCKED] === true;

/** The two gates as the host takes them: live reads of the save's flags (a flag set mid-play counts at once). */
export function storyGates(save: AdventureSave): { flightUnlocked: () => boolean; fusionUnlocked: () => boolean } {
  return {
    flightUnlocked: () => flightUnlockedIn(save.story.flags),
    fusionUnlocked: () => fusionUnlockedIn(save.story.flags),
  };
}
