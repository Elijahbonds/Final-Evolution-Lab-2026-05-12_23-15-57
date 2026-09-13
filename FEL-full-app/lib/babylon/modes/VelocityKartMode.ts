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

import { Color3, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import type { PBRMaterial } from '@babylonjs/core';
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
import { readKart } from '../racing/garage';

/** A kart is small; a full-size body swamps it. */
const DRIVER_SCALE = 0.92;

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
};

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
  // the ROOT is an empty the mode drives (position + heading); every part hangs off it in kart space, so no
  // part's own offset can be clobbered by the per-frame `kart.position.set(...)` in update()
  const rig = new TransformNode('kart', ctx.scene);

  // PBR, not StandardMaterial: these venues light for PBR (directional 2.60 + hemispheric 0.85) and a
  // StandardMaterial clips to white under that — this kart rendered WHITE instead of red. See VenueKit.paint.
  const paint = VenueKit.paint(ctx.scene, 'kart_paint', '#f25f5c', 0.08, 0.45);
  const dark = VenueKit.paint(ctx.scene, 'kart_tyre', '#15181f', 0.05, 0.92);

  const part = (name: string, dims: { width: number; height: number; depth: number }, at: [number, number, number], mat: PBRMaterial): Mesh => {
    const m = MeshBuilder.CreateBox(name, dims, ctx.scene);
    m.position.set(at[0], at[1], at[2]);
    m.material = mat;
    m.parent = rig;
    return m;
  };

  // the floor pan IS the kart — a slab you sit ON, not a block you sit on top of
  part('kart_body', { width: 1.08, height: 0.14, depth: 2.0 }, [0, KART_GROUND_Y + 0.13, 0], paint);
  // side pods: the walls the driver's hips sit between, which is what makes the gap in the middle a COCKPIT
  part('kart_pod_l', { width: 0.20, height: 0.34, depth: 1.15 }, [-0.62, KART_GROUND_Y + 0.30, -0.18], paint);
  part('kart_pod_r', { width: 0.20, height: 0.34, depth: 1.15 }, [0.62, KART_GROUND_Y + 0.30, -0.18], paint);
  // the nose the stretched-out legs reach to, with the pedals on it
  part('kart_nose', { width: 0.80, height: 0.18, depth: 0.66 }, [0, KART_GROUND_Y + 0.20, 0.92], paint);
  // PEDALS where the feet MEASURED out to (z 0.44, y −0.28), not where a nose cone happens to be — a foot
  // resting on bare floor pan is a foot that is not driving anything
  for (const side of [-1, 1]) {
    const pedal = part(`kart_pedal_${side > 0 ? 'r' : 'l'}`, { width: 0.16, height: 0.05, depth: 0.20 },
                       [side * 0.20, KART_GROUND_Y + 0.10, 0.46], dark);
    pedal.rotation.x = -18 * Math.PI / 180;
  }
  // a seat BACK, not a seat block: something to recline into, behind the hips rather than under them
  const back = part('kart_seat', { width: 0.60, height: 0.52, depth: 0.12 }, [0, KART_HIPS.y + 0.22, KART_HIPS.z - 0.32], paint);
  back.rotation.x = -14 * Math.PI / 180;

  // the engine sits on the right hip, the way a real kart's does — the one asymmetry that says "kart"
  part('kart_engine', { width: 0.34, height: 0.40, depth: 0.46 }, [0.52, KART_GROUND_Y + 0.32, -0.86], dark);

  // the wheel, and the column running down from it to the pan
  const col = MeshBuilder.CreateCylinder('kart_column', { diameter: 0.06, height: 0.46, tessellation: 8 }, ctx.scene);
  col.position.set(0, KART_WHEEL.y - 0.20, KART_WHEEL.z + 0.10);
  col.rotation.x = KART_WHEEL.tiltDeg * Math.PI / 180;
  col.material = dark;
  col.parent = rig;
  // the tilt lives on a HUB and the ring is its child, so the ring's own rotation.y spins it about the column
  // rather than about world up — Babylon composes Y·X·Z, so a y on the tilted mesh itself would not
  const hub = new TransformNode('kart_wheel_hub', ctx.scene);
  hub.position.set(0, KART_WHEEL.y, KART_WHEEL.z);
  hub.rotation.x = (90 - KART_WHEEL.tiltDeg) * Math.PI / 180;
  hub.parent = rig;
  const wheel = MeshBuilder.CreateTorus('kart_wheel_steer', { diameter: WHEEL_RADIUS * 2, thickness: 0.045, tessellation: 18 }, ctx.scene);
  wheel.material = dark;
  wheel.parent = hub;
  steerWheel = wheel;

  // tyres: fronts narrow, rears fat, all four sitting ON the road rather than hovering over it
  for (const [i, [x, z, dia, wide]] of ([
    [-0.60, 0.74, 0.56, 0.20], [0.60, 0.74, 0.56, 0.20],
    [-0.66, -0.74, 0.64, 0.30], [0.66, -0.74, 0.64, 0.30],
  ] as const).entries()) {
    const w = MeshBuilder.CreateCylinder(`kart_wheel_${i}`, { diameter: dia, height: wide, tessellation: 14 }, ctx.scene);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, KART_GROUND_Y + dia / 2, z);
    w.material = dark;
    w.parent = rig;
  }
  return rig;
}

/** The road: a slab per segment of the centre line, so what you SEE is what onTrack() tests. */
function buildRoad(ctx: ModeContext): Mesh[] {
  const out: Mesh[] = [];
  // the tarmac was the worst StandardMaterial casualty: #2a2f38 × the venue's 3.45 of light came out a pale
  // blue-grey, so the whole course read as a sheet of sky-coloured plastic rather than a road
  const tarmac = VenueKit.paint(ctx.scene, 'kart_tarmac', '#2a2f38', 0.05, 0.95);
  const pts = [course.start.at, ...course.gates.map((g) => g.at)];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (!course.loop && i === pts.length - 1) break;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const slab = MeshBuilder.CreateBox(`kart_road_${i}`, { width: TRACK_HALF_WIDTH * 2, height: 0.08, depth: len }, ctx.scene);
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
    boost: Math.round(state.boost * 100),
    lap: `${Math.min(race.lap, course.laps)}/${course.laps}`,
    time: race.time.toFixed(1),
    toGate: Math.round(dist),
    drift: state.drifting ? Math.round(driftQuality(state) * 100) : 0,
    banner: S.banner,
    hint: 'RT throttle · X drift into the corner · A spend the boost',
  } satisfies Record<string, HudValue>);
}

function finish(ctx: ModeContext): void {
  if (S.done) return;
  S.done = true;
  const medal = medalFor(course, race.time, race.finished);
  SoundKit.play(medal === 'none' ? 'miss' : 'score');
  ctx.juice.hitStop(90);
  say(medal === 'none' ? `FINISHED ${race.time.toFixed(1)}s` : `${medal.toUpperCase()} — ${race.time.toFixed(1)}s`, 2.4);
  pushHud(ctx);
  ctx.end(race.finished ? `COMPLETE_${medal.toUpperCase()}` : 'OUT',
    Math.round(Math.max(0, course.gold * 2 - race.time) * 10), {
      seconds: Number(race.time.toFixed(2)), gates: race.passed, laps: race.lap,
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
    S.done = false; S.banner = ''; S.bannerT = 0; S.bestDrift = 0; S.offRoadSec = 0;
    S.input = { steer: 0, throttle: 0, brake: 0, drift: false, fire: false };

    // THE MAP AND THE KART ARE BOTH PICKS (2026-09-13). Read once, here, at mount — the world is built from
    // the course and the handling comes from the vehicle, and neither can be swapped under a running scene.
    course = readCourse('kart');
    kartSpec = readKart().spec;
    race = startRace();

    venueRoot = buildCourseVenue(ctx.scene, course);
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
    if (e.t === 'button' && e.btn === 'A') S.input.fire = e.pressed;
  },

  update(ctx: ModeContext, dt: number): void {
    if (!state || !kart || S.done) return;

    prevPos.copyFrom(state.pos);
    const on = onTrack(state.pos, course);
    if (!on) S.offRoadSec += dt;
    const wasBoosting = state.boosting > 0;
    stepKart(state, S.input, dt, on, kartSpec);

    // the kart rides the road; y is cosmetic here because the track is flat
    kart.position.set(state.pos.x, KART_RIDE_Y, state.pos.z);
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
      if (Math.random() < 0.25) EffectsKit.burst(ctx.scene, state.pos.clone(), 'dust');
    }
    if (!wasBoosting && state.boosting > 0) {
      SoundKit.play('whoosh', { pitch: 1.3, volume: 0.5 });
      ctx.feel.impact(0.3);
      say('BOOST!', 0.6);
    }

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

    const res = stepRace(race, course, prevPos, state.pos, dt);
    if (res.gate) {
      SoundKit.play('score', { pitch: res.lap ? 1.2 : 1 });
      ctx.feel.impact(0.22);
      say(res.lap ? `LAP ${Math.min(race.lap, course.laps)}` : 'CHECKPOINT', 0.7);
      tintMarks();
    }
    if (res.finished) { finish(ctx); return; }

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    ctx.camDirector.look(S.lookX, S.lookY, dt);
    ctx.camDirector.update(kart.position, travelOf(state).scale(state.speed), null);
    pushHud(ctx);
  },

  dispose(): void {
    kart?.dispose(); kart = null;
    for (const m of marks) m.dispose();
    for (const r of road) r.dispose();
    marks = []; road = [];
    // the driver is parented to the kart, so the kart's dispose takes the body with it — but the pose clip
    // is a scene-level AnimationGroup and has to be stopped and released on its own
    seated?.stop(); seated?.dispose(); seated = null;
    driver?.dispose(); driver = null;
    steerWheel = null;
    venueRoot?.dispose(); venueRoot = null;
    state = null;
  },
};
}

export const VelocityKartMode: ModeDefinition = makeVelocityKartMode();
