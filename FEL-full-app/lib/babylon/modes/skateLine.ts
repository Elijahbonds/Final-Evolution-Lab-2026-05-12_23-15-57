// SKATE LINE (IMPROVE 2026-10-06) — the THPS line's small rules SkateRunMode wires in, pure so each is tested on its own
// (skateLine.test.ts): which grind a rail lock is (item 11), what a lock's repeat identity is (item 12), the combo line the
// ticker reads (item 10), and the buzzer's warnings (item 19). No Babylon, no DOM.
import type { BoardTrick } from '../core/BoardTricks';
import type { ComboLink } from '../core/ComboChain';

// ── Item 11: NAMED GRINDS ────────────────────────────────────────────────────────────────────────────────────────────
/** A grind the held stick picks at the lock: its name, and the shape the mode puts on the rider for it. */
export interface GrindTrick {
  id: '5050' | 'boardslide' | 'noseslide' | 'tailslide';
  label: string;
  /** The whole rider (and the deck with him) turned off the rail, radians: a slide rides the deck ACROSS the bar. */
  bodyYaw: number;
  /** The deck's nose angle on the bar (the manual's sign: negative is nose up). */
  boardPitch: number;
}
const QUARTER = Math.PI / 2;
/**
 * Every lock was "GRIND" (or "TRANSFER GRIND") although the slides were already in the trick table. THPS picks the grind
 * from the stick held as the board meets the bar: nothing held rides the trucks (50-50), across the bar is the boardslide
 * (the side you hold is the side you turn), forward puts the NOSE on it, back the TAIL. The points are the rail's, as
 * before — the name and the shape are what is new.
 */
export function grindTrickFor(dir: BoardTrick['dir']): GrindTrick {
  switch (dir) {
    case 'left': return { id: 'boardslide', label: 'BOARDSLIDE', bodyYaw: -QUARTER, boardPitch: 0 };
    case 'right': return { id: 'boardslide', label: 'BOARDSLIDE', bodyYaw: QUARTER, boardPitch: 0 };
    case 'up': return { id: 'noseslide', label: 'NOSESLIDE', bodyYaw: QUARTER, boardPitch: -0.22 };
    case 'down': return { id: 'tailslide', label: 'TAILSLIDE', bodyYaw: QUARTER, boardPitch: 0.22 };
    default: return { id: '5050', label: '50-50', bodyYaw: 0, boardPitch: 0 };
  }
}
/** A rail at or above this bonus is a transfer (the kinked and the high rails); the lock says so. */
export const TRANSFER_BONUS = 260;
export function grindLabel(trick: GrindTrick, bonus: number): string {
  return bonus >= TRANSFER_BONUS ? `TRANSFER ${trick.label}` : trick.label;
}

// ── Item 12: LOCKS DECAY BY WHAT YOU LOCKED ──────────────────────────────────────────────────────────────────────────
/** A rail's repeat identity in a combo: its goal id when it has one, else its place in the world's list. */
export function railKey(gapId: string | undefined, index: number): string { return `rail:${gapId ?? `#${index}`}`; }
/** A wall's repeat identity: the face — its label AND where it starts, since the plaza's two gap ledges (and the two
 *  walls' short ends) share labels and are still different faces. */
export function wallKey(w: { label: string; a: { x: number; z: number } }): string { return `wall:${w.label}@${w.a.x.toFixed(1)},${w.a.z.toFixed(1)}`; }
/** A lip's repeat identity: its label (plazaLips names each one once). */
export function lipKey(label: string): string { return `lip:${label}`; }

// ── Item 10: THE COMBO LINE ──────────────────────────────────────────────────────────────────────────────────────────
/** The ticker shows this many links; an older head is folded into "…". */
export const COMBO_LINE_LINKS = 4;
/** "KICKFLIP + 50-50 + MANUAL": the links of the open combo, newest last (an air's own chain keeps its arrows). */
export function comboLine(links: readonly Pick<ComboLink, 'label'>[], max = COMBO_LINE_LINKS): string {
  if (!links.length) return '';
  const shown = links.slice(-max).map((l) => l.label.replace(/^SKETCHY\s+/, ''));
  return (links.length > max ? '… + ' : '') + shown.join(' + ');
}
/** The line under it: what the pot is waiting on. Settling is the moment a manual still saves the line. */
export function settlePrompt(active: boolean, settling: boolean): string {
  if (!active) return '';
  return settling ? 'SETTLING — MANUAL TO KEEP IT GOING' : 'LINK TRICKS BEFORE YOU SETTLE';
}

// ── Item 19: THE BUZZER ──────────────────────────────────────────────────────────────────────────────────────────────
/** The clock's warning, seconds left. */
export const BUZZER_WARN_SEC = 10;
/** How often "LAND IT!" may repeat while a pot rides into the buzzer (seconds). */
export const LAND_IT_EVERY_SEC = 1.5;
/**
 * The buzzer burns a pot still in the air, on a rail or in a manual — and the clock just ran out on it. Two cues: the ten
 * second call as the clock crosses it, and LAND IT! (repeating, not every frame) while a pot is open in a state the buzzer
 * would burn. `sinceLandIt` is the seconds since the last LAND IT!.
 */
export function buzzerCue(prevLeft: number, left: number, potOpen: boolean, burnable: boolean, sinceLandIt: number): 'ten' | 'landIt' | null {
  if (prevLeft > BUZZER_WARN_SEC && left <= BUZZER_WARN_SEC && left > 0) return 'ten';
  if (left <= BUZZER_WARN_SEC && left > 0 && potOpen && burnable && sinceLandIt >= LAND_IT_EVERY_SEC) return 'landIt';
  return null;
}

// ── Item 20: THE WALL RIDE'S CAMERA ──────────────────────────────────────────────────────────────────────────────────
/**
 * Which way the air cam swings on a wall ride (CameraDirector.setAir's `side`): toward the wall's OPEN side. The director
 * swings to the right of its look direction, which is down the travel `v` — right of that is (v.z, −v.x). With the wall's
 * normal `n` (pointing into the park, away from the face) on that side, +1 is right; otherwise −1 swings left.
 */
export function wallCamSide(vx: number, vz: number, nx: number, nz: number): 1 | -1 {
  return vz * nx - vx * nz >= 0 ? 1 : -1;
}
