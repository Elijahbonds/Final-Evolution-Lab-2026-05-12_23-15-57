// VELOCITY KART — the karting mode (2026-09-12).
//
// Owner: "karting? maps? gameplay?". Velocity Kart had NEVER existed here — "retired by decision, do not
// resurrect" (docs/ASSESSMENT-2026-09-04.md:42, MASTER_MODE_LIST.md:77). Built, not revived.
//
// Same three-layer split as Aero Aces, and for the same reason: KartModel owns the handling (grip, slip, the
// drift that banks boost, the understeer tax that makes drifting the fast line), RaceCourse owns the map and
// the loop (checkpoints in order, laps, the clock, the medal, and the ROAD — the road is the polyline through
// the checkpoints, so the track and the gates can never disagree about where the course goes). This file is
// only the face.
//
// The kart is primitives, like the aircraft and for the same reason: there is no kart in public/models/meshy,
// and the no-placeholder rule here is about BODIES, not vehicles.

import { stepSpeedFov } from '../core/SpeedFov';
import { GhostRecorder, deltaLabel, deltaMs, loadGhost, saveIfFaster, type Ghost } from '../racing/ghost';
import { cupForCourse, cupProgress, loadResults, recordResult } from '../racing/championship';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost (drift fills it, RB/Shift burns it)
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { Onlookers } from '../visual/Onlookers';
import { Color3, DynamicTexture, Mesh,
  MeshBuilder, PBRMaterial, Texture, TransformNode, Vector3, Vector4 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { buildPoseClip, REF_HIPS_Y } from '../anim/poseClip';
import { seatedKeys, driverLean, WHEEL_RADIUS, STEER_LOCK_RAD } from '../anim/authored/seated';
import type { AnimationGroup } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  KART_STARTER, MAX_SLIP, spawnKart, stepKart, travelOf, driftQuality, kartHitWall,
  type KartInput, type KartState, type KartSpec,
} from '../core/KartModel';
import {
  KART_COURSES, readCourse, startRace, stepRace, toNextGate, medalFor, onTrack, TRACK_HALF_WIDTH, courseLength,
  type Course, type RaceProgress,
} from '../core/RaceCourse';
import { buildCourseVenue, buildWorldGround, worldHeightFn } from '../racing/venueForCourse';
import { kartCircuitById, type KartCircuit, type KartRamp } from '../racing/kartCircuits';
import { locate, pointAlong, cornerRadiusAt, holdableSpeed } from '../racing/racingLine';
import { edgeLimit, edgeReturn } from '../racing/courseEdge';   // the outside of the course: off-road is a cost, not a door out
import { steerLane, resolveContact, nearMisses, personalityFor, CONTACT } from '../racing/RaceContact';   // RACE CONTACT (2026-09-18): rivals with intent, bumps and punts
import { collectBalloon, balloonsHit, stepBalloons, useItem, stepMissiles, stepMines, ITEM_KINDS, ITEM_LABEL, type Balloon, type HeldItem, type Missile, type Mine, type ItemKind, type Target } from '../racing/AeroItems';   // the kart's items are the flyers' items on the road
import { AeroPickups } from '../racing/aeroPickups';
import {
  buildKerbs, buildObstacles, obstacleContact, placeObstacles, stillTouching,
  type PlacedObstacle, buildChevrons, buildGantry, kartSceneryFor, buildForest, buildEdgeLights } from '../racing/kartDressing';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';
import { VENUE_PROP_SETS } from '../visual/venuePropSets';
import { refuse } from '../core/Refusal';
import { stepDraft, noDraft, DRAFT, type DraftState } from '../racing/Slipstream';   // racing pass phase 7
import { stepMini, noMini, MINI_ZIP_SEC, MINI_LABEL, MINI_COLOR, type MiniState } from '../racing/MiniTurbo';   // racing pass phase 8
import { newStart, stepStart, beatLabel, ROCKET_ZIP_SEC, BURNOUT_SEC, BURNOUT_THROTTLE, type StartState, type StartOutcome } from '../racing/RaceStart';   // racing pass phase 4
import {
  boostEarnFor, crossedLip, idleAir, launch, startTrick, stepAir, type KartAirState,
} from '../core/KartAir';
import { buildTrackside, type TracksideHandle } from '../racing/trackside';   // the world that follows the racing line
import { readProfile, profileFor, DEFAULT_TIER } from '../core/Difficulty';
import { taperedPlank, taperedSection, roadWheel } from '../racing/shapes';
import {
  buildRaceLine, makeField, stepRival, rivalPlacement, playerPosition, ordinal, fieldLeaderDone, stepFinishGrace, fieldFor, aroundCall, gapLine, raceLineFromPoints, lapProgress,
  type RaceLine, type Rival,
} from '../racing/RaceField';
import { readKart } from '../racing/garage';
import { dressVehicle } from '../racing/vehicleBody';   // models pass phase 5: the Meshy kart bodies over the primitives

/** A kart is small; a full-size body swamps it. */
const DRIVER_SCALE = 0.92;

/** The camera preset's resting fov, captured on the first frame after load and restored to by SpeedFov. */
let baseFov: number | null = null;
/** Last frame's finishing place, so an OVERTAKE can be detected as a change rather than a state. */
let lastPlace = 0;
let driftCallT = 0;
let offRoadTick = 0;
let offRoadSaid = false;

export function makeVelocityKartMode(): ModeDefinition {
let kart: TransformNode | null = null;
let marks: Mesh[] = [];
let road: Mesh[] = [];
let course: Course = KART_COURSES[0];
/** The circuit the course was derived from: its road width, ramps, obstacles and kerbs. */
let circuit: KartCircuit | null = kartCircuitById(KART_COURSES[0].id);
let state: KartState | null = null;
let driver: SpawnedCharacter | null = null;
let seated: AnimationGroup | null = null;
let steerWheel: Mesh | null = null;
let venueRoot: TransformNode | null = null;
let worldGround: Mesh | null = null;
let trackside: TracksideHandle | null = null;
let crowd: Onlookers | null = null;
let roadTex: DynamicTexture | null = null;
// THE FIELD (2026-09-13). This mode shipped as a time trial: a clock does not overtake you on the last
// corner, and Phase 0 recorded it as the one racing mode with no opponent of any kind. The rivals are
// PACERS, not drivers — they advance along the racing line at a believable pace rather than running the
// handling model, which means they can never spin, wall themselves or drive the wrong way, and from a chase
// camera the difference is invisible. See racing/RaceField.ts for why that is the honest trade.
let line: RaceLine | null = null;
let rivals: Rival[] = [];
let rivalKarts: TransformNode[] = [];
// RACE CONTACT + ITEMS (2026-09-18). A rival's home lane (its personality steers off it), its spin, the per-pair bump
// cooldown, the near-miss latch, and its item kit — the same kit the Aero Aces field carries.
let rivalHome: number[] = [];
let rivalStun: number[] = [];
let rivalCool: number[] = [];
/** Which rivals the player is still touching — a grind along a rival is ONE bump, not one a frame. */
let rivalTouch: boolean[] = [];
/** Throttles the "back to the track" nudge's sound and shake while the ground is pulling the kart in. */
let edgeCool = 0;
let rivalAlongside: boolean[] = [];
interface RivalKit { item: HeldItem | null; itemAt: number; shieldT: number; zipT: number; nextRow: number; lap: number }
let rivalKits: RivalKit[] = [];
let balloons: Balloon[] = [];
let missiles: Missile[] = [];
let mines: Mine[] = [];
let rowDists: number[] = [];
let pickups: AeroPickups | null = null;
const PLAYER_ID = 0;
/** The kart's items sit lower and smaller than the flyers': a balloon is 1.4 m across, not 3.4. */
const KART_PICKUP_SCALE = 0.42;
/** The player's own distance along the racing line — what the standings are computed against. */
let playerDist = 0;

// THE GHOST (2026-09-19 depth pass). The mode had a clock and medals and no memory: once the gold was gone there was
// nothing left on the course to chase. The recorder runs every frame, the best lap per course is kept on the device,
// and the HUD carries the delta AT THE CURRENT DISTANCE — the only comparison that means anything (racing/ghost).
let ghostRec: GhostRecorder | null = null;
let bestGhost: Ghost | null = null;
let ghostDelta: number | null = null;
let kartId = '';
// THE CUP (2026-09-20). Seven courses that had never heard of each other: every race was an island with a medal on
// it. The season was built and tested and nothing rendered it, which is the same gap this pass has been closing
// everywhere else — so the kart records its round at the flag and carries the standings into the next one.
let cupLine = '';
let tier = profileFor(DEFAULT_TIER);
/** The picked kart's handling. Defaults to the starter, so a mode with no pick is byte-identical to before. */
let kartSpec: KartSpec = KART_STARTER;
/** The edge of the world the kart can drive to — inside the world ground and outside every course. */
const WORLD_WALL = 400;
/** How far above the tier's edge the kart field is paced (racing pass phase 6, measured — see the field's build). */
const KART_FIELD_EDGE = 0.15;
/** The world ground's relief under (x, z), for the courses that have any — what the kart rides off the road. */
let worldHeight: ((x: number, z: number) => number) | null = null;
let race: RaceProgress = startRace();
const prevPos = new Vector3();

const S = {
  input: { steer: 0, throttle: 0, brake: 0, drift: false, fire: false } as KartInput,
  banner: '', bannerT: 0,
  done: false,
  bestDrift: 0,
  offRoadSec: 0,
  lookX: 0, lookY: 0,
  boostHeld: false,
  /** The left stick's y, kept because a trick is a stick DIRECTION and steer only carries x. */
  stickY: 0,
  /** Air off a ramp: the launch, the trick, the landing. Grounded most of the time. */
  air: idleAir() as KartAirState,
  /** Distance along the racing line last frame, for spotting a ramp lip being crossed. */
  lastDist: null as number | null,
  /** The solid we are currently resting against, so one clip is not sixty scrubs a second. */
  touching: null as PlacedObstacle | null,
  /** THE FINISH CLOCK (MECHANICS PASS): seconds left to the line once the field's leader is home; null = not running. */
  graceLeft: null as number | null,
  // ITEMS + CONTACT (2026-09-18)
  held: null as HeldItem | null, shieldT: 0, zipT: 0, spinT: 0,
  events: { bumps: 0, punts: 0, punted: 0, nearMisses: 0, fired: 0, hits: 0, picked: 0, slingshots: 0, minis: 0 },
  /** SLIPSTREAM (phase 7): the wake's charge behind the rival ahead, and whether this tow has been called. */
  draft: noDraft() as DraftState, draftSaid: false,
  /** MINI-TURBO (phase 8): the slide's clean seconds and the spark tier they have reached. */
  mini: noMini() as MiniState,
  // THE START (racing pass phase 4): the countdown, and the burnout's seconds of lost drive after a too-early throttle
  start: newStart() as StartState, burnT: 0,
  /** Seconds the nose has pointed back down the line (racing pass phase 5: WRONG WAY, as the plane already had). */
  wrongT: 0,
};
let boost = new BoostKit();
let boostFx: BoostFx | null = null;
let boostPads: BoostPads | null = null;
let ramps: Mesh[] = [];
let kerbRoot: TransformNode | null = null;
let detailRoot: TransformNode | null = null; let scenery: VenuePropsHandle | null = null; let sceneryGone = false;   // DETAIL PASS
let obstacleRoot: TransformNode | null = null;
let placedObstacles: PlacedObstacle[] = [];

const say = (t: string, sec = 1.0): void => { S.banner = t; S.bannerT = sec; };

/**
 * The ramps, placed by distance along the racing line — so a ramp is always ON the road, at the road's own height
 * and angle, without anybody placing it by hand per course.
 *
 * A ramp's mesh IS its physics: the box is `run` long and pitched by the same `pitch` KartAir launches with, so the
 * take-off you see is the take-off you get. A 'gap' ramp has nothing beyond the lip, which is what makes the two
 * rooftop gaps a commitment rather than a bump.
 */
function buildRamps(ctx: ModeContext): Mesh[] {
  if (!circuit) return [];
  const half = circuit.halfWidth;
  const mat = VenueKit.paint(ctx.scene, 'kart_ramp', '#3b4150', 0.06, 0.78);
  return circuit.ramps.map((r: KartRamp, i: number) => {
    const at = pointOn(r.dist);
    const pitch = (r.pitch * Math.PI) / 180;
    const m = MeshBuilder.CreateBox(`kart_ramp_${i}`, { width: half * 2, height: 0.22, depth: r.run }, ctx.scene);
    // sit the low end on the road and let the lip rise, so the wedge reads as a launch and not a speed bump
    m.position.set(at.pos.x, at.pos.y + Math.sin(pitch) * r.run * 0.5 + 0.11, at.pos.z);
    m.rotation.set(-pitch, Math.atan2(at.tangent.x, at.tangent.z), 0);
    m.material = mat;
    m.receiveShadows = true;
    return m;
  });
}

/** A point on the racing line by distance along it, falling back to the start before a circuit is picked. */
function pointOn(dist: number): { pos: Vector3; tangent: Vector3 } {
  if (!circuit) return { pos: course.start.at, tangent: new Vector3(0, 0, 1) };
  const line = circuit.line;
  const d = ((dist % line.length) + line.length) % line.length;
  let lo = 0, hi = line.pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (line.cum[mid] <= d) lo = mid; else hi = mid - 1; }
  const a = line.pts[lo], b = line.pts[(lo + 1) % line.pts.length];
  const seg = (lo + 1 < line.cum.length ? line.cum[lo + 1] : line.length) - line.cum[lo];
  const t = seg > 1e-6 ? (d - line.cum[lo]) / seg : 0;
  const tangent = new Vector3(b.x - a.x, 0, b.z - a.z);
  return {
    pos: new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
    tangent: tangent.length() > 1e-6 ? tangent.normalize() : new Vector3(0, 0, 1),
  };
}

// THE COCKPIT (2026-09-13). The kart was one 1.3×0.5×2.2 box with a second box on top of it called
// `kart_seat`, and the driver had to be perched on the lid of that — which is exactly how it read on screen:
// a body riding on the bodywork. A kart has no lid. It is a flat floor pan a hand's width off the tarmac,
// pods either side of the driver, a nose out front with the pedals on it, and a wheel up at chest height.
// Build that, and the body has somewhere to BE.
//
// Every number below is in the kart's own space, where the tyres put the road at y = −0.36 (KART_GROUND_Y).
const KART_GROUND_Y = -0.36;
/** Root height that puts KART_GROUND_Y on the road slab's top face (0.04 centre + 0.04 half-height). */
const KART_RIDE_Y = 0.08 - KART_GROUND_Y;
/** Where the driver's hip joint lands: reclined into the pan, 0.28 m off the tarmac, behind the wheel. */
const KART_HIPS = { y: -0.08, z: -0.30 };
/** The wheel, at the height and reach the posed hands MEASURED out to on the live rig. */
const KART_WHEEL = { y: 0.28, z: -0.02, tiltDeg: 22 };

function buildKart(ctx: ModeContext): TransformNode {
  const rig = new TransformNode('kart', ctx.scene);

  // PBR with the environment reined in — these venues light for PBR and a vehicle the camera sits three
  // metres behind takes the sky straight across its flanks otherwise. That is what made it render PINK.
  // #f25f5c is a salmon and it PHOTOGRAPHED as one even on PBR with the IBL down — under this much light a
  // mid-tone red lands pink. A deeper base pigment is what actually reads as a red kart on screen.
  const paint = VenueKit.paint(ctx.scene, 'kart_paint', '#b8302c', 0.08, 0.32);
  paint.environmentIntensity = 0.4; paint.specularIntensity = 0.8; paint.metallic = 0.2;
  const dark = VenueKit.paint(ctx.scene, 'kart_tyre', '#15181f', 0.05, 0.88);
  dark.environmentIntensity = 0.3;
  const chrome = VenueKit.paint(ctx.scene, 'kart_chrome', '#b9c0cc', 0.06, 0.22);
  chrome.environmentIntensity = 0.5; chrome.metallic = 0.85;

  const box = (name: string, w: number, h: number, d: number, at: [number, number, number], mat = paint): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, ctx.scene);
    m.position.set(at[0], at[1], at[2]);
    m.material = mat;
    m.parent = rig;
    return m;
  };

  // the floor pan IS the kart — a slab you sit ON, not a block you sit on top of
  box('kart_body', 1.02, 0.12, 1.95, [0, KART_GROUND_Y + 0.13, 0]);

  // SIDE PODS, tapered rather than square: a kart's bodywork narrows toward the nose, and that taper is most
  // of what separates a kart silhouette from a shoebox on wheels
  for (const side of [-1, 1]) {
    const pod = taperedPlank(ctx.scene, `kart_pod_${side > 0 ? 'r' : 'l'}`, 1.15, 0.40, 0.22, 0.34);
    pod.rotation.y = Math.PI / 2;                 // run it along Z
    // pods sit ALONGSIDE the driver, centred on the wheelbase — at z −0.72 they bunched at the back axle
    pod.position.set(side * 0.58, KART_GROUND_Y + 0.28, -0.55);
    pod.material = paint;
    pod.parent = rig;
  }

  // NOSE CONE, tapered to a point — the old one was a slab that ended in a wall
  // Kept LOW and SMALL. The first pass used a 0.78 x 0.95 cone standing proud of the pan and it dominated
  // the whole vehicle — a kart's nose is a shin-high wedge, not a prow.
  const nose = taperedSection(ctx.scene, 'kart_nose', 0.72, 0.46, 0.16, 4);
  nose.rotation.z = Math.PI / 4;                  // a diamond section reads as a moulded cone
  nose.scaling.y = 0.30;
  nose.position.set(0, KART_GROUND_Y + 0.14, 1.02);
  nose.material = paint;
  nose.parent = rig;
  // NO SPLITTER. Two attempts at one (a plank, then a lip) both photographed as a white slab floating in
  // front of the kart — at this scale anything ahead of the nose separates from it visually, and a bright
  // trim colour is the first thing the eye goes to. The nose wedge alone reads better than the nose wedge
  // plus a distraction, which is the whole argument for cutting a detail rather than tuning it a third time.

  // PEDALS where the feet MEASURED out to (z 0.44, y −0.28), not where a nose cone happens to be
  for (const side of [-1, 1]) {
    const pedal = box(`kart_pedal_${side > 0 ? 'r' : 'l'}`, 0.16, 0.05, 0.20, [side * 0.20, KART_GROUND_Y + 0.10, 0.46], dark);
    pedal.rotation.x = -18 * Math.PI / 180;
  }

  // a BUCKET seat: a back and two sides, rather than one flat panel behind the driver
  const back = box('kart_seat', 0.56, 0.50, 0.10, [0, KART_HIPS.y + 0.22, KART_HIPS.z - 0.32]);
  back.rotation.x = -14 * Math.PI / 180;
  for (const side of [-1, 1]) {
    const wall = box(`kart_seat_${side > 0 ? 'r' : 'l'}`, 0.09, 0.34, 0.42, [side * 0.28, KART_HIPS.y + 0.12, KART_HIPS.z - 0.14]);
    wall.rotation.z = side * 0.12;
  }

  // the engine on the right hip, with a real exhaust rather than a bare block
  box('kart_engine', 0.32, 0.38, 0.44, [0.52, KART_GROUND_Y + 0.32, -0.86], dark);
  const pipe = MeshBuilder.CreateCylinder('kart_exhaust', { diameter: 0.09, height: 0.72, tessellation: 10 }, ctx.scene);
  pipe.rotation.set(Math.PI / 2, 0.25, 0);
  pipe.position.set(0.6, KART_GROUND_Y + 0.46, -1.12);
  pipe.material = chrome;
  pipe.parent = rig;

  // a ROLL HOOP behind the seat: the tallest thing on the kart and the part that reads at distance
  const hoop = MeshBuilder.CreateTorus('kart_hoop', { diameter: 0.56, thickness: 0.05, tessellation: 14 }, ctx.scene);
  hoop.rotation.x = Math.PI / 2;
  hoop.position.set(0, KART_HIPS.y + 0.34, KART_HIPS.z - 0.46);
  hoop.material = chrome;
  hoop.parent = rig;

  // the wheel, and the column running down from it to the pan
  const col = MeshBuilder.CreateCylinder('kart_column', { diameter: 0.055, height: 0.46, tessellation: 8 }, ctx.scene);
  col.position.set(0, KART_WHEEL.y - 0.20, KART_WHEEL.z + 0.10);
  col.rotation.x = KART_WHEEL.tiltDeg * Math.PI / 180;
  col.material = chrome;
  col.parent = rig;
  // the tilt lives on a HUB and the ring is its child, so the ring's own rotation.y spins it about the column
  // rather than about world up — Babylon composes Y·X·Z, so a y on the tilted mesh itself would not
  const hub = new TransformNode('kart_wheel_hub', ctx.scene);
  hub.position.set(0, KART_WHEEL.y, KART_WHEEL.z);
  hub.rotation.x = (90 - KART_WHEEL.tiltDeg) * Math.PI / 180;
  hub.parent = rig;
  const wheel = MeshBuilder.CreateTorus('kart_wheel_steer', { diameter: WHEEL_RADIUS * 2, thickness: 0.042, tessellation: 18 }, ctx.scene);
  wheel.material = dark;
  wheel.parent = hub;
  steerWheel = wheel;

  // tyres: fronts narrow, rears fat, all four ON the road — and each with a RIM, because a bare cylinder
  // reads as a disc and a disc at speed reads as nothing at all
  for (const [i, [x, z, dia, wide]] of ([
    [-0.60, 0.74, 0.56, 0.20], [0.60, 0.74, 0.56, 0.20],
    [-0.66, -0.74, 0.64, 0.30], [0.66, -0.74, 0.64, 0.30],
  ] as const).entries()) {
    const w = roadWheel(ctx.scene, `kart_wheel_${i}`, dia, wide, dark, chrome);
    w.position.set(x, KART_GROUND_Y + dia / 2, z);
    w.parent = rig;
  }
  return rig;
}

/**
 * A rival's kart: the player's silhouette, simplified and tinted.
 *
 * Deliberately the SAME shape rather than a different one — a field of visibly cheaper cars reads as
 * placeholder art, and the pan/pods/wheels are six boxes either way. What it does not get is a driver: five
 * more skinned humanoids on screen is the frame budget spent on bodies nobody looks at, and the rule the
 * owner set is that every body MOVES WELL, which a second-tier rig would not.
 */
function buildRivalKart(ctx: ModeContext, name: string, tint: string): TransformNode {
  const rig = new TransformNode(`rival_${name}`, ctx.scene);
  const paint = VenueKit.paint(ctx.scene, `rival_paint_${name}`, tint, 0.1, 0.45);
  paint.environmentIntensity = 0.4;
  const dark = VenueKit.paint(ctx.scene, `rival_tyre_${name}`, '#15181f', 0.05, 0.92);
  dark.environmentIntensity = 0.3;
  const box = (n: string, w: number, h: number, d: number, at: [number, number, number], m = paint): void => {
    const b = MeshBuilder.CreateBox(`${n}_${name}`, { width: w, height: h, depth: d }, ctx.scene);
    b.position.set(at[0], at[1], at[2]);
    b.material = m;
    b.parent = rig;
  };
  box('rv_pan', 1.08, 0.14, 2.0, [0, KART_GROUND_Y + 0.13, 0]);
  box('rv_pod_l', 0.2, 0.34, 1.15, [-0.62, KART_GROUND_Y + 0.30, -0.18]);
  box('rv_pod_r', 0.2, 0.34, 1.15, [0.62, KART_GROUND_Y + 0.30, -0.18]);
  box('rv_nose', 0.8, 0.18, 0.66, [0, KART_GROUND_Y + 0.20, 0.92]);
  box('rv_seat', 0.6, 0.52, 0.12, [0, KART_HIPS.y + 0.22, KART_HIPS.z - 0.32]);
  for (const [i, [x, z, dia, wide]] of ([
    [-0.60, 0.74, 0.56, 0.20], [0.60, 0.74, 0.56, 0.20],
    [-0.66, -0.74, 0.64, 0.30], [0.66, -0.74, 0.64, 0.30],
  ] as const).entries()) {
    const w = MeshBuilder.CreateCylinder(`rv_wheel_${i}_${name}`, { diameter: dia, height: wide, tessellation: 10 }, ctx.scene);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, KART_GROUND_Y + dia / 2, z);
    w.material = dark;
    w.parent = rig;
  }
  return rig;
}

/**
 * THE TARMAC, painted rather than tinted (2026-09-13).
 *
 * A flat albedo cannot survive these venues. Measured on the live stadium map: no fog, ACES tone mapping,
 * exposure 1.15 — and a hemispheric at 0.55 in PALE BLUE (#9fb7ff) under a directional at 2.20, about 3.6x of
 * light landing on a 0.16-luminance surface. The venue's own ground gets away with the same lighting because
 * it is a PHOTO with dark pixels in it; a single mid-dark colour has nothing to hold the value down, so the
 * road came out the pale blue-lavender of the sky and the whole course read as a sheet of plastic. Switching
 * StandardMaterial to PBR fixed the kart's paint and did nothing for this, which is how I know it is the flat
 * fill and not the material model.
 *
 * So the road gets a real surface: dark asphalt with tonal variation, a dashed centre line, and — the part
 * that is gameplay and not decoration — SOLID WHITE EDGE LINES at the track boundary. `onTrack()` is what
 * decides whether you keep your grip and your top speed, and until now the line it tests was invisible: you
 * found the edge by losing the car. The texture's u runs across the full 2 x TRACK_HALF_WIDTH, so the painted
 * edge IS the tested edge, the same way the road polyline is the gate polyline.
 */
const ROAD_TEX_PX = 512;

function paintTarmac(scene: ModeContext['scene']): DynamicTexture {
  const tex = new DynamicTexture('kart_tarmac_tex', { width: ROAD_TEX_PX, height: ROAD_TEX_PX }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const S = ROAD_TEX_PX;
  let seed = 7;
  const rnd = (): number => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  g.fillStyle = '#14171c';                                  // dark, because 3.6x of light is coming
  g.fillRect(0, 0, S, S);
  // aggregate: broad patches first, then speckle. Patches are what stop a surface reading as noise-over-flat.
  for (let i = 0; i < 260; i++) {
    const r = 6 + rnd() * 34;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '44,48,56' : '10,12,15'},${0.10 + rnd() * 0.16})`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2); g.fill();
  }
  // speckle in ONE buffer pass: 28k fillRects painted per-frame is what killed an earlier floor (DUNK-VISUAL-POLISH)
  const img = g.getImageData(0, 0, S, S);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    px[i] = Math.max(0, Math.min(255, px[i] + n));
    px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + n));
    px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + n));
  }
  g.putImageData(img, 0, 0);

  // EDGE LINES at the track boundary — u = 0 and u = 1 are the two edges onTrack() tests
  const edge = Math.round(S * 0.035);
  g.fillStyle = 'rgba(232,236,242,0.88)';
  g.fillRect(0, 0, edge, S);
  g.fillRect(S - edge, 0, edge, S);
  // and the dashed centre line, which is what gives the road SPEED at 26 m/s
  g.fillStyle = 'rgba(226,214,150,0.72)';
  const dash = Math.round(S * 0.17), gap = Math.round(S * 0.13), w = Math.round(S * 0.018);
  for (let y = 0; y < S; y += dash + gap) g.fillRect(S / 2 - w / 2, y, w, dash);

  tex.update(false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;    // across the road: one span, never tiled, or the edge lines repeat
  tex.wrapV = Texture.WRAP_ADDRESSMODE;     // along the road: tiles with the segment's length
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/**
 * The road: slabs along the RACING LINE, so what you SEE is still exactly what onTrack() tests.
 *
 * It used to be a slab per gate-to-gate leg, which was the same thing when the gates WERE the shape. On a derived
 * course they are lap logic ~110 m apart, and a polyline through them cuts the inside of every corner — the road
 * would have been painted across the apex of the pier hairpin while onTrack() measured the curve, so the tested
 * edge and the painted edge would have disagreed by metres. That disagreement is the one thing this function's
 * previous comment promised would never happen, so the road now walks `course.path`.
 *
 * SEGMENT LENGTH is a draw-call trade, and it is settled by merging: ~14 m chords give a corner enough facets to
 * read as a curve, which is ~75 slabs a lap against the old ~10, and MergeMeshes folds them into a single mesh
 * afterwards so the geometry is exact and the scene still sees one road.
 */
const ROAD_SEG_M = 14;

function roadPath(): Vector3[] {
  const path = course.path;
  if (path && path.length > 1) return [...path];
  return [course.start.at, ...course.gates.map((g) => g.at)];
}

function buildRoad(ctx: ModeContext): Mesh[] {
  roadTex = paintTarmac(ctx.scene);
  const tarmac = new PBRMaterial('kart_tarmac', ctx.scene);
  tarmac.albedoTexture = roadTex;
  tarmac.albedoColor = Color3.White();
  tarmac.metallic = 0;
  tarmac.roughness = 0.92;
  // the venue's IBL is tuned for its own props; a road is 300 m of it, and at full strength the sky's colour
  // is exactly what was washing the tarmac out
  tarmac.environmentIntensity = 0.35;
  tarmac.specularIntensity = 0.22;

  const half = circuit?.halfWidth ?? TRACK_HALF_WIDTH;
  const path = roadPath();
  const n = path.length;

  // walk the line, emitting a slab every ~ROAD_SEG_M of it
  const slabs: Mesh[] = [];
  const last = course.loop ? n : n - 1;
  let i = 0;
  while (i < last) {
    const a = path[i % n];
    let j = i + 1, run = 0;
    while (j <= last && run < ROAD_SEG_M) {
      const p0 = path[(j - 1) % n], p1 = path[j % n];
      run += Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (run >= ROAD_SEG_M) break;
      j++;
    }
    const b = path[Math.min(j, last) % n];
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    const flat = Math.hypot(dx, dz);
    if (flat < 0.4) { i = j; continue; }
    const len = Math.hypot(flat, dy);

    // the tiling is baked into each slab's UVs at creation, so a long chord and a short one carry the same SIZE
    // of dash rather than the same NUMBER of them. Scaling the shared texture would make every slab agree, which
    // is the wrong thing to agree about.
    const tiles = Math.max(1, Math.round(len / (half * 2)));
    const faceUV = Array.from({ length: 6 }, () => new Vector4(0, 0, 1, tiles));
    const slab = MeshBuilder.CreateBox(`kart_road_${i}`, {
      width: half * 2, height: 0.08, depth: len, faceUV, wrap: true,
    }, ctx.scene);
    slab.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.04, (a.z + b.z) / 2);
    // yaw along the chord, then pitch onto the slope — Babylon applies rotation as YXZ, which is the order a road
    // needs. Without the pitch, ALPINE DESCENT's 96 m drop would be a staircase of level slabs.
    slab.rotation.set(-Math.atan2(dy, flat), Math.atan2(dx, dz), 0);
    slab.material = tarmac;
    slabs.push(slab);
    i = j;
  }

  const merged = slabs.length > 1 ? Mesh.MergeMeshes(slabs, true, true, undefined, false, true) : slabs[0] ?? null;
  if (!merged) return [];
  merged.name = 'kart_road';
  merged.material = tarmac;
  merged.receiveShadows = true;
  merged.isPickable = false;
  return [merged];
}

/** A bright slab across the road at each checkpoint, dim once taken. */
function buildMarks(ctx: ModeContext): Mesh[] {
  return course.gates.map((gate, i) => {
    const m = MeshBuilder.CreateBox(`kart_mark_${i}`, { width: (circuit?.halfWidth ?? TRACK_HALF_WIDTH) * 2, height: 0.12, depth: 0.7 }, ctx.scene);
    m.position.set(gate.at.x, gate.at.y + 0.1, gate.at.z);
    m.rotation.y = Math.atan2(gate.through.x, gate.through.z);
    m.material = VenueKit.paint(ctx.scene, `kart_markMat_${i}`, '#2a2f38', 0.05, 0.8);
    return m;
  });
}

function tintMarks(): void {
  marks.forEach((m, i) => {
    const mat = m.material as PBRMaterial | null;
    if (!mat) return;
    const next = i === race.next;
    // the NEXT gate glows and the rest go dark — on PBR that is albedo plus a real emissive lift, which is
    // what makes "which gate am I chasing" readable down a 150 m straight
    mat.albedoColor = Color3.FromHexString(next ? '#ffd75e' : '#3a4150');
    mat.emissiveColor = Color3.FromHexString(next ? '#ffd75e' : '#000000').scale(next ? 0.55 : 0);
  });
}

/** The nearest racer AHEAD of `dist` within range, for a homing shell. */
function targetAhead(owner: number, dist: number): number | null {
  let best: number | null = null, bestGap = Infinity;
  const consider = (id: number, d: number) => { const gap = d - dist; if (id !== owner && gap > 2 && gap < 160 && gap < bestGap) { best = id; bestGap = gap; } };
  consider(PLAYER_ID, playerDist);
  rivals.forEach((r, i) => consider(i + 1, r.dist));
  return best;
}
function racerPos(id: number): Vector3 | null {
  if (id === PLAYER_ID) return state ? state.pos.add(new Vector3(0, 0.6, 0)) : null;
  const k = rivalKarts[id - 1];
  return k ? k.position.add(new Vector3(0, 0.4, 0)) : null;
}
function fireItem(ctx: ModeContext): void {
  if (!state || S.done) return;
  if (!S.held) { refuse(ctx, 'NO ITEM — DRIVE THROUGH A BALLOON'); return; }
  if (S.spinT > 0) { refuse(ctx, 'SPINNING'); return; }
  const fwd = new Vector3(Math.sin(state.heading), 0, Math.cos(state.heading));
  const out = useItem(S.held, PLAYER_ID, state.pos.add(new Vector3(0, 0.6, 0)), fwd, fwd.scale(-1), targetAhead(PLAYER_ID, playerDist));
  missiles.push(...out.missiles); mines.push(...out.mines);
  if (out.boostSec) { S.zipT = Math.max(S.zipT, out.boostSec); SoundKit.play('whoosh', { pitch: 1.2, volume: 0.6 }); ctx.feel.impact(0.3); say('ZIP!', 0.6); }
  if (out.shieldSec) { S.shieldT = out.shieldSec; SoundKit.play('powerUp', { pitch: 1.1, volume: 0.5 }); say('SHIELD UP', 0.7); }
  if (out.missiles.length) { SoundKit.play('whoosh', { pitch: 0.8, volume: 0.6 }); say(out.missiles.length > 1 ? 'TRIPLE SHELL' : out.missiles[0].homing ? 'HOMING SHELL' : 'SHELL', 0.6); }
  if (out.mines.length) { SoundKit.play('uiTick', { pitch: 0.7, volume: 0.5 }); say(out.mines.length > 1 ? 'MINES DROPPED' : 'MINE DROPPED', 0.6); }
  S.events.fired++; console.info(`[RACE] fired ${S.held.kind} L${S.held.level}`);
  S.held = null;
}
function hitPlayer(ctx: ModeContext, what: string): void {
  if (!state) return;
  S.spinT = CONTACT.puntSpinSec; state.speed *= 0.4; state.slip = Math.min(MAX_SLIP, state.slip + 0.5);
  S.events.hits++;
  SoundKit.play('impact', { pitch: 0.8, volume: 0.6 }); ctx.juice.shake(0.35, 380); ctx.feel.impact(0.6);
  EffectsKit.burst(ctx.scene, state.pos.clone(), 'sparks', 2);
  ctx.momentum.report({ kind: 'blunder', weight: -12 });
  say(`HIT BY A ${what}`, 1.1); console.info(`[RACE] hit by ${what}`);
}
function hitRival(ctx: ModeContext, i: number, what: string, byPlayer: boolean): void {
  const k = rivalKits[i]; if (!k) return;
  rivalStun[i] = CONTACT.puntSpinSec; rivals[i].speed *= CONTACT.puntedKeep;
  const pos = rivalKarts[i]?.position;
  if (pos) EffectsKit.burst(ctx.scene, pos.clone(), 'sparks', 2);
  if (byPlayer) {
    SoundKit.play('crowdCheer', { volume: 0.4 }); ctx.feel.impact(0.35);
    ctx.momentum.report({ kind: 'big_make', weight: 10 }); boost.earn('trickSmall');
    say(`${what} — ${rivals[i].name}`, 1);
  }
  console.info(`[RACE] ${rivals[i].name} ${what.toLowerCase()}${byPlayer ? ' by you' : ''}`);
}
/** One frame of the field: intent, pace, stun, items, placement, then contact with the player. */
/** The speed the road lets the kart hold at a distance along it (racing pass phase 6: the field's physics cap). The rival
 *  line is built through the circuit's own points, so a rival's distance IS a circuit distance. */
function holdAtRoad(dist: number): number {
  if (!circuit) return Infinity;
  const L = circuit.line.length;
  return holdableSpeed(cornerRadiusAt(circuit.line, ((dist % L) + L) % L), kartSpec.grip);
}

function tickField(ctx: ModeContext, dt: number): void {
  if (!state || !line || !kart) return;
  const lapLen = line.lapLength;
  const pAt = circuit ? locate(circuit.line, state.pos.x, state.pos.z) : null;
  const pLat = pAt ? pAt.lateral : 0;
  const halfW = circuit ? circuit.halfWidth : TRACK_HALF_WIDTH;
  const player = { dist: playerDist, lateral: pLat, speed: state.speed };
  const others = rivals.map((r) => ({ dist: r.dist, lateral: r.lane, speed: r.speed }));
  for (const [i, r] of rivals.entries()) {
    const k = rivalKits[i];
    const before = r.dist;
    k.shieldT = Math.max(0, k.shieldT - dt); k.zipT = Math.max(0, k.zipT - dt);
    // INTENT: the lane the personality wants (a blocker crosses in front of you, a bumper leans on you, a clean one steps round a slower car)
    if (rivalStun[i] <= 0) r.lane = steerLane({ lane: r.lane, dist: r.dist, speed: r.speed, personality: personalityFor(i), home: rivalHome[i] }, player, others.filter((_, j) => j !== i), halfW, lapLen, dt);
    stepRival(r, line, dt, playerDist, { topSpeed: kartSpec.vMax * (k.zipT > 0 ? 1.3 : 1), holdAt: holdAtRoad }, race.time);
    if (rivalStun[i] > 0) { rivalStun[i] = Math.max(0, rivalStun[i] - dt); r.dist = before + (r.dist - before) * 0.25; r.speed *= 0.97; }
    // a rival crossing an item row picks up an item, and uses it when it makes sense
    const inLap = ((r.dist % lapLen) + lapLen) % lapLen;
    const lap = Math.floor(r.dist / lapLen);
    if (lap !== k.lap) { k.lap = lap; k.nextRow = 0; }
    if (k.nextRow < rowDists.length && inLap >= rowDists[k.nextRow]) {
      k.nextRow++;
      if (!k.item && Math.random() < 0.6) { k.item = { kind: ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)] as ItemKind, level: Math.random() < 0.3 ? 2 : 1 }; k.itemAt = race.time; }
    }
    const rk = rivalKarts[i];
    if (k.item && rk && race.time - k.itemAt > 1.2 && rivalStun[i] <= 0) {
      const gapToPlayer = playerDist - r.dist;
      const heading = rk.rotation.y;
      const aim = new Vector3(Math.sin(heading), 0, Math.cos(heading));
      let use = false;
      if (k.item.kind === 'missile') use = gapToPlayer > 8 && gapToPlayer < 120 && Math.random() < dt * 0.6 * tier.edge * 2;
      else if (k.item.kind === 'mine') use = gapToPlayer < -6 && gapToPlayer > -80 && Math.random() < dt * 0.5;
      else use = Math.random() < dt * 0.35;
      if (use) {
        const out = useItem(k.item, i + 1, rk.position.add(new Vector3(0, 0.6, 0)), aim, aim.scale(-1), targetAhead(i + 1, r.dist));
        missiles.push(...out.missiles); mines.push(...out.mines);
        if (out.boostSec) k.zipT = out.boostSec;
        if (out.shieldSec) k.shieldT = out.shieldSec;
        if (out.missiles.length && gapToPlayer > 0 && gapToPlayer < 120) say(`${r.name} FIRED — SWERVE`, 0.9);
        k.item = null;
      }
    }
    const at = rivalPlacement(r, line);
    if (rk) { rk.position.set(at.pos.x, at.pos.y + KART_RIDE_Y, at.pos.z); rk.rotation.y = at.heading + (rivalStun[i] > 0 ? rivalStun[i] * 11 : 0); pickups?.shield(i + 1, rk, k.shieldT > 0); }
  }
  // CONTACT: a side bump shoves both; closing fast (or with the boost lit) punts the car in front
  const rposes = rivals.map((r) => ({ dist: r.dist, lateral: r.lane, speed: r.speed }));
  if (!S.air.airborne && race.time > 3 && state.speed > 4) {   // not off the grid: the field launches through the player's spot in the first seconds
    const right = new Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading));
    for (const ev of resolveContact({ ...player, boosting: boost.k > 0.35 || S.zipT > 0 }, rposes, lapLen, rivalCool, dt, rivalTouch)) {
      const r = rivals[ev.i];
      state.pos.addInPlace(right.scale(ev.playerShove)); r.lane += ev.rivalShove;
      if (ev.kind === 'punt') { state.speed *= ev.playerKeep; hitRival(ctx, ev.i, 'PUNTED', true); S.events.punts++; ctx.juice.scorePop(kart.position.add(new Vector3(0, 1.6, 0)), 'PUNT!', '#fbbf24'); }
      else if (ev.kind === 'punted') { r.speed *= ev.rivalKeep; if (S.shieldT > 0) { say('SHIELD HELD', 0.5); } else { hitPlayer(ctx, `${r.name} PUNT`); S.events.punted++; } }
      else { state.speed *= ev.playerKeep; r.speed *= ev.rivalKeep; S.events.bumps++; SoundKit.play('thud', { pitch: 1.1, volume: 0.45 }); ctx.juice.shake(0.08, 110); ctx.feel.impact(0.2); EffectsKit.burst(ctx.scene, state.pos.add(right.scale(-ev.playerShove)), 'sparks'); say(`BUMPED ${r.name}`, 0.5); console.info(`[RACE] bump ${r.name}`); }
    }
    for (const i of nearMisses(player, rposes, lapLen, rivalAlongside)) { S.events.nearMisses++; boost.earn('nearMiss'); ctx.juice.callout('CLOSE PASS', '#86efac', 420); SoundKit.play('swish', { pitch: 1.4, volume: 0.35 }); console.info(`[RACE] near miss ${rivals[i].name}`); }
    // SLIPSTREAM (racing pass phase 7, racing/Slipstream): tuck in behind a rival, in its lane, and the wake charges; hold it
    // ~1 s and you are slung past. The rival AHEAD becomes a resource, not only an obstacle — Mario Kart's draft.
    const tow = stepDraft(S.draft, { dist: playerDist, lane: player.lateral, speed: state.speed }, rivals.map((r) => ({ name: r.name, dist: r.dist, lane: r.lane })), lapLen, dt);
    if (tow.towing && !S.draftSaid && tow.state.charge > 0.35) { S.draftSaid = true; ctx.juice.callout('SLIPSTREAM', '#a5f3fc', 500); SoundKit.play('whoosh', { pitch: 0.8, volume: 0.25 }); }
    if (!tow.towing) S.draftSaid = false;
    if (tow.event === 'slingshot') {
      S.zipT = Math.max(S.zipT, DRAFT.burstSec); S.events.slingshots++; S.draftSaid = false;
      say(`SLINGSHOT — PAST ${tow.from}`, 0.9); SoundKit.play('whoosh', { pitch: 1.5, volume: 0.55 }); ctx.juice.flash('#22d3ee', 50);
      console.info(`[RACE] slingshot ${tow.from}`);
    }
    S.draft = tow.state;
  }
  // ITEMS: balloons taken, shells and mines on the road
  stepBalloons(balloons, dt);
  for (const b of balloonsHit(balloons, prevPos, state.pos, 2.4)) {
    b.respawn = 3;
    const before = S.held;
    S.held = collectBalloon(S.held, b.kind); S.events.picked++;
    SoundKit.play('powerUp', { pitch: 1 + S.held.level * 0.12, volume: 0.55 });
    EffectsKit.burst(ctx.scene, b.pos.clone(), 'confetti'); ctx.feel.impact(0.15);
    say(before && before.kind === b.kind ? `${ITEM_LABEL[b.kind] === 'MISSILE' ? 'SHELL' : ITEM_LABEL[b.kind]} LEVEL ${S.held.level}` : (ITEM_LABEL[b.kind] === 'MISSILE' ? 'SHELL' : ITEM_LABEL[b.kind]), 0.8);
    console.info(`[RACE] picked ${b.kind}`);
  }
  const targets: Target[] = [
    { id: PLAYER_ID, pos: state.pos.add(new Vector3(0, 0.6, 0)), protected: S.shieldT > 0 },
    ...rivals.map((_, i) => ({ id: i + 1, pos: rivalKarts[i]?.position.add(new Vector3(0, 0.4, 0)) ?? new Vector3(0, -999, 0), protected: rivalKits[i].shieldT > 0 })),
  ];
  // whose projectile is about to land: the items core reports hits by target only, so read the owners before the step
  const nearOwner = (id: number): boolean => { const p = targets[id]?.pos; return !!p && [...missiles, ...mines].some((m) => m.owner === PLAYER_ID && Vector3.Distance(m.pos, p) < 9); };
  const byPlayer = new Map<number, boolean>(); for (const t of targets) byPlayer.set(t.id, nearOwner(t.id));
  const mres = stepMissiles(missiles, targets, dt);
  // a shell runs on the road, not into the sky: pin it to the surface after the step
  for (const m of missiles) { m.dir.y = 0; if (circuit) m.pos.y = circuit.surfaceAt(m.pos.x, m.pos.z) + 0.6; }
  const nres = stepMines(mines, targets, dt);
  for (const id of [...mres.hit, ...nres.hit]) {
    if (id === PLAYER_ID) hitPlayer(ctx, mres.hit.includes(id) ? 'SHELL' : 'MINE');
    else hitRival(ctx, id - 1, mres.hit.includes(id) ? 'SHELLED' : 'MINED', byPlayer.get(id) ?? false);
  }
  for (const id of [...mres.absorbed, ...nres.absorbed]) {
    const p = racerPos(id); if (p) EffectsKit.burst(ctx.scene, p.clone(), 'glitch');
    if (id === PLAYER_ID) { SoundKit.play('clang', { volume: 0.5 }); say('SHIELD BLOCKED IT', 0.8); }
  }
  for (const m of mres.spent) if (m.life <= 0) EffectsKit.burst(ctx.scene, m.pos.clone(), 'sparks');
  pickups?.update(dt, balloons, [], missiles, mines);
  pickups?.shield(PLAYER_ID, kart, S.shieldT > 0);
}
function pushHud(ctx: ModeContext): void {
  if (!state) return;
  const { dist } = toNextGate(race, course, state.pos);
  ctx.setHud({
    speed: Math.round(state.speed * 3.6),                 // km/h reads better than m/s on a kart
    ...boost.hud(),
    lap: `${Math.min(race.lap, course.laps)}/${course.laps}`,
    time: race.time.toFixed(1),
    draft: Math.round(S.draft.charge * 100),   // SLIPSTREAM (phase 7): the wake's charge, 0–100
    mini: S.mini.tier,   // MINI-TURBO (phase 8): the spark tier the slide has reached, 0–3
    start: S.start.go ? '' : beatLabel(S.start.beat),   // THE START: the beat on screen (QA drivers time the rocket off it)
    // THE GAP under the place (phase 5): seconds to the kart ahead, or the lead
    gap: rivals.length ? gapLine(rivals.map((r) => ({ name: r.name, gap: r.dist - playerDist })), state.speed) : '',
    toGate: Math.round(dist),
    drift: state.drifting ? Math.round(driftQuality(state) * 100) : 0,
    pos: rivals.length ? `${ordinal(playerPosition(playerDist, rivals))} / ${rivals.length + 1}` : '',
    item: S.held ? `${S.held.kind === 'missile' ? 'SHELL' : ITEM_LABEL[S.held.kind]}${S.held.level > 1 ? ` L${S.held.level}` : ''}` : '',
    itemKind: S.held?.kind ?? '',
    banner: S.banner,
    // only shown once there is a lap to measure against — a delta with no reference is a number pretending to mean something
    delta: bestGhost ? deltaLabel(ghostDelta) : '',
    chasing: bestGhost ? `PB ${(bestGhost.timeMs / 1000).toFixed(1)}s` : '',
    cup: cupLine,
    hint: S.start.go ? 'RT throttle · X drift to fill BOOST · hold RB / Shift to burn it · A fires your item'
      : 'THROTTLE DOWN ON "2" AND HOLD IT FOR A ROCKET START — ON "3" IT BOGS',
  } satisfies Record<string, HudValue>);
}

/** GO, and what the start was worth: a ROCKET is a zip of full boost, a BURNOUT a beat of lost drive, NORMAL nothing. */
function startBeat(ctx: ModeContext, outcome: StartOutcome): void {
  SoundKit.play('whistle');
  if (outcome === 'rocket') {
    S.zipT = Math.max(S.zipT, ROCKET_ZIP_SEC); say('ROCKET START!', 1.1);
    SoundKit.play('whoosh', { pitch: 1.4, volume: 0.6 }); ctx.juice.flash('#38bdf8', 80); ctx.feel.impact(0.35);
    if (state) EffectsKit.burst(ctx.scene, state.pos.clone(), 'sparks', 2);
  } else if (outcome === 'burnout') {
    S.burnT = BURNOUT_SEC; say('BURNOUT — TOO EARLY', 1.1);
    SoundKit.play('squeak', { pitch: 0.7, volume: 0.5 }); ctx.juice.shake(0.05, 120);
    if (state) EffectsKit.burst(ctx.scene, state.pos.clone(), 'dust', 2);
  } else say('GO!', 0.8);
  console.info(`[RACE] start ${outcome}`);
}

function finish(ctx: ModeContext): void {
  if (S.done) return;
  S.done = true;
  ctx.camDirector.rearView = false;   // the end card is never framed backwards
  const medal = medalFor(course, race.time, race.finished);
  const place = rivals.length ? playerPosition(playerDist, rivals) : 1;
  // RECORD THE ROUND. Only a finished race counts toward a cup — a DNF is not a result, and letting one score zero
  // would be indistinguishable from never having raced it.
  const cup = cupForCourse(course.id);
  if (cup && race.finished) {
    const rows = recordResult({
      courseId: course.id, racerId: 'me', place, finished: true, timeMs: Math.round(race.time * 1000),
    });
    const prog = cupProgress(cup, rows, 'me');
    cupLine = prog.headline;
  } else if (cup) {
    cupLine = cupProgress(cup, loadResults(), 'me').headline;
  }

  // KEEP THE LAP IF IT WAS FASTER. Only a finished race counts: a DNF is not a lap, and a half-recorded ghost would
  // strand a future chase halfway round the course with nothing to compare against.
  const hadGhost = bestGhost;
  if (race.finished && ghostRec) {
    const run = ghostRec.finish(course.id, race.time * 1000, kartId);
    bestGhost = saveIfFaster(run) ?? bestGhost;
  }
  const beatIt = race.finished && hadGhost != null && bestGhost != null && bestGhost.timeMs < hadGhost.timeMs;
  SoundKit.play(medal === 'none' ? 'miss' : 'score');
  ctx.juice.hitStop(90);
  // the result says WHERE you placed as well as the clock's medal, and a race you did not finish says so
  const placeTag = rivals.length ? `${ordinal(place)} · ` : '';
  // A NEW PERSONAL BEST OUTRANKS THE MEDAL on a course you have already golded — the medal stopped being news
  // three laps ago and the record is the reason you went round again.
  say(beatIt ? `NEW BEST — ${race.time.toFixed(1)}s` : !race.finished ? `OUT OF TIME — ${placeTag}DNF` : medal === 'none' ? `${placeTag}FINISHED ${race.time.toFixed(1)}s` : `${placeTag}${medal.toUpperCase()} — ${race.time.toFixed(1)}s`, 2.4);
  pushHud(ctx);
  // RACING PASS phase 9: the outcome is the RACE — 'win' for first over the line, 'complete' for any other finish, 'dnf'
  // when the clock called it. It was `COMPLETE_<MEDAL>` / 'OUT': the host looked for 'win' and so never reported a kart
  // win, a 4th-of-4 finish read as GOLD (the medal is the clock's), and a DNF was headlined "RACE COMPLETE".
  ctx.end(race.finished ? (place === 1 ? 'win' : 'complete') : 'dnf',
    Math.round(Math.max(0, course.gold * 2 - race.time) * 10), {
      seconds: Number(race.time.toFixed(2)), gates: race.passed, place, field: rivals.length + 1, laps: race.lap, medal: ['none', 'bronze', 'silver', 'gold'].indexOf(medal),   // details are numbers: 0 none … 3 gold
      bestDrift: Math.round(S.bestDrift * 100), offRoad: Number(S.offRoadSec.toFixed(1)),
    });
}

return {
  modeId: 'velocitykart',
  // A GETTER, read at mount after the course has been picked: a plain value would be evaluated when the mode
  // definition is built, which is before anybody has chosen a map, and every track would be lit for Venice.
  get mood(): ModeDefinition['mood'] { return readCourse('kart').mood; },
  camPreset: 'runner',

  async load(ctx: ModeContext): Promise<void> {
    // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's.
    baseFov = null;
    S.done = false; S.banner = ''; S.bannerT = 0; S.bestDrift = 0; S.offRoadSec = 0; S.graceLeft = null;
    S.input = { steer: 0, throttle: 0, brake: 0, drift: false, fire: false, boostK: 0 };
    S.boostHeld = false; boost = new BoostKit();
    S.held = null; S.shieldT = 0; S.zipT = 0; S.spinT = 0; S.events = { bumps: 0, punts: 0, punted: 0, nearMisses: 0, fired: 0, hits: 0, picked: 0, slingshots: 0, minis: 0 };
    S.draft = noDraft(); S.draftSaid = false; S.mini = noMini();
    S.start = newStart(); S.burnT = 0; S.wrongT = 0;
    missiles = []; mines = []; for (const b of balloons) b.respawn = 0;
    lastPlace = 0; driftCallT = 0; offRoadTick = 0; offRoadSaid = false;   // a remount must not inherit last race's place (it would read as an overtake on frame one)

    // THE MAP AND THE KART ARE BOTH PICKS (2026-09-13). Read once, here, at mount — the world is built from
    // the course and the handling comes from the vehicle, and neither can be swapped under a running scene.
    course = readCourse('kart');
    circuit = kartCircuitById(course.id);
    const chosenKart = readKart();
    kartSpec = chosenKart.spec;
    kartId = chosenKart.id;
    race = startRace();

    venueRoot = buildCourseVenue(ctx.scene, course);
    worldGround?.dispose(); worldGround = buildWorldGround(ctx.scene, course, WORLD_WALL + 2);   // no void past the road (see buildWorldGround)
    // THE VENUE IS COURT-SIZED AND THE COURSE IS HUNDREDS OF METRES, so the world was a small island near
    // the start and the rest of the lap ran off into nothing (step-0 audit: this mode was one of the two
    // worst frames in the project). Trackside dresses the PATH instead, at whatever scale the course is.
    trackside?.dispose();
    trackside = buildTrackside(ctx.scene, course);
    ramps = buildRamps(ctx);
    if (circuit) {
      placedObstacles = placeObstacles(circuit);
      kerbRoot = buildKerbs(ctx.scene, circuit);
      obstacleRoot = buildObstacles(ctx.scene, placedObstacles, circuit.course.id);
      // DETAIL PASS (2026-09-18): chevron boards on the outside of every corner, the start / finish gantry, and the
      // racing kit round the circuit (grandstands, tents, banner towers, flags, barrier walls, light posts)
      detailRoot?.dispose(); detailRoot = new TransformNode(`kart_detail_${circuit.course.id}`, ctx.scene);
      buildChevrons(ctx.scene, circuit).parent = detailRoot; buildGantry(ctx.scene, circuit).parent = detailRoot;
      // THE SETTING (owner, 2026-09-18): the mountain courses stand in a real forest on the relief; the night courses
      // read their road by edge lights (the orbit station was a black frame to the render watchdog without them)
      if (course.venue === 'slope') buildForest(ctx.scene, circuit, worldHeightFn(course), course.mood === 'alpine' ? '#2f5a3e' : '#3b6a4a').parent = detailRoot;
      if (course.mood === 'nightGame') buildEdgeLights(ctx.scene, circuit).parent = detailRoot;
      const key = `kart-${circuit.course.id}`; VENUE_PROP_SETS[key] = kartSceneryFor(circuit);
      sceneryGone = false; scenery?.dispose(); scenery = null;
      void mountVenueProps(ctx.scene, key, detailRoot, { snapToGround: true }).then((h) => { if (sceneryGone) h?.dispose(); else scenery = h; });
    }
    console.info(`[RACE-VENUE] ${course.id}: ${trackside.count} trackside instances`);
    // RACING WAS THE LAST FAMILY WITH NOBODY WATCHING. The board modes have had Onlookers since it landed;
    // both racing modes had an empty circuit, which reads as a test track rather than an event. The spots
    // come from the course's own geometry (start line + tightest corner) rather than being spread evenly —
    // nobody stands at uniform intervals around a racetrack.
    crowd?.dispose?.();
    crowd = trackside.crowdSpots.length
      ? new Onlookers(ctx.scene, trackside.crowdSpots, course.tint, course.start.at)
      : null;
    if (crowd) console.info(`[RACE-VENUE] ${crowd.count} trackside spectators`);
    road = buildRoad(ctx);
    marks = buildMarks(ctx);
    kart = buildKart(ctx);
    // models pass phase 5: the garage pick's Meshy body mounts under the root; the primitives hide when it arrives (and stay if it never does)
    { const k = kart; void dressVehicle(ctx.scene, k, 'kart', kartId, { hide: k.getChildMeshes(), y: KART_GROUND_Y }); }

    state = spawnKart(course.start.at, course.start.heading);
    if (circuit) state.pos.y = circuit.surfaceAt(state.pos.x, state.pos.z);
    prevPos.copyFrom(state.pos);
    kart.position.copyFrom(state.pos);
    kart.position.y = state.pos.y + KART_RIDE_Y;

    // THE DRIVER (2026-09-13). This mode shipped with a kart and NOBODY IN IT — a visible vehicle driving
    // itself, which is both the most unfinished thing a racing mode can show and a straight breach of the
    // rule that every body in a scene is a humanoid that moves well.
    //
    // Parented to the kart, so the seat carries the body: the kart already sets its own position and
    // heading every frame, and a driver parented to it inherits both without a second copy of that maths
    // that could drift by a frame. Posed with an authored seated stance (anim/authored/seated.ts) because
    // no sitting clip exists — keyed as BONE EULERS through the bind frame, which is the channel that means
    // the same thing at any yaw.
    driver = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, {
      position: new Vector3(0, 0, 0), yawRad: 0, startClip: 'idle_stand',
    });
    // PARK the animator, do not `stopAll` it: stopAll fades to idle_stand, which would be a second owner
    // overwriting the seated pose (it was, and the arms hung at the driver's sides). No clip ever plays on
    // this body — an authored stance is the only thing that drives it — so neverBindPose has nothing to
    // guard and is deliberately not applied here.
    driver.animator.park();
    driver.root.parent = kart;
    // A character's root is at its FEET, and a seated pose does not move the root — the hip joint stays
    // REF_HIPS_Y (0.96) above it whatever the legs do. So the root goes wherever puts the hips in the pan:
    // subtract that scaled offset instead of eyeballing a height, which is how the first attempt ended up
    // sitting the driver on the bodywork.
    driver.root.scaling.setAll(DRIVER_SCALE);         // a kart is small; a full-size body swamps it
    driver.root.position.set(0, KART_HIPS.y - REF_HIPS_Y * DRIVER_SCALE, KART_HIPS.z);
    const seatClip = buildPoseClip(ctx.scene, driver.skeleton, 'kart_seated', 0.5, seatedKeys());
    if (seatClip) { seatClip.start(true, 1, 0, 0.5, false); seated = seatClip; }
    else console.warn('[FEL-KART] seated pose could not be built — the driver stands');

    // the field: one simplified kart per rival, tinted so they are telling apart at speed
    // THE FIELD RACES THE ROAD (racing pass phase 6). It raced `buildRaceLine(course)` — straight chords between the
    // gates, off the tarmac on 13–50 % of every lap (29 m out on the summit's switchbacks) and 2–7 % shorter than the
    // road, so the rivals cut every corner across the grass. The circuit's own line is the road.
    line = circuit ? raceLineFromPoints(circuit.line.pts, course.loop) : buildRaceLine(course);
    // THE TIER drives the field's pace. `fieldFor` still decides how MANY rivals a course can hold (a tight
    // circuit cannot take eight karts whatever the difficulty), but how fast they run is the player's pick.
    const shape = fieldFor(course, kartSpec.vMax, kartSpec.grip);
    tier = readProfile();
    // +KART_FIELD_EDGE (racing pass phase 6): on the road — no longer cutting corners across the grass — a PRO field at the
    // tier's own edge let a clean driver at top speed pull 200 m clear in 50 s on STADIUM OVAL. One notch up: rookie runs
    // where the kart's fixed 0.5 used to, legend at the ceiling.
    rivals = makeField(shape.count, kartSpec.vMax, Math.min(1, tier.edge + KART_FIELD_EDGE));
    rivalKarts = rivals.map((r) => buildRivalKart(ctx, r.name, r.tint));
    for (const rk of rivalKarts) void dressVehicle(ctx.scene, rk, 'kart', 'rival', { hide: rk.getChildMeshes(), y: KART_GROUND_Y });   // phase 5: the field wears the fifth body
    playerDist = 0;
    // a fresh recorder per race, and whatever the device remembers for THIS course as the thing to chase
    ghostRec = new GhostRecorder();
    bestGhost = loadGhost(course.id);
    ghostDelta = null;
    // the standings you are carrying INTO this round — the reason a third race matters
    const cupAtStart = cupForCourse(course.id);
    cupLine = cupAtStart ? cupProgress(cupAtStart, loadResults(), 'me').headline : '';
    rivalHome = rivals.map((r) => r.lane); rivalStun = rivals.map(() => 0); rivalCool = rivals.map(() => 0); rivalTouch = rivals.map(() => false); edgeCool = 0; rivalAlongside = rivals.map(() => false);
    rivalKits = rivals.map(() => ({ item: null, itemAt: 0, shieldT: 0, zipT: 0, nextRow: 0, lap: 0 }));
    // ITEM ROWS: three balloons across the road on every leg, 62% of the way along it (the boost pads sit at 40% of every
    // other leg), the kinds cycling so a row always offers a choice
    pickups?.dispose(); pickups = new AeroPickups(ctx.scene, KART_PICKUP_SCALE);
    balloons = [];
    if (circuit) {
      const pts = [course.start.at, ...course.gates.map((gt) => gt.at)];
      let id = 0;
      for (let i = 1; i <= pts.length; i++) {
        const a = pts[i - 1], b = pts[i % pts.length];
        const mid = a.add(b.subtract(a).scale(0.62));
        const at = locate(circuit.line, mid.x, mid.z);
        const right = new Vector3(at.tangent.z, 0, -at.tangent.x);
        for (const [k, lat] of [-3.2, 0, 3.2].entries()) {
          const kind = ITEM_KINDS[(i + k) % ITEM_KINDS.length];
          balloons.push({ id: id++, kind, pos: at.point.add(right.scale(lat)).add(new Vector3(0, 1.3, 0)), respawn: 0 });
        }
      }
    }
    rowDists = [...new Set(balloons.map((b) => circuit ? Math.round(locate(circuit.line, b.pos.x, b.pos.z).dist) : 0))].sort((p, q) => p - q);
    pickups.setBalloons(balloons); pickups.setBananas([]);
    missiles = []; mines = [];

    // BOOST (FINISH-RELEASE): the trail streams off the kart; a pad sits on the straight into every other gate, 40% of
    // the way from the gate before, pointing along the line — a pad is a racing-line choice, not a scatter.
    boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: kart, trailWidth: 0.9, color: '#ff8a1f' });
    boostPads?.dispose();
    {
      const pts = [course.start.at, ...course.gates.map((gt) => gt.at)];
      const spots = [];
      for (let i = 1; i < pts.length; i += 2) {
        const a = pts[i - 1], b = pts[i];
        const at = a.add(b.subtract(a).scale(0.4)); at.y = 0;
        spots.push({ pos: at, yaw: Math.atan2(b.x - a.x, b.z - a.z), kind: 'pad' as const, radius: 3 });
      }
      boostPads = new BoostPads(ctx.scene, spots);   // SHARD-PICKUP: one colour for the mechanic
    }

    ctx.heroRef.current = kart;
    ctx.objectiveRef.current = null;
    // THE CAMERA'S BOX IS THE PLAY BOX (SCORECARD VISUALS, 2026-09-15). With no explicit bounds the director derived them
    // from the venue's shell meshes — the court-sized park at the start — and clamped the chase camera inside it while the
    // kart drove 200 m away: the rc10 late frame was the kart as a speck from the park. The course's wall is ±260 m.
    // …and over the ground: the road where there is road, the relief-following world ground everywhere else
    const groundHeight = worldHeightFn(course); const circ = circuit; worldHeight = groundHeight;
    ctx.camDirector.setBounds({
      minX: -402, maxX: 402, minZ: -402, maxZ: 402, minY: -0.1,
      groundAt: circ ? (x, z) => Math.max(circ.surfaceAt(x, z), groundHeight ? groundHeight(x, z) : -0.03) : undefined,
    });
    ctx.camDirector.snapTo(state.pos, null);
    tintMarks();
    say(`${course.name} — ${course.sub}`, 2.2);
    // THE PROBE SEAM (dev): where the kart is on the line, the field around it, what happened.
    (ctx.scene.metadata ??= {}).kart = {
      state: () => {
        const at = state && circuit ? locate(circuit.line, state.pos.x, state.pos.z) : null;
        return {
          // The race loop itself, so a probe can tell a race that FINISHED from one that merely stopped reporting.
          lap: race.lap, laps: course.laps, next: race.next, time: +race.time.toFixed(2), finished: race.finished, done: S.done,
          start: S.start.go ? S.start.outcome : `count ${S.start.beat}`,
          // THE LINE AHEAD (racing pass phase 6, dev seam): the yaw to a point a speed-scaled look-ahead down the line,
          // and the speed the corner coming up can be held at — what a driver who reads the road knows
          ...(() => {
            if (!state || !circuit || !at) return {};
            const v = Math.max(8, state.speed), p = pointAlong(circuit.line, at.dist + Math.max(10, v * 0.75)).pos;
            const r = cornerRadiusAt(circuit.line, at.dist + v * 1.1);
            return { aheadYaw: +Math.atan2(p.x - state.pos.x, p.z - state.pos.z).toFixed(3), cornerR: Math.round(r), holdV: +holdableSpeed(r, kartSpec.grip).toFixed(1), halfWidth: circuit.halfWidth };
          })(),
          along: +playerDist.toFixed(1), lateral: at ? +at.lateral.toFixed(2) : 0, speed: state ? +state.speed.toFixed(1) : 0,
          heading: state ? +state.heading.toFixed(3) : 0, tangentYaw: at ? +Math.atan2(at.tangent.x, at.tangent.z).toFixed(3) : 0, onRoad: state ? onTrack(state.pos, course) : true,
          place: rivals.length ? playerPosition(playerDist, rivals) : 1, item: S.held, events: { ...S.events },
          rivals: rivals.map((r, i) => ({ name: r.name, gap: +(r.dist - playerDist).toFixed(1), lateral: +r.lane.toFixed(2), stun: +rivalStun[i].toFixed(2), personality: personalityFor(i) })),
        };
      },
    };
    pushHud(ctx);
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }
    // RACING PASS phase 3 — the stick clicks. L3 held = LOOK BACK (handled before the done gate so a release on the end
    // card still lets go); R3 = who is around you, in seconds.
    if (e.t === 'button' && e.btn === 'LS') { ctx.camDirector.rearView = e.pressed && !S.done; return; }
    if (S.done) return;
    if (e.t === 'button' && e.btn === 'RS') {
      if (e.pressed) { ctx.juice.callout(aroundCall(rivals.map((r) => ({ name: r.name, gap: r.dist - playerDist })), state?.speed ?? 0), '#e2e8f0', 1400); SoundKit.play('uiTick', { pitch: 1.1, volume: 0.35 }); }
      return;
    }
    if (e.t === 'stick' && e.side === 'L') { S.input.steer = e.x; S.stickY = e.y; return; }
    // SCORECARD CONTROLS (2026-09-15): gas, brake and drift changed a number and nothing a player hears (76 % of presses
    // silent). A kart answers the pedal: the engine revs as the throttle goes down, the tyres squeal on the brake, the
    // drift hisses as it hooks up.
    if (e.t === 'trigger' && e.side === 'R') { if (S.input.throttle < 0.5 && e.value >= 0.5) SoundKit.play('whoosh', { pitch: 0.55, volume: 0.32 }); S.input.throttle = e.value; }
    if (e.t === 'trigger' && e.side === 'L') { if (S.input.brake < 0.5 && e.value >= 0.5) SoundKit.play('squeak', { pitch: 0.9, volume: 0.35 }); S.input.brake = e.value; }
    if (e.t === 'button' && e.btn === 'X') { if (e.pressed && !S.input.drift) SoundKit.play('swish', { pitch: 0.7, volume: 0.4 }); S.input.drift = e.pressed; }
    // BOOST is the shared held R1 (RB · Shift · the BOOST pill); A no longer dumps the meter.
    if (e.t === 'button' && e.btn === 'R1') S.boostHeld = e.pressed;
    if (e.t === 'button' && e.pressed && e.btn === 'A') { fireItem(ctx); return; }   // ITEMS: A fires what the last balloon gave you
    // TRICKS, only in the air. B and Y with a stick direction, the same binding the board modes use, so the
    // BUTTONS map on the start screen reads them without a special case. A press that cannot act is answered:
    // asking for a FULL SPIN off a kicker says so by name rather than quietly handing over something smaller.
    if (e.t === 'button' && e.pressed && (e.btn === 'B' || e.btn === 'Y')) {
      if (!S.air.airborne) { refuse(ctx, 'NOT IN THE AIR'); return; }
      const next = startTrick(S.air, S.input.steer, S.stickY, e.btn);
      S.air = next;
      if (next.refusal) refuse(ctx, next.refusal);
      else if (next.trick) { say(next.trick.label, 0.7); SoundKit.play('swish', { pitch: 1.15, volume: 0.42 }); }
    }
  },

  update(ctx: ModeContext, dt: number): void {
    crowd?.update(dt);   // they idle and bob whether or not the race is running
    if (!state || !kart || S.done) return;

    // ── THE START (racing pass phase 4, racing/RaceStart) ─────────────────────────────────────────────────────────
    // The field launched on frame one while the course name was still on screen. Now nobody moves until GO, the clock
    // does not run, and the throttle's timing against the beats is the first skill of the race.
    if (!S.start.go) {
      const st = stepStart(S.start, dt, S.input.throttle >= 0.5);
      S.start = st.state;
      if (st.beatChanged && S.start.beat > 0) { say(beatLabel(S.start.beat), 0.9); SoundKit.play('uiTick', { pitch: 0.85, volume: 0.55 }); ctx.juice.shake(0.02, 80); }
      if (!st.wentGo) {
        if (S.input.throttle >= 0.5 && Math.random() < dt * 8) EffectsKit.burst(ctx.scene, state.pos.clone(), 'dust');   // revving on the grid
        if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
        ctx.camDirector.look(S.lookX, S.lookY, dt);
        ctx.camDirector.update(kart.position, Vector3.Zero(), null);
        pushHud(ctx);
        return;
      }
      startBeat(ctx, S.start.outcome ?? 'normal');
    }

    prevPos.copyFrom(state.pos);
    // AIRBORNE COUNTS AS ON-ROAD. Off-track costs grip and top speed, and a kart over a rooftop gap is off the
    // polyline by definition — taxing a jump for leaving the road is the opposite of the intent.
    const on = S.air.airborne || onTrack(state.pos, course);
    if (!on) {
      S.offRoadSec += dt;
      // SCORECARD FEEL (2026-09-15): OFF THE ROAD was a number on the HUD and nothing else — the grass is a penalty you
      // should feel and hear, and it is most of what a driver who leaves the line experiences
      offRoadTick -= dt;
      if (offRoadTick <= 0) { offRoadTick = 0.45; ctx.feel.impact(0.12); SoundKit.play('rattle', { pitch: 0.8, volume: 0.22 }); EffectsKit.burst(ctx.scene, state.pos.clone(), 'dust'); }
      if (!offRoadSaid) { offRoadSaid = true; ctx.juice.callout('OFF THE ROAD', '#fca5a5', 600); }
    } else { offRoadTick = 0; offRoadSaid = false; }
    const bev = boost.update(dt, S.boostHeld, true);
    ctx.stamina?.(boost.meter);   // PLAYER RING: the ring's arc is the boost tank
    S.input.boostK = boost.k;
    // ITEMS: a boost balloon's ZIP rides the same ramp the meter does; the shield and a spin count down
    if (S.zipT > 0) { S.zipT = Math.max(0, S.zipT - dt); S.input.boostK = Math.max(S.input.boostK, 1); }
    S.shieldT = Math.max(0, S.shieldT - dt); S.spinT = Math.max(0, S.spinT - dt);
    if (S.spinT > 0) { S.input.throttle *= 0.3; }
    // a BURNOUT (throttle down on "3") is a beat of lost drive after GO — on a copy, so a held trigger is never rewritten
    if (S.burnT > 0) S.burnT = Math.max(0, S.burnT - dt);
    stepKart(state, S.burnT > 0 ? { ...S.input, throttle: Math.min(S.input.throttle, BURNOUT_THROTTLE) } : S.input, dt, on, kartSpec);

    // ── THE ROAD HAS HEIGHT NOW, so something has to put the kart on it ──────────────────────────────────
    //
    // stepKart moves x and z and leaves y alone, which was right while every kart course sat flat. On ALPINE
    // DESCENT's 96 m drop the kart would have held its starting height and flown, then sunk through the road on
    // the way back up. The line is the road, so the line's height is the kart's height.
    if (circuit) {
      let at = locate(circuit.line, state.pos.x, state.pos.z);
      // WRONG WAY (racing pass phase 5): the nose pointed back down the line, moving, for over a second — the plane
      // had this and the kart did not (a spin-out's own turn is exempt)
      if (S.spinT <= 0 && state.speed > 3 && Math.sin(state.heading) * at.tangent.x + Math.cos(state.heading) * at.tangent.z < -0.35) S.wrongT += dt; else S.wrongT = 0;
      if (S.wrongT > 1.2 && S.bannerT <= 0) { say('WRONG WAY', 0.8); SoundKit.play('miss', { volume: 0.35 }); }

      // ── THE OUTSIDE OF THE COURSE ───────────────────────────────────────────────────────────────────────
      // Measured by steering off with the throttle pinned: the kart reached 76 m from the line, still making
      // race distance at the on-road rate, with nothing to stop it. Past the verge the ground pulls it back —
      // harder the further out it is, settling a few metres over rather than pinning it. Not a wall, not a
      // respawn: leaving the line still costs time and grip, it just no longer leads out of the world.
      const pull = edgeReturn(at.lateral, edgeLimit(circuit.halfWidth), dt);
      if (pull !== 0) {
        state.pos.subtractInPlace(new Vector3(at.tangent.z, 0, -at.tangent.x).scale(pull));
        at = locate(circuit.line, state.pos.x, state.pos.z);   // the height below is read off the corrected place
        edgeCool -= dt;
        if (edgeCool <= 0) {
          edgeCool = 0.8;
          SoundKit.play('rattle', { pitch: 0.7, volume: 0.3 });
          ctx.juice.shake(0.06, 110);
          ctx.juice.callout('BACK TO THE TRACK', '#fca5a5', 600);
        }
      } else edgeCool = 0;
      const roadY = at.point.y;
      const lineLen = circuit.line.length;

      // A LIP CROSSED IS A LAUNCH. Measured by distance along the line rather than by touching a mesh: the ramp
      // mesh is cosmetic and a physics contact would miss at 26 m/s between frames.
      if (!S.air.airborne && S.lastDist !== null && Math.abs(at.lateral) < circuit.halfWidth) {
        const prev = S.lastDist, now = at.dist;
        for (const r of circuit.ramps) {
          const lip = r.dist + r.run * 0.5;
          if (crossedLip(prev, now, lip, lineLen) && state.speed > 6) {
            S.air = launch(S.air, { speed: state.speed, pitchDeg: r.pitch, boosting: boost.k > 0.2 });
            const hint = S.air.airSec >= 0.46 ? 'TRICK!' : 'AIR';
            say(hint, 0.6);
            SoundKit.play('whoosh', { pitch: 1.25, volume: 0.5 });
            break;
          }
        }
      }

      if (S.air.airborne) {
        const tangentDeg = (Math.atan2(at.tangent.x, at.tangent.z) * 180) / Math.PI;
        const headingDeg = (state.heading * 180) / Math.PI;
        let yawErr = ((headingDeg - tangentDeg + 540) % 360) - 180;
        const next = stepAir(S.air, dt, {
          groundClearance: S.air.height > 0.02 || S.air.t < dt * 1.5 ? 1 : -1,
          yawErrorDeg: yawErr,
        });
        S.air = next;

        if (next.landed) {
          const L = next.landed;
          const earn = boostEarnFor(L);
          if (earn) boost.earn(earn.what, earn.scale);
          if (L.trick && L.bailed) {
            say(`BAILED — ${L.trick.label}`, 1.1);
            SoundKit.play('squeak', { pitch: 0.7, volume: 0.5 });
          } else if (L.trick) {
            say(`${L.trick.label} +${L.pts}`, 1.2);
            ctx.juice.scorePop(kart.position.add(new Vector3(0, 1.8, 0)), `${L.trick.label} +${L.pts}`, '#fbbf24');
            ctx.momentum.report({ kind: 'chain', weight: 10 + L.pts * 0.2 });
            SoundKit.play('swish', { pitch: 1.5, volume: 0.55 });
          } else if (L.clean01 > 0.7 && L.airSec > 0.4) {
            SoundKit.play('thud', { pitch: 1.0, volume: 0.35 });
          }
        }
      }

      // ── OBSTACLES, only while the wheels are down ────────────────────────────────────────────────────
      if (!S.air.airborne && placedObstacles.length) {
        if (!stillTouching(S.touching, state.pos)) S.touching = null;
        const contact = obstacleContact(placedObstacles, state.pos, 1.1, S.touching);
        if (contact.hit) {
          // the cost is the TIME you lose, not a respawn: a race that stops for a cone is not a race
          state.speed *= contact.impact;
          state.slip = Math.min(MAX_SLIP, state.slip + (1 - contact.impact) * 0.8);
          S.touching = contact.hit;
          say(contact.hit.kind.toUpperCase(), 0.6);
          SoundKit.play('thud', { pitch: 0.8, volume: 0.45 });
          ctx.juice.shake?.(0.18 * (1 - contact.impact) * 4);
          ctx.momentum.report({ kind: 'blunder', weight: 6 * (1 - contact.impact) });
        }
        // a surface patch does not hit you, it just stops the road holding you — a corner taken through gravel
        // slides whether you asked for it or not, which is the one place the grip floor is meant to give
        if (contact.grip < 1) {
          state.slip = Math.min(MAX_SLIP, state.slip + (1 - contact.grip) * dt * 2.2);
          if (S.offRoadSec === 0) say(contact.grip < 0.5 ? 'GRAVEL' : 'WET', 0.5);
        }
      }

      // OFF THE ROAD THE KART RIDES THE MOUNTAIN, not the line's height: between two switchback legs the world ground
      // climbs toward the upper leg while the nearest line point is still the lower one, and the kart tunnelled 7 m
      // under the snow (measured on the summit's first hairpin) with the camera chasing it down there
      const groundY = worldHeight ? worldHeight(state.pos.x, state.pos.z) + 0.12 : -Infinity;
      state.pos.y = Math.max(roadY, groundY) + S.air.height;
      S.lastDist = at.dist;
    }

    // THE KART RIDES THE ROAD'S HEIGHT (2026-09-18). This was pinned to the flat ride height "because the track is
    // flat" — the rooftops, the mountain loops and the station platforms are not, so the kart drove at y 0 under a road
    // 56 m up with the chase camera under the terrain. state.pos.y is the road (or the air over it) every frame.
    kart.position.set(state.pos.x, state.pos.y + KART_RIDE_Y, state.pos.z);

    // THE FIELD MOVES. playerDist is PROGRESS ALONG THE ROAD (racing pass phase 6), laps plus where the kart projects
    // onto the circuit line — the axis the rivals now run. It was distance TRAVELLED, which counted every weave and
    // every metre on the grass: measured on SUMMIT CLIMB, the HUD read 1st to the end of a race the kart never
    // finished (a missed checkpoint, called OUT while "leading"). Cutting a corner still earns nothing the gates
    // do not allow. Aero Aces measures its pilot the same way.
    // Both seams at the line are RaceField.lapProgress's (tested): the grid, and the frame the kart wraps past zero
    // before the finish gate counts the lap — unhandled, a race led from the front ended "4th / 4" on six courses.
    if (circuit) playerDist = lapProgress(locate(circuit.line, state.pos.x, state.pos.z).dist, circuit.line.length, race.lap, race.next, course.gates.length);
    else playerDist += state.speed * dt;
    // THE GHOST RIDES THE SAME DISTANCE AXIS as the standings: progress is travelled distance over the whole race,
    // so the delta and the placing can never disagree about where the player is.
    if (ghostRec && state) {
      const full = Math.max(1, (circuit ? circuit.line.length : courseLength(course)) * course.laps);
      const progress = Math.min(1, playerDist / full);
      ghostRec.sample({ progress, t: race.time * 1000, x: state.pos.x, y: state.pos.y, z: state.pos.z });
      ghostDelta = deltaMs(bestGhost, progress, race.time * 1000);
    }
    // AN OVERTAKE IS THE HIGHLIGHT OF A RACE, and neither racing mode could see one happen -- both reported
    // nothing into the Game-Breaker layer, so the crowd was as loud in last as in first. `playerPosition`
    // already exists and the HUD already prints it; this only remembers last frame's. Improving a place
    // sings; losing one is quiet, because falling back is punishment enough and a jeer on every trade of
    // places during a scrap would be constant.
    if (rivals.length) {
      const place = playerPosition(playerDist, rivals);
      // SCORECARD FEEL (2026-09-15): an overtake, a lost place and a checkpoint moved a HUD number and a banner — the race
      // counted 0 juice beats a minute. The race is told in beats now: a pass pops over the kart, a lost place is called.
      if (lastPlace > 0 && place < lastPlace) { ctx.momentum.report({ kind: 'overtake', weight: 13 * (lastPlace - place) }); boost.earn('nearMiss', lastPlace - place); ctx.juice.scorePop(kart.position.add(new Vector3(0, 1.6, 0)), `P${place}`, '#86efac'); SoundKit.play('swish', { pitch: 1.3, volume: 0.4 }); }
      else if (lastPlace > 0 && place > lastPlace) ctx.juice.callout(`DOWN TO P${place}`, '#fca5a5', 600);
      lastPlace = place;
    }
    if (line) tickField(ctx, dt);   // RACE CONTACT + ITEMS: the rivals steer, bump, spin, pick up and fire
    // the BODY points where the nose does while the kart travels at the slip angle — that difference is the
    // drift, and showing it is the whole read
    kart.rotation.y = state.heading + (S.spinT > 0 ? S.spinT * 11 : 0);   // a shell or a punt spins the body; the travel carries on
    // the driver leans into the corner — shoulders following the turn, not a board rider's whole-body bank:
    // a seated body is belted in and cannot lean like that (8° at full lock against the boards' 22°)
    if (driver) {
      const want = driverLean(S.input.steer, Math.min(1, state.speed / Math.max(1, kartSpec.vMax)));
      driver.root.rotation.z += (want - driver.root.rotation.z) * Math.min(1, 8 * dt);
    }
    // and the wheel turns under the hands, on the same damping, so the two never disagree about the corner
    if (steerWheel) {
      const want = -S.input.steer * STEER_LOCK_RAD;
      steerWheel.rotation.y += (want - steerWheel.rotation.y) * Math.min(1, 8 * dt);
    }

    if (state.drifting) {
      S.bestDrift = Math.max(S.bestDrift, driftQuality(state));
      boost.earnOver('drift', dt, driftQuality(state));   // a CLEAN slide fills the shared meter (the kart's own bank is retired)
      if (Math.random() < 0.25) EffectsKit.burst(ctx.scene, state.pos.clone(), 'dust');
      // SCORECARD FEEL (2026-09-15): a slide that HOOKS UP is the kart's best moment and it was silent past the dust —
      // it calls itself while it holds (the race measured 1.5 juice beats a minute)
      driftCallT -= dt;
      if (driftQuality(state) > 0.55 && driftCallT <= 0) { driftCallT = 0.9; ctx.juice.callout('DRIFT', '#fbbf24', 420); SoundKit.play('squeak', { pitch: 1.1, volume: 0.25 }); }
    } else driftCallT = 0;
    // MINI-TURBO (racing pass phase 8, racing/MiniTurbo): the clean slide's sparks climb blue → orange → purple at the rear
    // wheels, and letting go fires a zip sized by the colour reached. The drift still fills the shared BOOST meter; this
    // is the MOMENT-TO-MOMENT pay, and the sparks are how you know what the release is worth before you let go.
    const mt = stepMini(S.mini, state.drifting, driftQuality(state), dt);
    S.mini = mt.state;
    if (S.mini.tier > 0 && Math.random() < dt * 14) EffectsKit.burst(ctx.scene, state.pos.clone(), 'sparks', 0.45 + 0.2 * S.mini.tier, MINI_COLOR[S.mini.tier]);
    if (mt.tierUp) SoundKit.play('uiTick', { pitch: 0.9 + 0.3 * mt.tierUp, volume: 0.4 });
    if (mt.released) {
      S.zipT = Math.max(S.zipT, MINI_ZIP_SEC[mt.released]); S.events.minis++;
      say(MINI_LABEL[mt.released], 0.8); SoundKit.play('whoosh', { pitch: 1.1 + 0.15 * mt.released, volume: 0.5 }); ctx.juice.flash(MINI_COLOR[mt.released], 50);
      console.info(`[RACE] mini-turbo ${mt.released}`);
    }
    if (boostPads && boostPads.update(dt, state.pos, boost) > 0) { say('BOOST PAD', 0.5); ctx.juice.scorePop(kart.position.add(new Vector3(0, 1.4, 0)), 'BOOST PAD', '#38bdf8'); }
    boostFx?.update(dt, boost, bev);
    if (bev.started) { ctx.feel.impact(0.3); say('BOOST!', 0.6); }
    if (bev.full) say('BOOST READY', 0.8);
    // RACING PASS phase 3: an empty press already ticks and flags the HUD pill; it now also SAYS what fills the tank
    if (bev.denied) ctx.juice.callout('BOOST EMPTY — DRIFT (X) TO FILL IT', '#94a3b8', 900);

    // the edge of the world: a wall you hit rather than an invisible stop. ±400 (was 260: the stadium oval runs to z 382 and the boardwalk pier
    // runs out to z 332, so the wall stood ACROSS the road there; the world ground is sized off the same number)
    if (Math.abs(state.pos.x) > WORLD_WALL || Math.abs(state.pos.z) > WORLD_WALL) {
      state.pos.x = Math.max(-WORLD_WALL, Math.min(WORLD_WALL, state.pos.x));
      state.pos.z = Math.max(-WORLD_WALL, Math.min(WORLD_WALL, state.pos.z));
      const lost = kartHitWall(state);
      if (lost > 3) {
        SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
        ctx.juice.shake(0.1, 140);
        say('WALL', 0.6);
      }
    }

    // THE RACE ENDS FOR EVERYONE — see RaceField.stepFinishGrace. Checked before the player's own gates so a player
    // crossing the line on the clock's last frame still finishes rather than being called out.
    if (line && rivals.length) {
      const leader = S.graceLeft === null ? fieldLeaderDone(rivals, line, course.laps) : null;
      const g = stepFinishGrace(S.graceLeft, dt, !!leader);
      S.graceLeft = g.left;
      if (g.started && leader) { SoundKit.play('whistle'); say(`${leader.name} FINISHED — ${Math.ceil(g.left ?? 0)}s TO THE LINE`, 1.8); }
      else if (g.tick !== null && g.tick > 0 && g.tick <= 5) { SoundKit.play('uiTick', { pitch: 1 + (5 - g.tick) * 0.08 }); say(`FINISH IN ${g.tick}`, 0.9); }
    }
    const res = stepRace(race, course, prevPos, state.pos, dt);
    if (res.gate) {
      SoundKit.play('score', { pitch: res.lap ? 1.2 : 1 });
      ctx.feel.impact(0.22);
      // FINAL LAP is its own sting (phase 5): the lap that decides the race is announced as that, not as a number
      const finalLap = res.lap && !res.finished && race.lap === course.laps;
      say(finalLap ? 'FINAL LAP!' : res.lap ? `LAP ${Math.min(race.lap, course.laps)}` : 'CHECKPOINT', finalLap ? 1.2 : 0.7);
      if (finalLap) { SoundKit.play('whistle', { pitch: 1.3 }); ctx.juice.callout('FINAL LAP', '#fde047', 900); }
      if (res.lap) { ctx.juice.flash('#fde68a', 90); ctx.juice.shake(0.04, 110); } else ctx.juice.scorePop(kart.position.add(new Vector3(0, 1.6, 0)), 'CHECKPOINT', '#7dd3fc');
      tintMarks();
    }
    if (res.finished || S.graceLeft === 0) { finish(ctx); return; }

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    ctx.camDirector.look(S.lookX, S.lookY, dt);
    ctx.camDirector.update(kart.position, travelOf(state).scale(state.speed), null);
    // SPEED YOU CANNOT SEE IS NOT SPEED. The lens widens toward top speed and eases back, normalised
    // against THIS mode's ceiling so flat-out feels the same in every discipline. Frame-independent:
    // see SpeedFov (a per-frame lerp settles 2.4x faster at 144 fps than at 60).
    baseFov ??= ctx.camera.fov;
    ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boost) ?? 1), state.speed, kartSpec.vMax, dt);
    pushHud(ctx);
  },

  dispose(): void {
    boostFx?.dispose(); boostFx = null; boostPads?.dispose(); boostPads = null;
    crowd?.dispose?.(); crowd = null;
    kart?.dispose(); kart = null;
    for (const m of marks) m.dispose();
    for (const r of road) r.dispose();
    marks = []; road = [];
    // the driver is parented to the kart, so the kart's dispose takes the body with it — but the pose clip
    // is a scene-level AnimationGroup and has to be stopped and released on its own
    seated?.stop(); seated?.dispose(); seated = null;
    driver?.dispose(); driver = null;
    steerWheel = null;
    venueRoot?.dispose(); venueRoot = null; worldGround?.dispose(); worldGround = null; trackside?.dispose(); trackside = null;
    roadTex?.dispose(); roadTex = null;
    for (const rk of rivalKarts) rk.dispose();
    pickups?.dispose(); pickups = null; missiles = []; mines = []; balloons = [];
    rivalKarts = []; rivals = []; line = null;
    ramps.forEach((m) => m.dispose());
    ramps = [];
    kerbRoot?.dispose(); sceneryGone = true; scenery?.dispose(); scenery = null; detailRoot?.dispose(); detailRoot = null; kerbRoot = null;
    obstacleRoot?.dispose(); obstacleRoot = null;
    placedObstacles = [];
    S.touching = null;
    S.air = idleAir();
    S.lastDist = null;
    state = null;
  },
};
}

export const VelocityKartMode: ModeDefinition = makeVelocityKartMode();
