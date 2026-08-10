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
