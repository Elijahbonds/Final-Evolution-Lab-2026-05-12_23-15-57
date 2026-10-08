/**
 * Downs, revives and eliminations (ADVENTURE PLAN, "The Battle Royale": "Downed duo members bleed out and can be
 * revived (DownRevive)"). OnslaughtCore's DownRevive is the clock and the channel, one per fighter, unchanged; the BR
 * runs its bleed faster (DOWNS.bleedRate) and faster again with an enemy standing over the body (the finish), by
 * moving the down's start back — DownRevive's own `bledOut` then answers.
 *
 *   SOLO          at zero HP a fighter is out (after a beat lying there).
 *   DUO           at zero HP a fighter is DOWNED while a teammate still stands: the teammate revives them by standing in
 *                 DownRevive's range for its channel — a human holding interact (MoveInput.interactHeld, contracts v2)
 *                 or standing still (A3's story rule), a bot by going there. The revive is the contract's `revive`
 *                 event, which A2's combat applies (hp is A2's field). Bled out, or the whole team down: out.
 *   OUT           the fighter's team place is fixed when the team's last member goes out; the kit spills.
 *
 * It writes no actor field: the hp comes back through A2, the body leaves through the match (a spawn's write).
 * Pure: no Babylon, no clock (ctx.tSec).
 */

import { BLEED_OUT_SEC, DownRevive, REVIVED_HP_RATIO, REVIVE_CHANNEL_SEC, REVIVE_RANGE } from '@/lib/babylon/core/OnslaughtCore';
import type { ActorId, AdventureActor, AdventureStepContext, AdventureSystem } from '../contracts';
import { ABILITY, DOWNS } from './tuning';
import { hasAbility, type Kit } from './kit';

export interface DownsFighter {
  id: ActorId;
  team: number;
  human: boolean;
  kit: Kit;
  status: 'dropping' | 'alive' | 'downed' | 'out';
  /** Sim second the fighter hit zero (solo: the lie before the elimination). */
  zeroAt: number | null;
}

export interface DownsHost {
  fighters(): readonly DownsFighter[];
  /** A fighter is out: the match places them, spills their kit and clears the body away. */
  eliminate(f: DownsFighter, byId: ActorId | null): void;
  /** Duos (teammates revive) or solos. */
  readonly duos: boolean;
}

export interface DownsSystem extends AdventureSystem {
  /** A downed fighter's revive progress 0..1 and seconds left to bleed (the HUD), or null when not downed. */
  downOf(id: ActorId): { revive01: number; bleedLeftSec: number } | null;
}

/** Revive channel and range (OnslaughtCore's). */
export const REVIVE = { channelSec: REVIVE_CHANNEL_SEC, rangeM: REVIVE_RANGE } as const;
/** [TUNE] A human "stands still" to revive below this stick (A3's story rule), or holds interact. */
export const STILL_STICK = 0.2;

export function createDownsSystem(host: DownsHost): DownsSystem {
  const clocks = new Map<ActorId, DownRevive>();
  const lastHit = new Map<ActorId, ActorId | null>();
  let busRef: AdventureStepContext['bus'] | null = null;
  let off: (() => void) | null = null;
  let lastT = 0;

  const clockOf = (id: ActorId): DownRevive => {
    let c = clocks.get(id);
    if (!c) { c = new DownRevive(); clocks.set(id, c); }
    return c;
  };
  const down = (a: AdventureActor | undefined): boolean => !a || !(a.stats.hp.cur > 0);

  return {
    id: 'br.downs',
    downOf(id) {
      const c = clocks.get(id);
      if (!c || !c.downed || c.downedAt === null) return null;
      return { revive01: Math.min(1, c.channelSec / REVIVE_CHANNEL_SEC), bleedLeftSec: Math.max(0, BLEED_OUT_SEC - (lastT - c.downedAt)) / DOWNS.bleedRate };
    },
    step(ctx: AdventureStepContext, dt: number): void {
      if (busRef !== ctx.bus) {
        off?.();
        busRef = ctx.bus;
        off = ctx.bus.on('ko', (e) => { lastHit.set(e.actorId, e.byId); });
      }
      lastT = ctx.tSec;
      const fs = host.fighters();
      for (const f of fs) {
        if (f.status === 'out' || f.status === 'dropping') continue;
        const a = ctx.world.actors.get(f.id);
        if (f.status === 'alive') {
          if (!down(a)) { f.zeroAt = null; continue; }
          if (f.zeroAt === null) f.zeroAt = ctx.tSec;
          const mate = host.duos ? fs.find((m) => m !== f && m.team === f.team && m.status === 'alive' && !down(ctx.world.actors.get(m.id))) : undefined;
          if (mate) {
            f.status = 'downed';
            clockOf(f.id).down(ctx.tSec);
          } else if (ctx.tSec - f.zeroAt >= DOWNS.soloLieSec || host.duos) {
            host.eliminate(f, lastHit.get(f.id) ?? null);
            // the whole team down: the downed mates go out with them
            for (const m of fs) if (m !== f && m.team === f.team && m.status === 'downed') host.eliminate(m, lastHit.get(m.id) ?? null);
          }
          continue;
        }
        // downed
        if (!down(a)) { f.status = 'alive'; f.zeroAt = null; clockOf(f.id).revive(); continue; }   // the revive landed
        const c = clockOf(f.id);
        let reviving = false, hostiles = 0;
        for (const m of fs) {
          if (m === f || m.status !== 'alive') continue;
          const b = ctx.world.actors.get(m.id);
          if (!a || !b || down(b)) continue;
          const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
          if (m.team === f.team) {
            if (d > REVIVE_RANGE) continue;
            const inp = ctx.inputs.get(m.id);
            const still = !inp || Math.hypot(inp.move.x, inp.move.y) < STILL_STICK;
            if (still || inp?.interactHeld) reviving = true;
          } else if (d <= DOWNS.finishM) hostiles++;
        }
        const mateSwift = reviving && fs.some((m) => m !== f && m.team === f.team && hasAbility(m.kit, 'swiftHands'));
        if (c.channel(dt * (mateSwift ? ABILITY.swiftReviveMult : 1), reviving)) {
          // the revive is A2's to apply (hp is its field) on its next step; the status flips when the hp is back
          ctx.bus.emit('revive', { actorId: f.id, byId: fs.find((m) => m !== f && m.team === f.team)?.id ?? f.id, hpRatio: REVIVED_HP_RATIO });
          c.channelSec = 0;
          continue;
        }
        if (c.downedAt !== null) {
          // the BR bleeds faster, and an enemy over the body finishes it
          const rate = DOWNS.bleedRate * (hostiles > 0 ? DOWNS.finishRate : 1);
          c.downedAt -= dt * (rate - 1);
        }
        if (c.bledOut(ctx.tSec)) {
          host.eliminate(f, lastHit.get(f.id) ?? null);
          c.revive();
        }
      }
    },
    dispose() { off?.(); off = null; busRef = null; clocks.clear(); lastHit.clear(); },
  };
}
