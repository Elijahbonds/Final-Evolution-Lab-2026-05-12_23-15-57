// FEL Babylon mode registry — route-ready ModeDefinitions on the shared cores.
// Rollout policy (M27): dunk is the proof gate and ships first; the remaining
// modes are complete and flip on one at a time behind their routes WITHOUT new
// code, after the dunk passes device playtest.

import type { ModeDefinition } from '../core/ModeHarness';
import { DunkMode } from './DunkMode';
import { KarateEndlessMode } from './KarateEndlessMode';
import { FootballRushMode } from './FootballRushMode';
import { SkateRunMode } from './SkateRunMode';
import { SnowboardSlalomMode } from './SnowboardSlalomMode';
import { SurfBreakMode } from './SurfBreakMode';
import { GolfMode, DerbyMode, PenaltyMode } from './precisionModes';
import { TennisMode } from './TennisMode';        // M74 net-sport replaces precision tennis
import { VolleyballMode } from './VolleyballMode'; // M74
import { OneVOneMode } from './OneVOneMode';
import { ThreeVThreeMode } from './ThreeVThreeMode';
import { CourtCarnivalMode } from './CourtCarnivalMode';
import { KarateVSMode } from './KarateVSMode';
import { MixedCombatMode } from './MixedCombatMode';
import { DunkDuelMode } from './DunkDuelMode';
import { DanceMode } from './DanceMode';        // M75 creative discipline

export const MODES: Record<string, ModeDefinition> = {
  // P3–P4 proof mode — shipped and playtested FIRST
  dunk: DunkMode,
  // Rollout wave 1 (enable after dunk passes playtest)
  karate: KarateEndlessMode,
  football: FootballRushMode,
  // Rollout wave 2 — board family (M39 full rebuilds on boardCore + rideWorlds)
  skateboard: SkateRunMode,
  snowboard_slalom: SnowboardSlalomMode,
  surf: SurfBreakMode,
  // Rollout wave 3 — precision family (M40 full rebuilds on aimSwingCore).
  // Route flag keys map to these registry keys: baseball→derby, soccer→penalty.
  tennis: TennisMode,
  derby: DerbyMode,
  penalty: PenaltyMode,
  golf: GolfMode,
  // Rollout wave 4 — basketball simulator family (M48) on PlayerSlot +
  // BasketballCore. 1V1 first-to-11, 3V3 first-to-21 on a 90s clock.
  onevone: OneVOneMode,
  threevthree: ThreeVThreeMode,
  // Rollout wave 5 — Court Carnival (M49): a NEW hub mode that rotates through
  // four quick minigame bursts. Doesn't replace anything.
  carnival: CourtCarnivalMode,
  // Rollout wave 7 — net-sport family (M74) on RallyCore + NexusVenue
  volleyball: VolleyballMode,
  // Rollout wave 6 — combat/duel family (M53/M56)
  karate_vs: KarateVSMode,
  mixedcombat: MixedCombatMode,
  dunkduel: DunkDuelMode,
  // Rollout wave 8 — creative disciplines (M75): rhythm dance on the audio clock
  dance: DanceMode,
};

/** Modes proven safe to serve on Babylon right now (dunk = the gate; karate +
 * football flipped on as rollout wave 1). */
export const ENABLED_BABYLON_MODES = new Set<string>([
  'dunk', 'karate', 'football',
  // rollout wave 2 — board family
  'skateboard', 'snowboard_slalom', 'surf',
  // rollout wave 3 — timing family (registry keys)
  'tennis', 'derby', 'penalty', 'golf',
  // rollout wave 4 — basketball simulator family (M48)
  'onevone', 'threevthree',
  // rollout wave 5 — Court Carnival hub (M49)
  'carnival',
  // Rollout wave 6 — combat/duel modes (M53/M56)
  'karate_vs', 'mixedcombat', 'dunkduel',
  // Rollout wave 7 — net-sport family (M74)
  'volleyball',
  // Rollout wave 8 — creative disciplines (M75)
  'dance',
]);
