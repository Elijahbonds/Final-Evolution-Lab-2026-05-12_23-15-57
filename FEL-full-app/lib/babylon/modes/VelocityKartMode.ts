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
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost (drift fills it, RB/Shift burns it)
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { Onlookers } from '../visual/Onlookers';
import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, Texture, TransformNode, Vector3, Vector4 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { buildPoseClip, REF_HIPS_Y } from '../anim/poseClip';
import { seatedKeys, driverLean, WHEEL_RADIUS, STEER_LOCK_RAD } from '../anim/authored/seated';
import type { AnimationGroup } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  KART_STARTER, spawnKart, stepKart, travelOf, driftQuality, kartHitWall,
  type KartInput, type KartState, type KartSpec,
} from '../core/KartModel';
import {
  KART_COURSES, readCourse, startRace, stepRace, toNextGate, medalFor, onTrack, TRACK_HALF_WIDTH,
  type Course, type RaceProgress,
} from '../core/RaceCourse';
import { buildCourseVenue } from '../racing/venueForCourse';
import { buildTrackside, type TracksideHandle } from '../racing/trackside';   // the world that follows the racing line
import { readProfile, profileFor, DEFAULT_TIER } from '../core/Difficulty';
import { taperedPlank, taperedSection, roadWheel } from '../racing/shapes';
import {
  buildRaceLine, makeField, stepRival, rivalPlacement, playerPosition, ordinal, fieldLeaderDone, stepFinishGrace, fieldFor,
  type RaceLine, type Rival,
} from '../racing/RaceField';
import { readKart } from '../racing/garage';

/** A kart is small; a full-size body swamps it. */
const DRIVER_SCALE = 0.92;

/** The camera preset's resting fov, captured on the first frame after load and restored to by SpeedFov. */
let baseFov: number | null = null;
/** Last frame's finishing place, so an OVERTAKE can be detected as a change rather than a state. */
let lastPlace = 0;

export function makeVelocityKartMode(): ModeDefinition {
let kart: TransformNode | null = null;
let marks: Mesh[] = [];
let road: Mesh[] = [];
let course: Course = KART_COURSES[0];
let state: KartState | null = null;
let driver: SpawnedCharacter | null = null;
let seated: AnimationGroup | null = null;
let steerWheel: Mesh | null = null;
let venueRoot: TransformNode | null = null;
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
/** The player's own distance along the racing line — what the standings are computed against. */
let playerDist = 0;
let tier = profileFor(DEFAULT_TIER);
/** The picked kart's handling. Defaults to the starter, so a mode with no pick is byte-identical to before. */
let kartSpec: KartSpec = KART_STARTER;
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
  /** THE FINISH CLOCK (MECHANICS PASS): seconds left to the line once the field's leader is home; null = not running. */
  graceLeft: null as number | null,
};
let boost = new BoostKit();
let boostFx: BoostFx | null = null;
let boostPads: BoostPads | null = null;

const say = (t: string, sec = 1.0): void => { S.banner = t; S.bannerT = sec; };

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

/** The road: a slab per segment of the centre line, so what you SEE is what onTrack() tests. */
function buildRoad(ctx: ModeContext): Mesh[] {
  const out: Mesh[] = [];
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
  const pts = [course.start.at, ...course.gates.map((g) => g.at)];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!course.loop && i === pts.length - 1) break;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    // ONE material, but the tiling is baked into each slab's UVs at creation — so a 220 m straight and a 60 m
    // arc carry the same SIZE of dash rather than the same NUMBER of them. Scaling the shared texture instead
    // would make every slab agree, which is the wrong thing to agree about.
    const tiles = Math.max(1, Math.round(len / (TRACK_HALF_WIDTH * 2)));
    const faceUV = Array.from({ length: 6 }, () => new Vector4(0, 0, 1, tiles));
    const slab = MeshBuilder.CreateBox(`kart_road_${i}`, {
      width: TRACK_HALF_WIDTH * 2, height: 0.08, depth: len, faceUV, wrap: true,
    }, ctx.scene);
    slab.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
    slab.rotation.y = Math.atan2(dx, dz);
    slab.material = tarmac;
    out.push(slab);
  }
  return out;
}

/** A bright slab across the road at each checkpoint, dim once taken. */
function buildMarks(ctx: ModeContext): Mesh[] {
  return course.gates.map((gate, i) => {
    const m = MeshBuilder.CreateBox(`kart_mark_${i}`, { width: TRACK_HALF_WIDTH * 2, height: 0.12, depth: 0.7 }, ctx.scene);
    m.position.set(gate.at.x, 0.1, gate.at.z);
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

function pushHud(ctx: ModeContext): void {
  if (!state) return;
  const { dist } = toNextGate(race, course, state.pos);
  ctx.setHud({
    speed: Math.round(state.speed * 3.6),                 // km/h reads better than m/s on a kart
    ...boost.hud(),
    lap: `${Math.min(race.lap, course.laps)}/${course.laps}`,
    time: race.time.toFixed(1),
    toGate: Math.round(dist),
    drift: state.drifting ? Math.round(driftQuality(state) * 100) : 0,
    pos: rivals.length ? `${ordinal(playerPosition(playerDist, rivals))} / ${rivals.length + 1}` : '',
    banner: S.banner,
    hint: 'RT throttle · X drift to fill BOOST · hold RB / Shift to burn it',
  } satisfies Record<string, HudValue>);
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
  ctx.end(race.finished ? `COMPLETE_${medal.toUpperCase()}` : 'OUT',
    Math.round(Math.max(0, course.gold * 2 - race.time) * 10), {
      seconds: Number(race.time.toFixed(2)), gates: race.passed, place, field: rivals.length + 1, laps: race.lap,
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
    lastPlace = 0;   // a remount must not inherit last race's place (it would read as an overtake on frame one)

    // THE MAP AND THE KART ARE BOTH PICKS (2026-09-13). Read once, here, at mount — the world is built from
    // the course and the handling comes from the vehicle, and neither can be swapped under a running scene.
    course = readCourse('kart');
    kartSpec = readKart().spec;
    race = startRace();

    venueRoot = buildCourseVenue(ctx.scene, course);
    // THE VENUE IS COURT-SIZED AND THE COURSE IS HUNDREDS OF METRES, so the world was a small island near
    // the start and the rest of the lap ran off into nothing (step-0 audit: this mode was one of the two
    // worst frames in the project). Trackside dresses the PATH instead, at whatever scale the course is.
    trackside?.dispose();
    trackside = buildTrackside(ctx.scene, course);
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

    state = spawnKart(course.start.at, course.start.heading);
    prevPos.copyFrom(state.pos);
    kart.position.copyFrom(state.pos);
    kart.position.y = KART_RIDE_Y;

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
    line = buildRaceLine(course);
    // THE TIER drives the field's pace. `fieldFor` still decides how MANY rivals a course can hold (a tight
    // circuit cannot take eight karts whatever the difficulty), but how fast they run is the player's pick.
    const shape = fieldFor(course, kartSpec.vMax, kartSpec.grip);
    tier = readProfile();
    rivals = makeField(shape.count, kartSpec.vMax, tier.edge);
    rivalKarts = rivals.map((r) => buildRivalKart(ctx, r.name, r.tint));
    playerDist = 0;

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
      boostPads = new BoostPads(ctx.scene, spots, '#ff8a1f');
    }

    ctx.heroRef.current = kart;
    ctx.objectiveRef.current = null;
    ctx.camDirector.snapTo(state.pos, null);
    tintMarks();
    say(`${course.name} — ${course.sub}`, 2.2);
    pushHud(ctx);
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    void ctx;
    if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }
    if (S.done) return;
    if (e.t === 'stick' && e.side === 'L') { S.input.steer = e.x; return; }
    if (e.t === 'trigger' && e.side === 'R') S.input.throttle = e.value;
    if (e.t === 'trigger' && e.side === 'L') S.input.brake = e.value;
    if (e.t === 'button' && e.btn === 'X') S.input.drift = e.pressed;
    // BOOST is the shared held R1 (RB · Shift · the BOOST pill); A no longer dumps the meter.
    if (e.t === 'button' && e.btn === 'R1') S.boostHeld = e.pressed;
  },

  update(ctx: ModeContext, dt: number): void {
    crowd?.update(dt);   // they idle and bob whether or not the race is running
    if (!state || !kart || S.done) return;

    prevPos.copyFrom(state.pos);
    const on = onTrack(state.pos, course);
    if (!on) S.offRoadSec += dt;
    const bev = boost.update(dt, S.boostHeld, true);
    S.input.boostK = boost.k;
    stepKart(state, S.input, dt, on, kartSpec);

    // the kart rides the road; y is cosmetic here because the track is flat
    kart.position.set(state.pos.x, KART_RIDE_Y, state.pos.z);

    // THE FIELD MOVES. playerDist is measured as distance TRAVELLED rather than progress along the line, so
    // a player who cuts a corner does not get credited for the metres they skipped — the standings read the
    // same racing line the rivals run.
    playerDist += state.speed * dt;
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
        stepRival(r, line, dt, playerDist, { topSpeed: kartSpec.vMax }, race.time);
        const at = rivalPlacement(r, line);
        const rk = rivalKarts[i];
        if (rk) { rk.position.set(at.pos.x, KART_RIDE_Y, at.pos.z); rk.rotation.y = at.heading; }
      }
    }
    // the BODY points where the nose does while the kart travels at the slip angle — that difference is the
    // drift, and showing it is the whole read
    kart.rotation.y = state.heading;
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
    }
    if (boostPads && boostPads.update(dt, state.pos, boost) > 0) say('BOOST PAD', 0.5);
    boostFx?.update(dt, boost, bev);
    if (bev.started) { ctx.feel.impact(0.3); say('BOOST!', 0.6); }
    if (bev.full) say('BOOST READY', 0.8);

    // the edge of the world: a wall you hit rather than an invisible stop
    if (Math.abs(state.pos.x) > 260 || Math.abs(state.pos.z) > 260) {
      state.pos.x = Math.max(-260, Math.min(260, state.pos.x));
      state.pos.z = Math.max(-260, Math.min(260, state.pos.z));
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
      say(res.lap ? `LAP ${Math.min(race.lap, course.laps)}` : 'CHECKPOINT', 0.7);
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
    venueRoot?.dispose(); venueRoot = null; trackside?.dispose(); trackside = null;
    roadTex?.dispose(); roadTex = null;
    for (const rk of rivalKarts) rk.dispose();
    rivalKarts = []; rivals = []; line = null;
    state = null;
  },
};
}

export const VelocityKartMode: ModeDefinition = makeVelocityKartMode();
