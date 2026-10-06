/**
 * The scripted sandbox run (A4's integration proof): a 60 s play of the test yard through the REAL input path — FelInput
 * events into host/inputMap, the mapper into the host, the host stepping all five systems — that runs, grinds,
 * switches rails, tricks, homes onto a monster, fights with a lock, a string, a parry and a spell, fuses, flies,
 * cruises, unfuses, mounts, rides and dismounts. Pure (no Babylon), deterministic from a seed: the integration and
 * ownership tests run it, and a probe can.
 *
 * It plays like a person with a pad would: it steers the stick toward a waypoint (the camera is held looking +z, so the
 * stick is the world direction), presses buttons on the frame a condition holds, and moves on when each beat's event
 * arrives. Each beat has a time limit; a beat that runs out is recorded as missed and the run carries on.
 */

import type { FelInput } from '@/lib/babylon/core/InputBus';
import type { ActorId, AdventureActor, AdventureEventName, AdventureEvents } from '../contracts';
import { MONSTERS } from '../combat/monsters/defs';
import { PLACEHOLDER_BOSS } from '../combat/bosses/defs';
import { createInputMapper, type InputMapper } from './inputMap';
import { createSandbox, type Sandbox, type SandboxOptions } from '../world/sandboxSetup';

export const SCRIPT_BEATS = [
  'run', 'catch', 'trick', 'switch', 'rail-end', 'homing', 'lock', 'string', 'parry', 'spell', 'fuse', 'fly', 'cruise',
  'unfuse', 'mount', 'ride', 'dismount', 'brawl',
] as const;
export type ScriptBeat = (typeof SCRIPT_BEATS)[number];

export interface ScriptResult {
  sandbox: Sandbox;
  mapper: InputMapper;
  /** Sim second each beat was reached (absent = missed). */
  reached: Partial<Record<ScriptBeat, number>>;
  /** Every event the run saw, by name (counts). */
  counts: Partial<Record<AdventureEventName, number>>;
  /** Wall time of each host.tick(), milliseconds (the per-tick budget). */
  tickMs: number[];
  /** Any non-finite position or velocity seen (actor id and sim second). */
  nonFinite: string[];
  /** Ticks run. */
  ticks: number;
}

export interface ScriptOptions extends SandboxOptions {
  seconds?: number;
  /** Measure each tick's wall time with this clock (default: none — the run is the same either way). */
  now?: () => number;
  /** Called once before the first tick (the ownership test patches the systems here). */
  beforeRun?: (s: Sandbox) => void;
  /** Called after every tick. */
  afterTick?: (s: Sandbox, tick: number) => void;
}

const SIM_HZ = 60;
const NAMES: AdventureEventName[] = [
  'damage', 'ko', 'state', 'rail:enter', 'rail:switch', 'rail:trick', 'rail:exit', 'homing', 'lock', 'spell:cast',
  'time:scale', 'fusion', 'mount', 'xp', 'level', 'boss:phase', 'telegraph', 'revive',
];

/** The landing beat of a monster attack, seconds into its strike (for the parry's timing). */
function landAtOf(attackId: string): number {
  for (const d of Object.values(MONSTERS)) for (const a of d.attacks) if (a.id === attackId) return a.landAt;
  for (const p of PLACEHOLDER_BOSS.phases) for (const a of [...p.attacks, p.opener]) if (a && a.id === attackId) return a.landAt;
  return 0.15;
}

export function runSandboxScript(o: ScriptOptions = {}): ScriptResult {
  const sb = createSandbox({ ...o, fuseReady: false });
  const { host } = sb;
  const mapper = createInputMapper();
  host.setInputSource(host.playerId, (out) => mapper.fill(out, { camYaw: 0, state: host.player.state }));
  const P = (): AdventureActor => host.player;
  const reached: ScriptResult['reached'] = {};
  const counts: ScriptResult['counts'] = {};
  const tickMs: number[] = [];
  const nonFinite: string[] = [];
  const seen: { name: AdventureEventName; p: unknown }[] = [];
  for (const n of NAMES) host.bus.on(n, (p: unknown) => { counts[n] = (counts[n] ?? 0) + 1; seen.push({ name: n, p }); });
  const since = (n: number) => seen.slice(n);

  // ── the pad ──
  const send = (e: FelInput) => mapper.onInput(e);
  const stick = (x: number, z: number) => {
    const l = Math.hypot(x, z);
    const k = l > 1 ? 1 / l : 1;
    send({ t: 'stick', side: 'L', x: x * k, y: -z * k });   // camYaw 0: stick x = world +x, stick up = world +z
  };
  const towards = (tx: number, tz: number, mag = 1) => {
    const dx = tx - P().pos.x, dz = tz - P().pos.z, l = Math.hypot(dx, dz) || 1;
    stick((dx / l) * mag, (dz / l) * mag);
    return l;
  };
  const btn = (b: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1', down: boolean) => send({ t: 'button', btn: b, pressed: down });
  const dpad = (dir: 'up' | 'down', down: boolean) => send({ t: 'dpad', dir, pressed: down });
  const trig = (v: number) => send({ t: 'trigger', side: 'R', value: v });
  const releaseAll = () => { for (const b of ['A', 'B', 'X', 'Y', 'L1', 'R1'] as const) btn(b, false); trig(0); dpad('down', false); dpad('up', false); };
  /** Buttons to let go of on a later tick: [tick, action]. */
  const later: [number, () => void][] = [];
  let tick = 0;
  const after = (n: number, fn: () => void) => later.push([tick + n, fn]);
  let lastStrike: 'X' | 'Y' | null = null;
  const tap = (b: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1', hold = 1) => {
    if (b === 'X' || b === 'Y') lastStrike = b;
    btn(b, true); after(hold, () => btn(b, false));
  };
  // the string's landed strikes, classed by the button that started the swing that landed
  const landed = { light: 0, heavy: 0 };
  host.bus.on('damage', (e) => {
    if (e.sourceId !== host.playerId || e.outcome !== 'hit' || e.source !== 'strike') return;
    if (lastStrike === 'Y') landed.heavy++; else landed.light++;
  });

  const nearestHostile = (maxM = 60): AdventureActor | null => {
    let best: AdventureActor | null = null, bd = maxM;
    for (const a of host.world.actors.values()) {
      if ((a.kind !== 'monster' && a.kind !== 'boss') || !(a.stats.hp.cur > 0)) continue;
      const d = Math.hypot(a.pos.x - P().pos.x, a.pos.z - P().pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };
  const on = <K extends AdventureEventName>(from: number, name: K, pred: (p: AdventureEvents[K]) => boolean = () => true): boolean =>
    since(from).some((e) => e.name === name && pred(e.p as AdventureEvents[K]));

  // ── the beats ──
  type Beat = { id: ScriptBeat; maxSec: number; enter?: () => void; step: (t: number) => boolean };
  let mark = 0;            // index into `seen` at the beat's start
  let beatT = 0;
  let retry = 0;
  const switchRail = sb.spec.rails.segments.find((s) => s.id === 'loop.in')!;
  let guardUntil = -1;
  const strikeStart = new Map<ActorId, number>();
  let lastCast = -99;

  const beats: Beat[] = [
    { id: 'run', maxSec: 8, step: () => {
      const p = P();
      // out to the rail line, then up it: the run builds speed
      if (p.pos.z < 3 && Math.abs(p.pos.x + 22) > 1.2) towards(-22, 2.5);
      else stick(Math.max(-1, Math.min(1, (-22 - p.pos.x) * 0.8)), 1);
      return p.pos.z >= 11.5 && Math.abs(p.pos.x + 22) < 0.8 && Math.hypot(p.vel.x, p.vel.z) > 7;
    } },
    { id: 'catch', maxSec: 3, enter: () => { btn('A', true); after(14, () => btn('A', false)); }, step: () => {
      stick(Math.max(-1, Math.min(1, (-22 - P().pos.x) * 0.8)), 1);
      return P().state === 'grind';
    } },
    { id: 'trick', maxSec: 2, enter: () => tap('X', 2), step: () => { stick(0, 1); return on(mark, 'rail:trick'); } },
    { id: 'switch', maxSec: 10, step: () => {
      const p = P();
      const r = p.rail;
      if (!r) { stick(0, 1); return false; }
      const w = r.segmentId === switchRail.id ? switchRail.switches.find((s) => s.toSegment === 'side' && Math.abs(r.sM - s.atM) < s.windowM * 0.5) : undefined;
      if (w && beatT > 0.2) { stick(w.side * r.dir, 0.2); tap('A', 2); }
      else stick(0, 1);
      return on(mark, 'rail:switch', (e) => e.to === 'side');
    } },
    { id: 'rail-end', maxSec: 9, step: () => { stick(0, 1); return P().state === 'ground' && on(mark, 'rail:exit'); } },
    { id: 'homing', maxSec: 14, enter: () => { retry = 0; }, step: (t) => {
      const p = P();
      const m = nearestHostile();
      if (!m) { towards(0, 160); return false; }
      const d = towards(m.pos.x, m.pos.z);
      // jump inside 6.5 m, then jump again in the air: the homing dash
      if (p.state === 'ground' && d < 6.5 && t - retry > 0.6) { retry = t; tap('A', 4); after(10, () => tap('A', 2)); }
      return on(mark, 'homing', (e) => e.hit && e.actorId === host.playerId);
    } },
    { id: 'lock', maxSec: 3, enter: () => tap('R1', 2), step: (t) => {
      if (!P().lock?.hard && t > 0.5 && Math.floor(t * 4) % 4 === 0) tap('R1', 2);
      const m = nearestHostile(); if (m) towards(m.pos.x, m.pos.z, 0.4);
      return !!P().lock?.hard && on(mark, 'lock', (e) => e.actorId === host.playerId && !!e.target);
    } },
    { id: 'string', maxSec: 10, enter: () => { landed.light = 0; landed.heavy = 0; }, step: (t) => {
      const p = P();
      const lk = p.lock?.hard ? host.world.actors.get(p.lock.actorId) : null;
      if (!lk || !(lk.stats.hp.cur > 0)) { if (!p.lock?.hard && Math.floor(t * 10) % 5 === 0) tap('R1', 2); const m = nearestHostile(); if (m) towards(m.pos.x, m.pos.z); return false; }
      const d = Math.hypot(lk.pos.x - p.pos.x, lk.pos.z - p.pos.z);
      if (d > 1.8) towards(lk.pos.x, lk.pos.z, 0.9); else stick(0, 0);
      // light, light, heavy: one press every 0.3 s
      const k = Math.floor(t / 0.3);
      if (Math.abs(t - k * 0.3) < 1 / SIM_HZ / 2 + 1e-9 && d < 3) tap(k % 3 === 2 ? 'Y' : 'X', 2);
      return landed.light >= 1 && landed.heavy >= 1;
    } },
    { id: 'parry', maxSec: 14, step: (t) => {
      const p = P();
      // stand in the fight and answer the swings aimed at us: press guard as the swing lands (inside 160 ms)
      const m = nearestHostile();
      if (m) { const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z); if (d > 2.4) towards(m.pos.x, m.pos.z, 0.5); else stick(0, 0); }
      for (const a of host.world.actors.values()) {
        if (a.kind !== 'monster' && a.kind !== 'boss') continue;
        const tel = host.combat.telegraphOf(a.id);
        if (!tel) { strikeStart.delete(a.id); continue; }
        if (tel.phase === 'strike' && !strikeStart.has(a.id)) strikeStart.set(a.id, t);
        const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
        if (Math.hypot(dx, dz) > tel.range + 1.5) continue;
        const toLand = tel.phase === 'windup' ? (1 - tel.t01) * tel.tellSec + landAtOf(tel.attackId) : landAtOf(tel.attackId) - (t - (strikeStart.get(a.id) ?? t));
        if (toLand > 0 && toLand <= 0.09 && t > guardUntil) { btn('L1', true); guardUntil = t + 0.3; after(18, () => btn('L1', false)); }
      }
      return on(mark, 'damage', (e) => e.targetId === host.playerId && e.outcome === 'parried');
    } },
    { id: 'spell', maxSec: 6, step: (t) => {
      if (!P().lock?.hard && Math.floor(t * 10) % 5 === 0) tap('R1', 2);
      if (t - lastCast > 1.2) { lastCast = t; trig(1); after(2, () => trig(0)); }
      return on(mark, 'spell:cast', (e) => e.actorId === host.playerId);
    } },
    { id: 'fuse', maxSec: 4, enter: () => {
      releaseAll();
      // the scene's write: the meter full (the party has fought together; the yard does not make the run wait for 300 hp)
      if (P().fusion.meter < 1) P().fusion.meter = 1;
      if (P().stats.energy.cur < 60) P().stats.energy.cur = 60;
      dpad('down', true); after(2, () => dpad('down', false));
    }, step: () => { stick(0, -1); return P().fusion.active; } },
    { id: 'fly', maxSec: 6, enter: () => { retry = 0; }, step: (t) => {
      stick(0, -0.6);
      if (P().state !== 'flight' && t - retry > 0.8) { retry = t; btn('A', true); after(10, () => btn('A', false)); after(12, () => tap('A', 2)); }
      return P().state === 'flight';
    } },
    { id: 'cruise', maxSec: 8, enter: () => { btn('A', true); after(40, () => btn('A', false)); after(42, () => { btn('B', true); }); }, step: (t) => {
      stick(0, t < 0.7 ? 0 : 1);
      return host.movement.inspect(host.playerId)?.flight.mode === 'cruise' && t > 1.5;
    } },
    { id: 'unfuse', maxSec: 8, enter: () => { btn('B', false); dpad('down', true); after(2, () => dpad('down', false)); }, step: () => {
      stick(0, 0);
      return !P().fusion.active && P().state === 'ground';
    } },
    { id: 'mount', maxSec: 10, enter: () => { retry = 0; }, step: (t) => {
      const q = host.partnerActor!;
      const d = towards(q.pos.x, q.pos.z, 0.7);
      if (d < 2 && t - retry > 0.5) { retry = t; dpad('down', true); after(2, () => dpad('down', false)); stick(0, 0); }
      return on(mark, 'mount', (e) => e.on && e.riderId === host.playerId);
    } },
    { id: 'ride', maxSec: 4, step: (t) => { stick(0.3, 1); return t > 2 && P().state === 'riding'; } },
    { id: 'dismount', maxSec: 3, enter: () => { stick(0, 0); dpad('down', true); after(2, () => dpad('down', false)); }, step: () =>
      on(mark, 'mount', (e) => !e.on && e.riderId === host.playerId) && P().state !== 'riding' },
    // then the rest of the minute is a brawl in the camp: lock, strings, guard on the tells, a spell now and then
    { id: 'brawl', maxSec: Infinity, step: (t) => {
      const p = P();
      const m = nearestHostile(80);
      if (!m) { stick(0, 0); return false; }
      if (!p.lock?.hard && Math.floor(t * 10) % 7 === 0) tap('R1', 2);
      const lk = p.lock?.hard ? host.world.actors.get(p.lock.actorId) ?? m : m;
      const d = Math.hypot(lk.pos.x - p.pos.x, lk.pos.z - p.pos.z);
      if (d > 1.8) towards(lk.pos.x, lk.pos.z, d > 8 ? 1 : 0.8); else stick(0, 0);
      const k = Math.floor(t / 0.3);
      if (Math.abs(t - k * 0.3) < 1 / SIM_HZ / 2 + 1e-9 && d < 3) tap(k % 3 === 2 ? 'Y' : 'X', 2);
      if (t - lastCast > 3 && d < 15) { lastCast = t; trig(1); after(2, () => trig(0)); }
      return false;
    } },
  ];

  const seconds = o.seconds ?? 60;
  const total = Math.round(seconds * SIM_HZ);
  let bi = 0;
  let beatStart = 0;
  const startBeat = (i: number) => {
    bi = i; mark = seen.length; beatStart = host.tSec; beatT = 0;
    beats[i]?.enter?.();
  };
  o.beforeRun?.(sb);
  startBeat(0);
  for (tick = 0; tick < total; tick++) {
    for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= tick) { const fn = later[i][1]; later.splice(i, 1); fn(); }
    const beat = beats[bi];
    if (beat) {
      beatT = host.tSec - beatStart;
      let done = false;
      try { done = beat.step(beatT); } catch { done = false; }
      if (done) { reached[beat.id] = host.tSec; startBeat(bi + 1); }
      else if (beatT > beat.maxSec) startBeat(bi + 1);
    } else stick(0, 0);
    const t0 = o.now?.();
    host.tick();
    if (t0 !== undefined) tickMs.push(o.now!() - t0);
    for (const a of host.world.actors.values()) {
      if (![a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.facingYaw].every(Number.isFinite)) nonFinite.push(`${a.id}@${host.tSec.toFixed(2)}`);
    }
    o.afterTick?.(sb, tick);
  }
  return { sandbox: sb, mapper, reached, counts, tickMs, nonFinite, ticks: total };
}
