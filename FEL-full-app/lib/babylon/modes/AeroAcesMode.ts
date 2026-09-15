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

import { stepSpeedFov } from '../core/SpeedFov';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost (rings, low passes, overtakes fill it)
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
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
import { buildTrackside, type TracksideHandle } from '../racing/trackside';   // the world that follows the racing line
import { readProfile, profileFor, DEFAULT_TIER } from '../core/Difficulty';
import {
  buildRaceLine, makeField, stepRival, rivalPlacement, playerPosition, ordinal, fieldLeaderDone, stepFinishGrace,
  type RaceLine, type Rival,
} from '../racing/RaceField';
import { readPlane } from '../racing/garage';

/** The picked airframe. Defaults to the trainer, so a mode with no pick flies exactly as it was tuned. */
let FRAME: Airframe = AERO_TRAINER;
/** The world's lid, floor and walls. clampFlight holds the aircraft inside them. */
const CEILING = 520, FLOOR = 14, HALF_WORLD = 700;

/** The camera preset's resting fov, captured on the first frame after load and restored to by SpeedFov. */
let baseFov: number | null = null;
/** Last frame's finishing place, so an OVERTAKE can be detected as a change rather than a state. */
let lastPlace = 0;

export function makeAeroAcesMode(): ModeDefinition {
let plane: TransformNode | null = null;
let venueRoot: TransformNode | null = null;
let trackside: TracksideHandle | null = null;
let pilot: SpawnedCharacter | null = null;
/** The propeller, spun in update — a still prop on a flying aircraft reads as a model on a stick. */
let propHub: TransformNode | null = null;
let seated: AnimationGroup | null = null;
// THE FIELD. Same module the karts use — see racing/RaceField.ts. Rivals fly the racing line as PACERS
// rather than running the flight model: an AI that actually flies needs stall recovery, and an aircraft
// recovering badly in front of the player is worse than no aircraft at all.
let line: RaceLine | null = null;
let rivals: Rival[] = [];
let rivalPlanes: TransformNode[] = [];
let playerDist = 0;
let tier = profileFor(DEFAULT_TIER);
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
  boostHeld: false,
  /** THE FINISH CLOCK (MECHANICS PASS): seconds left to the line once the field's leader is home; null = not running. */
  graceLeft: null as number | null,
};
let boost = new BoostKit();
let boostFx: BoostFx | null = null;
let boostRings: BoostPads | null = null;
/** Below this height over the floor, flying fast is a LOW PASS and pays into the boost. */
const LOW_PASS_M = 22;

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

/**
 * SHAPE, NOT DECALS (2026-09-13, owner: "we need to do a visual upgrades on the karts and planes").
 *
 * The aircraft was five flat boxes and photographed exactly like that — a white slab with rectangular wings,
 * reading as a paper cutout against the sky. The single biggest win on a vehicle seen in silhouette against
 * open air is the SILHOUETTE, so that is where the work goes: a round tapered fuselage, tapered swept wings
 * with dihedral and winglets, a spinner and a turning propeller, and a fin with a real leading edge.
 *
 * THE TAPER TRICK, because it is not obvious: Babylon has no tapered box. `CreateCylinder` with
 * `tessellation: 4` is a four-sided prism, and giving it a different top and bottom diameter makes it
 * TAPERED — lay it on its side, flatten one axis, and that is a wing with a root chord, a tip chord and a
 * thickness, for one draw call. Everything wing-shaped on this aircraft is that one primitive.
 */
const PROP_RPM = 12;    // radians/sec of the spinner, fast enough to blur, slow enough not to strobe

/**
 * A tapered plank — the wing/fin primitive. See the header.
 *
 * THE ROOT SITS AT THE ORIGIN and the tip extends to +X. That matters and the first version got it wrong:
 * baking a centred cylinder left the root at −X for both wings, so the LEFT wing was mounted tip-first —
 * photographed, it tapered the wrong way and the aircraft was visibly asymmetric. With the root at the
 * origin a wing is placed at the fuselage skin and mirrored with a negative x scale, which cannot be
 * lopsided by construction.
 */
function taperedPlank(
  ctx: ModeContext, name: string,
  span: number, rootChord: number, tipChord: number, thickness: number,
): Mesh {
  const m = MeshBuilder.CreateCylinder(name, {
    height: span, diameterBottom: rootChord, diameterTop: tipChord, tessellation: 4,
  }, ctx.scene);
  m.rotation.z = -Math.PI / 2;                   // +Y (tip) maps to +X
  m.position.x = span / 2;                       // root to the origin
  m.bakeCurrentTransformIntoVertices();
  m.scaling.y = thickness / Math.max(rootChord, tipChord);
  return m;
}

function buildPlane(ctx: ModeContext): TransformNode {
  const rig = new TransformNode('aero_body', ctx.scene);

  // PBR with the environment pulled down — the same lesson the kart's paint and the tarmac both taught:
  // these venues light for PBR and an aircraft the camera sits behind takes the sky straight across its
  // flanks unless the IBL is reined in.
  const shell = VenueKit.paint(ctx.scene, 'aero_shell', '#e8ecf4', 0.05, 0.34);
  shell.environmentIntensity = 0.45; shell.specularIntensity = 0.7; shell.metallic = 0.25;
  const accent = VenueKit.paint(ctx.scene, 'aero_accent', '#22d3ee', 0.18, 0.4);
  accent.environmentIntensity = 0.45;
  const dark = VenueKit.paint(ctx.scene, 'aero_dark', '#171b22', 0.04, 0.6);
  dark.environmentIntensity = 0.3; dark.metallic = 0.5;

  // ── fuselage: a round barrel with a nose cone and a tail cone, not a box ──
  const barrel = MeshBuilder.CreateCylinder('aero_fuse', { height: 4.2, diameter: 1.15, tessellation: 14 }, ctx.scene);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.1;
  barrel.material = shell;
  barrel.parent = rig;

  const nose = MeshBuilder.CreateCylinder('aero_nose', { height: 1.7, diameterBottom: 1.15, diameterTop: 0.32, tessellation: 14 }, ctx.scene);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 3.05;
  nose.material = shell;
  nose.parent = rig;

  // −PI/2 like the nose: the WIDE end has to meet the fuselage. With +PI/2 it flared the other way and the
  // tail opened out into a funnel.
  const tailCone = MeshBuilder.CreateCylinder('aero_tailcone', { height: 1.9, diameterBottom: 1.15, diameterTop: 0.26, tessellation: 14 }, ctx.scene);
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.scaling.z = -1;                       // point it aft
  tailCone.position.z = -2.95;
  tailCone.material = shell;
  tailCone.parent = rig;

  // ── wings: tapered, swept back, with dihedral and winglets ──
  for (const side of [-1, 1]) {
    const wing = taperedPlank(ctx, `aero_wing_${side > 0 ? 'r' : 'l'}`, 4.4, 1.9, 0.95, 0.16);
    wing.position.set(side * 0.5, -0.05, -0.15);   // root at the fuselage skin
    wing.scaling.x = side;                          // mirror, so both roots meet the body
    wing.rotation.y = side * -0.12;                 // sweep back
    wing.rotation.z = side * 0.05;                  // dihedral
    wing.material = accent;
    wing.parent = rig;

    // PARENTED TO THE WING, not placed in body space. Positioned independently they floated off the tips —
    // the wing sweeps back and has dihedral, so its tip is nowhere near the x it started at, and matching
    // that by hand is a sum that goes stale the moment the sweep is retuned. At the wing's own local
    // +X = span it rides the tip whatever the wing does.
    const winglet = taperedPlank(ctx, `aero_winglet_${side > 0 ? 'r' : 'l'}`, 0.5, 0.75, 0.3, 0.09);
    winglet.rotation.z = -Math.PI / 2;              // stand it up from the tip
    winglet.position.set(4.4, 0, 0);
    winglet.material = accent;
    winglet.parent = wing;
  }

  // ── tail: a tapered stabiliser and a swept fin ──
  for (const side of [-1, 1]) {
    const stab = taperedPlank(ctx, `aero_stab_${side > 0 ? 'r' : 'l'}`, 1.2, 0.95, 0.5, 0.11);
    stab.position.set(side * 0.2, 0.18, -3.25);
    stab.scaling.x = side;
    stab.material = accent;
    stab.parent = rig;
  }

  const fin = taperedPlank(ctx, 'aero_fin', 1.25, 1.15, 0.42, 0.1);
  fin.rotation.z = -Math.PI / 2;                 // root down, tip up
  fin.position.set(0, 0.3, -3.3);
  fin.rotation.x = -0.2;                         // leading edge raked back
  fin.material = accent;
  fin.parent = rig;

  // ── spinner and propeller ──
  const spinner = MeshBuilder.CreateCylinder('aero_spinner', { height: 0.5, diameterBottom: 0.32, diameterTop: 0.05, tessellation: 12 }, ctx.scene);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = 4.05;
  spinner.material = dark;
  spinner.parent = rig;

  const hub = new TransformNode('aero_prop_hub', ctx.scene);
  hub.position.z = 3.95;
  hub.parent = rig;
  // the blades radiate in the hub's XY plane so the disc faces forward; `rotation.y` would have turned them
  // edge-on to the camera, which is why the first pass photographed a bare spinner and no propeller
  for (const i of [0, 1, 2]) {
    const blade = taperedPlank(ctx, `aero_blade_${i}`, 1.15, 0.26, 0.12, 0.05);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    blade.rotation.x = 0.35;                     // a little pitch, so it reads as a blade not a stick
    blade.material = dark;
    blade.parent = hub;
  }
  propHub = hub;

  // ── the cockpit the pilot actually sits in, on the top of the barrel ──
  const tub = MeshBuilder.CreateBox('aero_cockpit', { width: 0.8, height: 0.46, depth: 1.7 }, ctx.scene);
  tub.position.set(0, 0.44, 0.95);
  tub.material = dark;
  tub.parent = rig;

  const col = MeshBuilder.CreateCylinder('aero_column', { diameter: 0.07, height: 0.5, tessellation: 8 }, ctx.scene);
  col.position.set(0, YOKE.y - 0.22, YOKE.z - 0.1);
  col.rotation.x = -YOKE.tiltDeg * Math.PI / 180;
  col.material = dark;
  col.parent = rig;
  const yoke = MeshBuilder.CreateBox('aero_yoke', { width: WHEEL_RADIUS * 2, height: 0.05, depth: 0.07 }, ctx.scene);
  yoke.position.set(0, YOKE.y, YOKE.z);
  yoke.material = dark;
  yoke.parent = rig;

  const glass = new StandardMaterial('aero_glass', ctx.scene);
  glass.diffuseColor = Color3.FromHexString('#9fd7e8');
  glass.alpha = 0.4;
  glass.specularColor = Color3.FromHexString('#ffffff');
  const screen = MeshBuilder.CreateBox('aero_screen', { width: 0.72, height: 0.4, depth: 0.06 }, ctx.scene);
  screen.position.set(0, 0.88, 1.85);
  screen.rotation.x = -30 * Math.PI / 180;
  screen.material = glass;
  screen.parent = rig;

  return rig;
}

/**
 * A rival's aircraft: the player's silhouette, tinted.
 *
 * Deliberately the SAME build rather than a cheaper one — a field of visibly worse aircraft reads as
 * placeholder art, and the taper trick costs the same either way. No pilot and no propeller: five more
 * skinned humanoids is frame budget spent on bodies nobody looks at, and a spinning prop on a rival 200 m
 * away is invisible.
 */
function buildRivalPlane(ctx: ModeContext, name: string, tint: string): TransformNode {
  const rig = new TransformNode(`rival_${name}`, ctx.scene);
  const shell = VenueKit.paint(ctx.scene, `rival_shell_${name}`, '#dfe5ef', 0.05, 0.36);
  shell.environmentIntensity = 0.45; shell.metallic = 0.25;
  const accent = VenueKit.paint(ctx.scene, `rival_accent_${name}`, tint, 0.18, 0.4);
  accent.environmentIntensity = 0.45;

  const barrel = MeshBuilder.CreateCylinder(`rv_fuse_${name}`, { height: 4.2, diameter: 1.15, tessellation: 10 }, ctx.scene);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.1; barrel.material = shell; barrel.parent = rig;
  const nose = MeshBuilder.CreateCylinder(`rv_nose_${name}`, { height: 1.7, diameterBottom: 1.15, diameterTop: 0.32, tessellation: 10 }, ctx.scene);
  nose.rotation.x = -Math.PI / 2; nose.position.z = 3.05; nose.material = shell; nose.parent = rig;
  const tailCone = MeshBuilder.CreateCylinder(`rv_tailcone_${name}`, { height: 1.9, diameterBottom: 1.15, diameterTop: 0.26, tessellation: 10 }, ctx.scene);
  tailCone.rotation.x = -Math.PI / 2; tailCone.scaling.z = -1; tailCone.position.z = -2.95; tailCone.material = shell; tailCone.parent = rig;

  for (const side of [-1, 1]) {
    const wing = taperedPlank(ctx, `rv_wing_${side > 0 ? 'r' : 'l'}_${name}`, 4.4, 1.9, 0.95, 0.16);
    wing.position.set(side * 0.5, -0.05, -0.15);
    wing.scaling.x = side;
    wing.rotation.y = side * -0.12; wing.rotation.z = side * 0.05;
    wing.material = accent; wing.parent = rig;
    const stab = taperedPlank(ctx, `rv_stab_${side > 0 ? 'r' : 'l'}_${name}`, 1.2, 0.95, 0.5, 0.11);
    stab.position.set(side * 0.2, 0.18, -3.25); stab.scaling.x = side;
    stab.material = accent; stab.parent = rig;
  }
  const fin = taperedPlank(ctx, `rv_fin_${name}`, 1.25, 1.15, 0.42, 0.1);
  fin.rotation.z = -Math.PI / 2; fin.position.set(0, 0.3, -3.3); fin.rotation.x = -0.2;
  fin.material = accent; fin.parent = rig;
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
    hint: 'STICK to fly · RT throttle · roll INTO the turn · hold RB / Shift to BOOST',
    ...boost.hud(),
  };
  if (flight.stalled) hud.banner = 'STALL — NOSE DOWN';
  ctx.setHud(hud);
}

function finish(ctx: ModeContext): void {
  if (S.done) return;
  S.done = true;
  const medal = medalFor(course, race.time, race.finished);
  const place = rivals.length ? playerPosition(playerDist, rivals) : 1;
  SoundKit.play(medal === 'none' ? 'miss' : 'score');
  ctx.juice.hitStop(90);
  // the result says WHERE you placed as well as the clock's medal, and a race you did not finish says so
  const placeTag = rivals.length ? `${ordinal(place)} · ` : '';
  say(!race.finished ? `OUT OF TIME — ${placeTag}DNF` : medal === 'none' ? `${placeTag}FINISHED ${race.time.toFixed(1)}s` : `${placeTag}${medal.toUpperCase()} — ${race.time.toFixed(1)}s`, 2.4);
  pushHud(ctx);
  // stats are numbers only (ModeContext.end takes Record<string, number>), so the medal rides the OUTCOME
  ctx.end(race.finished ? `COMPLETE_${medal.toUpperCase()}` : 'OUT',
    Math.round(Math.max(0, course.gold * 2 - race.time) * 10), {
      seconds: Number(race.time.toFixed(2)), gates: race.passed, place, field: rivals.length + 1, crashes: S.crashes, laps: race.lap,
    });
}

return {
  modeId: 'aeroaces',
  // A GETTER, read at mount after the course has been picked — see VelocityKartMode for why a plain value
  // would light every course for the first one.
  get mood(): ModeDefinition['mood'] { return readCourse('aero').mood; },
  camPreset: 'descent',

  async load(ctx: ModeContext): Promise<void> {
    // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's,
    // and must not inherit last race's finishing place (which would read as an overtake on frame one).
    baseFov = null;
    lastPlace = 0;
    S.done = false; S.crashes = 0; S.banner = ''; S.bannerT = 0; S.graceLeft = null;
    S.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, boost: false, boostK: 0 };
    S.boostHeld = false; boost = new BoostKit(0.25);   // a quarter tank on the grid, so the first straight can use it

    // the course is DATA, so a map is a pick rather than a code path — and so is the aircraft
    course = readCourse('aero');
    FRAME = readPlane().spec;
    race = startRace();

    venueRoot = buildCourseVenue(ctx.scene, course);
    // THE VENUE IS COURT-SIZED AND THE COURSE IS HUNDREDS OF METRES, so the world was a small island near
    // the start and the rest of the lap ran off into nothing (step-0 audit: this mode was one of the two
    // worst frames in the project). Trackside dresses the PATH instead, at whatever scale the course is.
    trackside?.dispose();
    trackside = buildTrackside(ctx.scene, course);
    console.info(`[RACE-VENUE] ${course.id}: ${trackside.count} trackside instances`);
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
    tier = readProfile();
    rivals = makeField(4, FRAME.cruise, tier.edge);
    rivalPlanes = rivals.map((r) => buildRivalPlane(ctx, r.name, r.tint));
    playerDist = 0;

    flight = spawnFlight(course.start.at, course.start.heading, FRAME);
    prevPos.copyFrom(flight.pos);
    plane.position.copyFrom(flight.pos);

    // BOOST (FINISH-RELEASE): the trail streams off the airframe; a gold boost ring hangs halfway between every other
    // pair of gates, at the height of the line, so taking it is part of flying the course well.
    boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: plane, trailWidth: 1.6, color: '#ffd75e' });
    boostRings?.dispose();
    {
      const spots = [];
      for (let i = 1; i < course.gates.length; i += 2) {
        const a = course.gates[i - 1], b = course.gates[i];
        const at = a.at.add(b.at.subtract(a.at).scale(0.5));
        spots.push({ pos: at, yaw: Math.atan2(b.at.x - a.at.x, b.at.z - a.at.z), kind: 'ring' as const, radius: 9 });
      }
      boostRings = new BoostPads(ctx.scene, spots, '#ffd75e');
    }
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
    // BOOST is the shared held R1 (RB · Shift · the BOOST pill).
    if (e.t === 'button' && e.btn === 'R1') S.boostHeld = e.pressed;
    if (e.t === 'button' && e.btn === 'B' && e.pressed) S.input.yaw = 0;
  },

  update(ctx: ModeContext, dt: number): void {
    if (!flight || !plane || S.done) return;

    prevPos.copyFrom(flight.pos);
    const bev = boost.update(dt, S.boostHeld, !flight.stalled);
    S.input.boostK = boost.k;
    stepFlight(flight, S.input, dt, FRAME);
    // the propeller turns with the throttle — a still prop on a flying aircraft reads as a model on a stick
    if (propHub) propHub.rotation.z += PROP_RPM * (0.35 + S.input.throttle * 0.65) * dt;

    // THE FIELD MOVES. Rivals ride the racing line, which on an aero course runs THROUGH the rings — so a
    // rival ahead of you is a rival you can see taking the gate you are about to take, which is the whole
    // reason to put opponents in a time-attack course.
    playerDist += flight.speed * dt;
    // AN OVERTAKE IS THE HIGHLIGHT OF A RACE, and neither racing mode could see one happen -- both reported
    // nothing into the Game-Breaker layer, so the crowd was as loud in last as in first. `playerPosition`
    // already exists and the HUD already prints it; this only remembers last frame's. Improving a place
    // sings; losing one is quiet, because falling back is punishment enough and a jeer on every trade of
    // places during a scrap would be constant.
    if (rivals.length) {
      const place = playerPosition(playerDist, rivals);
      if (lastPlace > 0 && place < lastPlace) { ctx.momentum.report({ kind: 'overtake', weight: 13 * (lastPlace - place) }); boost.earn('nearMiss', lastPlace - place); }
      lastPlace = place;
    }
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
      ctx.momentum.report({ kind: 'blunder', weight: -14 });   // scraping the world costs the run its heat
      flight.speed *= 0.45;
      SoundKit.play('impact', { pitch: 0.7, volume: 0.5 });
      ctx.juice.shake(0.12, 160);
      ctx.feel.impact(0.5);
      EffectsKit.burst(ctx.scene, flight.pos.clone(), 'dust');
      say('SCRAPED IT', 0.8);
    }

    plane.position.copyFrom(flight.pos);
    plane.rotation.set(-flight.pitch, flight.heading, -flight.roll);
    // a fast LOW PASS pays into the boost, a little every second you hold it
    if (flight.pos.y < FLOOR + LOW_PASS_M && flight.speed > FRAME.cruise * 0.8) boost.earnOver('nearMiss', dt, 3);
    if (boostRings && boostRings.update(dt, flight.pos, boost) > 0) say('BOOST RING', 0.5);
    boostFx?.update(dt, boost, bev);
    if (bev.started) { ctx.feel.impact(0.3); say('BOOST!', 0.6); }
    if (bev.full) say('BOOST READY', 0.8);

    // THE GATES. Fed the travel segment, not the position, because at 100 m/s an aircraft crosses a 26 m ring
    // inside a single frame and a point test would miss nearly all of them.
    // THE RACE ENDS FOR EVERYONE — see RaceField.stepFinishGrace. Checked before the player's own gates so a player
    // crossing the line on the clock's last frame still finishes rather than being called out.
    if (line && rivals.length) {
      const leader = S.graceLeft === null ? fieldLeaderDone(rivals, line, course.laps) : null;
      const g = stepFinishGrace(S.graceLeft, dt, !!leader);
      S.graceLeft = g.left;
      if (g.started && leader) { SoundKit.play('whistle'); say(`${leader.name} FINISHED — ${Math.ceil(g.left ?? 0)}s TO THE LINE`, 1.8); }
      else if (g.tick !== null && g.tick > 0 && g.tick <= 5) { SoundKit.play('uiTick', { pitch: 1 + (5 - g.tick) * 0.08 }); say(`FINISH IN ${g.tick}`, 0.9); }
    }
    const res = stepRace(race, course, prevPos, flight.pos, dt);
    if (res.gate) {
      SoundKit.play('score', { pitch: res.lap ? 1.2 : 1 });
      ctx.feel.impact(0.25);
      EffectsKit.burst(ctx.scene, flight.pos.clone(), 'sparks');
      say(res.lap ? `LAP ${Math.min(race.lap, course.laps)}` : 'GATE', 0.7);
      boost.earn('ring');
      tintRings();
    }
    if (res.finished || S.graceLeft === 0) { finish(ctx); return; }

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    const vel = noseOf(flight).scale(flight.speed);
    ctx.camDirector.look(S.lookX, S.lookY, dt);
    ctx.camDirector.update(flight.pos, vel, null);
    // SPEED YOU CANNOT SEE IS NOT SPEED. The lens widens toward top speed and eases back, normalised
    // against THIS mode's ceiling so flat-out feels the same in every discipline. Frame-independent:
    // see SpeedFov (a per-frame lerp settles 2.4x faster at 144 fps than at 60).
    baseFov ??= ctx.camera.fov;
    ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boost) ?? 1), flight.speed, FRAME.vMax, dt);
    pushHud(ctx);
  },

  dispose(): void {
    boostFx?.dispose(); boostFx = null; boostRings?.dispose(); boostRings = null;
    plane?.dispose(); plane = null;
    seated?.dispose(); seated = null;
    pilot?.dispose(); pilot = null;
    propHub = null;
    for (const rp of rivalPlanes) rp.dispose();
    rivalPlanes = []; rivals = []; line = null;
    venueRoot?.dispose(); venueRoot = null; trackside?.dispose(); trackside = null;
    for (const r of rings) r.dispose();
    rings = [];
    flight = null;
  },
};
}

export const AeroAcesMode: ModeDefinition = makeAeroAcesMode();
