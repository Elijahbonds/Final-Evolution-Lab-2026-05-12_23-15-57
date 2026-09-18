// RivalCircuit — Story Mode Phase 3: recurring-rival encounters driven by
// data manifests, riding the SHARED CameraDirector (punch-in + pulse) — no
// forked camera system.
//
//   Beats — a Rival encounter is a manifest: trigger (gate/quest/mode
//     result), dialogue lines (Vane's voice), the mode it hands to, and
//     the camera treatment. Vane recurs across tiers in context forms
//     (court / dojo / colosseum / sky), per the approved spine.
//   Camera — encounters reuse ctx.camDirector.pulse/snapTo (the dunk
//     contest's language). Flight-duel beats flag the aerial treatment.

import type { PrqGrade } from '../../prq';
import { biasForGrade } from './StoryProgression';

export interface RivalBeat {
  id: string;
  tier: number;
  /** where Vane appears */
  arena: 'court' | 'dojo' | 'colosseum' | 'sky';
  label: string;
  /** gate/quest trigger id */
  trigger: string;
  /** the mode the encounter hands off to */
  modeId: string;
  /** dialogue lines — manifest-driven, original */
  lines: string[];
  /** camera: punch-in on intro, pulse on the decisive moment */
  camera: { introPulse: number; decisivePulse: number };
  /** aerial chase treatment (tier-4 flight duel) */
  aerial?: boolean;
}

export const RIVAL_BEATS: RivalBeat[] = [
  {
    id: 'vane_t1_court', tier: 1, arena: 'court', label: 'Vane: Street Proof',
    trigger: 'gate_dunk', modeId: 'dunkduel',
    lines: [
      "Vane: Cute vertical. My guy at the lab measured mine in a wind tunnel.",
      "Vane: You actually… practice? That's adorable.",
    ],
    camera: { introPulse: 0.6, decisivePulse: 1.0 },
  },
  {
    id: 'vane_t2_dojo', tier: 2, arena: 'dojo', label: 'Vane: Tape Study',
    trigger: 'gate_dojo', modeId: 'showdown',
    lines: [
      "Vane: I watched your tape. Twice. Don't flatter yourself — scouting is just diligence.",
      "Vane: Substitution won't save you. I count your frames now.",
    ],
    camera: { introPulse: 0.7, decisivePulse: 1.0 },
  },
  {
    id: 'vane_t3_colosseum', tier: 3, arena: 'colosseum', label: 'Vane: Factory vs Found',
    trigger: 'colosseum_final', modeId: 'mixedcombat',  // placeholder until Phase 5 registers the Colosseum mode
    lines: [
      "Vane: Mine was bred for this. Yours was… raised? Like a garden tomato?",
      "Vane: Let's see what your little project is worth.",
    ],
    camera: { introPulse: 0.7, decisivePulse: 1.0 },
  },
  {
    id: 'vane_t4_sky', tier: 4, arena: 'sky', label: 'Vane: The Air Is Mine',
    trigger: 'gate_sky_trial', modeId: 'snowboard_slalom',   // aerial slot (see StoryHub note)
    lines: [
      "Vane: You finally got wings. I got mine LAST season.",
      "Vane: Try to keep up — the skyline is mine.",
    ],
    camera: { introPulse: 0.8, decisivePulse: 1.0 },
    aerial: true,
  },
];

/** Resolve the encounter for a trigger, biased by the player's PRQ grade. */
export function rivalEncounter(triggerId: string, grade: PrqGrade['key']): (RivalBeat & { taunt: string; aiDifficulty: number }) | null {
  const beat = RIVAL_BEATS.find((b) => b.trigger === triggerId);
  if (!beat) return null;
  const bias = biasForGrade(grade);
  return { ...beat, taunt: bias.rivalTaunt, aiDifficulty: bias.aiDifficulty };
}

/** Validate a beat manifest (trigger gates exist, modes resolvable). */
export function validateBeats(beats: RivalBeat[], knownModeIds: Set<string>): string[] {
  const errs: string[] = [];
  for (const b of beats) {
    if (!knownModeIds.has(b.modeId)) errs.push(`${b.id}: unknown modeId ${b.modeId}`);
    if (b.lines.length < 2) errs.push(`${b.id}: needs at least 2 lines`);
    if (b.camera.introPulse <= 0 || b.camera.decisivePulse <= 0) errs.push(`${b.id}: camera pulses must be positive`);
  }
  return errs;
}
