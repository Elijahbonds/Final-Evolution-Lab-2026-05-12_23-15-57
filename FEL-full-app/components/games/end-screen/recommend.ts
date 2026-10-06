// WHAT'S NEXT — the one recommendation the card puts beside Play again.
//
// In order, the first that applies:
//   1. a playlist in progress: the Court Carnival's next stop (lib/carnival-run.ts — the run the shell already advanced);
//   2. the story: the next node in this zone when this one completed (lib/story-data.ts, rail order r1 → r2 → r3 → boss),
//      or the map when the zone's boss fell or the node did not complete;
//   3. the daily attempt at this week's Signature (lib/mastery/signature.ts — one attempt a day, server-capped), when this
//      device has not played one today and this run was not one;
//   4. a mode this device has not finished today: the rest of this mode's shelf first (lib/nav/families.ts), then the
//      shelves after it;
//   5. everything played today: the next mode on the shelf anyway.
// Only modes a player can pick from the shelf are offered (no parked mode, no off-shelf surface), and not the camera
// rooms (Hang Time, Prove It), which need the camera set up first — assumption: those are a choice, not a nudge.

import { MODE_INFO } from '@/lib/game-data';
import { FAMILIES, familyOf } from '@/lib/nav/families';
import { isUnlistedMode } from '@/lib/unlisted-modes';
import { getNodeById, getZoneById } from '@/lib/story-data';
import { carnivalStopHref, carnivalStopLabel, type CarnivalRunState } from '@/lib/carnival-run';
import { SIGNATURE_MODES, signatureFor, isoWeekKey } from '@/lib/mastery/signature';

export type NextKind = 'carnival' | 'carnival-results' | 'story-node' | 'story-map' | 'signature' | 'fresh' | 'shelf';

export interface NextPick {
  kind: NextKind;
  /** The mode key the teaser draws (name, colour, icon); null for the story map / carnival results. */
  modeKey: string | null;
  title: string;
  href: string;
  /** One line on why this one — shown on the teaser. */
  reason: string;
  /** Optional second line (the node's challenge, the Signature's modifier). */
  detail?: string;
}

/** Shelf modes that are never the nudge: the camera rooms, and the story's own tile (it has its own route above). */
export const NOT_A_NUDGE = new Set(['irl', 'dunkduel', 'storyMode']);

export interface RecommendInput {
  mode: string;
  storyNodeId?: string | null;
  /** The story node completed on this run (GameShell's storyReward landed). */
  storyCompleted?: boolean;
  carnivalRun?: CarnivalRunState | null;
  signatureRun?: boolean;
  /** Modes this device finished today, this run included. */
  playedToday: ReadonlySet<string>;
  /** This device played the Signature today. */
  signaturePlayedToday?: boolean;
  nowMs: number;
}

/** The shelf, starting after `mode`: the rest of its family (wrapping), then the families after it, in order. */
export function shelfOrderAfter(mode: string): string[] {
  const fam = familyOf(mode);
  const offerable = (m: string) => m !== mode && !isUnlistedMode(m) && !NOT_A_NUDGE.has(m) && Boolean(MODE_INFO[m]);
  if (!fam) return FAMILIES.flatMap((f) => f.modes).filter(offerable);
  const fi = FAMILIES.indexOf(fam);
  const mi = fam.modes.indexOf(mode);
  const own = [...fam.modes.slice(mi + 1), ...fam.modes.slice(0, Math.max(0, mi))];
  const rest = [...FAMILIES.slice(fi + 1), ...FAMILIES.slice(0, fi)].flatMap((f) => f.modes);
  return [...own, ...rest].filter(offerable);
}

export function recommendNext(i: RecommendInput): NextPick | null {
  // 1. the playlist
  const c = i.carnivalRun;
  if (c) {
    if (c.index < c.lineup.length) {
      const stop = c.lineup[c.index];
      return { kind: 'carnival', modeKey: stop, title: carnivalStopLabel(stop), href: carnivalStopHref(stop), reason: `Game Night · stop ${c.index + 1} of ${c.lineup.length}` };
    }
    return { kind: 'carnival-results', modeKey: null, title: 'Game Night results', href: '/play/carnival/recap', reason: `All ${c.lineup.length} stops played` };
  }

  // 2. the story
  if (i.storyNodeId) {
    const node = getNodeById(i.storyNodeId);
    if (node && i.storyCompleted) {
      const zone = getZoneById(node.zoneId);
      const chain = [...zone.rail, zone.boss];
      const nxt = chain[node.order];   // order is 1-based: chain[order] is the node after this one
      if (nxt) {
        return {
          kind: 'story-node', modeKey: null, title: nxt.title,
          href: `/play/${nxt.mode}?story=${encodeURIComponent(nxt.id)}`,
          reason: nxt.kind === 'boss' ? `${zone.title} · the boss is open` : `${zone.title} · next on the rail`,
          detail: nxt.description,
        };
      }
      return { kind: 'story-map', modeKey: null, title: 'The Nexus map', href: '/story', reason: `${zone.title} cleared` };
    }
    return { kind: 'story-map', modeKey: null, title: 'The Nexus map', href: '/story', reason: 'Back to the campaign' };
  }

  // 3. the daily Signature attempt
  if (!i.signatureRun && !i.signaturePlayedToday) {
    const week = isoWeekKey(new Date(i.nowMs));
    const pick = SIGNATURE_MODES.find((m) => m !== i.mode && !i.playedToday.has(m)) ?? SIGNATURE_MODES.find((m) => m !== i.mode) ?? SIGNATURE_MODES[0];
    const sig = signatureFor(pick, week);
    return {
      kind: 'signature', modeKey: sig.mode, title: `Signature: ${sig.modeLabel}`, href: '/signature',
      reason: "This week's Signature · today's attempt is open",
      detail: `${sig.modifier.name} · beat ${sig.targetScore}`,
    };
  }

  // 4 / 5. the shelf
  const order = shelfOrderAfter(i.mode);
  const fresh = order.find((m) => !i.playedToday.has(m));
  const key = fresh ?? order[0];
  if (!key) return null;
  const info = MODE_INFO[key];
  const fam = familyOf(key);
  return {
    kind: fresh ? 'fresh' : 'shelf', modeKey: key, title: info.name, href: info.href,
    reason: fresh ? `Not played today${fam ? ` · ${fam.label}` : ''}` : `Up next${fam ? ` in ${fam.label}` : ''}`,
    detail: info.venue,
  };
}
