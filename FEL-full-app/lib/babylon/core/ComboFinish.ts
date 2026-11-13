// ComboFinish — hoops-gather G4 (owner 2026-11-12: "a euro step dunk", "a spin move into a dunk"; docs/HOOPS-GATHER-ESCAPE-PLAN.md §5 G4).
//
// Measured at eec53f24: a euro always ended in a layup or a floater (HoopsMoves.planEuro), a hop in a rise, a layup or a floater
// (FinishFootwork.hopThen), and the spin thrown into the take-off was always the 360 (HoopsDunks.PAUSIN_DUNK). Nothing here authors a
// clip: a footwork gather may END in the dunk the drive would have picked anyway (pickHoopsDunk), on the clips the hoops rigs carry.
//
//   THE EURO INTO A DUNK — the turbo held at the squeeze, fast enough, and the euro's last plant inside dunk range: the second step is the
//     take-off. The cross is the angle (across the rim's face: the windmill at speed, the cradle without it), a body in the way the
//     double clutch — pickHoopsDunk's own order.
//   THE HOP INTO A DUNK — the same, off two feet: no angle to wind up on (the two-hand flush standing still, the tomahawk at speed).
//   (THE SPIN INTO A DUNK already exists two ways and is not changed here: PAUSIN', the sweep with the turbo in range, is the 360 through
//   the rise; and a ground spin's gather window lets a squeeze in dunk range take off into the drive's own pick — measured in G7.)
//
// Every number is new and a knob whose off value is today exactly (hoops.comboDunkOn 0). Pure: no Babylon, no scene.
import { feel } from '../../feel-panel/feel';   // knobs hoops.comboDunkOn / hoops.comboDunkMinMps (lib/feel-panel/knobs.ts)
import { DUNK_RANGE, DUNK_MIN_TURBO } from './BasketballCore';
import { pickHoopsDunk, ANGLED, type DunkRead, type HoopsDunk } from './HoopsDunks';

/** A euro or a hop may end in a dunk (1) / never does (0: as before). Knob `hoops.comboDunkOn`. */
export const COMBO_DUNK_ON = 0;
/** The drive must be at least this fast at the squeeze (m/s) — the drive dunk's own floor is DUNK_MIN_SPEED 3.4 at the take-off; a gather
 *  bleeds some of it, so the read is at the squeeze. Knob `hoops.comboDunkMinMps`. */
export const COMBO_DUNK_MIN_MPS = 3.4;
export const comboDunkOn = (): boolean => feel('hoops.comboDunkOn', COMBO_DUNK_ON) >= 0.5;

export interface ComboRead {
  /** Sprint (the turbo) held at the squeeze, with fuel (the drive dunk's own gate: the mode's sprintOk). */
  sprint: boolean;
  turbo01: number;
  /** Planar speed at the squeeze (m/s). */
  speed: number;
  /** Planar distance from the rim's floor point where the gather's last plant lands (m). */
  rimDistAfter: number;
}
/** Does this euro / hop end in a dunk? */
export function comboDunkThen(r: ComboRead): boolean {
  if (!comboDunkOn()) return false;
  if (!r.sprint || r.turbo01 < DUNK_MIN_TURBO) return false;
  if (r.speed < feel('hoops.comboDunkMinMps', COMBO_DUNK_MIN_MPS)) return false;
  return r.rimDistAfter <= DUNK_RANGE;
}
/** The dunk a euro or a hop ends in: the drive's own pick, with the footwork's shape — the euro's cross puts the approach at least ANGLED
 *  across the rim's face, the hop's two feet take none. */
export function comboDunkPick(kind: 'euro' | 'hop', read: DunkRead): HoopsDunk {
  const lateral01 = kind === 'euro' ? Math.max(read.lateral01, ANGLED) : 0;
  return pickHoopsDunk({ ...read, lateral01 });
}
/** Where a gather's legs put the feet: the shooter plus every leg's travel (planar). */
export function gatherEnd(shooter: { x: number; z: number }, legs: ReadonlyArray<{ dir: { x: number; z: number }; sec: number; speed: number }> | undefined): { x: number; z: number } {
  let x = shooter.x, z = shooter.z;
  for (const l of legs ?? []) { x += l.dir.x * l.speed * l.sec; z += l.dir.z * l.speed * l.sec; }
  return { x, z };
}
