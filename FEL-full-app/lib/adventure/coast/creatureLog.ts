/**
 * THE CREATURE LOG, phase B (lane/coast-b; docs/COAST-ISLANDS-PLAN.md; owner 2026-11-17: "one partner plus a creature log").
 *
 * WHERE IT IS SAVED: in the Adventure save, the same document and the same path as every other piece of Adventure progress
 * (lib/babylon/adventure/save: device first; to the account only under the save policy, which is off for everyone until the
 * owner applies the Adventure save table — save/policy.ts ADVENTURE_SERVER_SAVE_ENABLED). No new storage, no schema change.
 * An entry is a story flag, `coast.log.<creature id>` = 1 (seen) or 2 (met): the save already sanitises, caps (256 flags) and
 * migrates flags, so the log needs no new field and no save version. A dedicated `log` field (a version bump) is for when the
 * log outgrows a handful of creatures.
 *
 * Pure: the save in, a new save out. The caller loads and stores it (zoneSave below).
 */

import type { AdventureSave } from '@/lib/babylon/adventure/contracts';
import { ZONE_CREATURES } from './zoneCreatures';

export type LogLevel = 0 | 1 | 2;   // not yet · seen · met
export const LOG_PREFIX = 'coast.log.';
export const logFlag = (id: string): string => `${LOG_PREFIX}${id}`;

export interface LogEntry { id: string; name: string; where: string; level: LogLevel }

/** The zone's log, one entry per creature in the zone, from a save's flags. A value it does not know reads as not yet. */
export function readLog(save: Pick<AdventureSave, 'story'>): LogEntry[] {
  return ZONE_CREATURES.map((c) => {
    const v = save.story.flags[logFlag(c.id)];
    const level: LogLevel = v === 2 ? 2 : v === 1 ? 1 : 0;
    return { id: c.id, name: c.name, where: c.where, level };
  });
}

/** The save with `id` logged at `level`, or null when that is no news (a log only ever moves up: seen → met). */
export function withLog(save: AdventureSave, id: string, level: 1 | 2): AdventureSave | null {
  if (!ZONE_CREATURES.some((c) => c.id === id)) return null;
  const cur = save.story.flags[logFlag(id)];
  const have = cur === 2 ? 2 : cur === 1 ? 1 : 0;
  if (level <= have) return null;
  return { ...save, story: { ...save.story, flags: { ...save.story.flags, [logFlag(id)]: level } } };
}

/** How many creatures are seen (or met) and how many there are. */
export function logCount(entries: readonly LogEntry[]): { seen: number; met: number; total: number } {
  return { seen: entries.filter((e) => e.level >= 1).length, met: entries.filter((e) => e.level === 2).length, total: entries.length };
}
