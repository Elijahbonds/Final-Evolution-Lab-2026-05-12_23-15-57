// crowdFront — VENUE-SMOOTH-1 (2026-10-29): the FRONT crowd row is the forge rivals (athleteRoster, MPFB2), the five Meshy
// crowd bodies sit behind it. The front row is the one a camera actually sees faces in, and the Meshy scans are the bodies the
// owner took off the roster (REPLACED_MESHY); the back rows are a few pixels each, where they still read as a crowd.
//
// The forge spectators are rivals NO hoops mode casts (dunk, dunk duel, 1v1, 3v3), so a fan never wears the face of the rival
// on the court.
import { ATHLETE_ROSTER, MODE_CAST } from '../../core/athleteRoster';
import { feel } from '../../../feel-panel/feel';
import { demoModelFlags, type DemoModelFlags } from '../../core/demoModels';
import type { Seat } from './crowdLayout';

/** The feel knob crowd.forgeFront: default OFF (PM, 2026-10-30) — off, the Meshy crowd fills every row and no forge body loads. */
export const CROWD_FORGE_FRONT_ON = 0;
// DEMO-MODELS-1 (2026-11-09): the server setting CROWD_FORGE_FRONT_ENABLED turns the forge front row on for everyone. Off, it is
// exactly as before: CROWD_FORGE_FRONT_ON (0), and the feel knob can turn it on for a playtest. (A knob at its default 0 stores no
// override, feel.ts parseFeelOverrides, so while the setting is on the off switch is the setting itself.)
export function forgeFrontOn(): boolean { return feel('crowd.forgeFront', demoModelFlags().crowdForgeFront ? 1 : CROWD_FORGE_FRONT_ON) >= 0.5; }

/** DEMO-MODELS-1: THE BACK-ROW HOOK. The light forge back-row bodies 3D Art is making go here, as `/models/crowd/...` paths, when
 *  they are delivered (none are yet, so it is empty and nothing changes). assumption: crowdBake shares the first back body's
 *  material across all of them (Meshy bodies share one atlas); revisit that when the forge files land if they don't. */
export const CROWD_BACK_LIGHT_URLS: readonly string[] = [];
/** The bodies the crowd's back rows bake: the light forge bodies while CROWD_FORGE_FRONT_ENABLED is on and some are delivered,
 *  otherwise the Meshy bodies passed in (crowdBake CROWD_BODY_URLS), exactly as before. */
export function crowdBackBodyUrls(meshy: readonly string[], flags: DemoModelFlags = demoModelFlags(), light: readonly string[] = CROWD_BACK_LIGHT_URLS): readonly string[] {
  return flags.crowdForgeFront && light.length > 0 ? light : meshy;
}

export const CROWD_FRONT_KEYS: readonly string[] = ['halo', 'quill', 'sol', 'yara'];
export const CROWD_FRONT_URLS: readonly string[] = CROWD_FRONT_KEYS.map((k) => ATHLETE_ROSTER.find((a) => a.key === k)!.url);
/** The hoops casts the front row must stay out of. */
export const CROWD_FRONT_AVOIDS: readonly string[] = ['dunk', 'dunkduel', 'onevone', 'threevthree'].flatMap((m) => MODE_CAST[m] ?? []);

/** Each stand's front row: the lowest row any of its seats sits in (a stand's `firstRow` is where its fans start). */
export function frontRowOf(seats: readonly Pick<Seat, 'stand' | 'row'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of seats) { const r = m.get(s.stand); if (r === undefined || s.row < r) m.set(s.stand, s.row); }
  return m;
}

/** Which baked body a fan is: a forge body on its stand's front row (when any loaded), else one of the Meshy bodies. */
export function fanBody(s: Pick<Seat, 'stand' | 'row' | 'body'>, front: ReadonlyMap<string, number>, frontCount: number, backCount: number): { front: boolean; index: number } {
  if (frontCount > 0 && front.get(s.stand) === s.row) return { front: true, index: s.body % frontCount };
  return { front: false, index: s.body % Math.max(1, backCount) };
}
