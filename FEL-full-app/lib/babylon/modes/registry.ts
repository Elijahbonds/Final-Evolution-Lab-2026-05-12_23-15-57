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
import { AeroAcesMode } from './AeroAcesMode';
import { VelocityKartMode } from './VelocityKartMode';
import { DunkDuelMode } from './DunkDuelMode';
import { ShowdownMode } from './ShowdownMode';
import { DuelMode } from './DuelMode';
import { DanceMode } from './DanceMode';        // M75 creative discipline
import { ThreePointMode } from './ThreePointMode'; // Babylon port of the R3F shootout
import { BigAirMode } from './AirSessionMode'; // shared AirSessionCore (big air skin)
import { FreeRunMode } from './FreeRunMode';    // A+ mission #10: free-running tricking replaces the gymnastics vault
import { SprintMode } from './SprintMode';
import { WhoSceneItMode } from './WhoSceneItMode';   // lane 3 W1 — the live venue quiz
import { BrainBrawlMode } from './BrainBrawlMode';   // A+ mission #11 — the trivia deck as a party mode

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
  // Ported off react-three-fiber so the whole basketball family is Babylon.
  threepoint: ThreePointMode,
  // FreeRun (Havok traversal + Skate's combo scoring) took the gymnastics slot; snowboard big air stays on AirSessionCore.
  freerun: FreeRunMode,
  bigair: BigAirMode,
  sprint: SprintMode,
  threevthree: ThreeVThreeMode,
  // Rollout wave 5 — Court Carnival (M49): a NEW hub mode that rotates through
  // four quick minigame bursts. Doesn't replace anything.
  carnival: CourtCarnivalMode,
  // Rollout wave 7 — net-sport family (M74) on RallyCore + NexusVenue
  volleyball: VolleyballMode,
  // Rollout wave 6 — combat/duel family (M53/M56)
  karate_vs: KarateVSMode,
  showdown: ShowdownMode,
  duel: DuelMode,
  mixedcombat: MixedCombatMode,
  // NEW (owner ask 2026-09-12): Aero Aces had never existed here — see the mode's header.
  aeroaces: AeroAcesMode,
  velocitykart: VelocityKartMode,
  dunkduel: DunkDuelMode,
  // Rollout wave 8 — creative disciplines (M75): rhythm dance on the audio clock
  dance: DanceMode,
  // Lane 3 W1 (2026-09-06): Who Scene It as a live mode — the question's venue mounts behind the card
  who_scene_it: WhoSceneItMode,
  // A+ mission #11 — the trivia deck as a Babylon party mode.
  //
  // REGISTERED 2026-09-13 because it never was. BrainBrawlMode shipped with modeId 'brainbrawl' and
  // components/games/brainbrawl-babylon.tsx calls runMode(MODES.brainbrawl, …) — which was UNDEFINED, so
  // that host would have thrown the moment anything mounted it. Nothing does today (the player route still
  // serves the 2D deck), so the mode was simply unreachable work rather than a live crash.
  //
  // In MODES, deliberately NOT in ENABLED_BABYLON_MODES: registering makes it reachable from /dev/mode and
  // makes its own host valid, while whether players get the Babylon version instead of the deck stays an
  // owner call rather than something a registry edit decides by accident.
  brainbrawl: BrainBrawlMode,
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
  // REVIVED (owner, 2026-09-13: "i want to include and improve them, wire them in"). These three were retired
  // on 2026-09-01 for ONE stated reason — "no locked benchmark and none chosen" (PHASE2_BENCHMARK_LOCKS TIER
  // B). Phase 0 of the convergence pass locked a benchmark and a defining mechanic for all 28 modes
  // (docs/ROSTER-BASELINE.md), so the blocker that retired them no longer exists. All three boot clean at
  // 60 fps, measured.
  'sprint',      // Track & Field — rhythm, not mashing
  'showdown',    // Naruto Storm — your partner is a resource you spend
  'duel',        // Soul Calibur — reach decides the fight before the hands do
  // Rollout wave 7 — net-sport family (M74)
  'volleyball',
  // Rollout wave 8 — creative disciplines (M75)
  'dance',
  // lane 3 W1 — live venue quiz
  'who_scene_it',
  // A+ mission #10 — FreeRun took the gymnastics slot
  'freerun',
  // A+ P0 CONTACT-lite — the shootout ships with the basketball family
  'threepoint',
  // A+ P0 thin shell — the parked air-session shell ships with its juice (sprint retired, see above)
  'bigair',
  // NEW MODE (owner ask 2026-09-12). Aero Aces Flyer was listed "retired by decision, do not resurrect" and had
  // never existed in this codebase; the owner asked for it, so it is built rather than revived.
  'aeroaces',
  'velocitykart',
  // Brain Brawl was registered in MODES but never in ENABLED, so its Babylon mode was unreachable while the
  // route quietly rendered the 2D version instead.
  'brainbrawl',
]);
