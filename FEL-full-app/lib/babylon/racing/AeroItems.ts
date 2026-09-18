// AERO ITEMS — balloons, weapons and bananas, the Diddy Kong Racing way (owner, 2026-09-15: Aero Aces "like diddy Kong
// flyers"; decision: BALLOONS + ITEMS — fly through balloons for items: missiles, shield, boost, mines; bananas raise top
// speed).
//
// THE RULES, kept to DKR's so a player who knows it reads this at a glance:
//   · A BALLOON's colour is its item: RED missile · BLUE boost · YELLOW shield · GREEN mine.
//   · You carry ONE item. Fly through the SAME colour again and it LEVELS UP (1 → 2 → 3); a different colour replaces it.
//   · A popped balloon comes back after BALLOON_RESPAWN_SEC, so a lap is a line through the ones you want.
//   · BANANAS lie in lines along the course. Each one carried lifts the top speed a little (ArcadeFlight.bananaSpeed),
//     up to BANANA_CAP. A hit knocks BANANAS_LOST_ON_HIT loose.
//   · A HIT (missile, mine) spins you out unless the SHIELD is up or you are mid BARREL ROLL.
//
// What each item does at each level:
//   missile  1: one straight shot     2: one homing shot          3: three homing shots
//   boost    1: a short zip           2: a longer zip             3: the long zip
//   shield   1: 3 s                   2: 6 s                      3: 9 s
//   mine     1: one mine dropped      2: two, spread              3: three, spread
//
// Pure: positions are Vector3, nothing is drawn here.

import { Vector3 } from '@babylonjs/core';

export type ItemKind = 'missile' | 'boost' | 'shield' | 'mine';
export const ITEM_KINDS: readonly ItemKind[] = ['missile', 'boost', 'shield', 'mine'];
export const BALLOON_COLOR: Record<ItemKind, string> = { missile: '#ff4b4b', boost: '#3aa0ff', shield: '#ffd75e', mine: '#4fdc6a' };
export const ITEM_LABEL: Record<ItemKind, string> = { missile: 'MISSILE', boost: 'BOOST', shield: 'SHIELD', mine: 'MINE' };

export const BALLOON_RESPAWN_SEC = 3;
export const BALLOON_RADIUS = 5.5;   // a toy plane is ~5 m tip to tip: a balloon brushed by a wing is a balloon taken
export const BANANA_RADIUS = 4;
export const BANANA_CAP = 10;
export const BANANAS_LOST_ON_HIT = 2;
export const BOOST_ZIP_SEC = [0, 1.2, 2.0, 3.0];
export const SHIELD_SEC = [0, 3, 6, 9];
export const MISSILE_SPEED = 62;
export const MISSILE_LIFE_SEC = 3.2;
export const MISSILE_HIT_RADIUS = 3.2;
export const MISSILE_TURN = 2.6;          // rad/s a homing missile can turn
export const MINE_HIT_RADIUS = 3.6;
export const MINE_LIFE_SEC = 22;

export interface HeldItem { kind: ItemKind; level: 1 | 2 | 3 }

/** Fly through a balloon: the same colour levels up, another colour replaces what you hold. */
export function collectBalloon(held: HeldItem | null, kind: ItemKind): HeldItem {
  if (held && held.kind === kind) return { kind, level: Math.min(3, held.level + 1) as 1 | 2 | 3 };
  return { kind, level: 1 };
}

export interface Balloon { id: number; kind: ItemKind; pos: Vector3; respawn: number }

/** Balloons within reach of the travel segment prev → now pop (swept: 30 m/s covers a balloon in a frame). */
export function balloonsHit(balloons: Balloon[], prev: Vector3, now: Vector3, radius = BALLOON_RADIUS): Balloon[] {
  return balloons.filter((b) => b.respawn <= 0 && segDist(b.pos, prev, now) <= radius);
}

export function stepBalloons(balloons: Balloon[], dt: number): void {
  for (const b of balloons) if (b.respawn > 0) b.respawn = Math.max(0, b.respawn - dt);
}

export interface Banana { pos: Vector3; taken: boolean; respawn: number }

export function segDist(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.subtract(a); const l2 = ab.lengthSquared();
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, Vector3.Dot(p.subtract(a), ab) / l2));
  return Vector3.Distance(p, a.add(ab.scale(t)));
}

// ── the things items put in the air ──────────────────────────────────────────────────────────────────────

export interface Missile { pos: Vector3; dir: Vector3; homing: boolean; life: number; owner: number; target: number | null }
export interface Mine { pos: Vector3; life: number; owner: number; armT: number }

/** Racer ids: 0 = the player, 1.. = rivals. */
export interface Target { id: number; pos: Vector3; protected: boolean }

/**
 * Fire what you hold. Returns what it made and what the firer gets (a boost zip, a shield) — the caller spends the item.
 * `ahead` is the nearest racer in front (homing target), `aim` is the firer's forward.
 */
export function useItem(item: HeldItem, owner: number, from: Vector3, aim: Vector3, back: Vector3, ahead: number | null): {
  missiles: Missile[]; mines: Mine[]; boostSec: number; shieldSec: number;
} {
  const out = { missiles: [] as Missile[], mines: [] as Mine[], boostSec: 0, shieldSec: 0 };
  const dir = aim.normalizeToNew();
  switch (item.kind) {
    case 'missile': {
      const n = item.level === 3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.12;
        const d = new Vector3(dir.x * Math.cos(spread) - dir.z * Math.sin(spread), dir.y, dir.x * Math.sin(spread) + dir.z * Math.cos(spread));
        out.missiles.push({ pos: from.add(dir.scale(4 + i)), dir: d, homing: item.level >= 2, life: MISSILE_LIFE_SEC, owner, target: item.level >= 2 ? ahead : null });
      }
      break;
    }
    case 'boost': out.boostSec = BOOST_ZIP_SEC[item.level]; break;
    case 'shield': out.shieldSec = SHIELD_SEC[item.level]; break;
    case 'mine': {
      const n = item.level;
      const side = new Vector3(back.z, 0, -back.x).normalize();
      for (let i = 0; i < n; i++) {
        const off = side.scale((i - (n - 1) / 2) * 5);
        out.mines.push({ pos: from.add(back.normalizeToNew().scale(6)).add(off), life: MINE_LIFE_SEC, owner, armT: 0.6 });
      }
      break;
    }
  }
  return out;
}

/** Step every missile; returns the ids of racers hit this frame (a protected target absorbs it and the missile is gone). */
export function stepMissiles(missiles: Missile[], targets: Target[], dt: number): { hit: number[]; absorbed: number[]; spent: Missile[] } {
  const hit: number[] = []; const absorbed: number[] = []; const spent: Missile[] = [];
  for (const m of missiles) {
    m.life -= dt;
    const tgt = m.homing && m.target !== null ? targets.find((t) => t.id === m.target) : undefined;
    if (tgt) {
      const want = tgt.pos.subtract(m.pos).normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(m.dir, want))));
      const k = ang > 1e-4 ? Math.min(1, (MISSILE_TURN * dt) / ang) : 1;
      m.dir = Vector3.Lerp(m.dir, want, k).normalize();
    }
    const prev = m.pos.clone();
    m.pos.addInPlace(m.dir.scale(MISSILE_SPEED * dt));
    for (const t of targets) {
      if (t.id === m.owner) continue;
      if (segDist(t.pos, prev, m.pos) <= MISSILE_HIT_RADIUS) {
        (t.protected ? absorbed : hit).push(t.id);
        m.life = 0; break;
      }
    }
    if (m.life <= 0) spent.push(m);
  }
  for (const s of spent) missiles.splice(missiles.indexOf(s), 1);
  return { hit, absorbed, spent };
}

/** Step mines; a mine is armed after `armT` (you cannot hit your own as it leaves), and anyone flying through it is hit. */
export function stepMines(mines: Mine[], targets: Target[], dt: number): { hit: number[]; absorbed: number[]; spent: Mine[] } {
  const hit: number[] = []; const absorbed: number[] = []; const spent: Mine[] = [];
  for (const m of mines) {
    m.life -= dt; m.armT = Math.max(0, m.armT - dt);
    if (m.armT <= 0) {
      for (const t of targets) {
        if (Vector3.Distance(t.pos, m.pos) <= MINE_HIT_RADIUS) { (t.protected ? absorbed : hit).push(t.id); m.life = 0; break; }
      }
    }
    if (m.life <= 0) spent.push(m);
  }
  for (const s of spent) mines.splice(mines.indexOf(s), 1);
  return { hit, absorbed, spent };
}

/** Bananas after a hit. */
export function bananasAfterHit(n: number): number { return Math.max(0, n - BANANAS_LOST_ON_HIT); }
