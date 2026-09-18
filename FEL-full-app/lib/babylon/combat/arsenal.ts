// THE ARSENAL — one list of what you can fight WITH, and what carrying it costs (2026-09-13).
//
// Owner: "for the combat mode the screen should allow them to select their combat weapon", and on how a
// weapon should work given this roster has no weapon animations: "held prop + reach/damage changes".
//
// WHAT ALREADY EXISTED, and why this is a registry rather than a new system. StrikeSystem ships
// `karateMoveset`, `staffMoveset` and `bladeMoveset`; FightCore ships KARATE_ATTACKS and STAFF_ATTACKS;
// WeaponRig already parents a prop to the RightHand bone and swaps the strike table. Duel even has an
// in-round A/B/Y weapon phase. What there was NOT is one place that says which weapons exist, so:
//
//   · Duel offered three, Mixed Combat offered two (and only by loadout id), Showdown offered one
//   · nothing could be picked before the fight, which is what the owner asked for
//   · no weapon carried a line explaining its cost, so a picker would have had nothing to show
//
// THE HONEST LIMIT, stated because a picker must not promise what the rig cannot do: there are no weapon
// animations in this roster. A staff swing plays the same body clip a kick does. What a weapon genuinely
// changes is the prop in the hand and the numbers — reach, startup, damage, guard chip, knockback — and
// those are the things a fight is actually decided by. Nobody is told otherwise anywhere on the screen.
//
// The trade-off rule is the garage's rule: no weapon may beat another at everything, and arsenal.test.ts
// holds it.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from '../anim/boneLookup';
import { KARATE_ATTACKS, STAFF_ATTACKS, type AttackDef } from '../core/FightCore';
import { karateMoveset, staffMoveset, bladeMoveset, type CombatMove } from '../core/StrikeSystem';

export type WeaponId = 'fists' | 'blade' | 'staff' | 'gauntlet';

export interface ArsenalEntry {
  id: WeaponId;
  name: string;
  /** One line on the picker, and it names the COST. */
  sub: string;
  tint: string;
  /** Built fresh per fighter — a moveset is mutable state and must never be shared between two bodies. */
  moveset: () => Record<string, CombatMove>;
  /** The three-bar summary the picker draws: reach, speed, power. */
  bars: { reach: number; speed: number; power: number };
  /**
   * The furthest this weapon can hit from, metres — the DANGER ZONE, and the number spacing must use.
   *
   * Measured, not typed: every declared reach in the codebase understated it by quoting the jab's range
   * (DuelMode's WEAPON_RANGE has fists at 1.6), while the kick reaches 1.9. An AI spacing off the smaller
   * number stands at 1.8 believing it is safe and eats a kick, every time.
   */
  reach: number;
  /** The fast poke's range — the distance you actually fence at, and what the chip's REACH bar ranks on. */
  jabReach: number;
  /** Null for fists — there is nothing to put in the hand. */
  buildProp: ((scene: Scene) => Mesh) | null;
  ready: boolean;
}

/** A plain lit prop. StandardMaterial is fine here: combat venues are dojo-lit, not the racing sun. */
function prop(scene: Scene, name: string, mesh: Mesh, hex: string): Mesh {
  const mat = new StandardMaterial(`${name}Mat`, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = Color3.FromHexString('#3a3a42');
  mesh.material = mat;
  return mesh;
}

/**
 * THE GAUNTLET: the new one, and the only weapon that beats a GUARD rather than a body.
 *
 * Built from the karate table rather than a fresh set of numbers, because the gauntlet is a fist — the same
 * body clips, the same lines, the same ranges. What it changes is what happens when the other fighter blocks:
 * guard chip is roughly doubled and startup is slower, so it loses every trade it does not win outright and
 * wins the fights where the opponent never stops blocking. That is a real answer to a real problem (a turtle)
 * that none of the other three weapons had.
 */
function gauntletAttacks(): Record<'jab' | 'kick' | 'heavy', AttackDef> {
  const heavier = (a: AttackDef, dmg: number, startupMs: number, guardDmg: number): AttackDef =>
    ({ ...a, dmg, startupMs, guardDmg, knockback: a.knockback * 1.35 });
  return {
    jab: { ...heavier(KARATE_ATTACKS.jab, 7, 160, 14), id: 'crack', label: 'CRACK' },
    kick: { ...heavier(KARATE_ATTACKS.kick, 10, 220, 20), id: 'shove', label: 'SHOVE' },
    heavy: { ...heavier(KARATE_ATTACKS.heavy, 17, 330, 46), id: 'breaker', label: 'BREAKER' },
  };
}

function gauntletMoveset(): Record<string, CombatMove> {
  const a = gauntletAttacks();
  return {
    crack: {
      atk: a.jab, startupSec: 0.16, activeSec: 0.08, recoverySec: 0.26,
      cancelInto: ['shove', 'breaker'], cancelWindowSec: 0.18, weight: 'medium', tags: ['jab'],
    },
    shove: {
      atk: a.kick, startupSec: 0.22, activeSec: 0.1, recoverySec: 0.34,
      cancelInto: ['breaker'], cancelWindowSec: 0.16, weight: 'medium', tags: ['kick'],
    },
    breaker: {
      atk: a.heavy, startupSec: 0.33, activeSec: 0.12, recoverySec: 0.48,
      cancelInto: [], cancelWindowSec: 0, weight: 'heavy', tags: ['heavy'],
    },
  };
}

export const ARSENAL: readonly ArsenalEntry[] = [
  {
    id: 'fists', name: 'FISTS', sub: 'Fastest hands, shortest reach. You have to get inside.',
    tint: '#ff9d5c', ready: true, reach: 1.9, jabReach: 1.6,
    moveset: () => karateMoveset(KARATE_ATTACKS),
    bars: { reach: 0.3, speed: 0.95, power: 0.45 },
    buildProp: null,
  },
  {
    id: 'blade', name: 'BLADE', sub: 'Quick and combo-rich. Loses the range war outright.',
    tint: '#c9d6e8', ready: true, reach: 2.0, jabReach: 1.9,
    moveset: () => bladeMoveset(),
    bars: { reach: 0.5, speed: 0.85, power: 0.55 },
    buildProp: (scene) => prop(scene, 'blade',
      MeshBuilder.CreateBox('blade', { width: 0.05, height: 0.95, depth: 0.012 }, scene), '#cfd8e6'),
  },
  {
    id: 'staff', name: 'STAFF', sub: 'A metre more reach, and slow enough to be punished for it.',
    tint: '#c89b5a', ready: true, reach: 2.8, jabReach: 2.6,
    moveset: () => staffMoveset(STAFF_ATTACKS),
    bars: { reach: 0.95, speed: 0.35, power: 0.7 },
    buildProp: (scene) => prop(scene, 'staff',
      MeshBuilder.CreateCylinder('staff', { height: 1.8, diameter: 0.05 }, scene), '#8a5f38'),
  },
  {
    id: 'gauntlet', name: 'GAUNTLET', sub: 'Breaks a guard in two hits. Slowest thing in the arsenal.',
    tint: '#9aa7b8', ready: true, reach: 1.9, jabReach: 1.6,
    moveset: gauntletMoveset,
    bars: { reach: 0.3, speed: 0.28, power: 0.95 },
    buildProp: (scene) => prop(scene, 'gauntlet',
      MeshBuilder.CreateBox('gauntlet', { width: 0.13, height: 0.15, depth: 0.19 }, scene), '#6d7789'),
  },
];

export function weaponById(id: string): ArsenalEntry {
  return ARSENAL.find((w) => w.id === id) ?? ARSENAL[0];
}

export function readyWeapons(): ArsenalEntry[] {
  return ARSENAL.filter((w) => w.ready);
}

/**
 * Where the prop sits in the hand — in BONE-LOCAL units, which are NOT world metres.
 *
 * The existing WeaponRig parents the prop at Vector3.Zero() on RightHand, which puts a 1.8 m staff's CENTRE
 * at the wrist. Offsetting it needs the rig's own scale, and this hero's bone space runs about a third of
 * world scale — measured on the live rig, the hips sit at 0.47 in skeleton space and 0.88 in the world.
 * A first pass used 0.3 "because that is 30 cm up the shaft" and photographed a staff floating half a metre
 * off the fighter's hip. Mixed Combat's staff has always used 0.1 and has always looked right; these are
 * calibrated against that rather than against metres.
 *
 * HOW CLOSE THIS GETS, stated plainly: the hero rig has 22 bones and no fingers, so nothing can close around
 * a grip. What these offsets buy is a weapon carried diagonally across the body in a ready position — which
 * is a real guard for a staff and a real carry for a blade, and reads correctly at fighting distance.
 * Photographed at 2 m before shipping; at arm's length you can see the hand is open. The fix for that is a
 * finger rig, not a bigger number here.
 */
export const WEAPON_GRIP: Record<WeaponId, { offset: Vector3; pitchDeg: number }> = {
  fists: { offset: Vector3.Zero(), pitchDeg: 0 },
  // held point-forward along the forearm, hilt at the wrist
  blade: { offset: new Vector3(0, 0.14, 0.01), pitchDeg: 90 },
  // gripped a third of the way up, the way anyone carries a staff — Mixed Combat's proven value
  staff: { offset: new Vector3(0, 0.1, 0), pitchDeg: 90 },
  // worn ON the hand, so it sits at the wrist and barely moves
  gauntlet: { offset: new Vector3(0, 0.015, 0.006), pitchDeg: 0 },
};

/**
 * Put the weapon in the fighter's hand, and return it for disposal.
 *
 * Exists because picking a weapon and then holding NOTHING is the exact hollow promise a picker must not
 * make — and Duel did precisely that: it swapped to the staff moveset (long reach, slow frames, a different
 * fight) while the fighter's hands stayed empty. Mixed Combat had its own private `makeStaff`, so the one
 * mode that DID show a weapon showed it from a second copy of these numbers.
 */
export function equipWeapon(
  scene: Scene, skeleton: Skeleton, weapon: ArsenalEntry, name: string,
): Mesh | null {
  if (!weapon.buildProp) return null;
  const hand = boneNode(skeleton, 'RightHand');
  if (!hand) { console.warn(`[FEL-COMBAT] no RightHand bone — ${weapon.id} prop skipped`); return null; }
  const mesh = weapon.buildProp(scene);
  mesh.name = name;
  mesh.parent = hand as TransformNode;
  const grip = WEAPON_GRIP[weapon.id];
  mesh.position.copyFrom(grip.offset);
  mesh.rotation.set(grip.pitchDeg * Math.PI / 180, 0, 0);
  return mesh;
}

export const WEAPON_KEY = 'fel-combat-weapon';

/** The player's pick: `?weapon=` wins, then the remembered pick, then fists. */
export function readWeapon(): ArsenalEntry {
  const list = readyWeapons();
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('weapon');
      const byQuery = list.find((w) => w.id === q);
      if (byQuery) return byQuery;
      const s = window.localStorage.getItem(WEAPON_KEY);
      const byStore = list.find((w) => w.id === s);
      if (byStore) return byStore;
    }
  } catch { /* private mode: fists */ }
  return list[0] ?? ARSENAL[0];
}

export function writeWeapon(id: string): void {
  try { window.localStorage.setItem(WEAPON_KEY, id); } catch { /* convenience only */ }
}
