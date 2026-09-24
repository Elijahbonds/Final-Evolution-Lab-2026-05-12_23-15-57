// clipScope — which authored clips a mode's bodies may OWN (SHARED-ANIM-BUS, 2026-09-14).
//
// What was wrong (measured on 2a0304b, dev :3061, the hero's rig per rendered frame): every spawn in every mode ran
// all 130 authored builders, so a skateboarder's rig carried the whole dunk suite — `[FEL-ANIM] authored clips
// registered: idle_stand, strafe_left, …, dunk_charge_gather, dunk_launch, dunk_mocap …` was the first thing the QA eye
// read on /play/skateboard (H1 "dunk-clips"). Registering was not harmless either, because a registered clip is a
// PLAYABLE clip: the board trick machine's bail asked for `football_tackled_fall`, the board tree's celebrate for
// `bball_score_celebrate`, the football TD spike resolved through the alias table onto the karate `uppercut`, and the
// derby's alias names (`baseball_swing_full`, `derby_swing`) onto the karate `hook`. Nothing errored — every one of
// those names resolved to a real, moving clip from another sport, which is exactly why it survived.
//
// The rule now: a mode names the SUITES its bodies own (plus any single clip it deliberately BORROWS from another
// sport — a hoops player knocked to the floor does use the fighter's floor hold). A spawn registers core + those suites
// + those borrows and nothing else, and the animator REFUSES a request outside them (loudly, once per name) instead of
// letting an alias quietly hand it another sport's move. A body outside any mode (the closet, the anim harness, a
// unit test) is unscoped and keeps everything — the scope is a mode's promise, not a global diet.
//
// `clipScope.test.ts` holds each mode's import closure to its scope, so a new cross-sport literal fails a test before it
// fails a player.

import type { Scene } from '@babylonjs/core';
import { CLIP_ALIASES } from './clipAliases';

export type ClipSuite =
  | 'core' | 'dunk' | 'hoops' | 'football' | 'combat' | 'freerun' | 'board'
  | 'golf' | 'tennis' | 'volleyball' | 'soccer' | 'baseball';

export const ALL_SUITES: readonly ClipSuite[] = ['core', 'dunk', 'hoops', 'football', 'combat', 'freerun', 'board', 'golf', 'tennis', 'volleyball', 'soccer', 'baseball'];

/** The suite a clip NAME belongs to, by its sport prefix. Names with no sport prefix (idle_stand, run, walk, guard, the
 *  base strikes, jump_up, strafe_left, cheer, dance steps, mirrored '.M' groups) are core: every body may play them. */
export function suiteOfClip(name: string): ClipSuite {
  const n = name.replace(/\.M$/, '');
  if (n.startsWith('dunk_')) return 'dunk';
  if (n.startsWith('bball_')) return 'hoops';
  if (n.startsWith('football_')) return 'football';
  if (n.startsWith('karate_')) return 'combat';
  if (n.startsWith('freerun_')) return 'freerun';
  if (/^(board_|skate_|snow_|surf_)/.test(n)) return 'board';
  if (n.startsWith('golf_')) return 'golf';
  if (n.startsWith('tennis_')) return 'tennis';
  if (n.startsWith('volleyball_')) return 'volleyball';
  if (/^(soccer_|keeper_|penalty_)/.test(n)) return 'soccer';
  if (/^(baseball_|derby_)/.test(n)) return 'baseball';
  return 'core';
}

export interface ClipScope {
  modeId: string;
  suites: readonly ClipSuite[];
  /** Single clips from another suite this mode plays on purpose. */
  borrow: readonly string[];
  /** Core clips this mode's bodies must NOT own (ANIM-RESIDUAL): never built, refused onto the resting loop. */
  omit?: readonly string[];
}

// The contact reactions a ball sport borrows from the fighter / the carrier: knocked down, on the floor, back up.
const FLOOR = ['karate_hit_react', 'karate_knockdown', 'karate_floor_hold', 'karate_get_up', 'football_tackled_fall'] as const;
const HOOPS = { suites: ['hoops', 'dunk'], borrow: [...FLOOR, 'football_juke_left'] } as const;
const COMBAT = { suites: ['combat'], borrow: ['football_tackled_fall', 'dunk_celebrate_big'] } as const;   // victory pose = arms overhead
const BOARD = { suites: ['board'], borrow: [] } as const;
const NET = { suites: ['tennis', 'volleyball'], borrow: [] } as const;   // netTree drives both rackets and the net
const PARTY = { suites: [], borrow: ['karate_hit_react', 'dunk_celebrate_big'] } as const;
// ANIM-RESIDUAL (2026-09-14): the fighter's base clips are CORE by name (no sport prefix — guard is the MISSING-clip safe
// default and the alias base under half the table), so every scoped body still registered a playable guard, jab, hook,
// uppercut, roundhouse and high kick. A batter owns none of them: the derby's own bat clips replaced every alias that
// used to land there (SHARED-ANIM-BUS), and a request that still reaches one is a bleed — it lands on the bat stance now.
const FIGHTER_BASE = ['guard', 'jab', 'hook', 'uppercut', 'roundhouse', 'high_kick'] as const;
const DERBY = { suites: ['baseball'], borrow: [], omit: FIGHTER_BASE } as const;

/** Keyed by the harness's `def.modeId` (what ModeHarness stamps on `scene.metadata.felModeId`). */
export const MODE_CLIP_SCOPES: Record<string, { suites: readonly ClipSuite[]; borrow: readonly string[]; omit?: readonly string[] }> = {
  // HOOPS-DEPTH S8 (2026-09-23): the runway is a DRIBBLING run — the captured one (78_06, bent arms, the ball hand low) instead of the
  // generic `run`, whose arms read straight on 631 of 733 approach frames (body smoke)
  dunk: { suites: ['dunk'], borrow: ['bball_dribble_run'] },
  dunkduel: { suites: ['dunk'], borrow: ['bball_dribble_run'] },
  onevone: HOOPS,
  threevthree: HOOPS,
  threepoint: { suites: ['hoops'], borrow: ['karate_hit_react', 'football_juke_left', 'dunk_celebrate_big'] },   // the make's celebration
  carnival: { suites: ['hoops', 'dunk', 'board', 'combat', 'soccer'], borrow: [] },   // the hub rotates four sports' bursts
  karate: COMBAT, 'karate-vs': COMBAT, mixedcombat: COMBAT, showdown: COMBAT, duel: COMBAT,
  football: { suites: ['football'], borrow: ['karate_knockdown', 'karate_floor_hold'] },   // a trucked defender goes down on the fighter's knockdown; the carrier holds the turf until the reset
  skateboard: BOARD, surf: BOARD, bigair: BOARD,
  snowboard: { suites: ['board'], borrow: ['karate_knockdown'] },
  freerun: { suites: ['freerun'], borrow: ['karate_floor_hold', 'karate_get_up', 'football_tackled_fall', 'dunk_celebrate_big'] },
  sprint: { suites: [], borrow: [] },
  dance: { suites: [], borrow: ['karate_hit_react'] },
  tennis: NET, volleyball: NET,
  golf: { suites: ['golf'], borrow: [] },
  baseball: DERBY, derby: DERBY,
  soccer: { suites: ['soccer'], borrow: ['football_juke_left'] }, penalty: { suites: ['soccer'], borrow: ['football_juke_left'] },
  // The kart driver throws board tricks off a boosted ramp (KartAir reuses the BoardTrick vocabulary and rows), so
  // the board suite is what the kart's body owns. Aero has no body in the air — the stunt is the aircraft's.
  velocitykart: { suites: ['board'], borrow: [] }, aeroaces: { suites: [], borrow: [] },
  who_scene_it: PARTY, brainbrawl: PARTY,
};

/** The scope for a mode, or null (unscoped: every suite) for a body no mode owns. */
export function scopeForMode(modeId: string | undefined | null): ClipScope | null {
  if (!modeId) return null;
  const s = MODE_CLIP_SCOPES[modeId];
  return s ? { modeId, suites: s.suites, borrow: s.borrow, ...(s.omit ? { omit: s.omit } : {}) } : null;
}

export function scopeForScene(scene: Scene | null | undefined): ClipScope | null {
  return scopeForMode((scene?.metadata as { felModeId?: string } | undefined)?.felModeId);
}

/** May a body in this scope own/play `name`? Core always; a suite the mode names; a clip the mode borrows. */
export function scopeAllows(scope: ClipScope | null, name: string): boolean {
  if (!scope) return true;
  if (scope.omit?.includes(name.replace(/\.M$/, ''))) return false;
  const suite = suiteOfClip(name);
  if (suite === 'core' || scope.suites.includes(suite) || scope.borrow.includes(name.replace(/\.M$/, ''))) return true;
  // EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): a captured opponent clip (`karate_mc_hit_react`) is in scope wherever the
  // clip it stands in for (`karate_hit_react`) is — a hoops foe who borrows the fighter's flinch gets the captured one.
  return name.includes('_mc_') && scopeAllows(scope, name.replace('_mc_', '_'));
}

/** A request is in scope when its NAME is, and — for an alias the rig does not own under its own name — the clip the
 *  alias would really play is too (`karate_victory_pose` is a combat name that plays the dunk celebrate). */
export function requestAllowed(scope: ClipScope | null, name: string, registered: { has(name: string): boolean }): boolean {
  if (!scope) return true;
  if (!scopeAllows(scope, name)) return false;
  if (registered.has(name)) return true;
  const alias = CLIP_ALIASES[name];
  return !alias || scopeAllows(scope, alias[0]);
}

/** Where a refused request lands: the scope's own resting loop, never another sport's move. */
export function scopeFallback(scope: ClipScope | null): string {
  if (!scope) return 'idle_stand';
  const s = scope.suites;
  if (s.includes('board')) return 'board_ride_idle';
  if (s.includes('baseball')) return 'baseball_stance';
  if (s.includes('golf')) return 'golf_address_idle';
  if (s.includes('tennis')) return 'tennis_ready';
  if (s.includes('soccer')) return 'keeper_set';
  return 'idle_stand';
}

// ── The ledger (what a probe reads) ────────────────────────────────────────────────────────────────────────────────
// One entry per scene: the scope the spawns registered under, the clip names registered (deduped across the scene's
// bodies), and every refused request. ModeHarness hands a read of it to the production probe handle, because the QA eye
// runs on `next start` and the H1 grade was otherwise read off a truncated console line.

export interface AnimLedgerEntry {
  scope: ClipScope | null; registered: Set<string>; refused: Map<string, number>;
  /** RECOGNISABLE check (2026-09-15): every request a DIFFERENT clip played, as "requested→played" — a football stiff arm
   *  played by the boxer's jab, a hoops celebration by the karate uppercut. The scorecard lists them per mode. */
  stoodIn: Map<string, number>;
}
const ledgers = new WeakMap<Scene, AnimLedgerEntry>();

export function ledgerFor(scene: Scene): AnimLedgerEntry {
  let e = ledgers.get(scene);
  if (!e) { e = { scope: scopeForScene(scene), registered: new Set(), refused: new Map(), stoodIn: new Map() }; ledgers.set(scene, e); }
  return e;
}

export interface AnimReadout {
  modeId: string | null;
  suites: string[];
  borrow: string[];
  registered: string[];
  /** Registered names outside core + the mode's suites + borrows. Must be []. */
  outOfScope: string[];
  refused: Record<string, number>;
  /** "requested→played" for every request an alias (or the fallback) answered with another clip. */
  stoodIn: Record<string, number>;
}

export function animReadout(scene: Scene): AnimReadout {
  const e = ledgerFor(scene);
  const registered = [...e.registered].sort();
  return {
    modeId: e.scope?.modeId ?? null,
    suites: e.scope ? ['core', ...e.scope.suites] : ['*'],
    borrow: e.scope ? [...e.scope.borrow] : [],
    registered,
    outOfScope: registered.filter((n) => !scopeAllows(e.scope, n)),
    refused: Object.fromEntries(e.refused),
    stoodIn: Object.fromEntries(e.stoodIn),
  };
}
