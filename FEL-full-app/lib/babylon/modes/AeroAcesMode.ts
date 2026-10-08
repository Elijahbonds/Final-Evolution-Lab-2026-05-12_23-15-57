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
import { Mesh, MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { buildPoseClip, REF_HIPS_Y } from '../anim/poseClip';
import { seatedKeys } from '../anim/authored/seated';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { readCourse, startRace, stepRace, toNextGate, medalFor, type RaceProgress } from '../core/RaceCourse';
import { readProfile, profileFor, DEFAULT_TIER } from '../core/Difficulty';
import {
  makeField, stepRival, rivalPace, rivalPlacement, playerPosition, ordinal, fieldLeaderDone, stepFinishGrace, aroundCall, gapLine, lapProgress,
  type RaceLine, type Rival,
} from '../racing/RaceField';
import { readPlane } from '../racing/garage';
import { AERO_TUNE } from '../racing/aeroTune';   // 10-phase pass, phase 3: the mode's speed feel in one config
import { spawnAeroDrive, stepAeroDrive, type AeroDrive } from '../racing/RivalDriver';   // 10-phase pass, phase 5: the field flies the same model
import type { RacingLine } from '../racing/racingLine';
import { dressVehicle } from '../racing/vehicleBody';   // models pass phase 5: the Meshy plane bodies over the toy primitives
import { refuse } from '../core/Refusal';
import { stepDraft, noDraft, DRAFT, type DraftState } from '../racing/Slipstream';   // racing pass phase 7
import { newStart, stepStart, beatLabel, ROCKET_ZIP_SEC, BURNOUT_SEC, BURNOUT_THROTTLE, type StartState, type StartOutcome } from '../racing/RaceStart';   // racing pass phase 4
import {
  ARCADE_TRAINER, arcadeFrom, spawnArcade, stepArcade, startStunt, dodging, spinOut, wallTurn, forwardOf,
  type Stunt,
  type ArcadeState, type ArcadeTune, type ArcadeInput,
} from '../racing/ArcadeFlight';
import {
  addToChain, boostEarnForStunt, emptyChain, noHug, stepChain, stepHug, stuntById,
} from '../racing/AeroTricks';
import {
  collectBalloon, balloonsHit, stepBalloons, useItem, stepMissiles, stepMines, bananasAfterHit, segDist,
  BALLOON_RESPAWN_SEC, BANANA_RADIUS, BANANA_CAP, ITEM_LABEL, weightedItemKind,
  type Balloon, type Banana, type HeldItem, type Missile, type Mine, type Target,
} from '../racing/AeroItems';
import { aeroCircuits, circuitById, locate, pointAlong, type AeroCircuit } from '../racing/aeroCircuits';
import { locateNear, newLineFix } from '../racing/lineWindow';   // IMPROVE (2026-10-06) #13: the player's fix, windowed
import { GhostRecorder, loadGhost, saveIfFaster, ghostAtTime, deltaMs, deltaLabel, type Ghost } from '../racing/ghost';   // IMPROVE #1
import { VenueKit } from '../visual/VenueKit';
import {
  BannerSlot, BANNER_PRIO, racerPlace, incomingThreat, threatWords, neutralRoll, newRecover, stepRecover, aeroScore,
  mapFrame, mapPath, toMap, flyoverPose, aeroGhostKey, raceProgress, hudDue, type BannerPrio, type Threat, type MapFrame,
} from './aeroAcesRules';   // IMPROVE (2026-10-06): the owner-picked improvements' pure rules
import { buildAeroWorld, type AeroWorld } from '../racing/aeroWorlds';
import { buildToyPlane, blurProp, Scarf, brighter, type ToyPlane } from '../racing/toyPlane';
import { aeroHudWords, RideHudSwitch, setRingGlyph } from './rideHud';   // GC-13 / 10-phase pass, phase 10: the HUD says the rider's words
import { resolveRaceIdentity } from '../racing/raceLook';   // PR #138: a minor's look is the device's, and never uploaded
import { fitVehicleLight, type VehicleLightHandle } from '../racing/vehicleLight';   // 10-phase pass, phase 7
import { SpeedLines, WingtipTrails } from '../racing/speedFx';   // 10-phase pass, phase 8
import { AeroPickups } from '../racing/aeroPickups';
import { steerLane, resolveContact, nearMisses, personalityFor } from '../racing/RaceContact';   // RACE CONTACT (2026-09-18): rivals with intent, wing-to-wing bumps and punts

/** Racers on the grid: the player and seven rivals. */
const FIELD = 7;
const PILOT_SCALE = 0.82;
/** A banana taken comes back after this long (so a lap-3 line is still worth flying). */
const BANANA_RESPAWN_SEC = 10;
/** The field is paced against the plane's top speed ×this. RaceField's spread (0.62 + skill × 0.42 of pace) was tuned for
 *  karts that lose time in every corner; a plane on the line with a few bananas out-flew the whole normal field by a lap
 *  (measured: 1st by 20 s, every rival 25–28 m/s against 32). Kart-racer AI has to be in the mirror. */
// 1.22 (racing pass phase 6, was 1.16): measured over five circuits, the best rival flew 3.5–6 % slower than a pilot
// racing the line with the items and the boost, and a pilot with NO items, stunts or boost still won two of them (NEON
// SKYLINE by 309 m). The field now holds a pilot who only flies the line.
// 1.10 (BOARD-RACE W5, 2026-09-30: "slower rival pace", no measurement recorded) — and the comment above was left saying
// 1.22. IMPROVE (2026-10-06), aeroaces #7, RE-MEASURED UNDER PHASE 5: the field now flies the player's own model, whose
// top speed caps a rival however high this asks, so the number mostly moves the middle and the back of the field. A
// line-only pilot (the same pursuit pilot, full gas, no items, stunts, boost or bananas; pro tier, 3 laps, contact off)
// against the field: at 1.10 the best rival still beats it on all five circuits by 0.6–1.4 % and it finishes 2nd–3rd;
// at 1.22 by 2.3–3.3 % and it finishes 5th. 1.10 already holds a pilot who only flies the line, so it is KEPT, not
// raised back — the owner's sign-off is on this number (a headless race of RivalDriver + RaceField, 2026-10-06).
const RIVAL_PACE = 1.10;
/** How much a bend slows an aero rival (0..1 of pace at a hairpin) — racing pass phase 6, see the rivals' step. */
const RIVAL_CORNER_BITE = 0.1;
/** Racer ids in the item system: 0 is the player, rivals are 1..FIELD. */
const PLAYER_ID = 0;

interface RivalKit { item: HeldItem | null; itemAt: number; shieldT: number; stunT: number; zipT: number; nextRow: number; lastHeading: number; roll: number; lap: number; home: number; cool: number; touch: boolean; alongside: boolean }

let baseFov: number | null = null;
/** The end card's medal as a number (stats are numbers): 3 gold … 0 none. */
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1, none: 0 } as const;
/** IMPROVE (2026-10-06) #11: circuits already flown over this page session — a retry goes straight to the grid. */
const flownOver = new Set<string>();

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
  let vehicleLight: VehicleLightHandle | null = null;   // 10-phase pass, phase 7: the vehicles' own light
  let speedLines: SpeedLines | null = null;       // 10-phase pass, phase 8: streaks past ~80% of top speed
  let wingtipFx: WingtipTrails | null = null;     // 10-phase pass, phase 8: the air coming off the wingtips
  let flight: ArcadeState | null = null;
  let race: RaceProgress = startRace();
  let line: RaceLine | null = null;
  let rivals: Rival[] = [];
  let rivalKits: RivalKit[] = [];
  let rivalPlanes: ToyPlane[] = [];
  /** THE FIELD FLIES (10-phase pass, phase 5): each rival's own ArcadeState, stepped through the player's
   *  model by a pure-pursuit pilot. `driveLine` is the circuit's line as a racingLine (same arrays — the
   *  aero CircuitLine is always a loop, so the adapter is exact). */
  let rivalDrive: AeroDrive[] = [];
  let driveLine: RacingLine | null = null;
  let balloons: Balloon[] = [];
  let bananas: Banana[] = [];
  let missiles: Missile[] = [];
  let mines: Mine[] = [];
  let rowDists: number[] = [];
  let boost = new BoostKit();
  let tier = profileFor(DEFAULT_TIER);
  const prevPos = new Vector3();

  /** GC-13 / phase 10: whose words the HUD says, and when the ring's puck needs re-asserting. */
  const hudSwitch = new RideHudSwitch();
  const S = {
    input: { steer: 0, climb: 0, gas: 0, brake: 0, boostK: 0, bananas: 0 } as ArcadeInput,
    held: null as HeldItem | null,
    bananas: 0,
    shieldT: 0,
    zipT: 0,
    boostHeld: false,
    done: false,
    events: { bumps: 0, punts: 0, punted: 0, nearMisses: 0, slingshots: 0 },   // RACE CONTACT telemetry
    /** SLIPSTREAM (phase 7): the wake's charge behind the plane ahead, and whether this tow has been called. */
    draft: noDraft() as DraftState, draftSaid: false,
    lookX: 0, lookY: 0,
    lastPlace: 0,
    wrongT: 0,
    /** IMPROVE #10: the wrong-way / no-progress net (aeroAcesRules.stepRecover). */
    recover: newRecover(),
    /** IMPROVE #3: the nearest missile coming for the player, this frame. */
    threat: null as Threat | null,
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
    /** THE START (racing pass phase 4): the countdown, and a burnout's seconds of lost thrust after a too-early throttle. */
    start: newStart() as StartState, burnT: 0,
  };

  // IMPROVE (2026-10-06) #4: ONE BANNER, RANKED. There was one slot and the last writer won, so "BUMPED" or "ZIP!" a
  // frame after "VOSS FIRED — ROLL TO DODGE" erased the warning. A message now carries a rank (aeroAcesRules.BANNER_PRIO)
  // and a lower one never covers a higher one still on screen.
  const banner = new BannerSlot();
  const say = (t: string, sec = 1.1, prio: BannerPrio = BANNER_PRIO.info): void => { banner.say(t, sec, prio); };

  // IMPROVE (2026-10-06) #12/#13: THE PLAYER'S PLACE ON THE LINE, ONCE A FRAME. playerDist() was a full locate() scan
  // (two Vector3s each) called ~9 times a frame, once per rival inside gapLine's map. The plane moves once a frame, so
  // the fix is taken once after it moves (windowed round the last one, into a reused object) and every reader that
  // frame — the field, the HUD, items, the probe — gets the same number.
  const playerFix = newLineFix();
  let distMemo: number | null = null;
  function fixPlayer(): void {
    if (!flight) return;
    locateNear(circuit.line, flight.pos.x, flight.pos.z, playerFix);
    // RaceField.lapProgress (racing pass phase 6): the grid seam this always handled, and the frame the plane wraps past
    // zero before the finish gate counts the lap (the kart's finish froze a lap down on it)
    distMemo = lapProgress(playerFix.dist, circuit.line.length, race.lap, race.next, circuit.course.gates.length);
  }
  /** The player's distance along the race: laps done + distance into this one. */
  function playerDist(): number {
    if (!flight || !line) return 0;
    if (distMemo === null) fixPlayer();
    return distMemo ?? 0;
  }

  // IMPROVE (2026-10-06) #15: the per-frame field lists are built into these and reused, never re-allocated.
  type Racer = { dist: number; lateral: number; speed: number };
  let othersBuf: Racer[] = [];
  let rposes: Racer[] = [];
  let cools: number[] = [], touches: boolean[] = [], was: boolean[] = [];
  let targets: Target[] = [];
  let gapBuf: { name: string; gap: number }[] = [];
  let draftBuf: { name: string; dist: number; lane: number }[] = [];
  const PARKED = new Vector3(0, -999, 0);
  function sizeBuffers(): void {
    const n = rivals.length;
    othersBuf = Array.from({ length: Math.max(0, n - 1) }, () => ({ dist: 0, lateral: 0, speed: 0 }));
    rposes = Array.from({ length: n }, () => ({ dist: 0, lateral: 0, speed: 0 }));
    cools = new Array(n).fill(0); touches = new Array(n).fill(false); was = new Array(n).fill(false);
    targets = [{ id: PLAYER_ID, pos: PARKED, protected: false }, ...rivals.map((_, i) => ({ id: i + 1, pos: PARKED, protected: false }))];
    gapBuf = rivals.map((r) => ({ name: r.name, gap: 0 }));
    draftBuf = rivals.map((r) => ({ name: r.name, dist: 0, lane: 0 }));
  }
  function gaps(): { name: string; gap: number }[] {
    const pd = playerDist();
    for (let i = 0; i < rivals.length; i++) { gapBuf[i].name = rivals[i].name; gapBuf[i].gap = rivals[i].dist - pd; }
    return gapBuf;
  }

  // IMPROVE (2026-10-06) #1: THE GHOST — your best race on this circuit, flown beside you, and the delta to it by
  // distance (racing/ghost: the kart's own rule — compared at the same point on the course, never the same clock).
  let ghostBest: Ghost | null = null;
  const ghostRec = new GhostRecorder();
  let ghostMesh: Mesh | null = null;
  let ghostSampleAt = 0;
  let pbWords = '';
  /** Stored at 5 Hz, rounded: a three-lap race is ~900 samples (~60 KB) rather than 20 Hz of raw floats. */
  const GHOST_STORE_HZ = 5;
  function buildGhostMesh(scene: Scene): Mesh {
    const fuse = MeshBuilder.CreateCapsule('__aero_ghost_fuse', { height: 2.8, radius: 0.55, tessellation: 10, subdivisions: 2 }, scene);
    fuse.rotation.x = Math.PI / 2;
    const wing = MeshBuilder.CreateBox('__aero_ghost_wing', { width: 5.2, height: 0.22, depth: 0.9 }, scene);
    wing.position.set(0, -0.2, 0.2);
    const tail = MeshBuilder.CreateBox('__aero_ghost_tail', { width: 2, height: 0.18, depth: 0.6 }, scene);
    tail.position.set(0, 0.15, -1.3);
    const m = Mesh.MergeMeshes([fuse, wing, tail], true, true) ?? fuse;
    m.name = '__aero_ghost';
    const mat = VenueKit.paint(scene, 'aero_ghost_mat', '#7dd3fc', 0.7, 0.5);
    mat.alpha = 0.32;
    m.material = mat; m.isPickable = false; m.setEnabled(false);
    return m;
  }

  // IMPROVE (2026-10-06) #11: THE FLYOVER — the countdown starts with one sweep round the circuit, so the first lap of an
  // unseen 3D course is not guesswork. Once per circuit per page session; A or X skips it.
  const fly = { on: false, t: 0 };
  function endFlyover(ctx: ModeContext): void {
    if (!fly.on) return;
    fly.on = false;
    flownOver.add(circuit.course.id);
    ctx.camDirector.suspended = false;
    if (flight) ctx.camDirector.snapTo(flight.pos, null);
    hudKey = null;
  }

  // IMPROVE (2026-10-06) #6: THE COURSE STRIP — the outline is sent once, the dots at the HUD's rate.
  let frame: MapFrame | null = null;

  // IMPROVE (2026-10-06) #14: the HUD gate — a discrete change goes at once, the rest at AERO_HUD_HZ.
  let hudKey: string | null = null;
  let hudSince = 0;

  function lineFromCircuit(c: AeroCircuit): RaceLine {
    const pts = c.line.pts.map((p) => p.clone());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Vector3.Distance(pts[i - 1], pts[i]));
    return { pts, cum, lapLength: cum[cum.length - 1] + Vector3.Distance(pts[pts.length - 1], pts[0]), loop: true };
  }

  /** The boost pill's discrete states (burning, full, denied) — the meter's level rides the 10 Hz tick. */
  function boostKey(): string { const h = boost.hud(); return `${h.boosting}${h.boostFull}${h.boostDenied}`; }
  function pushHud(ctx: ModeContext, dt = 0, force = false): void {
    if (!flight) return;
    const place = playerPosition(playerDist(), rivals);
    const item = S.held ? `${ITEM_LABEL[S.held.kind]}${S.held.level > 1 ? ` ×${S.held.level}` : ''}` : '';
    const start = fly.on ? '' : S.start.go ? '' : beatLabel(S.start.beat);
    const shield = S.shieldT > 0 ? Math.ceil(S.shieldT) : 0;
    const threat = threatWords(S.threat);
    // IMPROVE #14: everything a player reads as an EVENT is in the key and goes the frame it changes; the clock, speed,
    // gaps, draft and the map dots ride the 10 Hz tick (pushHud ran every frame: a React setState per frame).
    const key = `${race.lap}|${place}|${item}|${S.bananas}|${banner.text}|${start}|${shield}|${S.threat?.side ?? ''}${S.threat?.rollNow ?? ''}|${fly.on}|${boostKey()}`;
    hudSince += dt;
    if (!force && !hudDue(hudKey, key, hudSince)) return;
    hudKey = key; hudSince = 0;
    const { dist, gate } = toNextGate(race, circuit.course, flight.pos);
    // IMPROVE #1: the delta to the best race here, by distance (ghost.deltaMs), at the HUD's rate
    if (ghostBest && S.start.go && !S.done) {
      const ms = deltaMs(ghostBest, raceProgress(playerDist(), circuit.line.length, circuit.course.laps), race.time * 1000);
      pbWords = ms === null ? '' : `PB ${deltaLabel(ms)}`;
    }
    const hud: Record<string, HudValue> = {
      lap: `${Math.min(race.lap, circuit.course.laps)}/${circuit.course.laps}`,
      pos: `${ordinal(place)} / ${rivals.length + 1}`,
      place,
      gap: gapLine(gaps(), flight.speed),   // phase 5: the gap under the place
      toGate: Math.round(dist),
      item,
      itemKind: S.held?.kind ?? '',
      itemLevel: S.held?.level ?? 0,
      bananas: S.bananas,
      shield,
      speed: Math.round(flight.speed * 3.6),
      time: race.time.toFixed(1),
      banner: banner.text,
      draft: Math.round(S.draft.charge * 100),   // SLIPSTREAM (phase 7): the wake's charge, 0–100
      start,   // THE START: the beat on screen (QA drivers time the rocket off it)
      // IMPROVE #3: the missile coming for you — seconds out, which side, and the moment to roll
      threat, threatSide: S.threat?.side ?? '', threatRoll: !!S.threat?.rollNow,
      // IMPROVE #1: the delta to your best race here, by distance
      pb: pbWords,
      ...boost.hud(),
      // GC-13 / phase 10: the words are whoever is flying (rideHud) — a body's on the body, the pad's unchanged
      ...aeroHudWords(hudSwitch.isBody, S.start.go),
      // IMPROVE #11: the sweep's own line, over the start hint while it runs
      ...(fly.on ? { hint: 'COURSE FLYOVER — A TO SKIP' } : {}),
    };
    // IMPROVE #6: the course strip's dots — you (with your heading), the field, the next ring
    if (frame) {
      const [mx, my] = toMap(frame, flight.pos.x, flight.pos.z);
      hud.mapMe = `${mx},${my},${Math.round((flight.heading * 180) / Math.PI)}`;
      let field = '';
      for (let i = 0; i < rivalPlanes.length; i++) { const p = rivalPlanes[i].root.position; const [x, y] = toMap(frame, p.x, p.z); field += `${i ? ';' : ''}${x},${y}`; }
      hud.mapField = field;
      if (gate) { const [gx, gy] = toMap(frame, gate.at.x, gate.at.z); hud.mapRing = `${gx},${gy}`; }
    }
    ctx.setHud(hud);
  }

  function buildRivals(scene: Scene): void {
    rivals = makeField(FIELD, tune.top, tier.edge);
    // planes are wide: spread the lanes, and put the grid behind the player in two staggered rows
    rivals.forEach((r, i) => { r.lane *= 3.2; r.dist = -10 - i * 7; });
    rivalKits = rivals.map((r) => ({ item: null, itemAt: 0, shieldT: 0, stunT: 0, zipT: 0, nextRow: 0, lastHeading: 0, roll: 0, lap: 0, home: r.lane, cool: 0, touch: false, alongside: false }));
    // the field's own planes, on the grid it was dealt (10-phase pass, phase 5)
    driveLine = { pts: circuit.line.pts, cum: circuit.line.cum, length: circuit.line.length, loop: true };
    rivalDrive = rivals.map((r) => spawnAeroDrive(driveLine!, r, tune));
    S.events = { bumps: 0, punts: 0, punted: 0, nearMisses: 0, slingshots: 0 };
    S.draft = noDraft(); S.draftSaid = false;
    rivalPlanes = rivals.map((r) => buildToyPlane(scene, r.name, r.tint, brighter(r.tint, 0.55), { toyPilot: true, mood: readCourse('aero').mood }));
    // phase 5: the field wears the fifth body. IMPROVE (2026-10-06): its 1024² LOD (#20), one drawn body instanced across
    // the field (#17), and the toy primitives disposed, not hidden, once it is on (#16)
    for (const rp of rivalPlanes) void dressVehicle(scene, rp.root, 'plane', 'rival', { hide: rp.parts, lod: true, instance: true }).then((h) => { if (h) { vehicleLight?.include(h.root.getChildMeshes()); rp.dropPrimitives(); } });
    sizeBuffers();
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

  /** IMPROVE #9: the sideways offset (+ = right of the nose) of the nearest rival plane within a wingspan or two, or null. */
  function alongsideLateral(): number | null {
    if (!flight) return null;
    const fx = Math.sin(flight.heading), fz = Math.cos(flight.heading);
    let best: number | null = null, bestD = 14 * 14;
    for (const rp of rivalPlanes) {
      const dx = rp.root.position.x - flight.pos.x, dz = rp.root.position.z - flight.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = dx * fz - dz * fx; }
    }
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
    say(lost ? `HIT BY A ${what} — ${lost} BANANA${lost > 1 ? 'S' : ''} LOST` : `HIT BY A ${what}`, 1.2, BANNER_PRIO.event);
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
      say(`DIRECT HIT — ${rivals[i].name}`, 1, BANNER_PRIO.event);
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

  function stunt(ctx: ModeContext, kind: Stunt): void {
    if (!flight) return;
    if (flight.spinT > 0) { refuse(ctx, 'SPINNING'); return; }
    if (!startStunt(flight, kind)) { refuse(ctx, 'ALREADY IN A STUNT'); return; }
    SoundKit.play('whoosh', { pitch: stuntById(kind)?.reverses ? 0.9 : 1.3, volume: 0.45 });
    say(stuntById(kind)?.label ?? 'STUNT', 0.6);
    S.stunts++;
  }

  /** GO, and what the start was worth: a ROCKET is a zip, a BURNOUT a beat of lost thrust, NORMAL nothing. */
  /** A rocket start leaves the grid this far over top speed (the zip then holds it there for ROCKET_ZIP_SEC). */
  const ROCKET_LAUNCH_MULT = 1.3;
  function startBeat(ctx: ModeContext, outcome: StartOutcome): void {
    SoundKit.play('whistle');
    // A PLANE LAUNCHES FROM THE GRID. It hangs at cruise while the beats count and reaches top speed in about a second,
    // so a zip alone moved it ~1 m against a normal start (measured at 10 s). The start sets the launch speed instead:
    // a normal GO leaves at the floor speed, a rocket leaves above top speed, a bog stays at the floor with the thrust cut.
    if (flight) flight.speed = outcome === 'rocket' ? tune.top * ROCKET_LAUNCH_MULT : tune.minSpeed;
    if (outcome === 'rocket') {
      S.zipT = Math.max(S.zipT, ROCKET_ZIP_SEC); say('ROCKET START!', 1.1, BANNER_PRIO.event);
      SoundKit.play('whoosh', { pitch: 1.4, volume: 0.6 }); ctx.juice.flash('#38bdf8', 80); ctx.feel.impact(0.35);
      if (flight) EffectsKit.burst(ctx.scene, flight.pos.clone(), 'sparks', 2);
    } else if (outcome === 'burnout') {
      S.burnT = BURNOUT_SEC; say('ENGINE BOGGED — TOO EARLY', 1.1, BANNER_PRIO.event);
      SoundKit.play('squeak', { pitch: 0.6, volume: 0.5 }); ctx.juice.shake(0.05, 120);
      if (flight) EffectsKit.burst(ctx.scene, flight.pos.clone(), 'dust', 2);
    } else say('GO!', 0.8, BANNER_PRIO.event);
    console.info(`[RACE] start ${outcome}`);
  }

  function finish(ctx: ModeContext): void {
    if (S.done) return;
    S.done = true;
    ctx.camDirector.rearView = false;   // the end card is never framed backwards
    const place = playerPosition(playerDist(), rivals);
    const podium = place <= 3;
    SoundKit.play(race.finished ? (podium ? 'crowdCheer' : 'score') : 'miss');
    ctx.juice.hitStop(90);
    // IMPROVE (2026-10-06) #1: a finished race is a ghost; the faster one keeps the circuit
    let newPb = false, pbDelta: number | null = null;
    const prevBest = ghostBest;
    if (race.finished) {
      const g = ghostRec.finish(aeroGhostKey(circuit.course.id), Math.round(race.time * 1000), readPlane().id);
      if (g) { newPb = saveIfFaster(g) === g && (!prevBest || g.timeMs < prevBest.timeMs); }
      if (prevBest) pbDelta = Math.round(race.time * 1000) - prevBest.timeMs;
    }
    const pbTail = !race.finished ? '' : newPb ? (prevBest ? ` · NEW PB ${deltaLabel(pbDelta)}` : ' · FIRST PB') : prevBest ? ` · PB ${deltaLabel(pbDelta)}` : '';
    say(race.finished ? `${ordinal(place).toUpperCase()} PLACE — ${race.time.toFixed(1)}s${pbTail}` : `OUT OF TIME — ${ordinal(place)}`, 2.4, BANNER_PRIO.final);
    S.threat = null;
    pushHud(ctx, 0, true);
    // IMPROVE (2026-10-06) #8: the score is the race AND how it was flown — place and bananas as before, plus the stunts
    // landed, the best chain and the medal (aeroAcesRules.aeroScore; at most AERO_SCORE_MAX = 1,600, under the measured
    // aeroAces row in lib/sessions/modeScoreRules.ts)
    const medal = medalFor(circuit.course, race.time, race.finished);
    const sc = aeroScore({ place, finished: race.finished, bananas: S.bananas, stunts: S.stunts, bestChain: S.bestChain, medal });
    ctx.end(race.finished ? (place === 1 ? 'WIN' : podium ? 'PODIUM' : 'FINISHED') : 'OUT',
      sc.total, {
        seconds: Number(race.time.toFixed(2)), place, field: rivals.length + 1, laps: Math.min(race.lap, circuit.course.laps),
        bananas: S.bananas, hits: S.hits, stunts: S.stunts, fired: S.fired, balloons: S.popped,
        bestChain: S.bestChain, medalRank: MEDAL_RANK[medal], placePts: sc.placePts, bananaPts: sc.bananaPts, stuntPts: sc.stuntPts, chainPts: sc.chainPts, medalPts: sc.medalPts,
        newPb: newPb ? 1 : 0, ...(pbDelta !== null ? { pbDeltaMs: pbDelta } : {}), ...(prevBest ? { bestMs: prevBest.timeMs } : {}),
      });
  }

  return {
    modeId: 'aeroaces',
    get mood(): ModeDefinition['mood'] { return readCourse('aero').mood; },
    camPreset: 'flyer',
    // GC-7. After mood/camPreset: pickerReach's modesById() only recognises a modeId whose next property
    // is mood or camPreset (see VelocityKartMode).
    hideRingInPlay: true,

    async load(ctx: ModeContext): Promise<void> {
      baseFov = null;
      hudSwitch.reset();   // GC-13: a remount starts on the pad's words until a body plays
      Object.assign(S, {
        input: { steer: 0, climb: 0, gas: 0, brake: 0, boostK: 0, bananas: 0 }, held: null, bananas: 0, shieldT: 0, zipT: 0,
        boostHeld: false, done: false, lastPlace: 0, wrongT: 0, scrapeCool: 0, graceLeft: null,
        hits: 0, stunts: 0, fired: 0, popped: 0, stickX: 0, stickY: 0, start: newStart(), burnT: 0,
        // IMPROVE (2026-10-06): the best chain now pays (#8), so a remount must not carry the last race's; the rest are new
        chain: emptyChain(), hug: noHug(), bestChain: 0, recover: newRecover(), threat: null,
      });
      banner.clear(); distMemo = null; playerFix.i = -1; hudKey = null; hudSince = 0; pbWords = ''; ghostSampleAt = 0;
      ghostRec.reset();
      boost = new BoostKit(0.25);
      circuit = circuitById(readCourse('aero').id) ?? aeroCircuits()[0];
      tune = arcadeFrom(readPlane().spec);
      tier = readProfile();
      race = startRace();
      line = lineFromCircuit(circuit);

      player = buildToyPlane(ctx.scene, 'player', '#e63946', '#ffd166', { mood: circuit.course.mood });
      // phase 5: the garage pick's body; IMPROVE (2026-10-06) #16: the primitives are disposed once it is on
      { const pl = player; void dressVehicle(ctx.scene, pl.root, 'plane', readPlane().id, { hide: pl.parts }).then((h) => { if (h) { vehicleLight?.include(h.root.getChildMeshes()); pl.dropPrimitives(); } }); }
      // IMPROVE (2026-10-06) #19: THE WORLD AND THE PILOT LOAD TOGETHER. They were awaited one after the other, though
      // neither needs the other: the world is geometry and props, the pilot is the identity read and the hero's GLB.
      // The identity still comes before the spawn — that order is PR #138's and is kept inside the second branch.
      // THE PILOT IN THE OPEN COCKPIT: the hero, seated, chest up out of the rim. Parented to the seat, so the plane
      // carries the body through every roll and loop with no second copy of the attitude maths.
      // PR #138: a minor's (or unknown-age) pilot wears the look the PHONE holds — resolved and seated here,
      // read-only over the wire, before the spawn asks for the session identity
      const [worldR, pilotR] = await Promise.allSettled([
        buildAeroWorld(ctx.scene, circuit),
        resolveRaceIdentity().then(() => CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: new Vector3(0, 0, 0), yawRad: 0, startClip: 'idle_stand' })),
      ]);
      if (worldR.status === 'fulfilled') world = worldR.value;
      if (pilotR.status === 'fulfilled') pilot = pilotR.value;
      if (worldR.status === 'rejected') throw worldR.reason;   // dispose() takes whichever half did load
      if (pilotR.status === 'rejected') throw pilotR.reason;
      pickups = new AeroPickups(ctx.scene);
      resetPickups();
      if (!pilot) throw new Error('[FEL-AERO] the pilot did not spawn');
      pilot.animator.park();
      pilot.root.parent = player.seat;
      pilot.root.scaling.setAll(PILOT_SCALE);
      pilot.root.position.set(0, -REF_HIPS_Y * PILOT_SCALE, 0);
      const seatClip = buildPoseClip(ctx.scene, pilot.skeleton, 'aero_seated', 0.5, seatedKeys());
      if (seatClip) { seatClip.start(true, 1, 0, 0.5, false); seated = seatClip; }
      else console.warn('[FEL-AERO] seated pose could not be built — the pilot stands');
      scarf = new Scarf(ctx.scene, player.scarfAnchor, '#ffffff');

      buildRivals(ctx.scene);

      // phase 7: one vehicle light over every plane on the grid (receiveShadows on all, fill where the mood is flat)
      vehicleLight?.dispose();
      vehicleLight = fitVehicleLight(ctx.scene, circuit.course.mood, [player.root, ...rivalPlanes.map((p) => p.root)], 'plane');
      // phase 8: speed you can see — streaks riding the camera, ribbons off the player's wingtips
      speedLines?.dispose(); speedLines = new SpeedLines(ctx.scene, ctx.camera);
      wingtipFx?.dispose(); wingtipFx = new WingtipTrails(ctx.scene, player.wingtips);

      flight = spawnArcade(circuit.course.start.at, circuit.course.start.heading, tune);
      prevPos.copyFrom(flight.pos);
      player.root.position.copyFrom(flight.pos);
      player.root.rotation.set(0, flight.heading, 0);

      boostFx?.dispose();
      boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: player.root, trailWidth: 1.4, color: '#ffd166' });

      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = null;
      ctx.camDirector.tuneFollow(AERO_TUNE.cam);   // the mode's own chase numbers (10-phase pass, phase 3)
      ctx.camDirector.snapTo(flight.pos, null);
      // IMPROVE #11: the flyover first, on a circuit this page has not flown yet — the course name rides it
      fly.on = !flownOver.has(circuit.course.id); fly.t = 0;
      say(`${circuit.course.name} — ${circuit.course.sub}`, fly.on ? 2.4 + 2.6 : 2.4, BANNER_PRIO.event);
      // IMPROVE #1: the circuit's best race, if this device has flown one — drawn beside you, and the delta to it
      ghostBest = loadGhost(aeroGhostKey(circuit.course.id));
      ghostMesh?.dispose(); ghostMesh = ghostBest ? buildGhostMesh(ctx.scene) : null;
      // IMPROVE #6: the course strip's outline, sent once
      frame = mapFrame(circuit.line.pts);
      ctx.setHud({ mapPath: mapPath(circuit.line, frame) });

      // THE PROBE SEAM (dev): where the racer is, the line ahead, the item, the place.
      (ctx.scene.metadata ??= {}).aero = {
        state: () => {
          const at = flight ? locate(circuit.line, flight.pos.x, flight.pos.z) : null;
          return {
            circuit: circuit.course.id, lap: race.lap, laps: circuit.course.laps, next: race.next, gates: circuit.course.gates.length,
            time: +race.time.toFixed(2), finished: race.finished, done: S.done,
            start: S.start.go ? S.start.outcome : `count ${S.start.beat}`,
            pos: flight ? { x: flight.pos.x, y: flight.pos.y, z: flight.pos.z } : null,
            heading: flight ? +flight.heading.toFixed(3) : 0, speed: flight ? +flight.speed.toFixed(1) : 0,
            along: at ? +at.dist.toFixed(1) : 0, lateral: at ? +at.lateral.toFixed(1) : 0, corridor: circuit.corridor,
            lineY: at ? +at.point.y.toFixed(1) : 0,
            tangent: at ? { x: at.tangent.x, z: at.tangent.z } : null,
            place: playerPosition(playerDist(), rivals), field: rivals.length + 1,
            item: S.held, bananas: S.bananas, hits: S.hits, stunts: S.stunts, stunt: flight?.stunt ?? null,
            events: { ...S.events }, rivals: rivals.map((r, i) => ({ name: r.name, gap: +(r.dist - playerDist()).toFixed(1), lateral: +r.lane.toFixed(2), stun: +rivalKits[i].stunT.toFixed(2), personality: personalityFor(i) })),
            // IMPROVE (2026-10-06): the flyover, the missile warning, the PB delta and the banner's rank, for a probe
            flyover: fly.on, threat: S.threat ? { tti: +S.threat.tti.toFixed(2), side: S.threat.side, rollNow: S.threat.rollNow } : null,
            pb: pbWords, ghost: !!ghostBest, banner: { text: banner.text, prio: banner.prio },
          };
        },
      };
      pushHud(ctx, 0, true);
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }
      // RACING PASS phase 3 — L3 held = LOOK BACK, R3 = who is around you (as the kart)
      if (e.t === 'button' && e.btn === 'LS') { ctx.camDirector.rearView = e.pressed && !S.done; return; }
      if (S.done || !flight) return;
      // IMPROVE #11: A or X skips the flyover (and is not a fire press: nothing is held on the grid)
      if (fly.on && e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'X')) { endFlyover(ctx); SoundKit.play('uiTick', { pitch: 1.2, volume: 0.35 }); return; }
      if (e.t === 'button' && e.btn === 'RS') {
        if (e.pressed) { ctx.juice.callout(aroundCall(gaps(), flight.speed), '#e2e8f0', 1400); SoundKit.play('uiTick', { pitch: 1.1, volume: 0.35 }); }
        return;
      }
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
      else if (e.btn === 'B') {
        // IMPROVE (2026-10-06) #9: with the stick centred the roll went left or right by `stunts % 2` — a dodge that went
        // whichever way the last trick count said. It now rolls AWAY from the threat (the incoming missile, else a rival
        // wing-to-wing), and with nothing there always the same way (aeroAcesRules.NEUTRAL_ROLL).
        stunt(ctx, S.stickY > 0.5 ? 'loop'
          : S.stickY < -0.5 ? 'split_s'
          : S.stickX < -0.3 ? 'roll_left'
          : S.stickX > 0.3 ? 'roll_right'
          : neutralRoll(S.threat?.lateral ?? alongsideLateral()));
      } else if (e.btn === 'Y') {
        stunt(ctx, Math.abs(S.stickX) > 0.3 ? 'knife_edge' : 'loop');
      }
    },

    update(ctx: ModeContext, dt: number): void {
      if (!flight || !player || !line || S.done) return;
      // GC-13 / phase 10: the HUD's words and the ring's gamepad puck follow whoever is flying (the kart's
      // wiring, the same pattern SkateRunMode set) — the puck is re-asserted once a second while a body
      // plays, because the harness can mount the ring after the switch
      const sw = hudSwitch.next(!!(ctx.body?.() ?? null));
      if (sw !== null) { ctx.setHud({ ...aeroHudWords(!!(ctx.body?.() ?? null), S.start.go) }); setRingGlyph(ctx.scene.meshes, !sw); }
      else if (hudSwitch.isBody && hudSwitch.glyphDue(dt)) setRingGlyph(ctx.scene.meshes, false);

      // ── THE START (racing pass phase 4, racing/RaceStart): the field holds on the grid until GO; the gas's timing
      // against the beats is worth a rocket (a zip) or a burnout (lost thrust). The planes hang on their grid spots.
      if (!S.start.go) {
        // IMPROVE (2026-10-06) #11: the flyover runs before the beats — the start clock waits for it
        if (fly.on) {
          fly.t += dt;
          const pose = flyoverPose(circuit.line, fly.t);
          ctx.camDirector.suspended = true;   // an authored shot: FrameGuard stands down (CameraDirector.suspended)
          ctx.camera.position.copyFrom(pose.pos);
          ctx.camera.setTarget(pose.target);
          if (pose.done) endFlyover(ctx);
        }
        const st = fly.on ? { state: S.start, beatChanged: false, wentGo: false } : stepStart(S.start, dt, S.input.gas >= 0.5);
        S.start = st.state;
        if (st.beatChanged && S.start.beat > 0) { say(beatLabel(S.start.beat), 0.9, BANNER_PRIO.event); SoundKit.play('uiTick', { pitch: 0.85, volume: 0.55 }); ctx.juice.shake(0.02, 80); }
        if (!st.wentGo) {
          player.root.position.copyFrom(flight.pos);
          player.root.rotation.set(-flight.pitch, flight.heading, -flight.roll);
          const gridRpm = AERO_TUNE.prop.gridIdle + AERO_TUNE.prop.gridGas * S.input.gas;   // the engine revs on the grid
          player.prop.rotation.z += gridRpm * dt;
          blurProp(player, gridRpm, AERO_TUNE.prop.blurFrom, AERO_TUNE.prop.blurTo);
          rivals.forEach((r, i) => {
            const rp = rivalPlanes[i]; if (!rp) return;
            const place = rivalPlacement(r, line!);
            rp.root.position.copyFrom(place.pos);
            rp.root.position.y = Math.max(rp.root.position.y, circuit.floorAt(rp.root.position.x, rp.root.position.z) + 3);
            rp.root.rotation.set(0, place.heading, 0);
          });
          banner.tick(dt);
          if (!fly.on) {
            ctx.camDirector.look(S.lookX, S.lookY, dt);
            ctx.camDirector.update(flight.pos, Vector3.Zero(), null);
          }
          pushHud(ctx, dt);
          return;
        }
        startBeat(ctx, S.start.outcome ?? 'normal');
        S.recover = newRecover(playerDist());
        ghostRec.reset(); ghostSampleAt = 0;
      }
      prevPos.copyFrom(flight.pos);

      // ── boost: the shared kit (RB), plus a blue balloon's zip holding it at full ──
      const bev = boost.update(dt, S.boostHeld, flight.spinT <= 0);
      ctx.stamina?.(boost.meter);   // PLAYER RING: the ring's arc is the boost tank
      S.zipT = Math.max(0, S.zipT - dt);
      S.shieldT = Math.max(0, S.shieldT - dt);
      S.input.boostK = Math.max(boost.k, S.zipT > 0 ? 1 : 0);
      S.input.bananas = S.bananas;

      // ── fly ──
      const ceiling = circuit.ceilingAt(flight.pos.x, flight.pos.z);
      const wasStunt = flight.stunt;
      // a BURNOUT is lost thrust for a beat after GO — on a copy, so the held trigger is never rewritten
      if (S.burnT > 0) S.burnT = Math.max(0, S.burnT - dt);
      const touched = stepArcade(flight, S.burnT > 0 ? { ...S.input, gas: Math.min(S.input.gas, BURNOUT_THROTTLE) } : S.input, dt, tune, circuit.floorAt, ceiling);
      distMemo = null;   // IMPROVE #12: the plane moved — the frame's fix is taken once, below
      // …and the plane's acceleration, not its thrust, limits the first second, so capping the gas cost ~2 m (measured):
      // a bogged engine holds the plane at its floor speed for the bog
      if (S.burnT > 0) flight.speed = Math.min(flight.speed, tune.minSpeed);
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
      // IMPROVE #12/#13: the one fix of the frame (windowed, into playerFix); playerDist() reads it from here on
      fixPlayer();
      const at = playerFix;
      if (Math.abs(at.lateral) > circuit.corridor) {
        const side = Math.sign(at.lateral);
        const right = new Vector3(at.tangent.z, 0, -at.tangent.x);
        flight.pos.subtractInPlace(right.scale(at.lateral - side * circuit.corridor));
        if (wallTurn(flight, -right.x * side, -right.z * side, tune.wallScrub) && S.scrapeCool <= 0) {
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
        if (hugged.closeness01 > 0.8 && banner.idle) say('LOW AND FAST', 0.4);
      }

      // WRONG WAY — pointed back down the line for a beat (a loop is allowed to face back for its own length)
      let fwd = forwardOf(flight);
      const backwards = fwd.x * at.tangent.x + fwd.z * at.tangent.z < -0.35;
      if (!flight.stunt && backwards) S.wrongT += dt; else S.wrongT = 0;
      if (S.wrongT > 1.4) say('WRONG WAY', 0.8, BANNER_PRIO.threat);   // IMPROVE #4: a warning, ranked over the chatter
      // IMPROVE (2026-10-06) #10: WRONG WAY OR GOING NOWHERE → BACK ON THE LINE. It only ever said so; the kart puts a
      // beached kart back after 2 s. Pointed back down the line for WRONG_WAY_RESPAWN_SEC, or no new ground for
      // NO_PROGRESS_RESPAWN_SEC (circling, pinned on the edge), puts the plane on the line at the distance it had already
      // earned, nose down the course, at its floor speed: the cost is the time lost, never the race. A stunt or a
      // spin holds the clocks.
      const rc = stepRecover(S.recover, dt, { wrongWay: backwards, dist: playerDist(), exempt: !!flight.stunt || flight.spinT > 0 });
      S.recover = rc.state;
      if (rc.respawn) {
        const home = pointAlong(circuit.line, rc.state.bestDist);
        flight.pos.copyFrom(home.pos);
        flight.heading = Math.atan2(home.tangent.x, home.tangent.z);
        flight.pitch = 0; flight.roll = 0; flight.yawAt = 0; flight.stunt = null; flight.stuntT = 0;
        flight.speed = tune.minSpeed;
        fwd = forwardOf(flight);
        prevPos.copyFrom(flight.pos);   // a teleport sweeps nothing: no gate, balloon or banana across it
        playerFix.i = -1; fixPlayer();
        S.wrongT = 0;
        ctx.camDirector.snapTo(flight.pos, null);   // a cut, not a whip pan
        say('BACK ON COURSE', 1.0, BANNER_PRIO.event);
        SoundKit.play('whoosh', { pitch: 0.9, volume: 0.4 });
        ctx.juice.flash('#ffffff', 40);
        console.info('[RACE] respawn — plane back on the line');
      }

      // ── the plane and the pilot ──
      player.root.position.copyFrom(flight.pos);
      player.root.rotation.set(-flight.pitch, flight.heading, -flight.roll);
      // phase 9: the prop rate lives in AERO_TUNE, and past the blur gate the blades smear into the disc
      const propRpm = AERO_TUNE.prop.idle + AERO_TUNE.prop.gas * S.input.gas + AERO_TUNE.prop.boost * S.input.boostK;
      player.prop.rotation.z += propRpm * dt;
      blurProp(player, propRpm, AERO_TUNE.prop.blurFrom, AERO_TUNE.prop.blurTo);
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
        // ITEM WEIGHTING BY PLACE (gap 12), same as the kart: drawn at collection, weighted by place.
        const kind = weightedItemKind(playerPosition(playerDist(), rivals), rivals.length + 1, Math.random);
        S.held = collectBalloon(S.held, kind);
        S.popped++;
        SoundKit.play('powerUp', { pitch: 1 + S.held.level * 0.12, volume: 0.55 });
        EffectsKit.burst(ctx.scene, b.pos.clone(), 'confetti');
        ctx.feel.impact(0.15);
        say(before && before.kind === kind ? `${ITEM_LABEL[kind]} LEVEL ${S.held.level}` : ITEM_LABEL[kind], 0.8);
      }

      // ── the field ──
      const pDist = playerDist();
      const lapLen = line.lapLength;
      const pLat = at.lateral;
      rivals.forEach((r, i) => {
        const k = rivalKits[i];
        const before = r.dist;
        k.shieldT = Math.max(0, k.shieldT - dt); k.zipT = Math.max(0, k.zipT - dt);
        // INTENT (RACE CONTACT): a blocker crosses in front of you, a bumper leans on your wing, a clean pilot steps round a slower plane
        // IMPROVE #15: the others are written into one reused list (live, so a lane moved earlier this frame is seen)
        if (k.stunT <= 0) {
          for (let j = 0, o = 0; j < rivals.length; j++) if (j !== i) { const b = othersBuf[o++]; b.dist = rivals[j].dist; b.lateral = rivals[j].lane; b.speed = rivals[j].speed; }
          r.lane = steerLane({ lane: r.lane, dist: r.dist, speed: r.speed, personality: personalityFor(i), home: k.home }, { dist: pDist, lateral: pLat, speed: flight!.speed }, othersBuf, circuit.corridor, lapLen, dt);
        }
        // cornerBite 0.1 (racing pass phase 6, was 0.3): an arcade plane turns at close to full speed, so a field that
        // lifted 30 % for every bend lost the twisty circuits by itself — measured, a driver flying the line with NO items,
        // stunts or boost won NEON SKYLINE by 332 m while RED ROCK was a real race. The corners are the pilot's, not a tax.
        const drv = rivalDrive[i];
        if (drv && driveLine) {
          // THE FIELD FLIES (10-phase pass, phase 5): rivalPace (the same maths stepRival ran) sets the TARGET;
          // the pursuit pilot flies the player's own stepArcade to it — the weave is a lane target now, so the
          // bank into it is the model's own. A stunned rival LIMPS at a fifth of its pace.
          const want = rivalPace(r, line!, pDist, { topSpeed: tune.top * RIVAL_PACE * (k.zipT > 0 ? 1.35 : 1), cornerBite: RIVAL_CORNER_BITE }, race.time);
          if (k.stunT > 0) k.stunT = Math.max(0, k.stunT - dt);
          const weave = Math.sin(race.time * 0.5 + r.phase) * 3;
          stepAeroDrive(drv, r, driveLine, k.stunT > 0 ? want * 0.2 : want, dt, tune, circuit.corridor, circuit.floorAt, circuit.ceilingAt, weave);
        } else {
          stepRival(r, line!, dt, pDist, { topSpeed: tune.top * RIVAL_PACE * (k.zipT > 0 ? 1.35 : 1), cornerBite: RIVAL_CORNER_BITE }, race.time);
          if (k.stunT > 0) { k.stunT = Math.max(0, k.stunT - dt); r.dist = before + (r.dist - before) * 0.25; r.speed *= 0.97; }
        }
        // a rival flying a balloon row picks up an item
        const inLap = ((r.dist % lapLen) + lapLen) % lapLen;
        const lap = Math.floor(r.dist / lapLen);
        if (lap !== k.lap) { k.lap = lap; k.nextRow = 0; }
        if (k.nextRow < rowDists.length && inLap >= rowDists[k.nextRow]) {
          k.nextRow++;
          // IMPROVE (2026-10-06) #2: a rival's balloon is weighted by ITS place, the player's table (AeroItems.weightedItemKind):
          // the leader draws shields and mines, the back of the field missiles and boosts. It drew uniformly at random.
          if (!k.item && Math.random() < 0.7) { k.item = { kind: weightedItemKind(racerPlace(r.dist, pDist, rivals, i), rivals.length + 1, Math.random), level: Math.random() < 0.3 ? 2 : 1 }; k.itemAt = race.time; }
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
            if (out.missiles.length && gapToPlayer > 0 && gapToPlayer < 150) say(`${r.name} FIRED — ROLL TO DODGE`, 0.9, BANNER_PRIO.threat);
            k.item = null;
          }
        }
        // place and pose the rival's plane: its lane weaves, it banks into the line's turns, it tumbles when hit
        if (rp) {
          const tumble = k.stunT > 0 ? race.time * 14 : 0;
          if (drv && driveLine) {
            // the pose is the STATE's: the bank into a turn is the model's own roll, not a heading delta
            const st = drv.state;
            rp.root.position.copyFrom(st.pos);
            rp.root.position.y = Math.max(rp.root.position.y, circuit.floorAt(st.pos.x, st.pos.z) + 3);
            rp.root.rotation.set(-st.pitch, st.heading, -st.roll + tumble);
          } else {
            const place = rivalPlacement(r, line!);
            const weave = Math.sin(race.time * 0.5 + r.phase) * 3;
            const side = new Vector3(Math.cos(place.heading), 0, -Math.sin(place.heading));
            rp.root.position.copyFrom(place.pos.add(side.scale(weave)));
            rp.root.position.y = Math.max(rp.root.position.y, circuit.floorAt(rp.root.position.x, rp.root.position.z) + 3);
            let turn = place.heading - k.lastHeading; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            k.lastHeading = place.heading;
            k.roll += ((dt > 0 ? Math.max(-0.8, Math.min(0.8, (turn / dt) * 0.5)) : 0) - k.roll) * Math.min(1, 5 * dt);
            rp.root.rotation.set(0, place.heading, -k.roll + tumble);
          }
          rp.prop.rotation.z += AERO_TUNE.prop.rival * dt;
          blurProp(rp, AERO_TUNE.prop.rival, AERO_TUNE.prop.blurFrom, AERO_TUNE.prop.blurTo);
          pickups?.shield(i + 1, rp.root, k.shieldT > 0);
        }
      });

      // ── CONTACT (RACE CONTACT, 2026-09-18): wing to wing is a bump; closing fast from behind is a punt ──
      if (flight.spinT <= 0 && race.time > 3) {   // not off the grid
        // IMPROVE #15: rposes, cools, touches and was are filled into the buffers sizeBuffers() made
        for (let i = 0; i < rivals.length; i++) {
          const r = rivals[i], k = rivalKits[i], b = rposes[i];
          b.dist = r.dist; b.lateral = r.lane + Math.sin(race.time * 0.5 + r.phase) * 3; b.speed = r.speed + (k.stunT > 0 ? -5 : 0);
          cools[i] = k.cool; touches[i] = k.touch; was[i] = k.alongside;
        }
        const me = { dist: pDist, lateral: pLat, speed: flight.speed, boosting: boost.k > 0.35 || S.zipT > 0 };
        const right = new Vector3(at.tangent.z, 0, -at.tangent.x);
        for (const ev of resolveContact(me, rposes, lapLen, cools, dt, touches)) {
          const r = rivals[ev.i];
          const rdrv = rivalDrive[ev.i];
          flight.pos.addInPlace(right.scale(ev.playerShove * 2)); r.lane += ev.rivalShove * 2;
          // the speed cost lands on the rival's MODEL (r.speed is measured off it next frame)
          const cutRival = (keep: number) => { r.speed *= keep; if (rdrv) rdrv.state.speed *= keep; };
          if (ev.kind === 'punt') { flight.speed *= ev.playerKeep; hitRival(ctx, ev.i, true); S.events.punts++; say(`PUNTED ${r.name}`, 0.9); }
          else if (ev.kind === 'punted') { cutRival(ev.rivalKeep); if (S.shieldT > 0) say('SHIELD HELD', 0.5); else { hitPlayer(ctx, `${r.name} PUNT`); S.events.punted++; } }
          else { flight.speed *= ev.playerKeep; cutRival(ev.rivalKeep); S.events.bumps++; SoundKit.play('thud', { pitch: 1.1, volume: 0.45 }); ctx.juice.shake(0.08, 110); ctx.feel.impact(0.2); EffectsKit.burst(ctx.scene, flight.pos.clone(), 'sparks'); say(`BUMPED ${r.name}`, 0.5); console.info(`[RACE] bump ${r.name}`); }
        }
        rivalKits.forEach((k, i) => { k.cool = cools[i]; k.touch = touches[i]; });
        for (const i of nearMisses(me, rposes, lapLen, was)) { S.events.nearMisses++; boost.earn('nearMiss'); ctx.juice.callout('CLOSE PASS', '#86efac', 420); SoundKit.play('swish', { pitch: 1.4, volume: 0.35 }); console.info(`[RACE] near miss ${rivals[i].name}`); }
        rivalKits.forEach((k, i) => { k.alongside = was[i]; });
        // SLIPSTREAM (racing pass phase 7, racing/Slipstream): tuck in behind a rival, in its lane, and the wake charges; hold it
        // ~1 s and you are slung past. The rival AHEAD becomes a resource, not only an obstacle — Mario Kart's draft.
        for (let i = 0; i < rivals.length; i++) { const b = draftBuf[i]; b.name = rivals[i].name; b.dist = rivals[i].dist; b.lane = rivals[i].lane; }
        const tow = stepDraft(S.draft, { dist: pDist, lane: pLat, speed: flight.speed }, draftBuf, lapLen, dt);
        if (tow.towing && !S.draftSaid && tow.state.charge > 0.35) { S.draftSaid = true; ctx.juice.callout('SLIPSTREAM', '#a5f3fc', 500); SoundKit.play('whoosh', { pitch: 0.8, volume: 0.25 }); }
        if (!tow.towing) S.draftSaid = false;
        if (tow.event === 'slingshot') {
          S.zipT = Math.max(S.zipT, DRAFT.burstSec); S.events.slingshots++; S.draftSaid = false;
          say(`SLINGSHOT — PAST ${tow.from}`, 0.9); SoundKit.play('whoosh', { pitch: 1.5, volume: 0.55 }); ctx.juice.flash('#22d3ee', 50);
          console.info(`[RACE] slingshot ${tow.from}`);
        }
        S.draft = tow.state;
      }

      // ── missiles and mines ──
      // IMPROVE #15: the target list is the reused one — positions are references, the flags refreshed
      targets[0].pos = flight.pos; targets[0].protected = S.shieldT > 0 || dodging(flight);
      for (let i = 0; i < rivals.length; i++) { const t = targets[i + 1]; t.pos = rivalPlanes[i]?.root.position ?? PARKED; t.protected = rivalKits[i].shieldT > 0; }
      const mres = stepMissiles(missiles, targets, dt);
      const nres = stepMines(mines, targets, dt);
      for (const id of [...mres.hit, ...nres.hit]) {
        if (id === PLAYER_ID) hitPlayer(ctx, mres.hit.includes(id) ? 'MISSILE' : 'MINE');
        else hitRival(ctx, id - 1, true);
      }
      for (const id of [...mres.absorbed, ...nres.absorbed]) {
        const p = racerPos(id);
        if (p) EffectsKit.burst(ctx.scene, p.clone(), 'glitch');
        if (id === PLAYER_ID) { SoundKit.play('clang', { volume: 0.5 }); say(dodging(flight) ? 'DODGED!' : 'SHIELD BLOCKED IT', 0.8, BANNER_PRIO.event); if (dodging(flight)) boost.earn('trickBig'); }
      }
      for (const m of mres.spent) if (m.life <= 0) EffectsKit.burst(ctx.scene, m.pos.clone(), 'sparks');
      pickups?.update(dt, balloons, bananas, missiles, mines);
      // IMPROVE (2026-10-06) #3: THE MISSILE WARNING. The only warning was a banner when a rival behind fired; a homing
      // missile then arrived with nothing to time the roll on. The nearest missile coming for you is now on the HUD with
      // its side and seconds out, and it turns to ROLL NOW (with a tick) inside the roll's window.
      const wasRoll = !!S.threat?.rollNow;
      S.threat = incomingThreat(missiles, PLAYER_ID, flight.pos, flight.heading, flight.speed);
      if (S.threat?.rollNow && !wasRoll && !dodging(flight)) SoundKit.play('uiTick', { pitch: 1.7, volume: 0.5 });

      // ── overtakes sing ──
      const place = playerPosition(pDist, rivals);
      if (S.lastPlace > 0 && place < S.lastPlace) { ctx.momentum.report({ kind: 'overtake', weight: 13 * (S.lastPlace - place) }); boost.earn('nearMiss', S.lastPlace - place); SoundKit.play('score', { pitch: 1.3, volume: 0.35 }); }
      S.lastPlace = place;

      boostFx?.update(dt, boost, bev);
      // phase 8: streaks past ~80% of top, and the wingtip ribbons in a hard bank or near the top
      speedLines?.update(S.done ? 0 : flight.speed / Math.max(1, tune.top));
      wingtipFx?.update(flight.roll, flight.speed / Math.max(1, tune.top));
      if (bev.started) { ctx.feel.impact(0.3); say('BOOST!', 0.6); }
      if (bev.full) say('BOOST READY', 0.8);
      // RACING PASS phase 3: an empty press says what fills the tank (it already ticked and lit the HUD pill)
      if (bev.denied) ctx.juice.callout('BOOST EMPTY — STUNTS, FLYING LOW, CLOSE PASSES FILL IT', '#94a3b8', 900);

      // ── the race: checkpoints, laps, the finish clock ──
      const leader = S.graceLeft === null ? fieldLeaderDone(rivals, line, circuit.course.laps) : null;
      const g = stepFinishGrace(S.graceLeft, dt, !!leader);
      S.graceLeft = g.left;
      if (g.started && leader) { SoundKit.play('whistle'); say(`${leader.name} FINISHED — ${Math.ceil(g.left ?? 0)}s TO THE LINE`, 1.8, BANNER_PRIO.event); }
      else if (g.tick !== null && g.tick > 0 && g.tick <= 5) { SoundKit.play('uiTick', { pitch: 1 + (5 - g.tick) * 0.08 }); say(`FINISH IN ${g.tick}`, 0.9, BANNER_PRIO.event); }
      const res = stepRace(race, circuit.course, prevPos, flight.pos, dt);
      // RACING PASS phase 8: a GATE between laps answered nothing — no sound, no pop (the plane measured 3.6 juice beats a
      // minute against the kart's 58–75). A ring flown through chimes and pops, as the kart's checkpoints do.
      if (res.gate && !res.lap) {
        SoundKit.play('score', { pitch: 1, volume: 0.35 });
        ctx.juice.scorePop(flight.pos.add(new Vector3(0, 3, 0)), `RING ${race.next === 0 ? circuit.course.gates.length : race.next}/${circuit.course.gates.length}`, '#7dd3fc');
      }
      if (res.lap) {
        SoundKit.play('score', { pitch: 1.2 });
        ctx.feel.impact(0.3);
        ctx.juice.flash('#fde68a', 90); ctx.juice.shake(0.04, 110);
        const finalLap = !res.finished && race.lap === circuit.course.laps;
        if (!res.finished) say(finalLap ? 'FINAL LAP!' : `LAP ${race.lap}`, 1.1, BANNER_PRIO.event);
        if (finalLap) { SoundKit.play('whistle', { pitch: 1.3 }); ctx.juice.callout('FINAL LAP', '#fde047', 900); }
      }
      // IMPROVE (2026-10-06) #1: record this race for the ghost (5 Hz, rounded — see GHOST_STORE_HZ), and fly the best one
      if (race.time >= ghostSampleAt || res.finished) {
        ghostSampleAt = race.time + 1 / GHOST_STORE_HZ;
        ghostRec.sample({
          progress: Math.round(raceProgress(playerDist(), circuit.line.length, circuit.course.laps) * 1e5) / 1e5,
          t: Math.round(race.time * 1000),
          x: Math.round(flight.pos.x * 10) / 10, y: Math.round(flight.pos.y * 10) / 10, z: Math.round(flight.pos.z * 10) / 10,
          yaw: Math.round(flight.heading * 100) / 100,
        });
      }
      if (ghostMesh) {
        const gs = ghostAtTime(ghostBest, race.time * 1000);
        const show = !!gs && !res.finished && race.time * 1000 <= (ghostBest?.timeMs ?? 0);
        if (ghostMesh.isEnabled() !== show) ghostMesh.setEnabled(show);
        if (gs && show) { ghostMesh.position.set(gs.x, gs.y, gs.z); ghostMesh.rotation.y = gs.yaw ?? 0; }
      }
      if (res.finished || S.graceLeft === 0) { ghostMesh?.setEnabled(false); finish(ctx); return; }

      const { gate } = toNextGate(race, circuit.course, flight.pos);
      ctx.objectiveRef.current = gate?.at.clone() ?? null;

      banner.tick(dt);

      world?.update(dt, ctx.camera);
      ctx.camDirector.look(S.lookX, S.lookY, dt);
      ctx.camDirector.update(flight.pos, fwd.scale(flight.speed), null);
      baseFov ??= ctx.camera.fov;
      ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boost) ?? 1), flight.speed, tune.top * 1.4, dt, AERO_TUNE.fov);
      // SPEED-VIGNETTE (racing HUD pass): same opt-in as the kart — report the fraction, the harness frames it.
      ctx.feel.speedVignette01(flight.speed / (tune.top * 1.4));
      pushHud(ctx, dt);
    },

    dispose(): void {
      boostFx?.dispose(); boostFx = null;
      vehicleLight?.dispose(); vehicleLight = null;
      speedLines?.dispose(); speedLines = null; wingtipFx?.dispose(); wingtipFx = null;
      scarf?.dispose(); scarf = null;
      seated?.dispose(); seated = null;
      pilot?.dispose(); pilot = null;
      player?.dispose(); player = null;
      for (const rp of rivalPlanes) rp.dispose();
      rivalPlanes = []; rivals = []; rivalKits = []; rivalDrive = []; driveLine = null; line = null;
      pickups?.dispose(); pickups = null;
      world?.dispose(); world = null;
      balloons = []; bananas = []; missiles = []; mines = [];
      ghostMesh?.material?.dispose(); ghostMesh?.dispose(); ghostMesh = null; ghostBest = null;
      if (fly.on) fly.on = false;
      flight = null;
    },
  };
}

export const AeroAcesMode: ModeDefinition = makeAeroAcesMode();
