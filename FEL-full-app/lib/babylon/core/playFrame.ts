// THE PLAY FRAME — body shape is cosmetic (REACH-FREEZE, 2026-09-29; Gameplay Systems' SPEC-REACH-FREEZE).
//
// Owner rule (AVATAR-BUILDER-PLAN-v1): a scanned or bigger body never changes timing, hitboxes or reach in any mode. Until this
// pass it did. `applyProportions` scaled the root by height × build and moved the elbow and wrist joints out by reach; the ball
// rides the hand bone (ballRig.attachBallToHand); and the hoops modes read that ball's WORLD position for the rim touch, the
// release and the catch. A longer or taller body touched the rim and let go of the ball higher. That is an edge, and a live one.
//
// This is the pure half of the answer:
//   - REACH IS FROZEN at 1.0 everywhere. The arm keeps its bind length; an old save's reachScale is read by nothing.
//   - HEIGHT AND BUILD STAY, cosmetic, inside COSMETIC_CLAMP — a small visible difference in the casual modes and the previews.
//   - A RANKED session, and every mode in STANDARD_FRAME_MODES, spawns every body at exactly 1.0 / 1.0 / 1.0.
//   - `toPlayFrame` moves a point on a scaled body to where it sits on the standard (1.0) body: the gameplay point a mode reads
//     instead of the scaled bone. playFramePoint.ts is the Babylon side of the same map.
//
// Pure: no Babylon, no DOM, no fetch.

/**
 * How far height and build may move a body from the standard frame, as multipliers. TUNE-EJ — the spec's 96–104 % and 94–108 %
 * (Decision 2), down from the creator's old 88–114 % and 88–118 %. The creator's Vitals rows are this range in percent.
 */
export const COSMETIC_CLAMP = {
  height: [0.96, 1.04],
  build: [0.94, 1.08],
} as const;

/** Why a mode spawns every body at 1.0, and what takes it off the list. */
export interface StandardFrameEntry {
  /** When the entry comes off. */
  until: string;
  /** The routed change (~/Claude/outbox/reach-freeze-routed.md) that lets it come off, or null for a spec decision. */
  routed: string | null;
}

/**
 * The modes whose outcome code still reads a scaled body — the ball on the hand bone for the touch, the release or the catch —
 * so every body in them spawns at exactly 1.0 / 1.0 / 1.0. Keyed by the harness's modeId (ModeHarness stamps
 * `scene.metadata.felModeId` before a mode spawns). An entry comes off when that mode reads its outcome points through
 * playFramePoint; the scaled body is then only drawn.
 */
export const STANDARD_FRAME_MODES: Readonly<Record<string, StandardFrameEntry>> = {
  // the spec's own call (Decision 5): the smallest safe change inside a gated mode, with no touch-geometry refactor in it
  dunk: { until: 'the Venice dunk passes; then its touch, release and catch read playFramePoint (R6)', routed: 'R6' },
  dunkduel: { until: 'the Venice dunk passes; then its release reads playFramePoint (R6)', routed: 'R6' },
  // held by hoops-motion (LANES §3), so the play-frame points are routed diffs and the rule "never changes reach in any mode" holds
  // meanwhile by spawning these at 1.0
  threepoint: { until: 'R3 lands in ThreePointMode.ts (the pick, the catch and the release through playFramePoint)', routed: 'R3' },
  onevone: { until: 'R4 lands in OneVOneMode.ts (every ball-on-hand release, contest and swat read through playFramePoint)', routed: 'R4' },
  threevthree: { until: 'R5 lands in ThreeVThreeMode.ts (every ball-on-hand release, contest and swat read through playFramePoint)', routed: 'R5' },
};

/** Where a body is spawned: the harness's mode, and whether the session is ranked. */
export interface PlayContext {
  modeId?: string | null;
  ranked?: boolean;
}

export interface ProportionInput {
  heightScale?: number | null;
  buildScale?: number | null;
  /** Read by nothing. Old saves and old scan rows still carry it (stored JSON is never migrated). */
  reachScale?: number | null;
}

/** The scales a body is actually spawned with. Reach is not a variable any more. */
export interface PlayScales {
  heightScale: number;
  buildScale: number;
  reachScale: 1;
}

/** The context a scene's metadata describes — the stamps ModeHarness writes (`felModeId`; `felRanked`, which nothing sets yet). */
export function playContextOf(metadata: unknown): PlayContext {
  const md = (metadata ?? {}) as { felModeId?: unknown; felRanked?: unknown };
  return { modeId: typeof md.felModeId === 'string' ? md.felModeId : null, ranked: md.felRanked === true };
}

/** True when every body here plays, and is drawn, at the standard frame. */
export function isStandardFrame(ctx: PlayContext = {}): boolean {
  if (ctx.ranked === true) return true;
  return !!ctx.modeId && Object.prototype.hasOwnProperty.call(STANDARD_FRAME_MODES, ctx.modeId);
}

/** One cosmetic scale, clamped. A missing, zero or non-numeric value is the standard frame (the old `|| 1`). */
export function clampCosmetic(v: unknown, axis: keyof typeof COSMETIC_CLAMP): number {
  const n = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1;
  const [lo, hi] = COSMETIC_CLAMP[axis];
  return Math.min(hi, Math.max(lo, n));
}

/** The scales a body spawns with here: exactly 1.0 when ranked or in a standard-frame mode, otherwise height and build clamped. */
export function playScales(p: ProportionInput | null | undefined, ctx: PlayContext = {}): PlayScales {
  if (isStandardFrame(ctx)) return { heightScale: 1, buildScale: 1, reachScale: 1 };
  return { heightScale: clampCosmetic(p?.heightScale, 'height'), buildScale: clampCosmetic(p?.buildScale, 'build'), reachScale: 1 };
}

export interface V3 { x: number; y: number; z: number }

/** What a play scale does to the root, per axis: height on all three, build on the girth (x, z) only — applyProportions. */
export function rootMultiplier(s: Pick<PlayScales, 'heightScale' | 'buildScale'>): V3 {
  const g = s.heightScale * s.buildScale;
  return { x: g, y: s.heightScale, z: g };
}

/**
 * A point on a scaled body, moved to where the same point sits on the standard (1.0) body: `root + (point − root) ⊘ multiplier`.
 *
 * Exact for a root turned about the vertical only, which is every player root: (h·b, h, h·b) commutes with any yaw, so the
 * division can be done in world axes. playFramePoint takes the root's full world matrix for anything else. Arms are frozen at
 * their bind length and clips key rotations only, so the ROOT's scale is the only thing that separates the two bodies.
 */
export function toPlayFrame(point: V3, root: V3, s: Pick<PlayScales, 'heightScale' | 'buildScale'>): V3 {
  const m = rootMultiplier(s);
  return {
    x: root.x + (point.x - root.x) / m.x,
    y: root.y + (point.y - root.y) / m.y,
    z: root.z + (point.z - root.z) / m.z,
  };
}
