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

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, TransformNode } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  KART_STARTER, spawnKart, stepKart, travelOf, driftQuality, kartHitWall,
  type KartInput, type KartState,
} from '../core/KartModel';
import {
  KART_COURSES, startRace, stepRace, toNextGate, medalFor, onTrack, TRACK_HALF_WIDTH,
  type Course, type RaceProgress,
} from '../core/RaceCourse';

const SPEC = KART_STARTER;

export function makeVelocityKartMode(): ModeDefinition {
let kart: TransformNode | null = null;
let marks: Mesh[] = [];
let road: Mesh[] = [];
let course: Course = KART_COURSES[0];
let state: KartState | null = null;
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

function buildKart(ctx: ModeContext): TransformNode {
  const body = MeshBuilder.CreateBox('kart_body', { width: 1.3, height: 0.5, depth: 2.2 }, ctx.scene);
  const paint = new StandardMaterial('kart_paint', ctx.scene);
  paint.diffuseColor = Color3.FromHexString('#f25f5c');
  body.material = paint;

  const seat = MeshBuilder.CreateBox('kart_seat', { width: 0.7, height: 0.6, depth: 0.6 }, ctx.scene);
  seat.position.set(0, 0.5, -0.3);
  seat.material = paint;
  seat.parent = body;

  const dark = new StandardMaterial('kart_tyre', ctx.scene);
  dark.diffuseColor = Color3.FromHexString('#15181f');
  for (const [i, [x, z]] of ([[-0.78, 0.75], [0.78, 0.75], [-0.78, -0.75], [0.78, -0.75]] as const).entries()) {
    const w = MeshBuilder.CreateCylinder(`kart_wheel_${i}`, { diameter: 0.62, height: 0.26, tessellation: 14 }, ctx.scene);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, -0.05, z);
    w.material = dark;
    w.parent = body;
  }
  return body;
}

/** The road: a slab per segment of the centre line, so what you SEE is what onTrack() tests. */
function buildRoad(ctx: ModeContext): Mesh[] {
  const out: Mesh[] = [];
  const tarmac = new StandardMaterial('kart_tarmac', ctx.scene);
  tarmac.diffuseColor = Color3.FromHexString('#2a2f38');
  tarmac.specularColor = Color3.FromHexString('#0c0e12');
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
    const mat = new StandardMaterial(`kart_markMat_${i}`, ctx.scene);
    mat.diffuseColor = Color3.FromHexString('#2a2f38');
    m.material = mat;
    return m;
  });
}

function tintMarks(): void {
  marks.forEach((m, i) => {
    const mat = m.material as StandardMaterial | null;
    if (!mat) return;
    const next = i === race.next;
    mat.diffuseColor = Color3.FromHexString(next ? '#ffd75e' : '#3a4150');
    mat.emissiveColor = Color3.FromHexString(next ? '#4a3d12' : '#000000');
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
  mood: 'daylight',
  camPreset: 'runner',

  async load(ctx: ModeContext): Promise<void> {
    S.done = false; S.banner = ''; S.bannerT = 0; S.bestDrift = 0; S.offRoadSec = 0;
    S.input = { steer: 0, throttle: 0, brake: 0, drift: false, fire: false };

    if (typeof window !== 'undefined') {
      const want = new URLSearchParams(window.location.search).get('course');
      course = KART_COURSES.find((c) => c.id === want) ?? KART_COURSES[0];
    }
    race = startRace();

    VenueKit.buildPark(ctx.scene);
    road = buildRoad(ctx);
    marks = buildMarks(ctx);
    kart = buildKart(ctx);

    state = spawnKart(course.start.at, course.start.heading);
    prevPos.copyFrom(state.pos);
    kart.position.copyFrom(state.pos);
    kart.position.y = 0.42;

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
    stepKart(state, S.input, dt, on, SPEC);

    // the kart rides the road; y is cosmetic here because the track is flat
    kart.position.set(state.pos.x, 0.42, state.pos.z);
    // the BODY points where the nose does while the kart travels at the slip angle — that difference is the
    // drift, and showing it is the whole read
    kart.rotation.y = state.heading;

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
    state = null;
  },
};
}

export const VelocityKartMode: ModeDefinition = makeVelocityKartMode();
