// ONE EVALUATION PASS, RUN ON ANY CHANGE (2026-09-14). Spec §10 steps 3 and 4.
//
// "Dependency graph resolver: vitals → body → attributes → mechanics → traits. One evaluation pass, runs
// on any change, returns violations + warnings." Plus the budget layer on top of it.
//
// THE MOST IMPORTANT DECISION IN THIS FILE IS THAT IT NEVER REFUSES A BUILD.
//
// The spec asks for exactly this in §9 — "validation on import reports violations without refusing the
// load; flag the build as invalid, let the user fix it in the editor" — and it is right for a reason worth
// writing down: a creator that rejects your build hands you an error and takes away the screen where you
// could have fixed it. So `resolve` is a REPORT. It returns what is wrong and lets the editor render it
// next to the row that is wrong, which is the only place a person can act on it.
//
// VIOLATIONS vs WARNINGS is the other half:
//   violation — the build breaks a rule and cannot be saved as valid (over a cap, past a PRQ ceiling, a
//               trait whose prerequisite is not met).
//   warning   — the build is legal and probably not what you meant. The spec names the case: "a tendency
//               with no capability behind it should surface as a validation warning, not a silent bad
//               build." Somebody who sets Three-Point Tendency to 90 on a 40 Three-Point rating has made a
//               player who will shoot his team out of games, and that is allowed — but he should be told.
//
// Pure: no Babylon, no DOM, no storage.

import type { PrqAxisId, RatedRow, TraitRow } from './types';
import { ATTRIBUTES } from './attributes';
import { TRAITS } from './traits';
import { ceilingFor } from './ceilings';
import { HOT_ZONES, ZONE_STATES, ZONE_POINT_CAP, zonePointsSpent } from './hotZones';

export interface CreatorBuild {
  attributes: Record<string, number>;
  /** zone id → state name. Absent zones read as NEUTRAL. */
  hotZones?: Record<string, string>;
  /** trait id → tier index (0-based). Absent = unequipped. */
  traits: Record<string, number>;
  tendencies?: Record<string, number>;
  /** The athlete's measured axes, or null for a guest. */
  prq?: Partial<Record<PrqAxisId, number>> | null;
}

export type IssueKind = 'violation' | 'warning';

export interface Issue {
  kind: IssueKind;
  /** The row this is about, so the editor can render it beside the control rather than in a list. */
  rowId: string;
  section: string;
  message: string;
}

export interface Budgets {
  attributePointsSpent: number;
  attributePointsCap: number;
  traitPointsSpent: number;
  traitPointsCap: number;
  hotZonePointsSpent: number;
  hotZonePointsCap: number;
}

export interface Resolution {
  issues: Issue[];
  budgets: Budgets;
  /** Convenience: no violations. Warnings do not make a build invalid. */
  valid: boolean;
}

/** Points a build may spend. Generous enough to make a specialist; tight enough that nobody is everything. */
export const ATTRIBUTE_POINT_CAP = 1500;
export const TRAIT_POINT_CAP = 24;
/** Attributes start here, and only the points ABOVE this are charged — a 0 build is not a free 99 build. */
export const ATTRIBUTE_BASE = 25;

const attrById = new Map(ATTRIBUTES.rows.map((r) => [r.id, r] as const));
const traitById = new Map(TRAITS.rows.map((r) => [r.id, r] as const));

/** One pass over the whole build. */
export function resolve(build: CreatorBuild): Resolution {
  const issues: Issue[] = [];
  let attributePointsSpent = 0;

  for (const [id, raw] of Object.entries(build.attributes ?? {})) {
    const row = attrById.get(id) as RatedRow | undefined;
    if (!row) {
      // An unknown key is NOT dropped and NOT fatal — forward compatibility (§9). A newer client may know
      // an attribute this build does not.
      issues.push({ kind: 'warning', rowId: id, section: 'attributes', message: `Unknown attribute "${id}" — kept, not editable here.` });
      continue;
    }
    const v = Number.isFinite(raw) ? Math.round(raw) : row.min;
    attributePointsSpent += Math.max(0, v - ATTRIBUTE_BASE);
    const cap = ceilingFor(row, build.prq);
    if (v > cap) {
      issues.push({
        kind: 'violation', rowId: id, section: 'attributes',
        message: row.prqAxis
          ? `${row.label} ${v} is past your ceiling of ${cap}. Raise it by training ${row.prqAxis}.`
          : `${row.label} ${v} is above the maximum of ${row.max}.`,
      });
    }
    if (v < row.min) issues.push({ kind: 'violation', rowId: id, section: 'attributes', message: `${row.label} cannot go below ${row.min}.` });
  }

  let traitPointsSpent = 0;
  for (const [id, tierRaw] of Object.entries(build.traits ?? {})) {
    const row = traitById.get(id) as TraitRow | undefined;
    if (!row) { issues.push({ kind: 'warning', rowId: id, section: 'traits', message: `Unknown trait "${id}" — kept, not editable here.` }); continue; }
    const tier = Math.round(tierRaw);
    if (tier < 0 || tier >= row.tiers.length) {
      issues.push({ kind: 'violation', rowId: id, section: 'traits', message: `${row.label} has no tier ${tier}.` });
      continue;
    }
    traitPointsSpent += row.cost[tier] ?? 0;
    if (row.requires) {
      const have = Math.round(build.attributes?.[row.requires.attribute] ?? 0);
      if (have < row.requires.min) {
        const need = attrById.get(row.requires.attribute);
        issues.push({
          kind: 'violation', rowId: id, section: 'traits',
          message: `${row.label} needs ${need?.label ?? row.requires.attribute} ${row.requires.min}; you have ${have}.`,
        });
      }
    }
  }

  // THE SPEC'S OWN NAMED WARNING: a tendency with no capability behind it.
  for (const [id, raw] of Object.entries(build.tendencies ?? {})) {
    const v = Math.round(Number.isFinite(raw) ? raw : 0);
    const backing = TENDENCY_BACKED_BY[id];
    if (!backing) continue;
    const have = Math.round(build.attributes?.[backing] ?? 0);
    if (v >= 70 && have < 55) {
      const cap = attrById.get(backing);
      issues.push({
        kind: 'warning', rowId: id, section: 'tendencies',
        message: `This is set to ${v} but ${cap?.label ?? backing} is only ${have} — you will do it often and badly.`,
      });
    }
  }

  // HOT ZONES. Cold zones refund, so this can be negative — a build that admitted where it cannot score.
  // Only going OVER is a violation; being under just means unspent room.
  const hotZonePointsSpent = zonePointsSpent(build.hotZones ?? {});
  if (hotZonePointsSpent > ZONE_POINT_CAP) {
    issues.push({ kind: 'violation', rowId: '__budget', section: 'hotZones', message: `${hotZonePointsSpent} hot-zone points of ${ZONE_POINT_CAP}. Cool a zone down to afford another hot one.` });
  }
  for (const [id, state] of Object.entries(build.hotZones ?? {})) {
    if (!HOT_ZONES.rows.some((r) => r.id === id)) { issues.push({ kind: 'warning', rowId: id, section: 'hotZones', message: `Unknown zone "${id}" — kept, not editable here.` }); continue; }
    if (!(ZONE_STATES as readonly string[]).includes(state)) {
      issues.push({ kind: 'violation', rowId: id, section: 'hotZones', message: `"${state}" is not a zone state.` });
    }
  }

  if (attributePointsSpent > ATTRIBUTE_POINT_CAP) {
    issues.push({ kind: 'violation', rowId: '__budget', section: 'attributes', message: `${attributePointsSpent} attribute points spent of ${ATTRIBUTE_POINT_CAP}.` });
  }
  if (traitPointsSpent > TRAIT_POINT_CAP) {
    issues.push({ kind: 'violation', rowId: '__budget', section: 'traits', message: `${traitPointsSpent} trait points spent of ${TRAIT_POINT_CAP}.` });
  }

  return {
    issues,
    budgets: {
      attributePointsSpent, attributePointsCap: ATTRIBUTE_POINT_CAP,
      traitPointsSpent, traitPointsCap: TRAIT_POINT_CAP,
      hotZonePointsSpent, hotZonePointsCap: ZONE_POINT_CAP,
    },
    valid: !issues.some((i) => i.kind === 'violation'),
  };
}

/**
 * Which attribute backs which tendency.
 *
 * Data, not logic — a new tendency is a new row here and nothing else, which is the test the spec sets for
 * the whole layer.
 */
export const TENDENCY_BACKED_BY: Record<string, string> = {
  shoot: 'shotIq', drive: 'drivingLayup', pullUp: 'midRange', spotUpThree: 'threePoint',
  offScreenThree: 'threePoint', stepback: 'midRange', deepRange: 'threePoint',
  standingDunk: 'standingDunk', drivingDunk: 'drivingDunk', flashyDunk: 'drivingDunk',
  alleyOop: 'drivingDunk', postUp: 'postControl',
  // BILATERAL, and the map has to say so: the tendency rows are per-shoulder (postHookL/R), so a single
  // `postHook` key mapped to nothing and the warning it was supposed to raise could never fire. Caught by
  // the test that asserts every mapped tendency is a row that exists.
  postHookL: 'postHook', postHookR: 'postHook', postFadeL: 'postFade', postFadeR: 'postFade',
  pass: 'passAccuracy', flashyPass: 'passAccuracy', throwAhead: 'passAccuracy',
  onBallSteal: 'steal', blockShot: 'block', contestShot: 'perimeterD', takeCharge: 'interiorD',
  crashGlass: 'offRebound', playPassingLanes: 'passPerception',
};
