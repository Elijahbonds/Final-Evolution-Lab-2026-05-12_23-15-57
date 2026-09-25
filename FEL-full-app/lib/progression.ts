/**
 * lib/progression.ts
 *
 * Pure story-progression engine for "The Nexus Initiative".
 *
 * No I/O, no Prisma, no React — takes plain inputs derived from
 * (StoryNodeProgress rows + PlayerProfile PRQ + LessonProgress count)
 * and returns full unlock/completion state. Both API routes and the
 * story-map component consume the wire shape produced here, so the
 * client never re-derives unlock rules from scratch.
 *
 * Rules:
 *  - Rail nodes unlock in order within a zone (r2 needs r1, r3 needs r2).
 *  - The boss unlocks once all 3 rail nodes are complete.
 *  - A zone is CLEARED when its boss is complete.
 *  - A zone is UNLOCKED when its `requiresZone` is cleared AND its
 *    optional prqGate / lessonGate are satisfied.
 *  - Campaign completion % = completed nodes / total nodes.
 *  - Next recommended node = first unlocked, incomplete node in campaign order.
 */

import {
  CAMPAIGN,
  TOTAL_NODE_COUNT,
  getNodeById,
  getZoneById,
  type StoryNode,
  type StoryZone,
  type ZoneId,
} from './story-data';
import { sessionModeFor } from './mp/match-core';
import { storyGoalLabel, storyModeLabel } from './story-yardstick';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface ProgressionInput {
  /** Node ids the user has completed (from StoryNodeProgress). */
  completedNodeIds: ReadonlySet<string>;
  /** Overall PRQ score, 0–100 (from PlayerProfile via lib/prq.ts). */
  prqOverall: number;
  /** Count of completed lessons (from LessonProgress). */
  lessonsCompleted: number;
}

export type LockReason =
  | 'previous-zone' // the required zone's boss is not cleared
  | 'prq-gate' // overall PRQ below the zone's gate
  | 'lesson-gate' // not enough lessons completed
  | 'previous-node' // earlier rail node in this zone incomplete
  | 'rail-incomplete'; // boss locked until all rail nodes are done

// ---------------------------------------------------------------------------
// Output (serializable — this is the wire shape of GET /api/story)
// ---------------------------------------------------------------------------

export interface NodeStatus {
  id: string;
  zoneId: ZoneId;
  kind: StoryNode['kind'];
  order: number;
  title: string;
  description: string;
  mode: string;
  targetScore: number;
  /** The session must be a win by the mode's own rules (the boss of a winnable mode). */
  mustWin: boolean;
  /** What the node asks, on its mode's own scale: "Score 8 points", "Take 2 games", "Win the set". */
  goal: string;
  rewardLC: number;
  badge?: StoryNode['badge'];
  completed: boolean;
  unlocked: boolean;
  lockReasons: LockReason[];
}

export interface ZoneStatus {
  id: ZoneId;
  title: string;
  mode: string;
  /** The mode's player-facing name ("Ones"), for the zone panel — `mode` is a route id. */
  modeLabel: string;
  act: StoryZone['act'];
  narrative: string;
  position: StoryZone['position'];
  accent: string;
  unlock: StoryZone['unlock'];
  unlocked: boolean;
  cleared: boolean;
  lockReasons: LockReason[];
  /** Human-readable unlock requirement, for locked-zone tooltips. */
  unlockLabel: string;
  nodes: NodeStatus[];
  completedCount: number;
  totalCount: number;
}

export interface CampaignStatus {
  campaign: { id: string; title: string; tagline: string };
  zones: ZoneStatus[];
  totalNodes: number;
  completedNodes: number;
  /** 0–100, one decimal place. */
  completionPct: number;
  badgesEarned: string[];
  nextRecommendedNodeId: string | null;
}

// ---------------------------------------------------------------------------
// Zone-level evaluation
// ---------------------------------------------------------------------------

export function isZoneCleared(
  zone: StoryZone,
  completedNodeIds: ReadonlySet<string>,
): boolean {
  return completedNodeIds.has(zone.boss.id);
}

export function evaluateZoneUnlock(
  zone: StoryZone,
  input: ProgressionInput,
): { unlocked: boolean; lockReasons: LockReason[] } {
  const lockReasons: LockReason[] = [];
  const { requiresZone, prqGate, lessonGate } = zone.unlock;

  if (requiresZone !== null) {
    const prev = getZoneById(requiresZone);
    if (!isZoneCleared(prev, input.completedNodeIds)) {
      lockReasons.push('previous-zone');
    }
  }
  if (prqGate !== undefined && input.prqOverall < prqGate) {
    lockReasons.push('prq-gate');
  }
  if (lessonGate !== undefined && input.lessonsCompleted < lessonGate) {
    lockReasons.push('lesson-gate');
  }

  return { unlocked: lockReasons.length === 0, lockReasons };
}

export function zoneUnlockLabel(zone: StoryZone): string {
  const parts: string[] = [];
  if (zone.unlock.requiresZone !== null) {
    parts.push(`Clear ${getZoneById(zone.unlock.requiresZone).title}`);
  }
  if (zone.unlock.prqGate !== undefined) {
    parts.push(`PRQ ${zone.unlock.prqGate}+`);
  }
  if (zone.unlock.lessonGate !== undefined) {
    parts.push(`${zone.unlock.lessonGate} lessons complete`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Open from the start';
}

// ---------------------------------------------------------------------------
// Node-level evaluation
// ---------------------------------------------------------------------------

function evaluateNode(
  node: StoryNode,
  zone: StoryZone,
  zoneUnlocked: boolean,
  zoneLockReasons: LockReason[],
  input: ProgressionInput,
): NodeStatus {
  const completed = input.completedNodeIds.has(node.id);
  const lockReasons: LockReason[] = [...zoneLockReasons];

  if (node.kind === 'rail') {
    // Rail nodes unlock in order: r(n) requires r(n-1).
    if (node.order > 1) {
      const prevRail = zone.rail[node.order - 2];
      if (prevRail && !input.completedNodeIds.has(prevRail.id)) {
        lockReasons.push('previous-node');
      }
    }
  } else {
    // Boss requires the full rail.
    const railDone = zone.rail.every((r) => input.completedNodeIds.has(r.id));
    if (!railDone) {
      lockReasons.push('rail-incomplete');
    }
  }

  const unlocked = zoneUnlocked && lockReasons.length === 0;

  return {
    id: node.id,
    zoneId: node.zoneId,
    kind: node.kind,
    order: node.order,
    title: node.title,
    description: node.description,
    mode: node.mode,
    targetScore: node.targetScore,
    mustWin: node.mustWin === true,
    goal: storyGoalLabel(storySessionMode(node), node),
    rewardLC: node.rewardLC,
    ...(node.badge ? { badge: node.badge } : {}),
    completed,
    unlocked,
    lockReasons,
  };
}

// ---------------------------------------------------------------------------
// Campaign evaluation
// ---------------------------------------------------------------------------

export function evaluateCampaign(input: ProgressionInput): CampaignStatus {
  const zones: ZoneStatus[] = CAMPAIGN.zones.map((zone) => {
    const { unlocked, lockReasons } = evaluateZoneUnlock(zone, input);
    const cleared = isZoneCleared(zone, input.completedNodeIds);
    const nodes = [...zone.rail, zone.boss].map((node) =>
      evaluateNode(node, zone, unlocked, lockReasons, input),
    );
    const completedCount = nodes.filter((n) => n.completed).length;

    return {
      id: zone.id,
      title: zone.title,
      mode: zone.mode,
      modeLabel: storyModeLabel(storySessionMode(zone)),
      act: zone.act,
      narrative: zone.narrative,
      position: zone.position,
      accent: zone.accent,
      unlock: zone.unlock,
      unlocked,
      cleared,
      lockReasons,
      unlockLabel: zoneUnlockLabel(zone),
      nodes,
      completedCount,
      totalCount: nodes.length,
    };
  });

  const completedNodes = zones.reduce((sum, z) => sum + z.completedCount, 0);
  const completionPct =
    Math.round((completedNodes / TOTAL_NODE_COUNT) * 1000) / 10;

  const badgesEarned = zones
    .filter((z) => z.cleared)
    .map((z) => {
      const boss = z.nodes.find((n) => n.kind === 'boss');
      return boss?.badge?.id ?? `badge.${z.id}`;
    });

  const nextRecommendedNodeId = findNextRecommendedNodeId(zones);

  return {
    campaign: {
      id: CAMPAIGN.id,
      title: CAMPAIGN.title,
      tagline: CAMPAIGN.tagline,
    },
    zones,
    totalNodes: TOTAL_NODE_COUNT,
    completedNodes,
    completionPct,
    badgesEarned,
    nextRecommendedNodeId,
  };
}

function findNextRecommendedNodeId(zones: ZoneStatus[]): string | null {
  for (const zone of zones) {
    if (!zone.unlocked) continue;
    for (const node of zone.nodes) {
      if (node.unlocked && !node.completed) {
        return node.id;
      }
    }
  }
  return null;
}

/**
 * Convenience for the completion route: is a single node currently
 * playable (unlocked and not yet completed)?
 */
export function isNodePlayable(
  nodeId: string,
  input: ProgressionInput,
): { playable: boolean; reason: 'unknown-node' | 'locked' | 'already-completed' | null } {
  const node = getNodeById(nodeId);
  if (!node) return { playable: false, reason: 'unknown-node' };
  if (input.completedNodeIds.has(nodeId)) {
    return { playable: false, reason: 'already-completed' };
  }

  const status = evaluateCampaign(input);
  const zone = status.zones.find((z) => z.id === node.zoneId);
  const nodeStatus = zone?.nodes.find((n) => n.id === nodeId);
  if (!nodeStatus?.unlocked) {
    return { playable: false, reason: 'locked' };
  }
  return { playable: true, reason: null };
}

/**
 * The `mode` a GameSession launched from this node is stored under. `node.mode` is the ROUTE segment
 * (/play/<mode>); the session carries the GameShell prop, and for half the campaign the two differ
 * (onevone → hoops1v1, karate → karateEndless, skateboard → skateboarding, surf → surfing). lib/mp/match-core
 * owns that map, measured against what the hosts actually post under; lib/story-data.test.ts reads each
 * node's loader and holds this to it.
 */
export function storySessionMode(node: Pick<StoryNode, 'mode'>): string {
  return sessionModeFor(node.mode);
}

export type StorySessionVerdict =
  | { ok: true }
  | { ok: false; error: 'Session mode does not match node'; required: string; achieved: string | null }
  | { ok: false; error: 'Not a win'; required: 'win'; achieved: 'loss' }
  | { ok: false; error: 'Not a win'; required: 'win'; achieved: 'loss'; orScore: number; score: number }
  | { ok: false; error: 'Score below target'; required: number; achieved: number };

/**
 * Does this GameSession complete this node?
 *
 * HOTFIX (2026-09-24): the completion route checked the score and nothing else, so any session that cleared the
 * number completed any node — a karate run counts in the thousands (scoreScale.ts: a mediocre one is 1,250) and
 * would clear a golf node it never touched. The session must have been played in the node's own mode. No session
 * at all is a mismatch too: a node is completed by playing it, never by asking.
 *
 * HOTFIX (2026-09-24): a boss of a winnable mode asks for the WIN, read off `won` — the verdict the mode itself
 * posts (first to 11, the set, the match, a par card, the derby, the shootout). Its targetScore is 0, so the score
 * check below never refuses a real win: a tennis match won by breaking the rival's racket posts fewer than 4 games.
 *
 * HOTFIX (2026-09-24): a win boss with an `orScore` also completes on a session at or over that score, won or lost —
 * the Blacktop, the Sand Pit and the Pitch, whose rivals no recorded run has beaten (lib/story-data.ts). A loss under
 * it is refused with both lines, so the player sees the way through.
 */
export function judgeStorySession(
  node: Pick<StoryNode, 'mode' | 'targetScore' | 'mustWin' | 'orScore'>,
  session: { mode: string; score: number; won: boolean } | null,
): StorySessionVerdict {
  const required = storySessionMode(node);
  if (!session || session.mode !== required) {
    return { ok: false, error: 'Session mode does not match node', required, achieved: session?.mode ?? null };
  }
  if (node.mustWin && session.won !== true) {
    if (node.orScore === undefined) return { ok: false, error: 'Not a win', required: 'win', achieved: 'loss' };
    if (session.score < node.orScore) {
      return { ok: false, error: 'Not a win', required: 'win', achieved: 'loss', orScore: node.orScore, score: session.score };
    }
  }
  if (session.score < node.targetScore) {
    return { ok: false, error: 'Score below target', required: node.targetScore, achieved: session.score };
  }
  return { ok: true };
}

/**
 * Diff helper for the completion route's response: which zones became
 * unlocked between two campaign evaluations.
 */
export function newlyUnlockedZones(
  before: CampaignStatus,
  after: CampaignStatus,
): ZoneId[] {
  const beforeUnlocked = new Set(
    before.zones.filter((z) => z.unlocked).map((z) => z.id),
  );
  return after.zones
    .filter((z) => z.unlocked && !beforeUnlocked.has(z.id))
    .map((z) => z.id);
}
