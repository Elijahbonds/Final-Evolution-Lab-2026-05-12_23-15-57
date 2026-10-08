/**
 * Strings: light / heavy presses become named moves with frame data (plan A2: "light/heavy strings from
 * FighterStyle.ROUTES and HordeDynamics' buffer; launchers and air strings from StormCombat").
 *
 * Nothing here is new combat design. The pieces are the shipped ones, composed:
 *   - HordeDynamics' STRING BOOK resolves a press (with the string so far, the stick against the target line, and the
 *     situation: a launched body in front = the air links) into a move; its 0.75 s chain window is the string window.
 *   - StrikeSystem's `bookMoveset` gives each book move its FRAME DATA (startup, active, recovery, the cancel point)
 *     and FightCore-shaped damage, stun and knockback; `validateMoveset` holds the 100 ms readability floor.
 *   - FighterStyle's ROUTES pay a named string's finisher (jab→heavy is a route, kick-kick-heavy the big one).
 *   - StormCombat's launch window is how long a launched body stays up for the air string.
 *
 * The Adventure's pad has two strike buttons (plan: X / Y = light / heavy), so light presses the book's A (the punch
 * family) and heavy its Y (the heavy family). Display labels are the Adventure's own, generic and [PLACEHOLDER]: the
 * book's banners are not shipped here (the IP line: no move names from a feel reference).
 */

import { KARATE_ATTACKS } from '@/lib/babylon/core/FightCore';
import { MOVES, type HordeMove, type MoveId, type MoveOpts, type StickDir, type StrikeBtn } from '@/lib/babylon/core/HordeDynamics';
import { bookMoveset, validateMoveset, type CombatMove } from '@/lib/babylon/core/StrikeSystem';
import type { RouteStrike } from '@/lib/babylon/core/FighterStyle';

export type StrikeInput = 'light' | 'heavy';

/** Which book button each Adventure button presses. */
export const BUTTON_OF: Readonly<Record<StrikeInput, StrikeBtn>> = { light: 'A', heavy: 'Y' };

/** The Adventure's names for the book's moves: generic, descriptive, [PLACEHOLDER] until the owner names them. */
const LABEL: Readonly<Record<MoveId, string>> = {
  jab: 'Jab', cross: 'Cross', uppercut: 'Rising Launcher', kick: 'Kick', whirl: 'Spin Sweep', roundhouse: 'Roundhouse',
  typhoon: 'Spiral Launcher', heavy: 'Heavy Launcher', hammer: 'Hammer Blow', rush: 'Rush', hook: 'Hook',
  airJab: 'Air Jab', airHook: 'Air Hook', spike: 'Air Slam', sweep: 'Low Sweep', elbow: 'Elbow',
  spinElbow: 'Spinning Elbow', jumpKick: 'Jump Kick', jumpSpinKick: 'Jumping Spin Kick', backSpin: 'Back Spin Kick',
  uppercutLink: 'Uppercut',
};

export interface AdventureMove {
  id: MoveId;
  /** `[PLACEHOLDER] …`: the owner names moves (plan: open decision 1). */
  label: string;
  weight: HordeMove['weight'];
  range: number;
  arcDeg: number;
  launch: boolean;
  /** An air link (thrown at a launched body); a slam ends the air string. */
  air: boolean;
  slam: boolean;
  ender: boolean;
  lunge: number;
  /** Damage, hit-stun and knockback metres (StrikeSystem.bookMoveset over FightCore's karate base). */
  dmg: number;
  staggerSec: number;
  knockbackM: number;
  /** Frame data, seconds from the press. */
  startupSec: number;
  activeSec: number;
  recoverySec: number;
  /** From here a buffered press cancels into the next link (the string rule). */
  cancelAtSec: number;
  /** Which FighterStyle route step this strike counts as. */
  route: RouteStrike;
}

/** StrikeSystem's frame data for every book move, over FightCore's karate base (the shipped fists). */
export const ADVENTURE_FRAME_DATA: Readonly<Record<string, CombatMove>> = bookMoveset(KARATE_ATTACKS);

const routeOf = (w: HordeMove['weight']): RouteStrike => (w === 'light' ? 'jab' : w === 'medium' ? 'kick' : 'heavy');

function build(): Record<MoveId, AdventureMove> {
  const out = {} as Record<MoveId, AdventureMove>;
  for (const id of Object.keys(MOVES) as MoveId[]) {
    const m: HordeMove = MOVES[id];
    const f = ADVENTURE_FRAME_DATA[id];
    out[id] = {
      id, label: `[PLACEHOLDER] ${LABEL[id]}`, weight: m.weight, range: m.range, arcDeg: m.arcDeg,
      launch: m.launch, air: !!m.air, slam: !!m.slam, ender: m.ender, lunge: m.lunge,
      dmg: f.atk.dmg, staggerSec: f.atk.stunSec, knockbackM: f.atk.knockback,
      startupSec: f.startupSec, activeSec: f.activeSec, recoverySec: f.recoverySec,
      cancelAtSec: f.cancelAtSec ?? f.startupSec + f.activeSec,
      route: routeOf(m.weight),
    };
  }
  return out;
}

/** Every move the Adventure's strings can produce, built once at load. */
export const ADVENTURE_MOVES: Readonly<Record<MoveId, AdventureMove>> = build();

/** The moveset lint (StrikeSystem): no unreadable startup, every cancel target real. Empty = valid. */
export function validateAdventureMoves(): string[] {
  // Every book move cancels under the string rule ('*': any link past the cancel point). The lint reads '*' as an
  // unknown move id, so the wildcard is taken out before the check; every named cancel target is still checked.
  const named: Record<string, CombatMove> = {};
  for (const [id, m] of Object.entries(ADVENTURE_FRAME_DATA)) named[id] = { ...m, cancelInto: m.cancelInto.filter((c) => c !== '*') };
  return validateMoveset(named);
}

/** Total length of a swing, seconds. */
export const swingSec = (m: AdventureMove): number => m.startupSec + m.activeSec + m.recoverySec;

/** Resolve a press through an actor's string book. */
export function pressString(book: { press(btn: StrikeBtn, dir: StickDir, now: number, opts?: MoveOpts): HordeMove },
  input: StrikeInput, dir: StickDir, now: number, opts: MoveOpts): AdventureMove {
  const m = book.press(BUTTON_OF[input], dir, now, opts);
  return ADVENTURE_MOVES[m.id as MoveId];
}
