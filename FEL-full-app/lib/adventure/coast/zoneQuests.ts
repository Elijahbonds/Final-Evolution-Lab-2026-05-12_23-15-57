/**
 * THE COAST'S SIDE QUESTS, phase D (lane/coast-d). Three small quests from the townsfolk (zoneTown TOWNSFOLK), each a thing
 * the zone already knows how to see: a creature in the log, a game played at a sports spot.
 *
 * STORED like the creature log (creatureLog.ts): in the Adventure save, as story flags — `coast.quest.<id>` 1 (taken) or 2
 * (done), and `coast.played.<spot id>` 1 once you came back from that spot's game. Device first; to the account under the
 * Adventure save policy (off for everyone until the owner's Adventure save table exists). No schema change, no save version.
 *
 * "Played": the coast cannot see a game's result, so the beach net's quest asks you to PLAY a match there and come back (the
 * end screen's "Back to the coast" brings you to the spot, and that arrival counts). A WIN would need the games to report to
 * the coast: a later phase. Pure.
 */

import type { AdventureSave } from '@/lib/babylon/adventure/contracts';
import { logFlag } from './creatureLog';

export type QuestState = 0 | 1 | 2;   // not taken · taken · done
export const questFlag = (id: string): string => `coast.quest.${id}`;
export const playedFlag = (spotId: string): string => `coast.played.${spotId}`;

export interface QuestDef {
  id: string;
  title: string;
  /** Who gives it (zoneTown TOWNSFOLK id). */
  from: string;
  /** What to do, one line. */
  ask: string;
  /** What they say when it is done. */
  thanks: string;
  /** Done when this holds of the save. */
  done: (flags: AdventureSave['story']['flags']) => boolean;
}

export const QUESTS: readonly QuestDef[] = [
  { id: 'q.reefstone', title: '[PLACEHOLDER] The stone out past Palm Key', from: 'npc.harbour',
    ask: 'Find the Reef Stone on Reef Rock: wade the sandbar from Palm Key.', thanks: 'So it is real! Thank you.',
    done: (f) => f[logFlag('reefstone')] === 1 || f[logFlag('reefstone')] === 2 },
  { id: 'q.net', title: '[PLACEHOLDER] A match at the net', from: 'npc.coach',
    ask: 'Play a match at the beach net, then come back.', thanks: 'Now you know the sand. Come back any time.',
    done: (f) => f[playedFlag('volley.net')] === 1 },
  { id: 'q.shell', title: '[PLACEHOLDER] Hello, Shellhopper', from: 'npc.kid',
    ask: 'Walk right up to a Shellhopper in the shallows below the dock.', thanks: 'You met one! What was it like?',
    done: (f) => f[logFlag('shellhopper')] === 2 },
];

export const questById = (id: string): QuestDef | undefined => QUESTS.find((q) => q.id === id);

export interface QuestEntry { id: string; title: string; ask: string; from: string; state: QuestState }

export function readQuests(save: Pick<AdventureSave, 'story'>): QuestEntry[] {
  return QUESTS.map((q) => {
    const v = save.story.flags[questFlag(q.id)];
    return { id: q.id, title: q.title, ask: q.ask, from: q.from, state: v === 2 ? 2 : v === 1 ? 1 : 0 };
  });
}

const withFlag = (save: AdventureSave, k: string, v: number): AdventureSave => ({ ...save, story: { ...save.story, flags: { ...save.story.flags, [k]: v } } });

/** Take a quest (from its giver). Null when unknown or already taken. A quest whose thing is already done is done at once. */
export function withQuestTaken(save: AdventureSave, id: string): AdventureSave | null {
  const q = questById(id);
  if (!q || save.story.flags[questFlag(id)] !== undefined) return null;
  return withFlag(save, questFlag(id), q.done(save.story.flags) ? 2 : 1);
}

/** Mark that the player came back from a sports spot's game. Null when already marked or the spot is unknown. */
export function withPlayed(save: AdventureSave, spotId: string, known: (id: string) => boolean): AdventureSave | null {
  if (!known(spotId) || save.story.flags[playedFlag(spotId)] === 1) return null;
  return withFlag(save, playedFlag(spotId), 1);
}

/** Every taken quest whose thing is now done becomes done. Returns the new save and the quests it finished (none: null). */
export function withQuestsChecked(save: AdventureSave): { save: AdventureSave; finished: QuestDef[] } | null {
  let next = save;
  const finished: QuestDef[] = [];
  for (const q of QUESTS) if (next.story.flags[questFlag(q.id)] === 1 && q.done(next.story.flags)) { next = withFlag(next, questFlag(q.id), 2); finished.push(q); }
  return finished.length ? { save: next, finished } : null;
}

/** coast.questsOn: 1 = the townsfolk give their quests (new); 0 = they only say hello. */
export const COAST_QUESTS_ON = 1;
