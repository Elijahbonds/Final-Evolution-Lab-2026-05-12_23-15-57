// The mode registry, lazy: one dynamic import per mode definition, under registry.ts's own keys (PERF-LOAD PRF-05, 2026-10-25).
//
// registry.ts imports all 30 mode definitions statically, so every host that mounted `MODES.<key>` from it put every game's
// code in its route's first download and parsed it on the main thread before its own mode could load (the /try dunk measured
// it: a static graph of 1,026 files against the dunk's own 505, FIRST-DUNK-BUDGET 6abc52c2). On the phone rig the 12.6 MB
// all-modes bundle took 5.6 s to parse and run before any mode code started (4x CPU throttle, sprint, 2026-10-25).
//
// Here `MODES.<key>` is a ModeRef: a function that imports that one mode's file the first time it is called and hands back
// the very same definition object registry.ts holds (lazyRegistry.test.ts checks === for every key). runMode() takes a
// ModeRef or a definition, so a host's `runMode(MODES.football, …)` reads the same and the registry's drift and door checks
// (registry.drift.test.ts) read the same spelling. registry.ts stays the eager table for the tests, the scripts, the dev
// pages and the TV host, which mount any mode by key.
//
// Same keys, same objects, nothing else: a key added to registry.ts is added here too (the test fails until it is).
import type { ModeDefinition, ModeRef } from '../core/ModeHarness';

function ref(modeKey: string, load: () => Promise<ModeDefinition>): ModeRef {
  let p: Promise<ModeDefinition> | null = null;
  const r = (): Promise<ModeDefinition> => {
    // a failed chunk download is retried on the next call (the host's RETRY), not cached as a failure
    p ??= load().catch((e) => { p = null; throw e; });
    return p;
  };
  return Object.assign(r, { modeKey });
}

export const MODES: Readonly<Record<string, ModeRef>> = {
  dunk: ref('dunk', () => import('./DunkMode').then((m) => m.DunkMode)),
  karate: ref('karate', () => import('./KarateEndlessMode').then((m) => m.KarateEndlessMode)),
  football: ref('football', () => import('./FootballRushMode').then((m) => m.FootballRushMode)),
  skateboard: ref('skateboard', () => import('./SkateRunMode').then((m) => m.SkateRunMode)),
  snowboard_slalom: ref('snowboard_slalom', () => import('./SnowboardSlalomMode').then((m) => m.SnowboardSlalomMode)),
  surf: ref('surf', () => import('./SurfBreakMode').then((m) => m.SurfBreakMode)),
  tennis: ref('tennis', () => import('./TennisMode').then((m) => m.TennisMode)),
  derby: ref('derby', () => import('./precisionModes').then((m) => m.DerbyMode)),
  baseball: ref('baseball', () => import('./BaseballInningsMode').then((m) => m.BaseballInningsMode)),
  penalty: ref('penalty', () => import('./precisionModes').then((m) => m.PenaltyMode)),
  golf: ref('golf', () => import('./precisionModes').then((m) => m.GolfMode)),
  onevone: ref('onevone', () => import('./OneVOneMode').then((m) => m.OneVOneMode)),
  threepoint: ref('threepoint', () => import('./ThreePointMode').then((m) => m.ThreePointMode)),
  freerun: ref('freerun', () => import('./FreeRunMode').then((m) => m.FreeRunMode)),
  bigair: ref('bigair', () => import('./AirSessionMode').then((m) => m.BigAirMode)),
  sprint: ref('sprint', () => import('./SprintMode').then((m) => m.SprintMode)),
  threevthree: ref('threevthree', () => import('./ThreeVThreeMode').then((m) => m.ThreeVThreeMode)),
  carnival: ref('carnival', () => import('./CourtCarnivalMode').then((m) => m.CourtCarnivalMode)),
  volleyball: ref('volleyball', () => import('./VolleyballMode').then((m) => m.VolleyballMode)),
  karate_vs: ref('karate_vs', () => import('./KarateVSMode').then((m) => m.KarateVSMode)),
  showdown: ref('showdown', () => import('./ShowdownMode').then((m) => m.ShowdownMode)),
  duel: ref('duel', () => import('./DuelMode').then((m) => m.DuelMode)),
  mixedcombat: ref('mixedcombat', () => import('./MixedCombatMode').then((m) => m.MixedCombatMode)),
  aeroaces: ref('aeroaces', () => import('./AeroAcesMode').then((m) => m.AeroAcesMode)),
  velocitykart: ref('velocitykart', () => import('./VelocityKartMode').then((m) => m.VelocityKartMode)),
  dunkduel: ref('dunkduel', () => import('./DunkDuelMode').then((m) => m.DunkDuelMode)),
  dance: ref('dance', () => import('./DanceMode').then((m) => m.DanceMode)),
  who_scene_it: ref('who_scene_it', () => import('./WhoSceneItMode').then((m) => m.WhoSceneItMode)),
  brainbrawl: ref('brainbrawl', () => import('./BrainBrawlMode').then((m) => m.BrainBrawlMode)),
  tiebreak: ref('tiebreak', () => import('./TiebreakMode').then((m) => m.TiebreakMode)),
  adventure: ref('adventure', () => import('./AdventureMode').then((m) => m.AdventureMode)),
  adventure_br: ref('adventure_br', () => import('./AdventureBRMode').then((m) => m.AdventureBRMode)),
};
