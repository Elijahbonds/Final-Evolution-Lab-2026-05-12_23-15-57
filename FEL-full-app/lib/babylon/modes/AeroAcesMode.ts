// AERO ACES — a kart racer with wings (rebuilt 2026-09-15).
//
// Owner: "Aero aces is supposed to be like diddy Kong flyers." Decisions, all four: ARCADE HANDLING (no stall, tight
// turns, auto-level, fly low through the course) · BALLOONS + ITEMS (missiles, shield, boost, mines; bananas raise top
// speed) · STUNTS (barrel roll dodge, loop U-turn) · THEMED LAP CIRCUITS (three laps through a canyon, an island cove
// and an ice cave, with a full field). The look: a CARTOONY TOY PLANE with the hero in an OPEN COCKPIT, scarf streaming.
//
// What it was: a ring time-trial on an energy-management flight sim (FlightModel) through hoops in open sky, rivals as
// pacers, the only verbs throttle / rudder / level. Everything a Diddy Kong Racing player expects was missing: nothing to
// pick up, nothing to fire, nothing to dodge, no reason to take one line over another but the next ring.
//
// THE PIECES, each in its own file so each is testable on its own:
//   racing/ArcadeFlight.ts   the handling — steer, climb, gas, brake, barrel roll, loop, spin-out
//   racing/AeroItems.ts      balloons → items (levels 1–3), missiles, mines, shield, boost zips, bananas
//   racing/aeroCircuits.ts   the three circuits: racing line, checkpoints, ground, ceiling, balloon rows, banana lines
//   racing/aeroWorlds.ts     the worlds built from those: terrain, sea, arches, ice cave, scenery, horizon
//   racing/toyPlane.ts       the toy plane, the rival pilots, the scarf
//   racing/aeroPickups.ts    how balloons, bananas, missiles, mines and shields look
//   racing/RaceField.ts      the field (shared with the karts): pace, bands, standings, the finish clock
// This file is the race: it reads the controls, runs the field's items, resolves hits, and tells the player what
// happened.
//
// CONTROLS — pad: L stick steer / climb (pull back to climb) · RT gas · LT brake (tight turn) · A or X FIRE · B STUNT
// (with the stick left / right: barrel roll that way; pulled back: loop) · Y LOOP · RB boost. Phone: GAS, BRAKE, FIRE,
// STUNT and the BOOST pill (modeVerbs).

import { stepSpeedFov } from '../core/SpeedFov';
import { BoostKit } from '../core/BoostKit';
import { BoostFx } from '../premium/BoostFx';
import { Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { buildPoseClip, REF_HIPS_Y } from '../anim/poseClip';
import { seatedKeys } from '../anim/authored/seated';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { readCourse, startRace, stepRace, type RaceProgress } from '../core/RaceCourse';
import { readProfile, profileFor, DEFAULT_TIER } from '../core/Difficulty';
import {
  makeField, stepRival, rivalPlacement, playerPosition, ordinal, fieldLeaderDone, stepFinishGrace,
  type RaceLine, type Rival,
} from '../racing/RaceField';
import { readPlane } from '../racing/garage';
import { refuse } from '../core/Refusal';
import {
  ARCADE_TRAINER, arcadeFrom, spawnArcade, stepArcade, startStunt, dodging, spinOut, wallTurn, forwardOf,
  type ArcadeState, type ArcadeTune, type ArcadeInput,
} from '../racing/ArcadeFlight';
import {
  addToChain, boostEarnForStunt, emptyChain, noHug, stepChain, stepHug, stuntById,
} from '../racing/AeroTricks';
import {
  collectBalloon, balloonsHit, stepBalloons, useItem, stepMissiles, stepMines, bananasAfterHit, segDist,
  BALLOON_RESPAWN_SEC, BANANA_RADIUS, BANANA_CAP, ITEM_LABEL, ITEM_KINDS,
  type Balloon, type Banana, type HeldItem, type Missile, type Mine, type Target, type ItemKind,
} from '../racing/AeroItems';
import { aeroCircuits, circuitById, locate, type AeroCircuit } from '../racing/aeroCircuits';
import { buildAeroWorld, type AeroWorld } from '../racing/aeroWorlds';
import { buildToyPlane, Scarf, brighter, type ToyPlane } from '../racing/toyPlane';
import { AeroPickups } from '../racing/aeroPickups';

/** Racers on the grid: the player and seven rivals. */
const FIELD = 7;
const PILOT_SCALE = 0.82;
/** A banana taken comes back after this long (so a lap-3 line is still worth flying). */
const BANANA_RESPAWN_SEC = 10;
/** The field is paced against the plane's top speed ×this. RaceField's spread (0.62 + skill × 0.42 of pace) was tuned for
 *  karts that lose time in every corner; a plane on the line with a few bananas out-flew the whole normal field by a lap
 *  (measured: 1st by 20 s, every rival 25–28 m/s against 32). Kart-racer AI has to be in the mirror. */
const RIVAL_PACE = 1.16;
/** Racer ids in the item system: 0 is the player, rivals are 1..FIELD. */
const PLAYER_ID = 0;

interface RivalKit { item: HeldItem | null; itemAt: number; shieldT: number; stunT: number; zipT: number; nextRow: number; lastHeading: number; roll: number; lap: number }

let baseFov: number | null = null;

export function makeAeroAcesMode(): ModeDefinition {
  let circuit: AeroCircuit = aeroCircuits()[0];
  let tune: ArcadeTune = ARCADE_TRAINER;   // the garage pick is read in load(), never at factory time (pickerReach)
  let world: AeroWorld | null = null;
  let player: ToyPlane | null = null;
  let pilot: SpawnedCharacter | null = null;
  let seated: AnimationGroup | null = null;
  let scarf: Scarf | null = null;
  let pickups: AeroPickups | null = null;
  let boostFx: BoostFx | null = null;
  let flight: ArcadeState | null = null;
  let race: RaceProgress = startRace();
  let line: RaceLine | null = null;
  let rivals: Rival[] = [];
  let rivalKits: RivalKit[] = [];
  let rivalPlanes: ToyPlane[] = [];
  let balloons: Balloon[] = [];
  let bananas: Banana[] = [];
  let missiles: Missile[] = [];
  let mines: Mine[] = [];
  let rowDists: number[] = [];
  let boost = new BoostKit();
  let tier = profileFor(DEFAULT_TIER);
  const prevPos = new Vector3();

  const S = {
    input: { steer: 0, climb: 0, gas: 0, brake: 0, boostK: 0, bananas: 0 } as ArcadeInput,
    held: null as HeldItem | null,
    bananas: 0,
    shieldT: 0,
    zipT: 0,
    boostHeld: false,
    banner: '', bannerT: 0,
    done: false,
    lookX: 0, lookY: 0,
    lastPlace: 0,
    wrongT: 0,
    scrapeCool: 0,
    graceLeft: null as number | null,
    hits: 0, stunts: 0, fired: 0, popped: 0,
    stickX: 0, stickY: 0,
    /** Stunts linked back to back: different ones multiply, the same one decays. */
    chain: emptyChain(),
    /** Seconds spent flying low, and the closest it got. */
    hug: noHug(),
    /** Best chain of the run, for the end card. */
    bestChain: 0,
  };

  const say = (t: string, sec = 1.1): void => { S.banner = t; S.bannerT = sec; };

  /** The player's distance along the race: laps done + distance into this one. */
  function playerDist(): number {
    if (!flight || !line) return 0;
    let d = locate(circuit.line, flight.pos.x, flight.pos.z).dist;
    if (race.next === 0 && d > circuit.line.length * 0.5) d -= circuit.line.length;   // closing on the line to end a lap
    return (race.lap - 1) * circuit.line.length + d;
  }

  function lineFromCircuit(c: AeroCircuit): RaceLine {
    const pts = c.line.pts.map((p) => p.clone());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Vector3.Distance(pts[i - 1], pts[i]));
    return { pts, cum, lapLength: cum[cum.length - 1] + Vector3.Distance(pts[pts.length - 1], pts[0]), loop: true };
  }

  function pushHud(ctx: ModeContext): void {
    if (!flight) return;
    const place = playerPosition(playerDist(), rivals);
    const hud: Record<string, HudValue> = {
      lap: `${Math.min(race.lap, circuit.course.laps)}/${circuit.course.laps}`,
      pos: `${ordinal(place)} / ${rivals.length + 1}`,
      place,
      item: S.held ? `${ITEM_LABEL[S.held.kind]}${S.held.level > 1 ? ` ×${S.held.level}` : ''}` : '',
      itemKind: S.held?.kind ?? '',
      itemLevel: S.held?.level ?? 0,
      bananas: S.bananas,
      shield: S.shieldT > 0 ? Math.ceil(S.shieldT) : 0,
      speed: Math.round(flight.speed * 3.6),
      time: race.time.toFixed(1),
      banner: S.banner,
      hint: 'RT gas · LT brake · A fire · B + stick: roll / loop · RB boost',
      ...boost.hud(),
    };
    ctx.setHud(hud);
  }

  function buildRivals(scene: Scene): void {
    rivals = makeField(FIELD, tune.top, tier.edge);
    // planes are wide: spread the lanes, and put the grid behind the player in two staggered rows
    rivals.forEach((r, i) => { r.lane *= 3.2; r.dist = -10 - i * 7; });
    rivalKits = rivals.map(() => ({ item: null, itemAt: 0, shieldT: 0, stunT: 0, zipT: 0, nextRow: 0, lastHeading: 0, roll: 0, lap: 0 }));
    rivalPlanes = rivals.map((r) => buildToyPlane(scene, r.name, r.tint, brighter(r.tint, 0.55), { toyPilot: true }));
  }

  function resetPickups(): void {
    balloons = circuit.balloons.map((b, i) => ({ id: i, kind: b.kind, pos: b.pos.clone(), respawn: 0 }));
    bananas = circuit.bananas.map((p) => ({ pos: p.clone(), taken: false, respawn: 0 }));
    missiles = []; mines = [];
    rowDists = [...new Set(circuit.balloons.map((b) => Math.round(locate(circuit.line, b.pos.x, b.pos.z).dist)))].sort((a, b) => a - b);
    pickups?.setBalloons(balloons);
    pickups?.setBananas(bananas);
  }

  /** The nearest racer AHEAD of `dist` within range, for a homing missile. */
  function targetAhead(owner: number, dist: number): number | null {
    let best: number | null = null, bestGap = Infinity;
    const consider = (id: number, d: number) => { const gap = d - dist; if (id !== owner && gap > 2 && gap < 220 && gap < bestGap) { best = id; bestGap = gap; } };
    consider(PLAYER_ID, playerDist());
    rivals.forEach((r, i) => consider(i + 1, r.dist));
    return best;
  }

  function racerPos(id: number): Vector3 | null {
    if (id === PLAYER_ID) return flight?.pos ?? null;
    const p = rivalPlanes[id - 1];
    return p ? p.root.position : null;
  }

  function hitPlayer(ctx: ModeContext, what: string): void {
    if (!flight) return;
    spinOut(flight);
    const lost = S.bananas - bananasAfterHit(S.bananas);
    S.bananas = bananasAfterHit(S.bananas);
    S.hits++;
    SoundKit.play('impact', { pitch: 0.8, volume: 0.6 });
    ctx.juice.shake(0.35, 380);
    ctx.feel.impact(0.6);
    EffectsKit.burst(ctx.scene, flight.pos.clone(), 'sparks', 2);
    ctx.momentum.report({ kind: 'blunder', weight: -12 });
    say(lost ? `HIT BY A ${what} — ${lost} BANANA${lost > 1 ? 'S' : ''} LOST` : `HIT BY A ${what}`, 1.2);
  }

  function hitRival(ctx: ModeContext, i: number, byPlayer: boolean): void {
    const k = rivalKits[i]; if (!k) return;
    k.stunT = 1.2;
    const pos = rivalPlanes[i]?.root.position;
    if (pos) EffectsKit.burst(ctx.scene, pos.clone(), 'sparks', 2);
    if (byPlayer) {
      SoundKit.play('crowdCheer', { volume: 0.4 });
      ctx.feel.impact(0.35);
      ctx.momentum.report({ kind: 'big_make', weight: 10 });
      boost.earn('trickSmall');
      say(`DIRECT HIT — ${rivals[i].name}`, 1);
    }
  }

  function firePlayerItem(ctx: ModeContext): void {
    if (!flight) return;
    if (!S.held) { refuse(ctx, 'NO ITEM — FLY THROUGH A BALLOON'); return; }
    if (flight.spinT > 0) { refuse(ctx, 'SPINNING'); return; }
    const fwd = forwardOf(flight);
    const out = useItem(S.held, PLAYER_ID, flight.pos, fwd, fwd.scale(-1), targetAhead(PLAYER_ID, playerDist()));
    missiles.push(...out.missiles); mines.push(...out.mines);
    if (out.boostSec) { S.zipT = Math.max(S.zipT, out.boostSec); SoundKit.play('whoosh', { pitch: 1.2, volume: 0.6 }); ctx.feel.impact(0.3); say('ZIP!', 0.6); }
    if (out.shieldSec) { S.shieldT = out.shieldSec; SoundKit.play('powerUp', { pitch: 1.1, volume: 0.5 }); say('SHIELD UP', 0.7); }
    if (out.missiles.length) { SoundKit.play('whoosh', { pitch: 0.8, volume: 0.55 }); say(out.missiles.length > 1 ? 'MISSILE BARRAGE' : out.missiles[0].homing ? 'HOMING MISSILE' : 'MISSILE', 0.6); }
    if (out.mines.length) { SoundKit.play('thud', { pitch: 1.2, volume: 0.5 }); say(out.mines.length > 1 ? 'MINEFIELD' : 'MINE DROPPED', 0.6); }
    S.fired++;
    S.held = null;
  }

  function stunt(ctx: ModeContext, kind: 'roll_left' | 'roll_right' | 'loop'): void {
    if (!flight) return;
    if (flight.spinT > 0) { refuse(ctx, 'SPINNING'); return; }
    if (!startStunt(flight, kind)) { refuse(ctx, 'ALREADY IN A STUNT'); return; }
    SoundKit.play('whoosh', { pitch: kind === 'loop' ? 0.9 : 1.3, volume: 0.45 });
    say(kind === 'loop' ? 'LOOP!' : 'BARREL ROLL', 0.6);
    S.stunts++;
  }

  function finish(ctx: ModeContext): void {
    if (S.done) return;
    S.done = true;
    const place = playerPosition(playerDist(), rivals);
    const podium = place <= 3;
    SoundKit.play(race.finished ? (podium ? 'crowdCheer' : 'score') : 'miss');
    ctx.juice.hitStop(90);
    say(race.finished ? `${ordinal(place).toUpperCase()} PLACE — ${race.time.toFixed(1)}s` : `OUT OF TIME — ${ordinal(place)}`, 2.4);
    pushHud(ctx);
    const placePts = [0, 1000, 750, 550, 400, 280, 180, 100, 50][place] ?? 0;
    ctx.end(race.finished ? (place === 1 ? 'WIN' : podium ? 'PODIUM' : 'FINISHED') : 'OUT',
      placePts + S.bananas * 10, {
        seconds: Number(race.time.toFixed(2)), place, field: rivals.length + 1, laps: Math.min(race.lap, circuit.course.laps),
        bananas: S.bananas, hits: S.hits, stunts: S.stunts, fired: S.fired, balloons: S.popped,
      });
  }

  return {
    modeId: 'aeroaces',
    get mood(): ModeDefinition['mood'] { return readCourse('aero').mood; },
    camPreset: 'flyer',

    async load(ctx: ModeContext): Promise<void> {
      baseFov = null;
      Object.assign(S, {
        input: { steer: 0, climb: 0, gas: 0, brake: 0, boostK: 0, bananas: 0 }, held: null, bananas: 0, shieldT: 0, zipT: 0,
        boostHeld: false, banner: '', bannerT: 0, done: false, lastPlace: 0, wrongT: 0, scrapeCool: 0, graceLeft: null,
        hits: 0, stunts: 0, fired: 0, popped: 0, stickX: 0, stickY: 0,
      });
      boost = new BoostKit(0.25);
      circuit = circuitById(readCourse('aero').id) ?? aeroCircuits()[0];
      tune = arcadeFrom(readPlane().spec);
      tier = readProfile();
      race = startRace();
      line = lineFromCircuit(circuit);

      world = await buildAeroWorld(ctx.scene, circuit);
      pickups = new AeroPickups(ctx.scene);
      resetPickups();

      player = buildToyPlane(ctx.scene, 'player', '#e63946', '#ffd166');
      // THE PILOT IN THE OPEN COCKPIT: the hero, seated, chest up out of the rim. Parented to the seat, so the plane
      // carries the body through every roll and loop with no second copy of the attitude maths.
      pilot = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: new Vector3(0, 0, 0), yawRad: 0, startClip: 'idle_stand' });
      pilot.animator.park();
      pilot.root.parent = player.seat;
      pilot.root.scaling.setAll(PILOT_SCALE);
      pilot.root.position.set(0, -REF_HIPS_Y * PILOT_SCALE, 0);
      const seatClip = buildPoseClip(ctx.scene, pilot.skeleton, 'aero_seated', 0.5, seatedKeys());
      if (seatClip) { seatClip.start(true, 1, 0, 0.5, false); seated = seatClip; }
      else console.warn('[FEL-AERO] seated pose could not be built — the pilot stands');
      scarf = new Scarf(ctx.scene, player.scarfAnchor, '#ffffff');

      buildRivals(ctx.scene);

      flight = spawnArcade(circuit.course.start.at, circuit.course.start.heading, tune);
      prevPos.copyFrom(flight.pos);
      player.root.position.copyFrom(flight.pos);
      player.root.rotation.set(0, flight.heading, 0);

      boostFx?.dispose();
      boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: player.root, trailWidth: 1.4, color: '#ffd166' });

      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = null;
      ctx.camDirector.snapTo(flight.pos, null);
      say(`${circuit.course.name} — ${circuit.course.sub}`, 2.4);

      // THE PROBE SEAM (dev): where the racer is, the line ahead, the item, the place.
      (ctx.scene.metadata ??= {}).aero = {
        state: () => {
          const at = flight ? locate(circuit.line, flight.pos.x, flight.pos.z) : null;
          return {
            circuit: circuit.course.id, lap: race.lap, laps: circuit.course.laps, next: race.next, gates: circuit.course.gates.length,
            time: +race.time.toFixed(2), finished: race.finished, done: S.done,
            pos: flight ? { x: flight.pos.x, y: flight.pos.y, z: flight.pos.z } : null,
            heading: flight ? +flight.heading.toFixed(3) : 0, speed: flight ? +flight.speed.toFixed(1) : 0,
            along: at ? +at.dist.toFixed(1) : 0, lateral: at ? +at.lateral.toFixed(1) : 0, corridor: circuit.corridor,
            lineY: at ? +at.point.y.toFixed(1) : 0,
            tangent: at ? { x: at.tangent.x, z: at.tangent.z } : null,
            place: playerPosition(playerDist(), rivals), field: rivals.length + 1,
            item: S.held, bananas: S.bananas, hits: S.hits, stunts: S.stunts, stunt: flight?.stunt ?? null,
          };
        },
      };
      pushHud(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }
      if (S.done || !flight) return;
      if (e.t === 'stick' && e.side === 'L') {
        S.stickX = e.x; S.stickY = e.y;
        S.input.steer = e.x;
        S.input.climb = e.y;          // pull BACK to climb — how a plane works
        return;
      }
      // SCORECARD CONTROLS (2026-09-15): the engine answers the gas, the air brake answers the brake (both were silent presses)
      if (e.t === 'trigger' && e.side === 'R') { if (S.input.gas < 0.5 && e.value >= 0.5) SoundKit.play('whoosh', { pitch: 0.7, volume: 0.3 }); S.input.gas = e.value; return; }
      if (e.t === 'trigger' && e.side === 'L') { if (S.input.brake < 0.5 && e.value >= 0.5) SoundKit.play('swish', { pitch: 0.55, volume: 0.35 }); S.input.brake = e.value; return; }
      if (e.t !== 'button') return;
      if (e.btn === 'R1') { S.boostHeld = e.pressed; return; }
      if (!e.pressed) return;
      if (e.btn === 'A' || e.btn === 'X') firePlayerItem(ctx);
      else if (e.btn === 'B') stunt(ctx, S.stickY > 0.5 ? 'loop' : S.stickX < -0.3 ? 'roll_left' : S.stickX > 0.3 ? 'roll_right' : (S.stunts % 2 ? 'roll_left' : 'roll_right'));
      else if (e.btn === 'Y') stunt(ctx, 'loop');
    },

    update(ctx: ModeContext, dt: number): void {
      if (!flight || !player || !line || S.done) return;
      prevPos.copyFrom(flight.pos);

      // ── boost: the shared kit (RB), plus a blue balloon's zip holding it at full ──
      const bev = boost.update(dt, S.boostHeld, flight.spinT <= 0);
      S.zipT = Math.max(0, S.zipT - dt);
      S.shieldT = Math.max(0, S.shieldT - dt);
      S.input.boostK = Math.max(boost.k, S.zipT > 0 ? 1 : 0);
      S.input.bananas = S.bananas;

      // ── fly ──
      const ceiling = circuit.ceilingAt(flight.pos.x, flight.pos.z);
      const wasStunt = flight.stunt;
      const touched = stepArcade(flight, S.input, dt, tune, circuit.floorAt, ceiling);
      // A STUNT LANDED GOES INTO THE CHAIN, and what it pays depends on what came before it.
      //
      // This used to be a flat earn: every stunt paid the same, so the twentieth roll paid like the first and the
      // safest thing a player could do was hold one button in open sky. Different stunts now multiply and the same
      // one decays to nothing, which is the MECHANICS anti-mash rule applied to the air.
      if (wasStunt && !flight.stunt) {
        const added = addToChain(S.chain, wasStunt);
        S.chain = added.chain;
        const earn = boostEarnForStunt(wasStunt, added.repeat);
        if (earn) boost.earn(earn.what, earn.scale);
        if (added.gained > 0) {
          const linked = S.chain.ids.length > 1;
          say(linked ? `${stuntById(wasStunt)?.label} x${S.chain.mult.toFixed(1)} +${added.gained}`
                     : `${stuntById(wasStunt)?.label} +${added.gained}`, 0.8);
          ctx.momentum.report({ kind: linked ? 'chain' : 'clean_hit', weight: 6 + added.gained * 0.02 });
        } else {
          // mashing the same stunt stops paying, and a press that cannot pay is still answered
          refuse(ctx, 'SAME TRICK — MIX IT UP');
        }
      }
      {
        const ticked = stepChain(S.chain, dt);
        S.chain = ticked.chain;
        if (ticked.closed && ticked.closed.ids.length > 1) {
          S.bestChain = Math.max(S.bestChain, ticked.closed.pts);
          ctx.juice.scorePop(flight.pos.add(new Vector3(0, 6, 0)),
            `${ticked.closed.ids.length} TRICK CHAIN +${ticked.closed.pts}`, '#fbbf24');
        } else if (ticked.closed) {
          S.bestChain = Math.max(S.bestChain, ticked.closed.pts);
        }
      }
      S.scrapeCool = Math.max(0, S.scrapeCool - dt);
      if (touched && S.scrapeCool <= 0) {
        S.scrapeCool = 1.2;
        SoundKit.play('thud', { pitch: 0.7, volume: 0.45 });
        ctx.juice.shake(0.1, 140);
        EffectsKit.burst(ctx.scene, flight.pos.clone(), 'dust');
        say('SCRAPED THE GROUND', 0.7);
      }
      // THE COURSE EDGE turns you back along the line (never pins you against it)
      const at = locate(circuit.line, flight.pos.x, flight.pos.z);
      if (Math.abs(at.lateral) > circuit.corridor) {
        const side = Math.sign(at.lateral);
        const right = new Vector3(at.tangent.z, 0, -at.tangent.x);
        flight.pos.subtractInPlace(right.scale(at.lateral - side * circuit.corridor));
        if (wallTurn(flight, -right.x * side, -right.z * side) && S.scrapeCool <= 0) {
          S.scrapeCool = 1.2;
          SoundKit.play('thud', { pitch: 0.9, volume: 0.35 });
          ctx.juice.shake(0.08, 120);
          say(circuit.theme === 'island' ? 'EDGE OF THE COVE' : 'OFF THE COURSE', 0.6);
        }
      }
      // HUGGING THE FLOOR. The audit's complaint about this mode was that there was "no reason to take one line
      // over another but the next ring". This is that reason: the floor pays, and it pays MORE the closer you are,
      // so the fast line through a canyon is the frightening one.
      //
      // It replaces a binary `gap < 7` check, which paid a flat rate at 6.9 m and nothing at 7.1 m and could be
      // collected by a single dive through. It now has to arm over half a second, and it scales with closeness.
      const gap = flight.pos.y - circuit.floorAt(flight.pos.x, flight.pos.z);
      const hugged = stepHug(S.hug, dt, gap);
      S.hug = hugged.hug;
      if (hugged.earnPerSec > 0 && flight.speed > tune.top * 0.7) {
        boost.earnOver('nearMiss', dt, 2 * hugged.earnPerSec);
        if (hugged.closeness01 > 0.8 && S.bannerT <= 0) say('LOW AND FAST', 0.4);
      }

      // WRONG WAY — pointed back down the line for a beat (a loop is allowed to face back for its own length)
      const fwd = forwardOf(flight);
      if (!flight.stunt && fwd.x * at.tangent.x + fwd.z * at.tangent.z < -0.35) S.wrongT += dt; else S.wrongT = 0;
      if (S.wrongT > 1.4 && S.bannerT <= 0) say('WRONG WAY', 0.8);

      // ── the plane and the pilot ──
      player.root.position.copyFrom(flight.pos);
      player.root.rotation.set(-flight.pitch, flight.heading, -flight.roll);
      player.prop.rotation.z += (18 + 30 * S.input.gas + 20 * S.input.boostK) * dt;
      scarf?.update(dt, Math.min(1, flight.speed / tune.top));
      pickups?.shield(PLAYER_ID, player.root, S.shieldT > 0);

      // ── bananas ──
      for (const b of bananas) {
        if (b.taken) { b.respawn -= dt; if (b.respawn <= 0) b.taken = false; continue; }
        if (segDist(b.pos, prevPos, flight.pos) <= BANANA_RADIUS) {
          b.taken = true; b.respawn = BANANA_RESPAWN_SEC;
          if (S.bananas < BANANA_CAP) {
            S.bananas++;
            SoundKit.play('uiTick', { pitch: 1.6 + S.bananas * 0.04, volume: 0.45 });
            if (S.bananas === BANANA_CAP) say('10 BANANAS — TOP SPEED', 0.9);
          } else SoundKit.play('uiTick', { pitch: 1.2, volume: 0.25 });
        }
      }

      // ── balloons: the player ──
      stepBalloons(balloons, dt);
      for (const b of balloonsHit(balloons, prevPos, flight.pos)) {
        b.respawn = BALLOON_RESPAWN_SEC;
        const before = S.held;
        S.held = collectBalloon(S.held, b.kind);
        S.popped++;
        SoundKit.play('powerUp', { pitch: 1 + S.held.level * 0.12, volume: 0.55 });
        EffectsKit.burst(ctx.scene, b.pos.clone(), 'confetti');
        ctx.feel.impact(0.15);
        say(before && before.kind === b.kind ? `${ITEM_LABEL[b.kind]} LEVEL ${S.held.level}` : ITEM_LABEL[b.kind], 0.8);
      }

      // ── the field ──
      const pDist = playerDist();
      const lapLen = line.lapLength;
      rivals.forEach((r, i) => {
        const k = rivalKits[i];
        const before = r.dist;
        k.shieldT = Math.max(0, k.shieldT - dt); k.zipT = Math.max(0, k.zipT - dt);
        stepRival(r, line!, dt, pDist, { topSpeed: tune.top * RIVAL_PACE * (k.zipT > 0 ? 1.35 : 1), cornerBite: 0.3 }, race.time);
        if (k.stunT > 0) { k.stunT = Math.max(0, k.stunT - dt); r.dist = before + (r.dist - before) * 0.25; r.speed *= 0.97; }
        // a rival flying a balloon row picks up an item
        const inLap = ((r.dist % lapLen) + lapLen) % lapLen;
        const lap = Math.floor(r.dist / lapLen);
        if (lap !== k.lap) { k.lap = lap; k.nextRow = 0; }
        if (k.nextRow < rowDists.length && inLap >= rowDists[k.nextRow]) {
          k.nextRow++;
          if (!k.item && Math.random() < 0.7) { k.item = { kind: ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)] as ItemKind, level: Math.random() < 0.3 ? 2 : 1 }; k.itemAt = race.time; }
        }
        // …and uses it when it makes sense
        const rp = rivalPlanes[i];
        if (k.item && rp && race.time - k.itemAt > 1.2) {
          const gapToPlayer = pDist - r.dist;
          const heading = rp.root.rotation.y;
          const aim = new Vector3(Math.sin(heading), 0, Math.cos(heading));
          let use = false;
          if (k.item.kind === 'missile') use = gapToPlayer > 15 && gapToPlayer < 150 && Math.random() < dt * 0.6 * tier.edge * 2;
          else if (k.item.kind === 'mine') use = gapToPlayer < -8 && gapToPlayer > -90 && Math.random() < dt * 0.5;
          else use = Math.random() < dt * 0.35;
          if (use) {
            const out = useItem(k.item, i + 1, rp.root.position, aim, aim.scale(-1), targetAhead(i + 1, r.dist));
            missiles.push(...out.missiles); mines.push(...out.mines);
            if (out.boostSec) k.zipT = out.boostSec;
            if (out.shieldSec) k.shieldT = out.shieldSec;
            if (out.missiles.length && gapToPlayer > 0 && gapToPlayer < 150) say(`${r.name} FIRED — ROLL TO DODGE`, 0.9);
            k.item = null;
          }
        }
        // place and pose the rival's plane: its lane weaves, it banks into the line's turns, it tumbles when hit
        if (rp) {
          const place = rivalPlacement(r, line!);
          const weave = Math.sin(race.time * 0.5 + r.phase) * 3;
          const side = new Vector3(Math.cos(place.heading), 0, -Math.sin(place.heading));
          rp.root.position.copyFrom(place.pos.add(side.scale(weave)));
          rp.root.position.y = Math.max(rp.root.position.y, circuit.floorAt(rp.root.position.x, rp.root.position.z) + 3);
          let turn = place.heading - k.lastHeading; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          k.lastHeading = place.heading;
          k.roll += ((dt > 0 ? Math.max(-0.8, Math.min(0.8, (turn / dt) * 0.5)) : 0) - k.roll) * Math.min(1, 5 * dt);
          const tumble = k.stunT > 0 ? race.time * 14 : 0;
          rp.root.rotation.set(0, place.heading, -k.roll + tumble);
          rp.prop.rotation.z += 40 * dt;
          pickups?.shield(i + 1, rp.root, k.shieldT > 0);
        }
      });

      // ── missiles and mines ──
      const targets: Target[] = [
        { id: PLAYER_ID, pos: flight.pos, protected: S.shieldT > 0 || dodging(flight) },
        ...rivals.map((_, i) => ({ id: i + 1, pos: rivalPlanes[i]?.root.position ?? new Vector3(0, -999, 0), protected: rivalKits[i].shieldT > 0 })),
      ];
      const mres = stepMissiles(missiles, targets, dt);
      const nres = stepMines(mines, targets, dt);
      for (const id of [...mres.hit, ...nres.hit]) {
        if (id === PLAYER_ID) hitPlayer(ctx, mres.hit.includes(id) ? 'MISSILE' : 'MINE');
        else hitRival(ctx, id - 1, true);
      }
      for (const id of [...mres.absorbed, ...nres.absorbed]) {
        const p = racerPos(id);
        if (p) EffectsKit.burst(ctx.scene, p.clone(), 'glitch');
        if (id === PLAYER_ID) { SoundKit.play('clang', { volume: 0.5 }); say(dodging(flight) ? 'DODGED!' : 'SHIELD BLOCKED IT', 0.8); if (dodging(flight)) boost.earn('trickBig'); }
      }
      for (const m of mres.spent) if (m.life <= 0) EffectsKit.burst(ctx.scene, m.pos.clone(), 'sparks');
      pickups?.update(dt, balloons, bananas, missiles, mines);

      // ── overtakes sing ──
      const place = playerPosition(pDist, rivals);
      if (S.lastPlace > 0 && place < S.lastPlace) { ctx.momentum.report({ kind: 'overtake', weight: 13 * (S.lastPlace - place) }); boost.earn('nearMiss', S.lastPlace - place); SoundKit.play('score', { pitch: 1.3, volume: 0.35 }); }
      S.lastPlace = place;

      boostFx?.update(dt, boost, bev);
      if (bev.started) { ctx.feel.impact(0.3); say('BOOST!', 0.6); }
      if (bev.full) say('BOOST READY', 0.8);

      // ── the race: checkpoints, laps, the finish clock ──
      const leader = S.graceLeft === null ? fieldLeaderDone(rivals, line, circuit.course.laps) : null;
      const g = stepFinishGrace(S.graceLeft, dt, !!leader);
      S.graceLeft = g.left;
      if (g.started && leader) { SoundKit.play('whistle'); say(`${leader.name} FINISHED — ${Math.ceil(g.left ?? 0)}s TO THE LINE`, 1.8); }
      else if (g.tick !== null && g.tick > 0 && g.tick <= 5) { SoundKit.play('uiTick', { pitch: 1 + (5 - g.tick) * 0.08 }); say(`FINISH IN ${g.tick}`, 0.9); }
      const res = stepRace(race, circuit.course, prevPos, flight.pos, dt);
      if (res.lap) {
        SoundKit.play('score', { pitch: 1.2 });
        ctx.feel.impact(0.3);
        if (!res.finished) say(race.lap === circuit.course.laps ? 'FINAL LAP!' : `LAP ${race.lap}`, 1.1);
      }
      if (res.finished || S.graceLeft === 0) { finish(ctx); return; }

      if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

      world?.update(dt, ctx.camera);
      ctx.camDirector.look(S.lookX, S.lookY, dt);
      ctx.camDirector.update(flight.pos, fwd.scale(flight.speed), null);
      baseFov ??= ctx.camera.fov;
      ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boost) ?? 1), flight.speed, tune.top * 1.4, dt);
      pushHud(ctx);
    },

    dispose(): void {
      boostFx?.dispose(); boostFx = null;
      scarf?.dispose(); scarf = null;
      seated?.dispose(); seated = null;
      pilot?.dispose(); pilot = null;
      player?.dispose(); player = null;
      for (const rp of rivalPlanes) rp.dispose();
      rivalPlanes = []; rivals = []; rivalKits = []; line = null;
      pickups?.dispose(); pickups = null;
      world?.dispose(); world = null;
      balloons = []; bananas = []; missiles = []; mines = [];
      flight = null;
    },
  };
}

export const AeroAcesMode: ModeDefinition = makeAeroAcesMode();
