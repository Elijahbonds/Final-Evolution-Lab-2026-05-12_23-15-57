// NeoCombatCore — the pure logic of the co-op horde beat-em-up (KARATE-NEO-COOP, 2026-09-07). Headless-testable;
// KarateEndlessMode renders it. Five systems, none of which touch Babylon:
//
//   PlayerVitals   — the fighter is NOT one-tap DOWN any more: an HP pool, a guard that chips but never drops you,
//                    post-hit i-frames, a revive ratio. The A+ P0 pass (2026-09-06) made one clean contact = DOWN;
//                    the owner's Neo brief reverses that for the player (enemies stay one-solid-strike).
//   SlowMoLatch    — the Matrix beat. Latches ONCE per moment (perfect dodge, a heavy / finisher KO, the wave-clear
//                    KO, the chi burst), short, with a cooldown so the run never lives in slow motion; the chi burst is
//                    player-triggered and always fires.
//   EnemyBrain     — pursue → WIND-UP (a readable telegraph) → STRIKE (the hit lands on the clip's contact beat) →
//                    RECOVER → pursue. The old mob hit you the frame it touched you and then stood idle for ever.
//   ComboTracker   — three lights inside the window make the third an UPPERCUT finisher (launch + slow-mo).
//   DropDirector   — the in-wave pickup loop: shards (the perk currency) most KOs, a chi orb every fourth, a health
//                    orb when you are hurt (with a pity counter so a bad streak cannot starve you).
//   Perks          — four perks that each change the run (toughness / reach / chi / movement), bought with the shards
//                    picked up THIS run — run-local, never the wallet.

// ── Player vitals ───────────────────────────────────────────────────────────
export const VITALS = {
  maxHp: 100,
  hitDmgBase: 18, hitDmgPerWave: 1, hitDmgCap: 26,   // 5–6 clean hits at wave 1, 4 by wave 9
  blockChip: 4,                                       // a guard chips; it can never drop you (floors at 1)
  hurtIframeSec: 0.55,                                // after a clean hit: no chain-stun from a horde
  reviveRatio: 0.4,
  reviveIframeSec: 1.2,
  knockbackM: 0.55,
} as const;

/** Damage of one enemy strike on a wave (escalation lives in count + speed; damage creeps, capped). The kick hits
 *  ENEMY_ATTACK.kick.dmgMult harder. */
export function enemyHitDamage(wave: number, strike: 'jab' | 'kick' = 'jab'): number {
  const jab = Math.min(VITALS.hitDmgCap, VITALS.hitDmgBase + Math.max(0, wave - 1) * VITALS.hitDmgPerWave);
  return strike === 'kick' ? Math.round(jab * ENEMY_ATTACK.kick.dmgMult) : jab;
}

export type HitOutcome = 'iframe' | 'blocked' | 'hit' | 'down';

export class PlayerVitals {
  hp: number;
  /** Post-hit / post-revive invulnerability (seconds). The DODGE's own window is the mode's (it carries the perfect-dodge read). */
  iframeSec = 0;
  constructor(public maxHp: number = VITALS.maxHp) { this.hp = maxHp; }
  get ratio(): number { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }
  get downed(): boolean { return this.hp <= 0; }
  tick(dt: number): void { this.iframeSec = Math.max(0, this.iframeSec - dt); }
  /** One enemy strike lands. `dodging` = inside the dodge's i-frames (untouchable). */
  /**
   * `blockChipMult` scales what a guard costs — it is how a FIGHTING STYLE reaches this mode's block.
   * Defaults to 1, so every existing caller is unchanged. Still floors at 1 hp: a guard can never drop you,
   * whatever style you brought.
   */
  takeHit(dmg: number, opts: { blocking?: boolean; dodging?: boolean; blockChipMult?: number } = {}): HitOutcome {
    if (this.hp <= 0) return 'down';
    if (opts.dodging || this.iframeSec > 0) return 'iframe';
    if (opts.blocking) { this.hp = Math.max(1, this.hp - VITALS.blockChip * (opts.blockChipMult ?? 1)); return 'blocked'; }
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) return 'down';
    this.iframeSec = VITALS.hurtIframeSec;
    return 'hit';
  }
  heal(n: number): void { this.hp = Math.min(this.maxHp, this.hp + n); }
  setMax(maxHp: number, healToFull = false): void { this.maxHp = maxHp; this.hp = healToFull ? maxHp : Math.min(this.hp, maxHp); }
  revive(ratio: number = VITALS.reviveRatio): void { this.hp = Math.max(1, Math.round(this.maxHp * ratio)); this.iframeSec = VITALS.reviveIframeSec; }
}

// ── Slow-mo latch ───────────────────────────────────────────────────────────
export const SLOWMO = {
  scale: 0.28,
  perfectDodge: 0.6, heavyKo: 0.45, finisher: 0.5, waveClear: 0.7, chiBurst: 0.9,
  cooldownSec: 2.5,   // after a beat ends, before the next non-special one may latch
} as const;
export type SlowMoKind = 'perfectDodge' | 'heavyKo' | 'finisher' | 'waveClear' | 'chiBurst';

export class SlowMoLatch {
  sec = 0;
  cooldown = 0;
  kind: SlowMoKind | null = null;
  episodes = 0;
  /** Latch a beat. Returns false when one is already running or the cooldown holds — except the player-triggered
   *  special, which always fires (and extends a running beat). */
  fire(kind: SlowMoKind): boolean {
    const dur = SLOWMO[kind];
    const special = kind === 'chiBurst';
    if (!special && (this.sec > 0 || this.cooldown > 0)) return false;
    this.sec = Math.max(this.sec, dur);
    this.kind = kind;
    this.episodes++;
    this.cooldown = Math.max(this.cooldown, dur + SLOWMO.cooldownSec);
    return true;
  }
  /** Real seconds (the latch itself never slows). */
  tick(dtReal: number): void {
    this.sec = Math.max(0, this.sec - dtReal);
    this.cooldown = Math.max(0, this.cooldown - dtReal);
    if (this.sec === 0) this.kind = null;
  }
  get active(): boolean { return this.sec > 0; }
  get scale(): number { return this.sec > 0 ? SLOWMO.scale : 1; }
  reset(): void { this.sec = 0; this.cooldown = 0; this.kind = null; }
}

// ── Enemy attack brain ──────────────────────────────────────────────────────
export const ENEMY_ATTACK = {
  windupSec: 0.40, windupMinSec: 0.22, windupPerWave: 0.022,   // the telegraph shortens per wave — raised 2026-09-19, the floor is still a readable 0.22 s
  strikeSec: 0.5, landAt: 0.2,                                  // the jab clip; the hit lands on its contact beat
  kick: { strikeSec: 0.7, landAt: 0.28, dmgMult: 1.5, fromWave: 2 },   // the high kick (wave 3+, every third square-up): longer, lands later, hits harder
  recoverSec: 0.44,                                             // less rest between an enemy's swings
  engageRange: 1.25, hitRange: 1.5, arcDeg: 90,
  orbitSpeed: 1.55,                                             // a capped-out attacker circles at this speed
} as const;

export function windupSecFor(wave: number): number {
  return Math.max(ENEMY_ATTACK.windupMinSec, ENEMY_ATTACK.windupSec - Math.max(0, wave - 1) * ENEMY_ATTACK.windupPerWave);
}
/** How many bodies may be inside a strike at once — the horde pressures, it does not instant-mob.
 *  RAISED 2026-09-19 (owner: the mode was too easy): the ceiling is 7 instead of 5 and it is reached at wave 9 instead
 *  of wave 9 at 5 — a body every 1.5 waves. The mob is still capped, because being swarmed with no answer is not
 *  difficulty; the answer here is that the crowd control verbs (the wall run, the carry, the finisher) have to be used. */
export function maxAttackers(wave: number): number {
  return Math.min(7, 2 + Math.floor(Math.max(0, wave - 1) / 1.5));
}

export type EnemyPhase = 'pursue' | 'windup' | 'strike' | 'recover';
export type EnemyEvent = 'windup' | 'strike' | 'land' | 'resume' | null;
export type EnemyStrikeKind = 'jab' | 'kick';

export class EnemyBrain {
  phase: EnemyPhase = 'pursue';
  t = 0;
  /** The strike this square-up throws (set by engage). */
  strike: EnemyStrikeKind = 'jab';
  private landed = false;
  constructor(public wave = 1) {}
  get attacking(): boolean { return this.phase === 'windup' || this.phase === 'strike'; }
  /** The strike's clip length and contact beat. */
  get strikeSec(): number { return this.strike === 'kick' ? ENEMY_ATTACK.kick.strikeSec : ENEMY_ATTACK.strikeSec; }
  get landAt(): number { return this.strike === 'kick' ? ENEMY_ATTACK.kick.landAt : ENEMY_ATTACK.landAt; }
  /** At engage range with a free attacker slot: start the wind-up (a jab, or the kick from ENEMY_ATTACK.kick.fromWave). */
  engage(strike: EnemyStrikeKind = 'jab'): EnemyEvent {
    if (this.phase !== 'pursue') return null;
    this.phase = 'windup'; this.t = 0; this.strike = strike;
    return 'windup';
  }
  /** Game seconds (slow-mo slows the telegraph too — that is the point). One event per step. */
  step(dt: number): EnemyEvent {
    switch (this.phase) {
      case 'pursue': return null;
      case 'windup':
        this.t += dt;
        if (this.t >= windupSecFor(this.wave)) { this.phase = 'strike'; this.t = 0; this.landed = false; return 'strike'; }
        return null;
      case 'strike':
        this.t += dt;
        if (!this.landed && this.t >= this.landAt) { this.landed = true; return 'land'; }
        if (this.t >= this.strikeSec) { this.phase = 'recover'; this.t = 0; }
        return null;
      case 'recover':
        this.t += dt;
        if (this.t >= ENEMY_ATTACK.recoverSec) { this.phase = 'pursue'; this.t = 0; return 'resume'; }
        return null;
    }
  }
  /** A hit lands on this enemy: whatever it was doing is cancelled. */
  interrupt(): void { this.phase = 'pursue'; this.t = 0; this.landed = false; }
}

// ── Combo ───────────────────────────────────────────────────────────────────
export const COMBO = { windowSec: 0.9, finisherAt: 3 } as const;

export class ComboTracker {
  private chain = 0;
  private lastAt = -Infinity;
  /** A light strike at `now` (seconds). Returns its position in the chain (1..finisherAt); the finisher wraps. */
  light(now: number): number {
    if (now - this.lastAt > COMBO.windowSec) this.chain = 0;
    this.chain++;
    this.lastAt = now;
    const pos = this.chain;
    if (this.chain >= COMBO.finisherAt) this.chain = 0;
    return pos;
  }
  /** Any other verb (kick / heavy / dodge / a hit taken) breaks the chain. */
  reset(): void { this.chain = 0; this.lastAt = -Infinity; }
}
export const isFinisher = (pos: number): boolean => pos === COMBO.finisherAt;

// ── Drops ───────────────────────────────────────────────────────────────────
export type DropKind = 'shard' | 'health' | 'chi';
export const DROPS = {
  shardChance: 0.6, chiEvery: 4, healthChance: 0.3, healthBelow: 0.6, healthPity: 8,
  waveClearShards: 3,
  healthHeal: 30, chiGain: 35,
  lifeSec: 14, blinkSec: 3, maxAlive: 12,
  magnetM: 1.5, collectM: 0.6,
} as const;

export class DropDirector {
  private kos = 0;
  private sinceHealth = 0;
  constructor(private rng: () => number = Math.random) {}
  /** A body drops. `hpRatio` = the player's health now. */
  onKo(hpRatio: number): DropKind | null {
    this.kos++; this.sinceHealth++;
    if (hpRatio < DROPS.healthBelow && (this.sinceHealth >= DROPS.healthPity || this.rng() < DROPS.healthChance)) { this.sinceHealth = 0; return 'health'; }
    if (this.kos % DROPS.chiEvery === 0) return 'chi';
    if (this.rng() < DROPS.shardChance) return 'shard';
    return null;
  }
}

// ── Perks (run-local shards, never the wallet) ──────────────────────────────
export interface PerkState {
  maxHp: number; reach: number; arcDeg: number; chiMult: number; burstRadius: number;
  speedMult: number; dodgeMult: number; iframeBonus: number;
}
export const BASE_PERKS: PerkState = { maxHp: VITALS.maxHp, reach: 1, arcDeg: 0, chiMult: 1, burstRadius: 0, speedMult: 1, dodgeMult: 1, iframeBonus: 0 };
export interface NeoPerk { id: string; label: string; blurb: string; cost: number }
export const NEO_PERKS: NeoPerk[] = [
  { id: 'iron',  label: 'IRON BODY',   blurb: '+40 MAX HP · FULL HEAL',       cost: 6 },
  { id: 'hands', label: 'HEAVY HANDS', blurb: '+25% REACH · WIDER ARCS',      cost: 8 },
  { id: 'flow',  label: 'CHI FLOW',    blurb: 'CHI ×1.5 · BURST +1.5 M',      cost: 8 },
  { id: 'quick', label: 'QUICKSILVER', blurb: '+15% SPEED · LONGER DODGE',    cost: 6 },
];

export function applyPerk(s: PerkState, id: string): PerkState {
  switch (id) {
    case 'iron':  return { ...s, maxHp: s.maxHp + 40 };
    case 'hands': return { ...s, reach: s.reach * 1.25, arcDeg: s.arcDeg + 20 };
    case 'flow':  return { ...s, chiMult: s.chiMult * 1.5, burstRadius: s.burstRadius + 1.5 };
    case 'quick': return { ...s, speedMult: s.speedMult * 1.15, dodgeMult: s.dodgeMult * 1.2, iframeBonus: s.iframeBonus + 0.1 };
    default: return s;
  }
}

export interface BuyResult { ok: boolean; id: string; cost: number; reason?: string }

export class PerkShop {
  sel = 0;
  readonly owned = new Set<string>();
  constructor(readonly catalog: NeoPerk[] = NEO_PERKS) {}
  get selected(): NeoPerk { return this.catalog[this.sel]; }
  move(d: -1 | 1): void { this.sel = (this.sel + d + this.catalog.length) % this.catalog.length; }
  /** Buy the selected perk with `shards`. The caller subtracts `cost` on ok. */
  buy(shards: number): BuyResult {
    const p = this.selected;
    if (this.owned.has(p.id)) return { ok: false, id: p.id, cost: p.cost, reason: 'OWNED' };
    if (shards < p.cost) return { ok: false, id: p.id, cost: p.cost, reason: `NEED ${p.cost - shards} MORE` };
    this.owned.add(p.id);
    return { ok: true, id: p.id, cost: p.cost };
  }
  get allOwned(): boolean { return this.catalog.every((p) => this.owned.has(p.id)); }
  /** The perk state every owned perk builds up to. */
  state(): PerkState { let s = BASE_PERKS; for (const p of this.catalog) if (this.owned.has(p.id)) s = applyPerk(s, p.id); return s; }
  /** The HUD line: `▶` marks the cursor, `✓` an owned perk. Joined by ' · ' (the bezel splits on it). */
  hudLine(): string {
    return this.catalog.map((p, i) => `${i === this.sel ? '▶ ' : ''}${this.owned.has(p.id) ? '✓ ' : ''}${p.label} ${p.cost}◆`).join(' · ');
  }
}

// ── Separation (a horde fans out; it does not conga) ───────────────────────
export interface P2 { x: number; z: number }
/** Per-point offsets pushing neighbours closer than `minDist` apart (half the overlap each, scaled by `strength`). */
export function separate(points: P2[], minDist: number, strength = 0.5): P2[] {
  const out = points.map(() => ({ x: 0, z: 0 }));
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const dx = points[j].x - points[i].x, dz = points[j].z - points[i].z;
    const d = Math.hypot(dx, dz);
    if (d >= minDist) continue;
    const push = (minDist - d) * strength * 0.5;
    const nx = d > 1e-4 ? dx / d : Math.cos(i * 2.4), nz = d > 1e-4 ? dz / d : Math.sin(i * 2.4);
    out[i].x -= nx * push; out[i].z -= nz * push;
    out[j].x += nx * push; out[j].z += nz * push;
  }
  return out;
}
