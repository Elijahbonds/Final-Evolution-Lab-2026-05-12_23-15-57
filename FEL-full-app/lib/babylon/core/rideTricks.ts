// rideTricks — the names a body's grab and spin make in each board discipline's own table (movement play P8, 2026-09-26).
//
// The mode reads the body's grab (a hand at the board's edge, which hand, which edge) and its quarter-turn (frontside or
// backside) through lib/babylon/core/rideBody's RideIntents; this is where they become a trick of skate's, snow's or surf's
// vocabulary (BoardTricks), against the air the rider has left — the same air budget a pad's press gets. Split from
// rideBody so the modes that only run (sprint) never import the boards' vocabulary and its clips (clipScope.test).
// Pure: no DOM, no Babylon.
import { SKATE_TRICKS, SNOW_TRICKS, SURF_TRICKS, airPressFor, fitsAir, type BoardDiscipline, type BoardTrick } from './BoardTricks';
import type { RideHand, RideEdge } from './rideBody';

/**
 * The grab a hand and an edge make in a discipline, the air left (s) deciding what can be held (PLAN-P8 §3.2):
 *   skate  rear·toe INDY · lead·heel MELON · lead·toe JAPAN AIR if the air holds it, else INDY · rear·heel (or no edge) the
 *          plain GRAB (null: the mode's own TRICKS.grab);
 *   snow   rear·toe INDY · lead·heel METHOD · rear·heel STALEFISH · lead·toe INDY — through airPressFor's X grab by direction;
 *   surf   the mode's one grab (null).
 */
export function grabTrickFor(d: BoardDiscipline, hand: RideHand, edge: RideEdge, airSec: number): BoardTrick | null {
  if (d === 'skate') {
    const by = (id: string) => SKATE_TRICKS.find((t) => t.id === id) ?? null;
    if (hand === 'rear' && edge === 'toe') return by('indy');
    if (hand === 'lead' && edge === 'heel') return by('melon');
    if (hand === 'lead' && edge === 'toe') { const j = by('japan'); return j && fitsAir(j, airSec) ? j : by('indy'); }
    return null;
  }
  if (d === 'snow') {
    const dir: BoardTrick['dir'] = hand === 'lead' && edge === 'heel' ? 'left' : hand === 'rear' && edge === 'heel' ? 'right' : 'up';
    return airPressFor('snow', dir, 'X', Math.max(0.3, airSec));
  }
  return null;
}

/**
 * The biggest spin in a direction the air left (s) can finish — the same air budget a pad's press gets (PLAN-P8 §3.2):
 *   skate  backside: the 540 if it fits, else BS 180 · frontside: FS 360 if it fits, else nothing (the table has no FS 180,
 *          owner call 2);
 *   snow   frontside: 720 → 360 · backside: CORK 720 → 540 MELON;
 *   surf   (in the air) frontside AIR REVERSE · backside ALLEY-OOP, if it fits.
 */
export function spinTrickFor(d: BoardDiscipline, dir: 'fs' | 'bs', airSec: number): BoardTrick | null {
  const table: Record<BoardDiscipline, Record<'fs' | 'bs', string[]>> = {
    skate: { fs: ['fs360'], bs: ['spin540', 'bs180'] },
    snow: { fs: ['snow720', 'snow360'], bs: ['cork720', 'snow540'] },
    surf: { fs: ['air_reverse'], bs: ['alley_oop'] },
  };
  const list = d === 'skate' ? SKATE_TRICKS : d === 'snow' ? SNOW_TRICKS : SURF_TRICKS;
  for (const id of table[d][dir]) {
    const t = list.find((x) => x.id === id);
    if (t && fitsAir(t, airSec)) return t;
  }
  return null;
}
