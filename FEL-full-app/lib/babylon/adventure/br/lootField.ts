/**
 * Loot on the ground (ADVENTURE PLAN Phase C: "Spawn tables, chests/drops, pickup"). Plain data the snapshot carries:
 * the items lying on the map and the chests, with the seed that rolled them.
 *
 *   AT THE START   each floor spot rolls its table (field or landmark) with LOOT.floorChance; chests stand shut.
 *   A CHEST        opens when a fighter stands at it for LOOT.chestOpenSec, and spills LOOT.chestDrops chest rolls.
 *   PICKUP         walking over an item takes it when it improves the kit (kit.upgradeScore > 0) — no button, so a
 *                  thumb on a phone stays on the fight — and a swap drops the old item at your feet (you cannot take
 *                  your own drop straight back: DROP_HOLD_SEC).
 *   AN ELIMINATION spills the fighter's whole kit where they fell.
 * Every take emits the contract's `loot` event.
 *
 * Pure: no Babylon, no clock, no global random (one seeded stream, forked from the match seed).
 */

import type { ActorId, AdventureBus, Vec3 } from '../contracts';
import { forkSeed, seededRng } from './rng';
import { lootById, rollLoot, type LootDef, type LootTableId } from './loot';
import { takeLoot, upgradeScore, type Kit, type TakeResult } from './kit';
import { LOOT } from './tuning';

export interface FloorItem {
  uid: number;
  lootId: string;
  pos: Vec3;
  /** Who dropped it (a swap) and until when they may not take it back. */
  droppedBy: ActorId | null;
  holdUntil: number;
}

export interface Chest { id: string; pos: Vec3; open: boolean; openSec: number; touched: boolean }

export interface LootFieldState { items: FloorItem[]; chests: Chest[]; nextUid: number }

/** [TUNE] A swapped-out item cannot be taken back by its dropper for this long. */
export const DROP_HOLD_SEC = 2;

export class LootField {
  readonly state: LootFieldState = { items: [], chests: [], nextUid: 1 };
  private readonly rng: () => number;

  constructor(seed: number, spots: readonly { pos: Vec3; table: LootTableId }[], chests: readonly Vec3[]) {
    this.rng = seededRng(forkSeed(seed, 'loot'));
    for (const s of spots) if (this.rng() < LOOT.floorChance) this.place(rollLoot(this.rng, s.table), s.pos, null, 0);
    chests.forEach((c, i) => this.state.chests.push({ id: `chest.${i}`, pos: { x: c.x, y: c.y, z: c.z }, open: false, openSec: 0, touched: false }));
  }

  get items(): readonly FloorItem[] { return this.state.items; }
  get chests(): readonly Chest[] { return this.state.chests; }

  place(def: LootDef, at: Vec3, droppedBy: ActorId | null, holdUntil: number): FloorItem {
    const it: FloorItem = { uid: this.state.nextUid++, lootId: def.id, pos: { x: at.x, y: at.y, z: at.z }, droppedBy, holdUntil };
    this.state.items.push(it);
    return it;
  }

  /** Spill `defs` round a point on a small ring (a chest's drops, an eliminated fighter's kit). */
  spill(defs: readonly LootDef[], at: Vec3, groundY: (x: number, z: number) => number | null): void {
    const n = defs.length;
    for (let i = 0; i < n; i++) {
      const ang = (i / Math.max(1, n)) * Math.PI * 2 + this.rng() * 0.5;
      const r = LOOT.spillM * (0.8 + 0.4 * this.rng());
      const x = at.x + Math.sin(ang) * r, z = at.z + Math.cos(ang) * r;
      const g = groundY(x, z);
      this.place(defs[i], { x, y: g ?? at.y, z }, null, 0);
    }
  }

  /**
   * One fighter's step on the field: take what improves the kit, open a chest stood at. `slot` is the spell slot a
   * human has selected. Returns the takes (for the HUD and the stats refresh).
   */
  visit(id: ActorId, pos: Vec3, kit: Kit, tSec: number, dt: number, slot: number | null, bus: AdventureBus,
    groundY: (x: number, z: number) => number | null, onTake: (r: TakeResult, def: LootDef) => void): void {
    const items = this.state.items;
    const r2 = LOOT.pickupM * LOOT.pickupM;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z;
      if (dx * dx + dz * dz > r2 || Math.abs(it.pos.y - pos.y) > 2) continue;
      if (it.droppedBy === id && tSec < it.holdUntil) continue;
      const def = lootById(it.lootId);
      if (!def || upgradeScore(kit, def) <= 0) continue;
      const res = takeLoot(kit, def, slot);
      if (!res.took) continue;
      items.splice(i, 1);
      i--;
      if (res.dropped) this.place(res.dropped, { x: pos.x, y: groundY(pos.x, pos.z) ?? pos.y, z: pos.z }, id, tSec + DROP_HOLD_SEC);
      bus.emit('loot', { actorId: id, lootId: def.id });
      onTake(res, def);
    }
    const c2 = LOOT.chestM * LOOT.chestM;
    for (const c of this.state.chests) {
      if (c.open) continue;
      const dx = c.pos.x - pos.x, dz = c.pos.z - pos.z;
      if (dx * dx + dz * dz > c2 || Math.abs(c.pos.y - pos.y) > 2) continue;
      if (c.touched) continue;   // one fighter's time per step, however many stand there
      c.touched = true;
      c.openSec += dt;
      if (c.openSec >= LOOT.chestOpenSec) {
        c.open = true;
        const drops: LootDef[] = [];
        for (let k = 0; k < LOOT.chestDrops; k++) drops.push(rollLoot(this.rng, 'chest'));
        this.spill(drops, c.pos, groundY);
      }
    }
  }

  /** The chests' open timers run down when nobody stood at them last step (call once a step, before the visits). */
  decay(dt: number): void {
    for (const c of this.state.chests) {
      if (!c.open && !c.touched && c.openSec > 0) c.openSec = Math.max(0, c.openSec - dt);
      c.touched = false;
    }
  }
}
