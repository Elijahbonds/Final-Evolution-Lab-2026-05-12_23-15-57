// PROPOSED, NOT FINAL, pending Elijah. Which program lane a Quick Screen result points to (AMENDMENTS 3 / 4).
//
// "Build my Dunk Program" takes the TOP RED flag, or the top YELLOW when there is no Red, and maps it to one of three
// lanes. ALL GREEN → dunking, but only on a real, completed screen (A4-4: missing, partial or hidden-only data is never
// "all green"). Several flags in the same band break by CHECK ORDER (T1 → T2 → T3 → T5, each test's checks in the
// draft's order). Hidden or TODO checks never drive a lane, and jump height has no band, so it never flags.
//
// Every row carries its placement: 'rule' (the brief's own mapping), 'confirmed (squad 9:55 PM PT)', or
// 'PROPOSED (unlisted, Autopilot placement)' — a check the brief did not place, placed here and still PROPOSED.
//
// Pure data and one pure function.
import { DRAFT_CUES, GRADED_CHECKS, bands3Of, checkById, type BandWord, type CheckId } from './PROPOSED-thresholds';

export const PROGRAM_LANES_HEADER = 'PROPOSED, NOT FINAL, pending Elijah';

export type LaneSlug = 'correctives' | 'posture' | 'dunking';
export const LANE_SLUGS: readonly LaneSlug[] = ['correctives', 'posture', 'dunking'];
export const isLaneSlug = (s: unknown): s is LaneSlug => typeof s === 'string' && (LANE_SLUGS as readonly string[]).includes(s);

export interface Lane {
  slug: LaneSlug;
  name: string;
  /** The lane's sample drill when its trigger has no draft cue of its own (a clean screen, or lateral shift). */
  defaultSample: { cue: string; from: string };
}

export const LANES: Record<LaneSlug, Lane> = {
  correctives: { slug: 'correctives', name: 'Correctives', defaultSample: { cue: DRAFT_CUES.kneeWallShin, from: 'the draft\'s knee-to-wall cue' } },
  posture: { slug: 'posture', name: 'Static & Dynamic Posture', defaultSample: { cue: DRAFT_CUES.ohsArmsForward, from: 'the draft\'s wall-slides cue' } },
  dunking: { slug: 'dunking', name: 'Dunking & Plyometrics', defaultSample: { cue: DRAFT_CUES.jumpLandingKneeCave, from: 'the draft\'s snap-down cue' } },
};

export type Placement = 'rule' | 'confirmed (squad 9:55 PM PT)' | 'PROPOSED (unlisted, Autopilot placement)';

export interface LaneRow {
  check: CheckId | 'all-green';
  lane: LaneSlug | null;
  placement: Placement;
  why: string;
  /** False for a row whose check is not graded at this HEAD (kept in the table, never drives). */
  active: boolean;
}

const graded = (id: CheckId) => GRADED_CHECKS.some((c) => c.id === id);
const row = (check: CheckId, lane: LaneSlug, placement: Placement, why: string): LaneRow => ({ check, lane, placement, why, active: graded(check) });

/** THE TABLE, in check order. */
export const LANE_TABLE: readonly LaneRow[] = [
  row('ohs.kneeCave', 'correctives', 'rule', 'OHS knee cave'),
  row('ohs.forwardLean', 'posture', 'rule', 'trunk lean'),
  row('ohs.armsForward', 'posture', 'confirmed (squad 9:55 PM PT)', 'arms fall forward; only while graded, never as TODO'),
  row('ohs.heelLift', 'correctives', 'confirmed (squad 9:55 PM PT)', 'ankle-driven'),
  row('ohs.depth', 'correctives', 'PROPOSED (unlisted, Autopilot placement)', 'mobility'),
  row('ohs.lateralShift', 'posture', 'PROPOSED (unlisted, Autopilot placement)', 'alignment'),
  row('ktw.shinAngle', 'correctives', 'rule', 'ankle'),
  row('ktw.lrGap', 'correctives', 'rule', 'ankle'),
  row('sls.kneeCave', 'correctives', 'PROPOSED (unlisted, Autopilot placement)', 'the same fault as the OHS knee cave'),
  row('sls.hipDrop', 'posture', 'rule', 'pelvic drop'),
  row('sls.trunkLean', 'posture', 'rule', 'trunk lean'),
  row('sls.lrGap', 'correctives', 'rule', 'left/right gap'),
  row('jump.landingKneeCave', 'dunking', 'rule', 'jump-related'),
  row('jump.stiffLanding', 'dunking', 'rule', 'jump-related'),
  { check: 'all-green', lane: 'dunking', placement: 'rule', why: 'a real, completed screen with every graded check green (A4-4)', active: true },
  { check: 'jump.landingWeightShift', lane: null, placement: 'rule', why: 'hidden in v1: never drives', active: false },
  { check: 'jump.height', lane: null, placement: 'rule', why: 'no band: never drives', active: false },
];

export const laneOfCheck = (id: CheckId): LaneSlug | null => LANE_TABLE.find((r) => r.check === id && r.active)?.lane ?? null;

export interface LanePick {
  lane: LaneSlug | null;
  /** The flag that picked it (null for a clean screen, or no pick). */
  flag: CheckId | null;
  band: BandWord | null;
}

/**
 * The lane for a screen: the first Red in check order, else the first Yellow, else dunking on a CLEAN screen, else no
 * pick (a partial screen with nothing flagged is not "all green"). `checks` is every graded check with its band.
 */
export function pickLane(checks: readonly { id: CheckId; band: BandWord | null }[], clean: boolean): LanePick {
  const order = GRADED_CHECKS.map((c) => c.id);
  const inOrder = [...checks].filter((c) => laneOfCheck(c.id) !== null).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const want of ['red', 'yellow'] as const) {
    const hit = inOrder.find((c) => c.band === want);
    if (hit) return { lane: laneOfCheck(hit.id), flag: hit.id, band: want };
  }
  return clean ? { lane: 'dunking', flag: null, band: null } : { lane: null, flag: null, band: null };
}

/**
 * The lane page's one free sample drill: the trigger's own draft cue when it has one (the cue that fits the lane's
 * trigger), else the lane's default draft cue. Always shown marked PROPOSED.
 */
export function sampleDrill(lane: LaneSlug, flag: CheckId | null): { cue: string; from: string } {
  if (flag && laneOfCheck(flag) === lane) {
    const c = checkById(flag);
    const b = c.thresholdId ? bands3Of(c.thresholdId) : null;
    if (b && b.cueSource === 'research-advisor-draft-2026-09-28') return { cue: b.cue, from: `the draft's cue for "${c.draftRow}"` };
  }
  return LANES[lane].defaultSample;
}
