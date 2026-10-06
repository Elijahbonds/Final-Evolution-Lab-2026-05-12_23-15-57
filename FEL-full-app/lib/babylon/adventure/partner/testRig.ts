/**
 * TEST RIG ONLY (A3's tests; nothing in the game imports this). A fake world built from the contracts, plus two small
 * stand-ins for the lanes A3 never imports, so the partner and stats systems can be stepped headless:
 *
 *   fakeMovement  A1's stand-in: an actor walks where its MoveInput points (camera-relative through wishDir), 6 m/s, 9
 *                 sprinting, and turns to face its stick. Knocked-out actors do not move. It writes `state` from hp the
 *                 way A1 will ('ko' at 0 HP).
 *   fakeCombat    A2's stand-in: a light / heavy press hits the nearest enemy within reach for 8 / 16, emits `damage`,
 *                 and a `ko` once at 0 HP. Monsters swing at the nearest party member on a cadence.
 *
 * They are deliberately crude: the tests check A3's systems, not these.
 */
import { PRQ_ATTRS } from '@/lib/prq';
import {
  NO_FUSION, createAdventureBus, neutralInput, pool, wishDir, type ActorId, type ActorKind, type AdventureActor,
  type AdventureBus, type AdventureStepContext, type AdventureSystem, type AdventureWorld, type CameraHint, type MoveInput,
  type Vec3,
} from '../contracts';

export function makeActor(id: ActorId, kind: ActorKind, team: number, pos: Partial<Vec3> = {}, hp = 100): AdventureActor {
  return {
    id, kind, team, pos: { x: pos.x ?? 0, y: pos.y ?? 0, z: pos.z ?? 0 }, vel: { x: 0, y: 0, z: 0 }, facingYaw: 0,
    grounded: true, state: 'ground', stateSec: 0, radius: 0.4, height: 1.8,
    stats: {
      hp: pool(hp), stamina: pool(100), energy: pool(100), poise: pool(50), special: 0, level: 1, prqBand: 'READY',
      school: { primary: 'straight', secondary: 'straight', mix: 0 }, element: null,
      attrs: Object.fromEntries(PRQ_ATTRS.map((k) => [k, 50])),
    },
    lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false,
    fusion: { ...NO_FUSION }, partnerId: null,
  };
}

export interface Rig {
  world: AdventureWorld & { actors: Map<ActorId, AdventureActor> };
  bus: AdventureBus;
  inputs: Map<ActorId, MoveInput>;
  hints: CameraHint[];
  tSec: number;
  ctx(): AdventureStepContext;
  add(a: AdventureActor): AdventureActor;
  /** Step every system once at 60 Hz (in the plan's order: the caller passes them in order). */
  step(systems: AdventureSystem[], dt?: number): void;
  /** Step for `sec` seconds; `each` runs before every step (scripted input). */
  run(systems: AdventureSystem[], sec: number, each?: (t: number) => void): void;
  events: { name: string; payload: unknown }[];
}

export function makeRig(): Rig {
  const actors = new Map<ActorId, AdventureActor>();
  const events: { name: string; payload: unknown }[] = [];
  const bus = createAdventureBus((e) => { throw e; });
  // record every event (wrap emit)
  const emit = bus.emit.bind(bus);
  bus.emit = ((name: never, payload: never) => { events.push({ name, payload }); emit(name, payload); }) as AdventureBus['emit'];
  const world: Rig['world'] = {
    groundY: () => 0,
    rails: { id: 'none', segments: [] },
    walls: [],
    actors,
    near(p, r) {
      const out: AdventureActor[] = [];
      for (const a of actors.values()) if (Math.hypot(a.pos.x - p.x, a.pos.y - p.y, a.pos.z - p.z) <= r) out.push(a);
      return out;
    },
    clear: () => true,
  };
  const inputs = new Map<ActorId, MoveInput>();
  const hints: CameraHint[] = [];
  const rig: Rig = {
    world, bus, inputs, hints, tSec: 0, events,
    ctx() {
      return { tSec: rig.tSec, world, inputs, bus, timeScaleOf: () => 1, hint: (h) => { hints.push(h); } };
    },
    add(a) { actors.set(a.id, a); if (!inputs.has(a.id)) inputs.set(a.id, neutralInput()); return a; },
    step(systems, dt = 1 / 60) {
      const ctx = rig.ctx();
      for (const s of systems) s.step(ctx, dt);
      rig.tSec += dt;
    },
    run(systems, sec, each) {
      const n = Math.round(sec * 60);
      for (let i = 0; i < n; i++) { each?.(rig.tSec); rig.step(systems); }
    },
  };
  return rig;
}

/** A1's stand-in (see the header). */
export function fakeMovement(): AdventureSystem {
  return {
    id: 'fake.movement',
    step(ctx, dt) {
      for (const a of ctx.world.actors.values()) {
        const ko = a.stats.hp.cur <= 0;
        if (ko && a.state !== 'ko') a.state = 'ko';
        else if (!ko && a.state === 'ko') a.state = 'ground';
        if (ko || a.fusion.active && a.kind === 'partner') continue;
        const inp = ctx.inputs.get(a.id);
        if (!inp) continue;
        const w = wishDir(inp);
        const speed = inp.dashHeld ? 9 : 6;
        a.vel.x = w.x * speed; a.vel.z = w.z * speed;
        a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt;
        if (w.mag > 0.05) a.facingYaw = Math.atan2(w.x, w.z);
      }
    },
  };
}

/** A2's stand-in (see the header). `monsterHit` is a monster's damage per swing (0 = harmless). */
export function fakeCombat(o: { monsterHit?: number; reach?: number } = {}): AdventureSystem {
  const reach = o.reach ?? 2.2;
  const swingCd = new Map<ActorId, number>();
  const kod = new Set<ActorId>();
  return {
    id: 'fake.combat',
    step(ctx, dt) {
      const all = [...ctx.world.actors.values()];
      const hit = (from: AdventureActor, to: AdventureActor, amount: number) => {
        if (to.stats.hp.cur <= 0) return;
        const dealt = Math.min(to.stats.hp.cur, amount);
        to.stats.hp.cur -= dealt;
        ctx.bus.emit('damage', {
          tSec: ctx.tSec, sourceId: from.id, targetId: to.id, amount: dealt, source: from.kind === 'partner' ? 'partner' : 'strike',
          element: null, outcome: 'hit', staminaDamage: 0, poiseDamage: 0, staggerSec: 0, launch: false, knockback: null,
        });
        if (to.stats.hp.cur <= 0 && !kod.has(to.id)) { kod.add(to.id); ctx.bus.emit('ko', { actorId: to.id, byId: from.id }); }
      };
      const nearestFoe = (a: AdventureActor) => {
        let best: AdventureActor | null = null, bd = Infinity;
        for (const b of all) {
          if (b.team === a.team || b.stats.hp.cur <= 0 || (b.kind === 'partner' && b.fusion.active)) continue;
          const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
          if (d < bd) { bd = d; best = b; }
        }
        return best && bd <= reach ? best : null;
      };
      for (const a of all) {
        if (a.stats.hp.cur <= 0) continue;
        if (a.stats.hp.cur > 0) kod.delete(a.id);
        const inp = ctx.inputs.get(a.id);
        if (a.kind === 'player' || a.kind === 'partner') {
          if (!inp || !(inp.attackLight || inp.attackHeavy)) continue;
          const foe = nearestFoe(a);
          if (foe) hit(a, foe, inp.attackHeavy ? 16 : 8);
        } else if (a.kind === 'monster' && (o.monsterHit ?? 0) > 0) {
          const cd = (swingCd.get(a.id) ?? 0) - dt;
          swingCd.set(a.id, cd);
          if (cd > 0) continue;
          const foe = nearestFoe(a);
          if (foe) { hit(a, foe, o.monsterHit!); swingCd.set(a.id, 1.2); }
        }
      }
    },
  };
}
