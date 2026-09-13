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

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh, TransformNode } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ModeContext, ModeDefinition, HudValue } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  AERO_TRAINER, spawnFlight, stepFlight, noseOf, levelOut, clampFlight,
  type FlightInput, type FlightState,
} from '../core/FlightModel';
import {
  AERO_COURSES, startRace, stepRace, toNextGate, medalFor, type Course, type RaceProgress,
} from '../core/RaceCourse';

const FRAME = AERO_TRAINER;
/** The world's lid, floor and walls. clampFlight holds the aircraft inside them. */
const CEILING = 520, FLOOR = 14, HALF_WORLD = 700;

export function makeAeroAcesMode(): ModeDefinition {
let plane: TransformNode | null = null;
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

  return body;
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
  mood: 'daylight',
  camPreset: 'descent',

  async load(ctx: ModeContext): Promise<void> {
    S.done = false; S.crashes = 0; S.banner = ''; S.bannerT = 0;
    S.input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, boost: false };

    // the course is DATA, so a map is a pick rather than a code path
    if (typeof window !== 'undefined') {
      const want = new URLSearchParams(window.location.search).get('course');
      course = AERO_COURSES.find((c) => c.id === want) ?? AERO_COURSES[0];
    }
    race = startRace();

    VenueKit.buildPark(ctx.scene);
    rings = buildRings(ctx);
    plane = buildPlane(ctx);

    flight = spawnFlight(course.start.at, course.start.heading, FRAME);
    prevPos.copyFrom(flight.pos);
    plane.position.copyFrom(flight.pos);

    ctx.heroRef.current = plane;
    ctx.objectiveRef.current = null;          // a chase cam has no second subject to frame
    ctx.camDirector.snapTo(flight.pos, null);
    tintRings();
    say(`${course.name} — ${course.sub}`, 2.2);
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
    for (const r of rings) r.dispose();
    rings = [];
    flight = null;
  },
};
}

export const AeroAcesMode: ModeDefinition = makeAeroAcesMode();
