/**
 * Chapter 1, played by a script (Phase B's proof: "a headless scripted playthrough of Chapter 1 start → boss →
 * fusion → flight unlocked → back at the hub, deterministic from a seed, finite, within budget"). It plays like a
 * person with a pad, through the REAL input path: FelInput events into story/input (the scene's tap / hold / choice, or
 * the Adventure's mapper), the mapper into the host, the host stepping all five systems, the story runtime and the
 * chapter runner on top. The camera is held looking +z, so the stick is the world direction.
 *
 * Per beat it does what the beat asks: taps through the scenes (and holds to skip one, and moves a choice's
 * highlight), walks into the hub's gate, grinds the rail, runs the wall and kicks off it, homes along the wisps, fights
 * the camps and the bosses (lock, light-light-heavy, a guard on a tell, the learned bolt), and flies home fused. AdventureMode's
 * `?demo=1` runs the same driver live in the page. Pure (no Babylon), deterministic from the seed.
 */

import type { FelInput } from '@/lib/babylon/core/InputBus';
import { emptyAdventureSave, type AdventureActor, type AdventureSave, type MovementState } from '../contracts';
import { createInputMapper, type InputMapper } from '../host/inputMap';
import { partnerFromPick, type PartnerPick } from './party';
import { StorySession, type StorySessionOptions } from './session';
import { routeStoryInput, settleStoryInput, storyInputState, type StoryInputState } from './input';
import { W1_WALL } from '../world/ch1/world1';

export interface PlaythroughDriver {
  /** Send this step's input (call once before each session.tick()). */
  step(): void;
  /** What the script is doing now. */
  doing(): string;
  readonly mapper: InputMapper;
}

/** A first-run save with a partner picked (the headless stand-in for the picker). */
export function playthroughSave(pick: PartnerPick = { kind: 'creature', speciesId: 'strideraptor' }): AdventureSave {
  const s = emptyAdventureSave(0);
  s.partner = partnerFromPick(pick);
  return s;
}

export function createPlaythroughDriver(session: StorySession, mapper: InputMapper, st: StoryInputState = storyInputState()): PlaythroughDriver {
  const host = session.host, runner = session.runner;
  const P = (): AdventureActor => host.player;
  let tick = 0;
  let doing = 'start';
  const later: [number, () => void][] = [];
  const after = (n: number, fn: () => void) => later.push([tick + n, fn]);
  const send = (e: FelInput) => routeStoryInput(e, runner, mapper, st);
  const stick = (x: number, z: number) => {
    const l = Math.hypot(x, z), k = l > 1 ? 1 / l : 1;
    send({ t: 'stick', side: 'L', x: x * k, y: -z * k });
  };
  // a person steps round what blocks them: no progress for a second while pushing on → sidestep for half a second
  let stuckT = 0, sideUntil = -1, sideDir = 1;
  const lastPos = { x: 0, z: 0 };
  const towards = (tx: number, tz: number, mag = 1) => {
    const p = P();
    const dx = tx - p.pos.x, dz = tz - p.pos.z, l = Math.hypot(dx, dz) || 1;
    const moved = Math.hypot(p.pos.x - lastPos.x, p.pos.z - lastPos.z);
    lastPos.x = p.pos.x; lastPos.z = p.pos.z;
    if (mag > 0.3 && l > 2 && moved < 0.01 && p.state === 'ground') stuckT++; else stuckT = 0;
    if (stuckT > 60) { stuckT = 0; sideUntil = tick + 30; sideDir = -sideDir; }
    let ux = dx / l, uz = dz / l;
    if (tick < sideUntil) { const sx = -uz * sideDir, sz = ux * sideDir; ux = sx * 0.9 - ux * 0.3; uz = sz * 0.9 - uz * 0.3; }
    stick(ux * mag, uz * mag);
    return l;
  };
  const btn = (b: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1', down: boolean) => send({ t: 'button', btn: b, pressed: down });
  const tap = (b: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1', hold = 2) => { btn(b, true); after(hold, () => btn(b, false)); };
  const trig = (v: number) => send({ t: 'trigger', side: 'R', value: v });
  const dpad = (dir: 'up' | 'down', down: boolean) => send({ t: 'dpad', dir, pressed: down });
  const state = (): MovementState => P().state;

  // the scene's taps: one every TAP_EVERY ticks once a line is fully shown; one scene is skipped with a hold
  let sceneTapAt = 0;
  let skippedOne = false;
  let choiceMoved = false;
  let lastCast = -99, guardUntil = -1, retry = -99, phaseT = 0, phaseOf = '';

  const nearestHostile = (maxM = 80): AdventureActor | null => {
    let best: AdventureActor | null = null, bd = maxM;
    for (const a of host.world.actors.values()) {
      if ((a.kind !== 'monster' && a.kind !== 'boss') || !(a.stats.hp.cur > 0) || a.id.startsWith('wisp')) continue;
      const d = Math.hypot(a.pos.x - P().pos.x, a.pos.z - P().pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };

  const fight = (t: number) => {
    const p = P();
    const m = nearestHostile();
    if (!m) { stick(0, 0); return; }
    // lock the fight's target (a lock that landed on a wisp, or on a body that is down, is let go and taken again)
    const locked = p.lock?.hard ? host.world.actors.get(p.lock.actorId) : undefined;
    const lockOk = !!locked && locked.stats.hp.cur > 0 && !locked.id.startsWith('wisp');
    if (!lockOk && tick % 20 === 0) tap('R1');
    const lk = lockOk ? locked! : m;
    const d = Math.hypot(lk.pos.x - p.pos.x, lk.pos.z - p.pos.z);
    const reach = 1.4 + lk.radius;
    if (d > reach) towards(lk.pos.x, lk.pos.z, d > 8 ? 1 : 0.8); else stick(0, 0);
    // guard a swing that is about to land on us (the tell is A2's telegraph)
    for (const a of host.world.actors.values()) {
      if (a.kind !== 'monster' && a.kind !== 'boss') continue;
      const tel = host.combat.telegraphOf(a.id);
      if (!tel || tel.phase !== 'windup') continue;
      if (Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) > tel.range + 1.5) continue;
      if ((1 - tel.t01) * tel.tellSec < 0.12 && t > guardUntil) { btn('L1', true); guardUntil = t + 0.45; after(24, () => btn('L1', false)); }
    }
    if (t < guardUntil) return;
    // light, light, heavy: a press every 0.3 s in reach
    if (tick % 18 === 0 && d < reach + 1.2) tap(Math.floor(tick / 18) % 3 === 2 ? 'Y' : 'X');
    if (session.save.player.spells.known.length && t - lastCast > 2.5 && d < 14 && p.stats.energy.cur > 30) { lastCast = t; trig(1); after(2, () => trig(0)); }
  };

  const driver: PlaythroughDriver = {
    mapper,
    doing: () => doing,
    step(): void {
      for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= tick) { const fn = later[i][1]; later.splice(i, 1); fn(); }
      settleStoryInput(runner, mapper, st);
      const b = runner.beat;
      const t = host.tSec;
      if (b && b.id !== phaseOf) { phaseOf = b.id; phaseT = t; retry = -99; }
      const bt = t - phaseT;
      if (!b || runner.done) { doing = 'free'; stick(0, 0); tick++; return; }
      if (runner.blocking) {
        doing = `scene ${b.id}`;
        const v = runner.view();
        // hold to skip the second scene (the arrival dialogue): the hold path is part of what is proved
        if (!skippedOne && b.id === 'b04-arrival' && v.active) { skippedOne = true; btn('A', true); after(60, () => btn('A', false)); }
        else if (v.choices && !choiceMoved) { choiceMoved = true; dpad('down', true); after(2, () => dpad('down', false)); sceneTapAt = tick + 20; }
        else if (v.active && v.shown >= v.text.length && tick >= sceneTapAt) { tap('A'); sceneTapAt = tick + 40; }
        tick++;
        return;
      }
      const p = P();
      switch (b.kind) {
        case 'objective': {
          if (b.goal.type === 'gate') { doing = 'to the gate'; towards(-22, 4); break; }
          if (b.id === 'b05-rail') {
            doing = 'rail run';
            if (state() === 'grind') { stick(0, 1); break; }
            stick(Math.max(-1, Math.min(1, -p.pos.x * 0.8)), 1);
            if (state() === 'ground' && p.pos.z > -550.5 && p.pos.z < -547 && bt - retry > 1) { retry = bt; btn('A', true); after(20, () => btn('A', false)); }
            break;
          }
          if (b.id === 'b06-wall') {
            doing = `wall run (${state()})`;
            const W = W1_WALL;
            if (state() === 'wallrun') {
              stick(0.3, 1);
              const ms = host.movement.inspect(host.playerId);
              void ms;
              if (p.stateSec > 0.8) tap('A');    // the kick, at the run's end
              break;
            }
            if (state() === 'air') {
              stick(0, 1);
              if (W.x0 - p.pos.x < 1.6 && p.pos.z < -400 && p.vel.y > -2) tap('A');
              else if (p.pos.z > -412 && p.pos.z < -404 && p.vel.y < 0 && bt - retry > 0.5) { retry = bt; tap('B'); }   // the air dash home
              break;
            }
            if (p.pos.z < -428) stick(Math.max(-1, Math.min(1, (3.6 - p.pos.x) * 0.6)), 1);
            else { stick(0.8, 1); if (W.x0 - p.pos.x < 3.2 && p.pos.z > -426 && bt - retry > 0.6) { retry = bt; btn('A', true); after(10, () => btn('A', false)); } }
            break;
          }
          if (b.id === 'b07-chain') {
            doing = `chain (${state()})`;
            if (state() === 'ground') {
              stick(Math.max(-1, Math.min(1, -p.pos.x * 0.8)), 1);
              if (p.pos.z > -376 && p.pos.z < -371 && bt - retry > 0.8) { retry = bt; btn('A', true); after(12, () => btn('A', false)); }
            } else {
              stick(0, 1);
              // press again on the way down: home onto the next wisp; after the last, the air dash
              if (p.vel.y < 1 && bt - retry > 0.25) { retry = bt; tap('A'); }
            }
            break;
          }
          doing = 'walk'; towards(0, (session.runtime.spawnPos('w1', (b.goal as { spawnId: string }).spawnId)?.z) ?? p.pos.z + 10);
          break;
        }
        case 'fight': case 'boss': doing = `fight ${b.id}`; fight(t); break;
        case 'travel': {
          if (b.via === 'gate') break;
          doing = `fly home (${state()})`;
          const dz = -22 - p.pos.z;
          if (state() === 'flight') {
            send({ t: 'stick', side: 'L', x: Math.max(-1, Math.min(1, -p.pos.x * 0.2)), y: dz > 6 ? -1 : 0 });
            // climb a little over the void, then let down over the landing (L1 descends in flight)
            if (dz > 30 && p.pos.y < 6) btn('A', true); else btn('A', false);
            if (dz <= 14) btn('L1', true);
          } else if (p.fusion.active) {
            btn('L1', false);
            stick(0, 0);
            // take off: jump, then jump again in the air
            if ((state() === 'ground') && bt - retry > 1) { retry = bt; tap('A', 3); after(10, () => tap('A', 3)); }
          } else stick(0, 0);
          break;
        }
        default: stick(0, 0);
      }
      tick++;
    },
  };
  return driver;
}

export interface PlaythroughResult {
  session: StorySession;
  ticks: number;
  /** Sim seconds the host stepped, and story seconds (ticks / 60, scenes included). */
  simSec: number;
  storySec: number;
  /** Beat id → story second it started. */
  beats: Record<string, number>;
  nonFinite: string[];
  maxBodies: number;
  tickMs: number[];
  /** Flight state seen before the boss fell (must stay false). */
  flewBeforeBoss: boolean;
  /** Was a fusion granted flight before flightUnlocked (must stay false). */
  flightGrantedEarly: boolean;
  saves: { reason: string; save: AdventureSave }[];
}

export interface PlaythroughOptions extends Partial<StorySessionOptions> {
  pick?: PartnerPick;
  /** The longest the run may take, in story seconds (it stops when the chapter is done and the party is home). */
  maxSec?: number;
  now?: () => number;
  beforeRun?: (s: StorySession) => void;
  afterTick?: (s: StorySession, tick: number) => void;
}

/** Play Chapter 1 from a first-run save to the end, headless. */
export function runPlaythrough(o: PlaythroughOptions = {}): PlaythroughResult {
  const saves: PlaythroughResult['saves'] = [];
  const beats: Record<string, number> = {};
  let ticks = 0;
  const session = new StorySession({
    ...o,
    save: o.save ?? playthroughSave(o.pick),
    seed: o.seed ?? 7,
    onSave: (save, reason) => { saves.push({ reason, save }); o.onSave?.(save, reason); },
    onEvent: (e) => { if (e.kind === 'beat') beats[e.beatId] = ticks / 60; o.onEvent?.(e); },
  });
  const mapper = createInputMapper();
  session.host.setInputSource(session.host.playerId, (out) => mapper.fill(out, { camYaw: 0, state: session.host.player.state }));
  const driver = createPlaythroughDriver(session, mapper);
  session.start();
  o.beforeRun?.(session);
  const max = Math.round((o.maxSec ?? 900) * 60);
  const nonFinite: string[] = [];
  const tickMs: number[] = [];
  let maxBodies = 0, flewBeforeBoss = false, flightGrantedEarly = false;
  let homeAt = -1;
  for (; ticks < max; ticks++) {
    driver.step();
    const t0 = o.now?.();
    session.tick();
    if (t0 !== undefined && !session.paused) tickMs.push(o.now!() - t0);
    const h = session.host, p = h.player;
    for (const a of h.world.actors.values()) {
      if (![a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.facingYaw].every(Number.isFinite)) nonFinite.push(`${a.id}@${h.tSec.toFixed(2)}`);
    }
    maxBodies = Math.max(maxBodies, h.world.actors.size);
    const bossDown = h.save.story.clearedBosses.includes('boss.ch1');
    if (!bossDown && p.state === 'flight') flewBeforeBoss = true;
    if (p.fusion.grantsFlight && h.save.story.flags.flightUnlocked !== true) flightGrantedEarly = true;
    o.afterTick?.(session, ticks);
    if (session.runner.done && homeAt < 0) homeAt = ticks;
    if (homeAt >= 0 && ticks - homeAt > 60) { ticks++; break; }
  }
  return {
    session, ticks, simSec: session.host.tSec, storySec: ticks / 60, beats, nonFinite, maxBodies, tickMs,
    flewBeforeBoss, flightGrantedEarly, saves,
  };
}
