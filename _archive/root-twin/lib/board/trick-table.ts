/**
 * lib/board/trick-table.ts
 *
 * THPS-style input -> trick lookup for the three board disciplines.
 * A trick is (button, direction-at-press) -> TrickDef; air spin is layered on
 * top and folded into the display name ("BS 360 Kickflip") and the score.
 *
 * Harvested from copilot_input/InputSystem.js per-mode faceButtonAction maps,
 * generalised into a data table so HUD, scoring and audio all read one source.
 *
 * All 3 modes animate through the shipped clips (skate_trick / snow_trick /
 * surf_ride — see ASSET_INVENTORY.md). Trick differentiation on top of the
 * single clip is procedural (board roll/pitch in board-sports-3d.tsx).
 * Bespoke per-trick clips are a NEXT-tier item (see GAP_ANALYSIS.md).
 */

export type BoardModeId = 'skate' | 'snow' | 'surf';
export type TrickDir = 'up' | 'down' | 'left' | 'right' | 'neutral';
export type TrickButton = 'flip' | 'grab' | 'special';

export interface TrickDef {
  /** stable id for repetition-decay bookkeeping */
  id: string;
  /** display name per discipline */
  names: Record<BoardModeId, string>;
  /** base points before spin bonus / multiplier / decay */
  base: number;
  /** trick must finish before touchdown or landing is a bail */
  durationMs: number;
  /** procedural board roll turns (kickflip axis, +/-) */
  boardRoll: number;
  /** procedural board/body pitch turns (flip axis, +/-) */
  boardPitch: number;
  /** requires full boost meter (TRICKY state) */
  special?: boolean;
}

// ---------------------------------------------------------------------------
// Trick tables
// ---------------------------------------------------------------------------

export const FLIP_TRICKS: Record<TrickDir, TrickDef> = {
  left: {
    id: 'flip_left',
    names: { skate: 'Kickflip', snow: 'Wildcat', surf: 'Air Reverse' },
    base: 250,
    durationMs: 420,
    boardRoll: -1,
    boardPitch: 0,
  },
  right: {
    id: 'flip_right',
    names: { skate: 'Heelflip', snow: 'Tamedog', surf: 'Frontside Snap' },
    base: 250,
    durationMs: 420,
    boardRoll: 1,
    boardPitch: 0,
  },
  down: {
    id: 'flip_down',
    names: { skate: '360 Flip', snow: 'Backflip', surf: 'Rodeo Flip' },
    base: 450,
    durationMs: 620,
    boardRoll: -1,
    boardPitch: -1,
  },
  up: {
    id: 'flip_up',
    names: { skate: 'Impossible', snow: 'Frontflip', surf: 'Alley-Oop' },
    base: 400,
    durationMs: 560,
    boardRoll: 0,
    boardPitch: 1,
  },
  neutral: {
    id: 'flip_neutral',
    names: { skate: 'Pop Shuvit', snow: 'Ollie Shifty', surf: 'Punt' },
    base: 150,
    durationMs: 320,
    boardRoll: 0,
    boardPitch: 0,
  },
};

export const GRAB_TRICKS: Record<TrickDir, TrickDef> = {
  left: {
    id: 'grab_left',
    names: { skate: 'Melon', snow: 'Mute Grab', surf: 'Slob Grab' },
    base: 200,
    durationMs: 380,
    boardRoll: 0,
    boardPitch: 0,
  },
  right: {
    id: 'grab_right',
    names: { skate: 'Indy', snow: 'Stalefish', surf: 'Indy Grab' },
    base: 200,
    durationMs: 380,
    boardRoll: 0,
    boardPitch: 0,
  },
  up: {
    id: 'grab_up',
    names: { skate: 'Nosegrab', snow: 'Nose Grab', surf: 'Nose Poke' },
    base: 220,
    durationMs: 400,
    boardRoll: 0,
    boardPitch: 0.15,
  },
  down: {
    id: 'grab_down',
    names: { skate: 'Tailgrab', snow: 'Tail Grab', surf: 'Tail Throw' },
    base: 220,
    durationMs: 400,
    boardRoll: 0,
    boardPitch: -0.15,
  },
  neutral: {
    id: 'grab_neutral',
    names: { skate: 'Method', snow: 'Method', surf: 'Layback Air' },
    base: 320,
    durationMs: 480,
    boardRoll: 0,
    boardPitch: 0,
  },
};

/**
 * ÜBER TRICKS — SSX3-style signature set. Only fires in TRICKY (full boost).
 * The direction held at the special-button press selects the über, giving the
 * variety SSX3 is known for instead of a single canned move. Every über is
 * high-value and slow (long durationMs) so it demands real air. // TUNE(elijah)
 */
export const UBER_TRICKS: Record<TrickDir, TrickDef> = {
  neutral: {
    id: 'uber_neutral',
    names: { skate: 'The 900', snow: 'Superman Backflip', surf: 'Sushi Roll' },
    base: 2500, durationMs: 1050, boardRoll: 1, boardPitch: -1, special: true,
  },
  up: {
    id: 'uber_up',
    names: { skate: 'Christ Air', snow: 'Misty Flip Grab', surf: 'Kerrupt Flip' },
    base: 2800, durationMs: 1120, boardRoll: 0, boardPitch: 2, special: true,
  },
  down: {
    id: 'uber_down',
    names: { skate: 'Darkslide 720', snow: 'Double Cork 1080', surf: 'Rodeo 720' },
    base: 3200, durationMs: 1240, boardRoll: -2, boardPitch: -1, special: true,
  },
  left: {
    id: 'uber_left',
    names: { skate: 'Ghetto Bird', snow: 'Yardsale Wildcat', surf: 'Superman Reverse' },
    base: 2600, durationMs: 1080, boardRoll: -2, boardPitch: 0, special: true,
  },
  right: {
    id: 'uber_right',
    names: { skate: 'Sproctologist', snow: 'Rocket Air Tamedog', surf: 'Pop-Shuv Alley-Oop' },
    base: 2600, durationMs: 1080, boardRoll: 2, boardPitch: 0, special: true,
  },
};

/** Back-compat alias: the neutral über was the original single signature trick. */
export const SPECIAL_TRICK: TrickDef = UBER_TRICKS.neutral;

export function lookupTrick(button: TrickButton, dir: TrickDir): TrickDef {
  if (button === 'special') return UBER_TRICKS[dir] ?? UBER_TRICKS.neutral;
  return button === 'flip' ? FLIP_TRICKS[dir] : GRAB_TRICKS[dir];
}

// ---------------------------------------------------------------------------
// Spin naming + scoring
// ---------------------------------------------------------------------------

/** Snap accumulated spin degrees to the nearest named rotation. */
export function namedSpin(spinDeg: number): { deg: number; label: string } {
  const abs = Math.abs(spinDeg);
  // snap to nearest 180; below 135deg of rotation we don't name a spin
  const snapped = Math.round(abs / 180) * 180;
  if (snapped < 180) return { deg: 0, label: '' };
  const side = spinDeg >= 0 ? 'FS' : 'BS';
  return { deg: snapped, label: `${side} ${snapped}` };
}

export interface ScoredTrick {
  /** composed display name, e.g. "BS 360 Kickflip" */
  name: string;
  /** points after spin bonus and repetition decay (pre-multiplier) */
  points: number;
  /** true when repetition decay kicked in (HUD dims the popup) */
  stale: boolean;
}

/**
 * Score a landed trick. THPS-style repetition decay: each reuse of the same
 * trick id in a single run is worth 80% of the previous one, floored at 25%.
 */
export function scoreTrick(
  def: TrickDef,
  mode: BoardModeId,
  spinDeg: number,
  usesSoFar: number
): ScoredTrick {
  const spin = namedSpin(spinDeg);
  const spinBonus = (spin.deg / 180) * 140;
  const decay = Math.max(0.25, Math.pow(0.8, usesSoFar));
  const points = Math.round((def.base + spinBonus) * decay);
  const name = spin.label ? `${spin.label} ${def.names[mode]}` : def.names[mode];
  return { name, points, stale: usesSoFar > 0 };
}

/** Score a pure spin landed with no button trick ("BS 540"). */
export function scoreSpinOnly(spinDeg: number, usesSoFar: number): ScoredTrick | null {
  const spin = namedSpin(spinDeg);
  if (spin.deg < 360) return null; // bare 180s don't score — keeps flow honest
  const decay = Math.max(0.25, Math.pow(0.8, usesSoFar));
  return {
    name: spin.label,
    points: Math.round((spin.deg / 180) * 160 * decay),
    stale: usesSoFar > 0,
  };
}

/** Points-per-second while grinding / lip-floating (fed to ComboEngine). */
export const GRIND_POINTS_PER_SEC = 180;

/** The single ride/trick clip each discipline owns (ASSET_INVENTORY.md). */
export const MODE_TRICK_CLIP: Record<BoardModeId, string> = {
  skate: 'skate_trick',
  snow: 'snow_trick',
  surf: 'surf_ride',
};
