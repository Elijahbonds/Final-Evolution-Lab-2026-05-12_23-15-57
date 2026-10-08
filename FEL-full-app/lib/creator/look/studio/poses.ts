// POSE IT (CREATOR-PLAN phase 4d, 2026-10-06): the look in the poses and the light of the games it will be played in.
// Read-only for the scene: a pose or a venue light changes what the Studio shows, never the look or the save.
//
// THE POSES are clips the game already builds (lib/babylon/anim/authored, registered on every body in an unscoped scene —
// the Studio's scene has no mode, so it builds them all). A held pose plays once and freezes on its last frame
// (CharacterAnimator.freezeAtEnd), so a dunk hang stays hanging; a stance loops.
//
// THE VENUE LIGHTS are the mode moods (lib/babylon/scene/moods.ts MODE_MOODS): the key takes the mood's sun colour, the
// fill its sky and ground, the coloured back light its sky, and the environment map is built from the same mood
// (EnvironmentIBL), so metal and glow read the way they will in that venue.

import { MOODS, type VenueMood } from '../../../babylon/scene/moods';

export interface StudioPose {
  id: string;
  label: string;
  /** the clip; null = the body's own idle (the turntable's stance) */
  clip: string | null;
  /** play once and freeze on the last frame (true) or loop (false) */
  hold: boolean;
  /** the venue light that suits it (a hint the photo mode uses) */
  mood: VenueMood | null;
}

/** assumption (phase 4d): there is no authored "sprint start"; the dunk's loaded gather crouch (dunk_charge_gather, an
 *  authored clip) reads as one and is used for it. The fight stance is the karate idle stance (the guard, looping). */
export const STUDIO_POSES: readonly StudioPose[] = [
  { id: 'idle', label: 'Stand', clip: null, hold: false, mood: null },
  { id: 'dunkHang', label: 'Dunk hang', clip: 'dunk_score_hang', hold: true, mood: 'goldenHour' },
  { id: 'fight', label: 'Fight stance', clip: 'karate_idle_stance', hold: false, mood: 'dojoWarm' },
  { id: 'boardGrab', label: 'Board grab', clip: 'board_grab', hold: true, mood: 'alpine' },
  { id: 'sprintStart', label: 'Sprint start', clip: 'dunk_charge_gather', hold: true, mood: 'daylight' },
  { id: 'victory', label: 'Victory', clip: 'dunk_celebrate_big', hold: true, mood: 'nightGame' },
];

export const poseById = (id: string): StudioPose => STUDIO_POSES.find((p) => p.id === id) ?? STUDIO_POSES[0];

export interface StudioVenue { id: 'studio' | VenueMood; label: string }

/** The Studio's own light first, then each venue mood a mode plays under. */
export const STUDIO_VENUES: readonly StudioVenue[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'goldenHour', label: 'Golden hour' },
  { id: 'daylight', label: 'Daylight' },
  { id: 'nightGame', label: 'Night game' },
  { id: 'dojoWarm', label: 'Dojo' },
  { id: 'alpine', label: 'Alpine' },
  { id: 'overcast', label: 'Overcast' },
];

/** The page's backdrop behind the transparent stage (the dark frame and the coloured glow; CSS, no draw call). */
export function backdropFor(venue: StudioVenue['id']): { glow: string; base: string } {
  if (venue === 'studio') return { glow: '#00E5FF', base: '#050505' };
  const m = MOODS[venue];
  return { glow: m.sky, base: m.clearColor };
}
