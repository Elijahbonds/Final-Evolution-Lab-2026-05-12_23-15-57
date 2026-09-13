// AERO ACES — the flying mode (2026-09-12).
//
// Owner: "aero aces, karting? maps? gameplay?". Aero Aces Flyer had NEVER existed here — recorded as "retired
// by decision, do not resurrect" (docs/ASSESSMENT-2026-09-04.md:42) and "Not found in app/play"
// (MODE_IMPLEMENTATION_MAP.txt:18). The owner's ask supersedes that. This is the mode around the two pieces
// built first, deliberately in that order: FlightModel (the handling) and RaceCourse (the maps and the loop).
//
// Nothing about flight is re-implemented here. This file is the FACE: it builds the aircraft and the rings,
// feeds the stick into FlightModel, feeds the aircraft's travel into RaceCourse, and shows the result. Same
// division SprintMode has with its core.
//
// THE AIRCRAFT IS BUILT FROM PRIMITIVES, and that is a considered choice rather than a placeholder: there is no
// plane in public/models/meshy (sedan, skateboard, snowboard, surfboard, hoopbus — no aircraft), and the
// no-placeholder rule this repo now enforces is about BODIES, not vehicles. A board is a box in boardCore and a
// ramp is a box in rideWorlds for the same reason. If a plane asset lands later, only buildPlane changes.

import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { buildPoseClip, REF_HIPS_Y } from '../anim/poseClip';
import { seatedKeys, WHEEL_RADIUS } from '../anim/authored/seated';
import type { AnimationGroup } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  AERO_TRAINER, spawnFlight, stepFlight, noseOf, levelOut, clampFlight,
  type FlightInput, type FlightState, type Airframe,
} from '../core/FlightModel';
import {
  AERO_COURSES, readCourse, startRace, stepRace, toNextGate, medalFor, type Course, type RaceProgress,
} from '../core/RaceCourse';
import { buildCourseVenue } from '../racing/venueForCourse';
import {
  buildRaceLine, makeField, stepRival, rivalPlacement, playerPosition, ordinal,
  type RaceLine, type Rival,
} from '../racing/RaceField';
import { readPlane } from '../racing/garage';

/** The picked airframe. Defaults to the trainer, so a mode with no pick flies exactly as it was tuned. */
let FRAME: Airframe = AERO_TRAINER;
/** The world's lid, floor and walls. clampFlight holds the aircraft inside them. */
const CEILING = 520, FLOOR = 14, HALF_WORLD = 700;

export function makeAeroAcesMode(): ModeDefinition {
let plane: TransformNode | null = null;
let venueRoot: TransformNode | null = null;
let pilot: SpawnedCharacter | null = null;
let seated: AnimationGroup | null = null;
// THE FIELD. Same module the karts use — see racing/RaceField.ts. Rivals fly the racing line as PACERS
// rather than running the flight model: an AI that actually flies needs stall recovery, and an aircraft
// recovering badly in front of the player is worse than no aircraft at all.
let line: RaceLine | null = null;
let rivals: Rival[] = [];
let rivalPlanes: TransformNode[] = [];
let playerDist = 0;
let rings: Mesh[] = [];
let course: Course = AERO_COURSES[0];
let flight: FlightState | null = null;
let race: RaceProgress = startRace();
const prevPos = new Vector3();

const S = {
  input: { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, boost: false } as FlightInput,
  /** True while the stick is actually being held — a released stick levels the wings. */
  rolling: false,
  banner: '', bannerT: 0,
  done: false,
  crashes: 0,
  lookX: 0, lookY: 0,
};

const say = (t: string, sec = 1.1): void => { S.banner = t; S.bannerT = sec; };

/** A stylised plane: fuselage, wings, tail. Yaw/pitch/roll are applied to the root. */
// THE COCKPIT AND THE PILOT (2026-09-13). Phase 0 booted every mode and found three with ZERO skeletons —
// this was one of them: an aircraft flying itself, which is the same defect Velocity Kart shipped with and
// the sharpest version of the unfinished signal in a game whose standing rule is that every body in a scene
// is a humanoid that moves well.
//
// The fuselage was a solid 1.5 x 1.2 x 7 box, so like the kart there was nowhere for a body to BE. It gets a
// well cut into the top and a yoke to hold. The pose is the SAME authored stance the kart driver uses
// (anim/authored/seated.ts) and that is not a shortcut: reclined into a seat with the legs stretched forward
// and the hands up at chest height is a cockpit posture before it is a karting one. A YOKE rather than a
// stick, because the authored pose puts both hands together at the centre line and a yoke is the control
// that actually matches that — a side-stick would have one hand gripping air.
const PILOT_HIPS = { y: 0.34, z: 1.05 };
const PILOT_SCALE = 0.94;
const YOKE = { y: 0.78, z: 1.62, tiltDeg: 24 };

function buildPlane(ctx: ModeContext): TransformNode {
  const body = MeshBuilder.CreateBox('aero_body', { width: 1.5, height: 1.2, depth: 7 }, ctx.scene);
  const paint = new StandardMaterial('aero_paint', ctx.scene);
  paint.diffuseColor = Color3.FromHexString('#d7dbe8');
  paint.specularColor = Color3.FromHexString('#222833');
  body.material = paint;

  const wing = MeshBuilder.CreateBox('aero_wing', { width: 11, height: 0.22, depth: 1.9 }, ctx.scene);
  wing.position.set(0, 0.1, -0.3);
  const accent = new StandardMaterial('aero_accent', ctx.scene);
  accent.diffuseColor = Color3.FromHexString('#22d3ee');
  accent.emissiveColor = Color3.FromHexString('#0b3b44');
  wing.material = accent;
  wing.parent = body;

  const tail = MeshBuilder.CreateBox('aero_tail', { width: 3.4, height: 0.18, depth: 1.0 }, ctx.scene);
  tail.position.set(0, 0.35, -3.1);
  tail.material = accent;
  tail.parent = body;

  const fin = MeshBuilder.CreateBox('aero_fin', { width: 0.16, height: 1.5, depth: 1.1 }, ctx.scene);
  fin.position.set(0, 0.9, -3.1);
  fin.material = accent;
  fin.parent = body;

  // the well the pilot sits in — dark, so the opening reads as an opening rather than a decal
  const well = new StandardMaterial('aero_well', ctx.scene);
  well.diffuseColor = Color3.FromHexString('#14171d');
  well.specularColor = Color3.FromHexString('#2a3038');
  const tub = MeshBuilder.CreateBox('aero_cockpit', { width: 0.86, height: 0.5, depth: 1.9 }, ctx.scene);
  tub.position.set(0, 0.46, 1.0);
  tub.material = well;
  tub.parent = body;

  // yoke: a column with a horizontal bar, where the authored pose's hands land
  const col = MeshBuilder.CreateCylinder('aero_column', { diameter: 0.07, height: 0.5, tessellation: 8 }, ctx.scene);
  col.position.set(0, YOKE.y - 0.22, YOKE.z - 0.1);
  col.rotation.x = -YOKE.tiltDeg * Math.PI / 180;
  col.material = well;
  col.parent = body;
  const yoke = MeshBuilder.CreateBox('aero_yoke', { width: WHEEL_RADIUS * 2, height: 0.05, depth: 0.07 }, ctx.scene);
  yoke.position.set(0, YOKE.y, YOKE.z);
  yoke.material = well;
  yoke.parent = body;

  // a windscreen in front of the pilot's face, so the head reads as sheltered rather than bolted on
  const glass = new StandardMaterial('aero_glass', ctx.scene);
  glass.diffuseColor = Color3.FromHexString('#9fd7e8');
  glass.alpha = 0.42;
  glass.specularColor = Color3.FromHexString('#ffffff');
  const screen = MeshBuilder.CreateBox('aero_screen', { width: 0.8, height: 0.42, depth: 0.06 }, ctx.scene);
  screen.position.set(0, 0.92, 1.95);
  screen.rotation.x = -28 * Math.PI / 180;
  screen.material = glass;
  screen.parent = body;

  return body;
}

/** A rival's aircraft: the player's silhouette, simplified and tinted. No pilot — see buildRivalKart. */
function buildRivalPlane(ctx: ModeContext, name: string, tint: string): TransformNode {
  const rig = new TransformNode(`rival_${name}`, ctx.scene);
  const paint = new StandardMaterial(`rival_paint_${name}`, ctx.scene);
  paint.diffuseColor = Color3.FromHexString(tint);
  paint.specularColor = Color3.FromHexString('#222833');
  const box = (n: string, w: number, h: number, d: number, at: [number, number, number]): void => {
    const b = MeshBuilder.CreateBox(`${n}_${name}`, { width: w, height: h, depth: d }, ctx.scene);
    b.position.set(at[0], at[1], at[2]);
    b.material = paint;
    b.parent = rig;
  };
  box('rv_body', 1.5, 1.2, 7, [0, 0, 0]);
  box('rv_wing', 11, 0.22, 1.9, [0, 0.1, -0.3]);
  box('rv_tail', 3.4, 0.18, 1.0, [0, 0.35, -3.1]);
  box('rv_fin', 0.16, 1.5, 1.1, [0, 0.9, -3.1]);
  return rig;
}

/** One ring per gate, tinted so the NEXT one reads as the one to chase. */
function buildRings(ctx: ModeContext): Mesh[] {
  return course.gates.map((gate, i) => {
    const ring = MeshBuilder.CreateTorus(`aero_ring_${i}`, {
      diameter: gate.radius * 2, thickness: gate.radius * 0.13, tessellation: 28,
    }, ctx.scene);
    ring.position.copyFrom(gate.at);
    // a torus lies in XZ by default; stand it up facing the gate's direction
    ring.rotation.x = Math.PI / 2;
    ring.rotation.y = Math.atan2(gate.through.x, gate.through.z);
    const m = new StandardMaterial(`aero_ringMat_${i}`, ctx.scene);
    m.diffuseColor = Color3.FromHexString('#1b2233');
    m.emissiveColor = Color3.FromHexString('#1b2233');
    ring.material = m;
    return ring;
  });
}

/** Paint the ring we are chasing bright and the rest dim, so the course reads without a minimap. */
function tintRings(): void {
  rings.forEach((ring, i) => {
    const m = ring.material as StandardMaterial | null;
    if (!m) return;
    const next = i === race.next;
    m.emissiveColor = Color3.FromHexString(next ? '#ffd75e' : '#1b2233');
    m.diffuseColor = Color3.FromHexString(next ? '#6b5a22' : '#1b2233');
  });
}

function pushHud(ctx: ModeContext): void {
  if (!flight) return;
  const { dist } = toNextGate(race, course, flight.pos);
  const hud: Record<string, HudValue> = {
    speed: Math.round(flight.speed),
    altitude: Math.round(flight.pos.y),
    gate: `${Math.min(race.next + 1, course.gates.length)}/${course.gates.length}`,
    lap: `${Math.min(race.lap, course.laps)}/${course.laps}`,
    time: race.time.toFixed(1),
    toGate: Math.round(dist),
    pos: rivals.length ? `${ordinal(playerPosition(playerDist, rivals))} / ${rivals.length + 1}` : '',
    banner: S.banner,
    hint: 'STICK to fly · RT throttle · A boost · roll INTO the turn',
  };
  if (flight.stalled) hud.banner = 'STALL — NOSE DOWN';
  ctx.setHud(hud);
}

function finish(ctx: ModeContext): void {
  if (S.done) return;
  S.done = true;
  const medal = medalFor(course, race.time, race.finished);
  SoundKit.play(medal === 'none' ? 'miss' : 'score');
  ctx.juice.hitStop(90);
  say(medal === 'none' ? `FINISHED ${race.time.toFixed(1)}s` : `${medal.toUpperCase()} — ${race.time.toFixed(1)}s`, 2.4);
  pushHud(ctx);
  // stats are numbers only (ModeContext.end takes Record<string, number>), so the medal rides the OUTCOME
  ctx.end(race.finished ? `COMPLETE_${medal.toUpperCase()}` : 'OUT',
    Math.round(Math.max(0, course.gold * 2 - race.time) * 10), {
      seconds: Number(race.time.toFixed(2)), gates: race.passed, crashes: S.crashes, laps: race.lap,
    });
}

return {
  modeId: 'aeroaces',
  // A GETTER, read at mount after the course has been picked — see VelocityKartMode for why a plain value
  // would light every course for the first one.
  get mood(): ModeDefinition['mood'] { return readCourse('aero').mood; },
  camPreset: 'descent',

  async load(ctx: ModeContext): Promise<void> {
    S.done = false; S.crashes = 0; S.banner = ''; S.bannerT = 0;
    S.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, boost: false };

    // the course is DATA, so a map is a pick rather than a code path — and so is the aircraft
    course = readCourse('aero');
    FRAME = readPlane().spec;
    race = startRace();

    venueRoot = buildCourseVenue(ctx.scene, course);
    rings = buildRings(ctx);
    plane = buildPlane(ctx);

    // A BODY IN THE AIRCRAFT. Parented to the plane, so the airframe carries the pilot: the flight model
    // already owns position and attitude every frame and a parented body inherits both without a second copy
    // of that maths that could drift by a frame. The character's root is at its FEET and a seated pose does
    // not move it, so the root goes wherever puts the HIPS in the tub — subtracting the scaled REF_HIPS_Y
    // rather than eyeballing a height, which is the mistake that first put the kart's driver on the bodywork.
    pilot = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
      position: new Vector3(0, 0, 0), yawRad: 0, startClip: 'idle_stand',
    });
    pilot.animator.park();          // NOT stopAll — that fades to idle_stand and becomes a second owner
    pilot.root.parent = plane;
    pilot.root.scaling.setAll(PILOT_SCALE);
    pilot.root.position.set(0, PILOT_HIPS.y - REF_HIPS_Y * PILOT_SCALE, PILOT_HIPS.z);
    const seatClip = buildPoseClip(ctx.scene, pilot.skeleton, 'aero_seated', 0.5, seatedKeys());
    if (seatClip) { seatClip.start(true, 1, 0, 0.5, false); seated = seatClip; }
    else console.warn('[FEL-AERO] seated pose could not be built — the pilot stands');

    // the field: a simplified airframe per rival, tinted. Four in the air rather than the kart's five —
    // a ring course is read by looking THROUGH it, and a crowded sky hides the gate you are chasing.
    line = buildRaceLine(course);
    rivals = makeField(4, FRAME.cruise, 0.5);
    rivalPlanes = rivals.map((r) => buildRivalPlane(ctx, r.name, r.tint));
    playerDist = 0;

    flight = spawnFlight(course.start.at, course.start.heading, FRAME);
    prevPos.copyFrom(flight.pos);
    plane.position.copyFrom(flight.pos);

    ctx.heroRef.current = plane;
    ctx.objectiveRef.current = null;          // a chase cam has no second subject to frame
    ctx.camDirector.snapTo(flight.pos, null);
    tintRings();
    say(`${course.name} — ${course.sub}`, 2.2);

    // THE PROBE SEAM (2026-09-13). Every other mode in the tree publishes one and this had none, which is
    // exactly why "the autopilot never finished a lap" sat open: a probe could fly the aircraft but could
    // not see WHERE THE NEXT GATE IS, so it had nothing to steer at. The same shape as 1v1's
    // scene.metadata.onevone — read-only getters, development cost only.
    (ctx.scene.metadata ??= {}).aero = {
      state: () => {
        const g = course.gates[Math.min(race.next, course.gates.length - 1)];
        return {
          next: race.next, lap: race.lap, laps: course.laps, gates: course.gates.length,
          time: +race.time.toFixed(2), finished: race.finished,
          // `through` as well as the centre: a gate is PASSED by crossing its plane inside the radius going
          // the right way, so anything steering at the centre alone arrives at a random angle and can orbit
          // a ring forever without ever passing it (measured: a pursuit autopilot circled gate 3 for 150 s).
          nextGate: g ? { x: g.at.x, y: g.at.y, z: g.at.z, radius: g.radius,
                          through: { x: g.through.x, y: g.through.y, z: g.through.z } } : null,
          pos: flight ? { x: flight.pos.x, y: flight.pos.y, z: flight.pos.z } : null,
          speed: flight ? +flight.speed.toFixed(1) : 0,
          heading: flight ? +flight.heading.toFixed(3) : 0,
          crashes: S.crashes,
        };
      },
    };

    pushHud(ctx);
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    void ctx;
    if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }
    if (S.done) return;
    if (e.t === 'stick' && e.side === 'L') {
      // PITCH IS INVERTED on purpose: pulling the stick back raises the nose, which is how an aircraft works
      // and the opposite of how a walking character reads the same axis.
      S.input.pitch = e.y;
      S.input.roll = e.x;
      S.rolling = Math.abs(e.x) > 0.08;
      return;
    }
    if (e.t === 'trigger' && e.side === 'R') S.input.throttle = Math.max(0.15, e.value);
    if (e.t === 'trigger' && e.side === 'L') S.input.yaw = -e.value;      // rudder left
    if (e.t === 'button' && e.btn === 'A') S.input.boost = e.pressed;
    if (e.t === 'button' && e.btn === 'B' && e.pressed) S.input.yaw = 0;
  },

  update(ctx: ModeContext, dt: number): void {
    if (!flight || !plane || S.done) return;

    prevPos.copyFrom(flight.pos);
    stepFlight(flight, S.input, dt, FRAME);

    // THE FIELD MOVES. Rivals ride the racing line, which on an aero course runs THROUGH the rings — so a
    // rival ahead of you is a rival you can see taking the gate you are about to take, which is the whole
    // reason to put opponents in a time-attack course.
    playerDist += flight.speed * dt;
    if (line) {
      for (const [i, r] of rivals.entries()) {
        stepRival(r, line, dt, playerDist, { topSpeed: FRAME.cruise, cornerBite: 0.35 }, race.time);
        const at = rivalPlacement(r, line);
        const rp = rivalPlanes[i];
        if (rp) { rp.position.copyFrom(at.pos); rp.rotation.y = at.heading; }
      }
    }
    if (!S.rolling) levelOut(flight, dt);    // hands off, the wings come level

    // the world has edges, and hitting one is a crash that costs speed rather than ending the run
    if (clampFlight(flight, FLOOR, CEILING, HALF_WORLD)) {
      S.crashes += 1;
      flight.speed *= 0.45;
      SoundKit.play('impact', { pitch: 0.7, volume: 0.5 });
      ctx.juice.shake(0.12, 160);
      ctx.feel.impact(0.5);
      EffectsKit.burst(ctx.scene, flight.pos.clone(), 'dust');
      say('SCRAPED IT', 0.8);
    }

    plane.position.copyFrom(flight.pos);
    plane.rotation.set(-flight.pitch, flight.heading, -flight.roll);

    // THE GATES. Fed the travel segment, not the position, because at 100 m/s an aircraft crosses a 26 m ring
    // inside a single frame and a point test would miss nearly all of them.
    const res = stepRace(race, course, prevPos, flight.pos, dt);
    if (res.gate) {
      SoundKit.play('score', { pitch: res.lap ? 1.2 : 1 });
      ctx.feel.impact(0.25);
      EffectsKit.burst(ctx.scene, flight.pos.clone(), 'sparks');
      say(res.lap ? `LAP ${Math.min(race.lap, course.laps)}` : 'GATE', 0.7);
      tintRings();
    }
    if (res.finished) { finish(ctx); return; }

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    const vel = noseOf(flight).scale(flight.speed);
    ctx.camDirector.look(S.lookX, S.lookY, dt);
    ctx.camDirector.update(flight.pos, vel, null);
    pushHud(ctx);
  },

  dispose(): void {
    plane?.dispose(); plane = null;
    seated?.dispose(); seated = null;
    pilot?.dispose(); pilot = null;
    for (const rp of rivalPlanes) rp.dispose();
    rivalPlanes = []; rivals = []; line = null;
    venueRoot?.dispose(); venueRoot = null;
    for (const r of rings) r.dispose();
    rings = [];
    flight = null;
  },
};
}

export const AeroAcesMode: ModeDefinition = makeAeroAcesMode();
