// HOOPS KINETIC — the parkour DNA in a game of one-on-one (owner brief, 2026-09-18: "Kinetic Duel & Ankle-Breaker Combat").
//
// Four reads, all pure, all on the geometry the modes already track:
//   · THE PARRY-VAULT. The driver is arriving — inside the window, closing fast — and the steal press lands in it: the
//     defender vaults OVER the driver, strips the ball on the way, and lands running the other way.
//   · THE MOMENTUM DRIFT. LT held while sprinting turns a sharp stick cut into a slide-drift: the turn is taken with
//     the dribble speed kept, and a defender inside reach on the cut is left on the wrong foot (the ankle-breaker).
//   · THE FOOTSTOOL. On a loose ball, a jump with the rival between you and it goes off his shoulders: extra reach.
//   · THE DRIVE-BY STEAL. Running parallel at speed, the poke is a lateral strike that takes the ball without stopping.

export const PARRY = {
  /** The driver's distance band and closing speed that make a press a parry rather than a reach. */
  minDist: 0.8, maxDist: 1.9, minClosing: 2.2,
  /** The vault: seconds in the air, height, metres carried past the driver. */
  sec: 0.5, up: 1.0, forward: 1.7,
  /** The driver is left stumbling this long. */
  stunSec: 0.9,
} as const;

/** Is this steal press a PARRY-VAULT? `closing` = the driver's speed toward the defender (m/s). */
export function parryVaultRead(dist: number, closing: number, phase: string): boolean {
  if (phase !== 'drive' && phase !== 'blowby') return false;
  return dist >= PARRY.minDist && dist <= PARRY.maxDist && closing >= PARRY.minClosing;
}

/** Where the vault puts the body `u` (0..1) of the way through: an arc up and forward along `dir` from `from`. */
export function vaultAt(from: { x: number; y: number; z: number }, dir: { x: number; z: number }, u: number): { x: number; y: number; z: number } {
  const l = Math.hypot(dir.x, dir.z) || 1;
  return { x: from.x + (dir.x / l) * PARRY.forward * u, y: from.y + Math.sin(u * Math.PI) * PARRY.up, z: from.z + (dir.z / l) * PARRY.forward * u };
}

export const DRIFT = {
  /** The cut must turn at least this far, at least this fast, on the turbo, with LT held. */
  minTurnDeg: 45, minSpeed: 3.5,
  /** The defender inside this of the cut, on the side the cut leaves, breaks his ankles. */
  ankleM: 1.5, stunSec: 0.9,
  /** Seconds between drifts (a drift is a commitment, not a hold). */
  cooldownSec: 0.6,
} as const;

/** The angle (deg) between the current velocity and the wished direction. */
export function turnDeg(vel: { x: number; z: number }, wish: { x: number; z: number }): number {
  const a = Math.hypot(vel.x, vel.z), b = Math.hypot(wish.x, wish.z);
  if (a < 1e-3 || b < 1e-3) return 0;
  const c = Math.max(-1, Math.min(1, (vel.x * wish.x + vel.z * wish.z) / (a * b)));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Is this frame a DRIFT? */
export function driftRead(ltHeld: boolean, sprint: boolean, vel: { x: number; z: number }, wish: { x: number; z: number }): boolean {
  if (!ltHeld || !sprint) return false;
  if (Math.hypot(vel.x, vel.z) < DRIFT.minSpeed) return false;
  return turnDeg(vel, wish) >= DRIFT.minTurnDeg;
}

/** Does the cut leave the defender on the wrong foot? He is inside reach and on the side the old line was headed. */
export function ankleBreak(me: { x: number; z: number }, velBefore: { x: number; z: number }, foe: { x: number; z: number }): boolean {
  const dx = foe.x - me.x, dz = foe.z - me.z, d = Math.hypot(dx, dz);
  if (d > DRIFT.ankleM || d < 1e-3) return false;
  const v = Math.hypot(velBefore.x, velBefore.z) || 1;
  const ahead = (dx * velBefore.x + dz * velBefore.z) / (d * v);
  return ahead > 0.3;   // he was in front of the old line — the cut goes past him
}

export const FOOTSTOOL = { withinM: 1.2, reachAdd: 0.6, hopVy: 5.5, holdSec: 0.7 } as const;

/** On a loose ball: is the rival between me and the ball, close enough to go off? */
export function footstoolRead(me: { x: number; z: number }, foe: { x: number; z: number }, ball: { x: number; z: number }): boolean {
  const dx = foe.x - me.x, dz = foe.z - me.z, d = Math.hypot(dx, dz);
  if (d > FOOTSTOOL.withinM || d < 1e-3) return false;
  const bx = ball.x - me.x, bz = ball.z - me.z, b = Math.hypot(bx, bz) || 1;
  return (dx * bx + dz * bz) / (d * b) > 0.3;
}

export const DRIVE_BY = { minSpeed: 3.6, alongM: 1.2, lateralMin: 0.45, lateralMax: 1.7, knockM: 1.6, stunSec: 0.8 } as const;

/** Running parallel to the handler at speed: the poke is a DRIVE-BY. */
export function driveByRead(myVel: { x: number; z: number }, me: { x: number; z: number }, foe: { x: number; z: number }): boolean {
  const s = Math.hypot(myVel.x, myVel.z);
  if (s < DRIVE_BY.minSpeed) return false;
  const fx = myVel.x / s, fz = myVel.z / s;
  const dx = foe.x - me.x, dz = foe.z - me.z;
  const along = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
  return Math.abs(along) <= DRIVE_BY.alongM && lateral >= DRIVE_BY.lateralMin && lateral <= DRIVE_BY.lateralMax;
}

// ── 3v3: THE SYNERGY (owner brief, 2026-09-18: "Team Slipstream & Synergy Overdrive") ────────────────────────────────
//   · THE SLIPSTREAM. Running in a mate carrier's wake — behind him along his line, inside the cone — buys top speed
//     and trickles into the shared gauge. A mate behind ME when I carry gets the same.
//   · THE SLING-PASS. A pass thrown at a sprint flies faster, and the catch hands the receiver a burst.
//   · THE SYNERGY OVERDRIVE. Assists, steals, drifts, blocks and dunks fill one gauge for the team; full, it ignites:
//     15 s of an infinite turbo, faster mates, and a dunk that lands a SHOCKWAVE on every rival near the rim.

export const SLIPSTREAM = { behindM: 3.4, lateralM: 1.2, minSpeed: 2.8, speedMult: 1.2, gaugePerSec: 5 } as const;

/** Am I in the mate carrier's wake? Behind him along his velocity, inside the cone, while he actually runs. */
export function slipstreamRead(me: { x: number; z: number }, mate: { x: number; z: number }, mateVel: { x: number; z: number }): boolean {
  const s = Math.hypot(mateVel.x, mateVel.z);
  if (s < SLIPSTREAM.minSpeed) return false;
  const fx = mateVel.x / s, fz = mateVel.z / s;
  const dx = me.x - mate.x, dz = me.z - mate.z;
  const behind = -(dx * fx + dz * fz), lateral = Math.abs(dx * fz - dz * fx);
  return behind > 0.4 && behind <= SLIPSTREAM.behindM && lateral <= SLIPSTREAM.lateralM;
}

export const SLING = { minSpeed: 3.8, ballMult: 1.3, burstMult: 1.35, burstSec: 0.9, /** the pick reads a rival this close to the ball (0.8 for an ordinary chest pass): a sling is harder to get a hand on */ pickM: 0.45 } as const;

/** A pass thrown on the turbo at speed is a SLING. */
export function slingRead(sprint: boolean, speed: number): boolean { return sprint && speed >= SLING.minSpeed; }

export const SYNERGY = {
  full: 100,
  assist: 30, steal: 25, drift: 15, block: 20, dunk: 10, parry: 20, driveBy: 25,
  overdriveSec: 15, mateMult: 1.15, meMult: 1.2,
  shockM: 3, shockStunSec: 1.0,
} as const;
export type SynergySource = 'assist' | 'steal' | 'drift' | 'block' | 'dunk' | 'parry' | 'driveBy';

/** The team's shared gauge. `add` returns true the moment it ignites; nothing accrues while the overdrive runs. */
export class SynergyGauge {
  value = 0; overdriveLeft = 0; ignitions = 0;
  get active(): boolean { return this.overdriveLeft > 0; }
  get meMult(): number { return this.active ? SYNERGY.meMult : 1; }
  get mateMult(): number { return this.active ? SYNERGY.mateMult : 1; }
  add(kind: SynergySource | number): boolean {
    if (this.active) return false;
    this.value = Math.min(SYNERGY.full, this.value + (typeof kind === 'number' ? kind : SYNERGY[kind]));
    if (this.value < SYNERGY.full) return false;
    this.ignite(); return true;
  }
  ignite(): void { this.overdriveLeft = SYNERGY.overdriveSec; this.value = 0; this.ignitions++; }
  tick(dt: number): void { if (this.overdriveLeft > 0) this.overdriveLeft = Math.max(0, this.overdriveLeft - dt); }
}

/** An overdrive dunk's SHOCKWAVE: the indices of the rivals inside `shockM` of the rim's floor point. */
export function shockVictims(rim: { x: number; z: number }, foes: readonly { x: number; z: number }[]): number[] {
  const out: number[] = [];
  foes.forEach((f, i) => { if (Math.hypot(f.x - rim.x, f.z - rim.z) <= SYNERGY.shockM) out.push(i); });
  return out;
}
