'use client';

/**
 * components/games/board-sports-3d.tsx
 *
 * BOARD SPORTS — one premium R3F implementation, three disciplines:
 *   mode="skate" -> venice-skatepark   (clip: skate_trick)
 *   mode="snow"  -> mountain-slope     (clip: snow_trick)
 *   mode="surf"  -> surf-break         (clip: surf_ride)
 *
 * Mount via app/play/<mode>/_components/loader.tsx inside GameShell
 * (see REFINEMENT.md for exact wiring + all flagged assumptions).
 *
 * Systems composed here (all in lib/board/):
 *   BoardPhysics (carve/air/landing) - trick-table (input grammar + scoring)
 *   ComboEngine (THPS bank/bail)     - GrindBalance (rail meter)
 *   BoostMeter (SSX adrenaline)      - BoardAudio (procedural WebAudio)
 *   BoardInput (synthetic-key bridge consumer)
 *
 * three-budget compliance: 2 dynamic lights total (in BoardEnvironment),
 * no shadows, instanced particles, dpr capped, zero per-frame allocations
 * (module-scope temps below), single procedural terrain mesh.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ── App contracts (paths per FILE_MAP.md; see REFINEMENT.md assumptions) ──
import { BoardAvatar as Avatar } from '@/components/three/board-avatar';
// import MapLoader from '@/components/three/map-loader'; // OPTIONAL: mount the
// venue GLB (/models/maps/venice-skatepark.glb etc.) behind the procedural
// terrain once collider/visual alignment is verified against the live map.

import {
  BoardPhysics,
  sampleTerrain,
  type BoardFrameEvents,
  type BoardInputFrame,
  type TerrainSample,
} from '../../lib/board/board-physics';
import {
  lookupTrick,
  scoreTrick,
  scoreSpinOnly,
  MODE_TRICK_CLIP,
  GRIND_POINTS_PER_SEC,
  type BoardModeId,
  type TrickDef,
} from '../../lib/board/trick-table';
import { ComboEngine } from '../../lib/board/combo-engine';
import { BoostMeter } from '../../lib/board/boost-meter';
import { GrindBalance, tryCatchRail, RAIL_SEGMENTS, type RailLock, type RailSegment } from '../../lib/board/grind-balance';
import {
  predictArc,
  arcColor,
  createAntiStall,
  updateAntiStall,
  createGrindChain,
  pushGrind,
  breakGrindChain,
  pickNextRail,
  type ArcClearance,
} from '../../lib/feel/board-flow';
import { BoardAudio } from '../../lib/board/board-audio';
import { BoardInput } from '../../lib/board/board-input';

import { BoardEnvironment, pickTimeOfDay, type TimeOfDayId } from '../three/board-environment';
import { BoardParticles, type ParticleEmitHandle } from '../three/board-particles';
import { SpeedLines } from '../three/speed-lines';
import { BoostTrail } from '../three/boost-trail';
import {
  BoardHud,
  createHudBus,
  createHudState,
  type BoardHudState,
  type HudBus,
} from './board-hud';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Documented avatar clip API — provided by components/three/board-avatar.tsx */
import type { AvatarClipHandle } from '@/components/three/board-avatar';
export type { AvatarClipHandle };

export interface BoardRunResult {
  score: number;
  bestCombo: number;
  tricksLanded: number;
  bails: number;
  maxSpeedNorm: number;
  mode: BoardModeId;
}

export interface BoardSports3DProps {
  mode: BoardModeId;
  durationSec?: number;
  timeOfDay?: TimeOfDayId | 'auto';
  onGameEnd?: (result: BoardRunResult) => void;
}

// ---------------------------------------------------------------------------
// Module-scope temps (never allocate in useFrame)
// ---------------------------------------------------------------------------

const _terr: TerrainSample = { h: 0, gx: 0, gz: 0 };
const _terrArc: TerrainSample = { h: 0, gx: 0, gz: 0 }; // Part 6 Fix 2 ghost-arc sampler (never clobbers _terr)
// Ghost-arc geometry cap: horizon 2.6s / step 0.05s => ~53 pts, round up. // TUNE(elijah)
const MAX_ARC_PTS = 64;
/** Highlight a rail as the next grind target within this radius. // TUNE(elijah) */
const NEXT_RAIL_RADIUS = 26;
const _events: BoardFrameEvents = {
  launched: false, ollie: false, landed: false, landingQuality: 'clean',
  landingSpinDeg: 0, landingAirTimeMs: 0, landingLateSpin: false, bailReason: '',
};
const _input: BoardInputFrame = {
  steer: 0, tuck: false, crouch: false, spin: 0, boost: false, grind: false,
};
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _look = new THREE.Vector3();

const PARTICLE_STYLE: Record<BoardModeId, { a: string; b: string; size: number; g: number }> = {
  skate: { a: '#a9926e', b: '#6b6257', size: 0.07, g: 7 },   // kickflip dust
  snow: { a: '#ffffff', b: '#bae6fd', size: 0.1, g: 8 },     // snow spray
  surf: { a: '#e0f7ff', b: '#67d1e8', size: 0.12, g: 12 },   // water wake
};

const BOARD_DIMS: Record<BoardModeId, [number, number, number]> = {
  skate: [0.24, 0.03, 0.82],
  snow: [0.3, 0.025, 1.5],
  surf: [0.52, 0.05, 2.3],
};

const GROUND_TINT: Record<BoardModeId, string> = {
  skate: '#2b2f38',
  snow: '#dfe9f5',
  surf: '#123a52',
};

// ---------------------------------------------------------------------------
// Procedural terrain (visual twin of the analytic collider)
// ---------------------------------------------------------------------------

interface TerrainPatchProps {
  mode: BoardModeId;
  targetRef: React.MutableRefObject<THREE.Group | null>;
}

/**
 * Renders the SAME heightfield the physics rides — visual/collider agreement
 * is guaranteed. Endless modes re-anchor the patch in 20m steps behind a
 * cheap resample; surf resamples every frame (3k verts) to animate the wave.
 */
function TerrainPatch({ mode, targetRef }: TerrainPatchProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const anchorZ = useRef(0);

  const { geometry, segX, segZ, sizeX, sizeZ } = useMemo(() => {
    const cfg = mode === 'skate'
      ? { segX: 64, segZ: 64, sizeX: 44, sizeZ: 44 }
      : mode === 'snow'
        ? { segX: 44, segZ: 72, sizeX: 60, sizeZ: 190 }
        : { segX: 44, segZ: 64, sizeX: 44, sizeZ: 130 };
    const geo = new THREE.PlaneGeometry(cfg.sizeX, cfg.sizeZ, cfg.segX, cfg.segZ);
    geo.rotateX(-Math.PI / 2);
    return { geometry: geo, ...cfg };
  }, [mode]);

  const resample = useCallback(
    (t: number, centerZ: number) => {
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const vertsX = segX + 1;
      const vertsZ = segZ + 1;
      for (let iz = 0; iz < vertsZ; iz++) {
        for (let ix = 0; ix < vertsX; ix++) {
          const idx = (iz * vertsX + ix) * 3;
          const wx = arr[idx];
          const wz = arr[idx + 2] + centerZ;
          sampleTerrain(mode, wx, wz, t, _terr);
          arr[idx + 1] = _terr.h;
        }
      }
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
    },
    [geometry, mode, segX, segZ]
  );

  useEffect(() => { resample(0, 0); }, [resample]);

  useFrame((state) => {
    const target = targetRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    if (mode === 'surf') {
      // animated wave — resample every frame, re-anchor as we travel
      const cz = Math.round((target?.position.z ?? 0) / 20) * 20;
      anchorZ.current = cz;
      mesh.position.z = cz;
      resample(t, cz);
    } else if (mode === 'snow') {
      const cz = Math.round((target?.position.z ?? 0) / 20) * 20;
      if (cz !== anchorZ.current) {
        anchorZ.current = cz;
        mesh.position.z = cz;
        resample(t, cz);
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={GROUND_TINT[mode]}
        roughness={mode === 'surf' ? 0.25 : 0.95}
        metalness={mode === 'surf' ? 0.35 : 0}
        transparent={mode === 'surf'}
        opacity={mode === 'surf' ? 0.94 : 1}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Chase camera with FOV kick + landing shake
// ---------------------------------------------------------------------------

interface ChaseCameraProps {
  targetRef: React.MutableRefObject<THREE.Group | null>;
  physicsRef: React.MutableRefObject<BoardPhysics>;
  fovKickRef: React.MutableRefObject<number>;  // extra degrees requested
  shakeRef: React.MutableRefObject<number>;    // impulse energy, decays here
}

function ChaseCamera({ targetRef, physicsRef, fovKickRef, shakeRef }: ChaseCameraProps) {
  const { camera } = useThree();

  useFrame((state, dt) => {
    const target = targetRef.current;
    const phys = physicsRef.current;
    if (!target) return;
    const step = Math.min(dt, 1 / 30);

    const fx = phys.forwardX();
    const fz = phys.forwardZ();
    const dist = 4.6 + phys.speedNorm * 1.8;
    const height = 2.1 + (phys.airborne ? 0.8 : 0);

    _camTarget.copy(target.position);
    _camDesired.set(
      _camTarget.x - fx * dist,
      _camTarget.y + height,
      _camTarget.z - fz * dist
    );
    camera.position.lerp(_camDesired, Math.min(1, step * 5));

    // landing shake: decaying noise injected into camera position
    shakeRef.current = Math.max(0, shakeRef.current - step * 3.2);
    if (shakeRef.current > 0.001) {
      const s = shakeRef.current * 0.18;
      const t = state.clock.elapsedTime;
      camera.position.x += Math.sin(t * 91.7) * s;
      camera.position.y += Math.sin(t * 113.3 + 2.1) * s;
    }

    _look.set(
      _camTarget.x + fx * 3.2,
      _camTarget.y + 1.15,
      _camTarget.z + fz * 3.2
    );
    camera.lookAt(_look);

    // FOV kick (boost / big air), damped both directions
    const persp = camera as THREE.PerspectiveCamera;
    const targetFov = 55 + fovKickRef.current;
    if (Math.abs(persp.fov - targetFov) > 0.01) {
      persp.fov += (targetFov - persp.fov) * Math.min(1, step * 6);
      persp.updateProjectionMatrix();
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Player rig + simulation
// ---------------------------------------------------------------------------

interface ActiveTrick {
  def: TrickDef;
  elapsedMs: number;
  done: boolean;
}

interface SimulationProps {
  mode: BoardModeId;
  durationSec: number;
  hudRef: React.MutableRefObject<BoardHudState>;
  bus: HudBus;
  inputRef: React.MutableRefObject<BoardInput>;
  audioRef: React.MutableRefObject<BoardAudio>;
  playerRef: React.MutableRefObject<THREE.Group | null>;
  fovKickRef: React.MutableRefObject<number>;
  shakeRef: React.MutableRefObject<number>;
  speedLinesRef: React.MutableRefObject<number>;
  speedLineColorRef: React.MutableRefObject<THREE.Color>;
  boostTrailRef: React.MutableRefObject<number>;
  physicsRef: React.MutableRefObject<BoardPhysics>;
  startedRef: React.MutableRefObject<boolean>;
  onEnd: (r: BoardRunResult) => void;
}

function Simulation({
  mode, durationSec, hudRef, bus, inputRef, audioRef, playerRef,
  fovKickRef, shakeRef, speedLinesRef, speedLineColorRef, boostTrailRef,
  physicsRef, startedRef, onEnd,
}: SimulationProps) {
  const avatarRef = useRef<AvatarClipHandle | null>(null);
  const spinGroupRef = useRef<THREE.Group>(null);
  const trickGroupRef = useRef<THREE.Group>(null);
  const leanGroupRef = useRef<THREE.Group>(null);
  const carveFxRef = useRef<ParticleEmitHandle>(null);
  const burstFxRef = useRef<ParticleEmitHandle>(null);
  const nextRailRef = useRef(-1);

  // Ghost trajectory arc (Part 6 Fix 2) — a dashed THREE.Line whose vertices we
  // rewrite each frame. Built once; never re-allocates.
  const ghostLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ARC_PTS * 3), 3));
    const mat = new THREE.LineDashedMaterial({
      color: '#00FF9D', dashSize: 0.35, gapSize: 0.22,
      transparent: true, opacity: 0.95, toneMapped: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    line.renderOrder = 5;
    return line;
  }, []);

  const sim = useRef({
    combo: new ComboEngine(),
    boost: new BoostMeter(),
    balance: new GrindBalance(),
    trick: null as ActiveTrick | null,
    trickUses: new Map<string, number>(),
    rail: null as RailLock | null,
    railT: 0,
    railChainMult: 1,                 // Part 6 Fix 4: current grind-chain point scale
    antiStall: createAntiStall(),     // Part 6 Fix 3: no dead-ends watchdog
    grindChain: createGrindChain(),   // Part 6 Fix 4: exponential grind chain
    arcHideT: 0,                      // Part 6 Fix 2: seconds left to keep arc after takeoff
    timeLeft: durationSec,
    timeScale: 1,          // bail slow-mo
    emitAcc: 0,
    score: 0,
    tricksLanded: 0,
    bails: 0,
    maxSpeedNorm: 0,
    wasBoosting: false,
    wasTricky: false,
    lastTickSecond: -1,
    ridePoseSet: false,
    ended: false,
  });

  const style = PARTICLE_STYLE[mode];

  // riding stance: loop the discipline clip's first beat as an idle-on-board.
  // ASSUMPTION: avatar.scrub(clip, t) freezes a pose; falls back to a slow
  // looped play of the same clip (see REFINEMENT.md).
  const setRidePose = useCallback(() => {
    const s = sim.current;
    if (s.ridePoseSet) return;
    const av = avatarRef.current;
    if (!av) return;
    if (av.scrub) av.scrub(MODE_TRICK_CLIP[mode], 0.05);
    else av.play(MODE_TRICK_CLIP[mode], { loop: true, fade: 0.25 });
    s.ridePoseSet = true;
  }, [mode]);

  useFrame((state, rawDt) => {
    const s = sim.current;
    const phys = physicsRef.current;
    const input = inputRef.current;
    const audio = audioRef.current;
    const player = playerRef.current;
    if (!player || s.ended) return;

    // ── pre-drop-in hold ───────────────────────────────────────────────────
    // The rider sits ready on the board at the start line: idle pose is set,
    // the scene is fully lit + populated (never a void), but NO timer drain
    // and NO physics until the player actually taps to drop in. This is the
    // single gate that keeps the clock honest for this mode (M12.4).
    if (!startedRef.current) {
      player.position.set(phys.x, phys.y, phys.z);
      player.rotation.y = phys.heading;
      if (!phys.airborne && !phys.isWipedOut && !s.rail) setRidePose();
      // keep HUD showing the full clock, no speed, no combo
      const hud0 = hudRef.current;
      hud0.timeRemaining = s.timeLeft;
      hud0.speedNorm = 0;
      return;
    }

    // ── time + slow-mo ─────────────────────────────────────────────────────
    s.timeScale += (1 - s.timeScale) * Math.min(1, rawDt * 2.2);
    const dt = Math.min(rawDt, 1 / 30) * s.timeScale;
    const tNow = state.clock.elapsedTime;

    s.timeLeft = Math.max(0, s.timeLeft - dt);
    const wholeSecond = Math.ceil(s.timeLeft);
    if (s.timeLeft <= 5 && wholeSecond !== s.lastTickSecond && s.timeLeft > 0) {
      s.lastTickSecond = wholeSecond;
      audio.countdownTick();
    }

    // ── input snapshot ─────────────────────────────────────────────────────
    _input.steer = input.steer();
    _input.tuck = input.tuck();
    _input.crouch = input.crouch();
    _input.spin = input.spin();
    _input.boost = input.boost();
    _input.grind = input.grind();

    // ── boost ──────────────────────────────────────────────────────────────
    s.boost.update(dt, _input.boost && !phys.isWipedOut);
    if (s.boost.active && !s.wasBoosting) { audio.boostIgnite(); audio.startBoostLoop(); }
    if (!s.boost.active && s.wasBoosting) audio.stopBoostLoop();
    s.wasBoosting = s.boost.active;
    if (s.boost.tricky && !s.wasTricky) { audio.trickyFanfare(); bus.emit({ kind: 'tricky' }); }
    s.wasTricky = s.boost.tricky;

    // ── grind lock ─────────────────────────────────────────────────────────
    if (s.rail) {
      const lock = s.rail;
      const speedAlong = Math.max(3, phys.speed);
      s.railT += (speedAlong * dt) / lock.length;
      const alive = s.balance.update(_input.steer, dt);
      audio.setGrindStress(Math.abs(s.balance.balance));
      s.combo.addGrindPoints(GRIND_POINTS_PER_SEC * dt * s.railChainMult); // Part 6 Fix 4

      const px = lock.rail.ax + (lock.rail.bx - lock.rail.ax) * s.railT;
      const pz = lock.rail.az + (lock.rail.bz - lock.rail.az) * s.railT;
      let py = lock.rail.y;
      if (mode === 'snow') { sampleTerrain(mode, px, pz, tNow, _terr); py = _terr.h + 0.5; }
      phys.snapTo(px, py, pz, Math.atan2(lock.dirX, -lock.dirZ));

      const railDone = s.railT <= 0 || s.railT >= 1;
      const wantsOff = _input.crouch; // pop off with ollie
      if (!alive) {
        endGrind(); triggerBail('rail-slip', 0);
      } else if (railDone || wantsOff) {
        endGrind();
        phys.launch(wantsOff ? 5 : 2.4);
        audio.ollie(0.4);
      }
    } else {
      // ── free physics ─────────────────────────────────────────────────────
      const wasWiped = phys.isWipedOut;
      phys.update(_input, dt, tNow, s.boost.speedMultiplier(), _events);

      // catch a rail on descent
      if (
        phys.airborne && _input.grind && phys.vy < 0 && !s.trick &&
        (mode === 'skate' || mode === 'snow')
      ) {
        const lock = tryCatchRail(mode, phys.x, phys.z, phys.forwardX(), phys.forwardZ());
        if (lock) {
          s.rail = lock;
          s.railT = lock.t;
          s.balance.start((Date.now() & 0xffff) || 7);
          // Part 6 Fix 4: each unbroken grind escalates the chain multiplier.
          s.railChainMult = pushGrind(s.grindChain);
          const catchPts = Math.round(120 * s.railChainMult);
          s.combo.addTrick(catchPts); // the grind catch itself scores (chain-scaled)
          bus.emit({ kind: 'trick', name: mode === 'snow' ? 'Rail Jib' : '50-50 Grind', points: catchPts, stale: false });
          audio.startGrindLoop();
          input.clearTricks();
        }
      }

      // ── frame events ─────────────────────────────────────────────────────
      if (_events.launched) {
        s.ridePoseSet = false;
        if (_events.ollie) audio.ollie(phys.crouchCharge);
        fovKickRef.current = Math.max(fovKickRef.current, 4);
      }

      if (_events.landed) {
        const incomplete = s.trick !== null && !s.trick.done;
        if (_events.landingQuality === 'bail' || incomplete) {
          if (incomplete && _events.landingQuality !== 'bail') phys.bail();
          triggerBail(
            incomplete ? 'trick-incomplete' : _events.bailReason,
            _events.landingAirTimeMs
          );
        } else {
          // clean / sketchy touchdown
          s.trick = null;
          const spinScore = scoreSpinOnly(
            _events.landingSpinDeg,
            s.trickUses.get('spin') ?? 0
          );
          if (spinScore) {
            s.trickUses.set('spin', (s.trickUses.get('spin') ?? 0) + 1);
            s.combo.addTrick(spinScore.points);
            bus.emit({ kind: 'trick', name: spinScore.name, points: spinScore.points, stale: spinScore.stale });
          }
          audio.trickLand(_events.landingQuality);
          if (_events.landingQuality === 'sketchy') bus.emit({ kind: 'sketchy' });
          shakeRef.current = Math.min(1, 0.3 + _events.landingAirTimeMs / 2500);
          burstFxRef.current?.emit(
            phys.x, phys.y + 0.05, phys.z,
            0, 0.6, 0, 14, 1.1, 2.4
          );
        }
      }

      // recover moment: back on the board after a wipeout
      if (wasWiped && !phys.isWipedOut) {
        avatarRef.current?.play('run', { loop: true, fade: 0.15 });
        s.ridePoseSet = false;
      }
    }

    // ── Part 6 Fix 3: no dead ends (invisible auto-boost push pad) ─────────
    // When a rider stalls out on the ground (no ramp exit, lost all momentum)
    // for too long, a hidden push pad restores cruising speed so no segment
    // can ever trap the player. Level-design fix, not a physics rewrite.
    {
      const groundedNow = !phys.airborne && !phys.isWipedOut && !s.rail;
      const as = updateAntiStall(s.antiStall, phys.speed, dt, groundedNow);
      if (as.push) {
        phys.speed = Math.max(phys.speed, as.pushTo);
        fovKickRef.current = Math.max(fovKickRef.current, 3);
        boostTrailRef.current = Math.max(boostTrailRef.current, 0.5);
      }
    }

    // ── tricks (air only) ──────────────────────────────────────────────────
    if (phys.airborne && !s.rail) {
      let press = input.nextTrickPress();
      while (press) {
        if (!s.trick) {
          if (press.button === 'special' && !s.boost.tricky) {
            press = input.nextTrickPress();
            continue;
          }
          const def = lookupTrick(press.button, press.dir);
          s.trick = { def, elapsedMs: 0, done: false };
          avatarRef.current?.play(MODE_TRICK_CLIP[mode], { loop: false, fade: 0.08 });
          s.ridePoseSet = false;
          audio.trickWhoosh();
        }
        press = input.nextTrickPress();
      }
    } else {
      input.clearTricks();
    }

    if (s.trick && !s.trick.done) {
      s.trick.elapsedMs += dt * 1000;
      if (s.trick.elapsedMs >= s.trick.def.durationMs) {
        s.trick.done = true;
        const def = s.trick.def;
        const uses = s.trickUses.get(def.id) ?? 0;
        s.trickUses.set(def.id, uses + 1);
        const scored = scoreTrick(def, mode, 0, uses);
        s.combo.addTrick(scored.points);
        s.tricksLanded += 1;
        if (def.special) s.boost.spendSpecial();
        bus.emit({ kind: 'trick', name: scored.name, points: scored.points, stale: scored.stale });
      }
    }

    // ── combo banking ──────────────────────────────────────────────────────
    const groundedSettled = !phys.airborne && !s.rail && !phys.isWipedOut;
    const preBankMultiplier = s.combo.snapshot().multiplier; // capture before reset
    const banked = s.combo.update(dt * 1000, groundedSettled);
    if (banked > 0) {
      s.score += banked;
      s.boost.addFromPoints(banked, 0, tNow);
      audio.bank(preBankMultiplier);
      bus.emit({ kind: 'banked', amount: banked, multiplier: preBankMultiplier });
      // Part 6 Fix 4: the combo line settled — the grind chain ends with it.
      breakGrindChain(s.grindChain);
      s.railChainMult = 1;
    }

    // ── presentation: rig pose ─────────────────────────────────────────────
    sampleTerrain(mode, phys.x, phys.z, tNow, _terr);
    player.position.set(phys.x, phys.y, phys.z);
    player.rotation.y = phys.heading;

    if (spinGroupRef.current) {
      spinGroupRef.current.rotation.y = phys.airborne
        ? (phys.spinDeg * Math.PI) / 180
        : 0;
    }
    if (leanGroupRef.current) {
      const lean = phys.airborne ? 0 : -_input.steer * 0.32 * phys.speedNorm;
      leanGroupRef.current.rotation.z +=
        (lean - leanGroupRef.current.rotation.z) * Math.min(1, dt * 10);
      // slope pitch alignment when grounded
      const pitch = phys.airborne
        ? 0
        : Math.atan2(-(_terr.gx * phys.forwardX() + _terr.gz * phys.forwardZ()), 1) * 0.7;
      leanGroupRef.current.rotation.x +=
        (pitch - leanGroupRef.current.rotation.x) * Math.min(1, dt * 8);
      // crouch squash for ollie load readability
      const squash = 1 - phys.crouchCharge * 0.16;
      leanGroupRef.current.scale.y +=
        (squash - leanGroupRef.current.scale.y) * Math.min(1, dt * 12);
    }
    if (trickGroupRef.current) {
      const tg = trickGroupRef.current;
      if (phys.isWipedOut) {
        // procedural tumble (no bail mocap yet — NEXT tier)
        tg.rotation.x += dt * 9;
        tg.rotation.z += dt * 5.4;
      } else if (s.trick && !s.trick.done) {
        const p = Math.min(1, s.trick.elapsedMs / s.trick.def.durationMs);
        const ease = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
        tg.rotation.z = s.trick.def.boardRoll * Math.PI * 2 * ease;
        tg.rotation.x = s.trick.def.boardPitch * Math.PI * 2 * ease;
      } else {
        tg.rotation.x *= Math.max(0, 1 - dt * 14);
        tg.rotation.z *= Math.max(0, 1 - dt * 14);
      }
    }
    if (!phys.airborne && !phys.isWipedOut && !s.rail) setRidePose();

    // ── terrain feel: carve particles ──────────────────────────────────────
    const carveRate =
      phys.carveIntensity > 0.18 ? phys.carveIntensity * 70 : mode === 'surf' && !phys.airborne ? 14 : 0;
    s.emitAcc += carveRate * dt;
    const n = Math.min(4, Math.floor(s.emitAcc));
    if (n > 0) {
      s.emitAcc -= n;
      carveFxRef.current?.emit(
        phys.x - phys.forwardX() * 0.4,
        phys.y + 0.06,
        phys.z - phys.forwardZ() * 0.4,
        -phys.forwardX() * 0.6 - _input.steer * phys.forwardZ() * 0.8,
        0.5,
        -phys.forwardZ() * 0.6 + _input.steer * phys.forwardX() * 0.8,
        n, 0.5, 1.6 + phys.speedNorm * 2.2
      );
    }

    // ── screen feel: speed lines + FOV + trail ─────────────────────────────
    const speedFeel = Math.max(0, (phys.speedNorm - 0.55) / 0.45);
    speedLinesRef.current = Math.min(1, speedFeel * 0.7 + (s.boost.active ? 0.55 : 0));
    speedLineColorRef.current.set(s.boost.active ? '#ffd98a' : '#eaf6ff');
    boostTrailRef.current = s.boost.active ? (s.boost.tricky ? 1 : 0.7) : 0;
    fovKickRef.current = Math.max(
      s.boost.active ? (s.boost.tricky ? 13 : 9) : 0,
      phys.airborne ? 4 : 0
    );

    // ── audio loops ────────────────────────────────────────────────────────
    audio.setCarveIntensity(
      mode,
      phys.airborne || phys.isWipedOut ? 0 : Math.max(phys.carveIntensity, mode === 'surf' ? 0.25 : 0.08),
      phys.speedNorm
    );

    // ── HUD sync ───────────────────────────────────────────────────────────
    s.maxSpeedNorm = Math.max(s.maxSpeedNorm, phys.speedNorm);
    const snap = s.combo.snapshot();
    const hud = hudRef.current;
    hud.score = s.score;
    hud.comboBase = snap.baseSum;
    hud.comboMultiplier = snap.multiplier;
    hud.comboOpen = snap.open;
    hud.chainWindow = snap.chainWindow;
    hud.grinding = s.rail !== null;
    hud.grindChain = s.grindChain.count;
    hud.balance = s.balance.balance;

    // ── Part 6 Fix 2: ghost trajectory arc (readability) ───────────────────
    // Visible while charging an ollie on the ground, and for 0.5s after
    // takeoff. Color = clear(green)/marginal(yellow)/won't-land(red).
    if (_events.launched) s.arcHideT = 0.5; // TUNE(elijah)
    if (s.arcHideT > 0) s.arcHideT -= dt;
    const charging = !phys.airborne && !phys.isWipedOut && !s.rail && phys.crouchCharge > 0.03;
    updateGhostArc(charging || (phys.airborne && s.arcHideT > 0), tNow);

    // ── Part 6 Fix 4: paint the next grind target green ────────────────────
    nextRailRef.current = pickNextRail(
      RAIL_SEGMENTS[mode], phys.x, phys.z, phys.forwardX(), phys.forwardZ(), NEXT_RAIL_RADIUS,
    );
    hud.boost = s.boost.value;
    hud.boostActive = s.boost.active;
    hud.tricky = s.boost.tricky;
    hud.rhythm = s.boost.rhythm;
    hud.rhythmMult = s.boost.rhythmMult();
    hud.speedNorm = phys.speedNorm;
    hud.airborne = phys.airborne;
    hud.wipeout = phys.isWipedOut;
    hud.timeRemaining = s.timeLeft;

    // ── run end ────────────────────────────────────────────────────────────
    if (s.timeLeft <= 0 && !s.ended) {
      s.ended = true;
      s.score += s.combo.bank(); // settle any open line honestly
      audio.matchEnd();
      audio.stopCarveLoop();
      audio.stopBoostLoop();
      audio.stopGrindLoop();
      onEnd({
        score: s.score,
        bestCombo: s.combo.bestCombo,
        tricksLanded: s.tricksLanded,
        bails: s.bails,
        maxSpeedNorm: s.maxSpeedNorm,
        mode,
      });
    }

    // ── helpers (closures over this frame) ─────────────────────────────────
    function endGrind() {
      s.rail = null;
      s.balance.end();
      audio.stopGrindLoop();
    }

    function groundAtArc(x: number, z: number): number {
      sampleTerrain(mode, x, z, tNow, _terrArc);
      return _terrArc.h;
    }
    function slopeAtArc(x: number, z: number): number {
      sampleTerrain(mode, x, z, tNow, _terrArc);
      return Math.hypot(_terrArc.gx, _terrArc.gz);
    }
    function updateGhostArc(show: boolean, _t: number) {
      if (!show) { ghostLine.visible = false; return; }
      const vy0 = phys.airborne
        ? phys.vy
        : phys.cfg.olliePopBase + phys.cfg.olliePopCharge * phys.crouchCharge + phys.speed * 0.1;
      const res = predictArc(
        {
          x0: phys.x, y0: phys.y + 0.15, z0: phys.z, vy0,
          speed: Math.max(phys.speed, 3),
          fx: phys.forwardX(), fz: phys.forwardZ(),
          gravity: phys.cfg.gravity,
        },
        groundAtArc, slopeAtArc,
      );
      const geo = ghostLine.geometry;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const N = Math.min(res.points.length, MAX_ARC_PTS);
      for (let i = 0; i < N; i++) {
        const p = res.points[i];
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y + 0.06; arr[i * 3 + 2] = p.z;
      }
      attr.needsUpdate = true;
      geo.setDrawRange(0, N);
      (ghostLine.material as THREE.LineDashedMaterial).color.set(arcColor(res.clearance as ArcClearance));
      ghostLine.computeLineDistances();
      ghostLine.visible = true;
    }

    function triggerBail(reason: string, airTimeMs: number) {
      const lost = s.combo.bail();
      s.trick = null;
      s.bails += 1;
      breakGrindChain(s.grindChain); // Part 6 Fix 4: a wipeout kills the chain
      s.railChainMult = 1;
      s.timeScale = 0.35; // slow-mo sting, eases back automatically
      shakeRef.current = 1;
      audio.bail();
      bus.emit({ kind: 'bail', lost, reason });
      burstFxRef.current?.emit(
        phys.x, phys.y + 0.4, phys.z,
        0, 1, 0, 26, 1.6, 3 + airTimeMs / 1200
      );
    }
  });

  const dims = BOARD_DIMS[mode];

  return (
    <>
      <group ref={playerRef}>
        <group ref={spinGroupRef}>
          <group ref={leanGroupRef}>
            <group ref={trickGroupRef}>
              {/* the board */}
              <mesh position={[0, 0.12, 0]}>
                <boxGeometry args={dims} />
                <meshStandardMaterial color="#1a1d24" roughness={0.6} metalness={0.2} />
              </mesh>
              <mesh position={[0, 0.135, 0]}>
                <boxGeometry args={[dims[0] * 0.5, 0.006, dims[2] * 0.9]} />
                <meshStandardMaterial
                  color="#38bdf8"
                  emissive="#38bdf8"
                  emissiveIntensity={0.6}
                  toneMapped={false}
                />
              </mesh>
              {/* rider — app avatar (clip API per FILE_MAP.md) */}
              <Avatar
                ref={avatarRef as React.Ref<AvatarClipHandle>}
                src="/models/elijah-hero.glb"
                position={[0, 0.15, 0]}
                scale={1}
              />
            </group>
          </group>
        </group>
      </group>

      {/* Ghost trajectory arc (Part 6 Fix 2) + rail markers (Part 6 Fix 4) */}
      <primitive object={ghostLine} />
      <RailMarkers mode={mode} nextRailRef={nextRailRef} />

      <BoardParticles
        ref={carveFxRef}
        capacity={140}
        colorA={style.a}
        colorB={style.b}
        size={style.size}
        gravity={style.g}
      />
      <BoardParticles
        ref={burstFxRef}
        capacity={64}
        colorA={style.a}
        colorB="#ffffff"
        size={style.size * 1.6}
        gravity={style.g}
        lifeSec={0.9}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Rail markers (Part 6 Fix 4) — world-space emissive bars over each grind
// segment. The rail nearest ahead (nextRailRef) glows green so the player can
// read where the next chain link is. Built once per mode; no per-frame allocs.
// ---------------------------------------------------------------------------

const RAIL_NEUTRAL = new THREE.Color('#00E5FF');
const RAIL_NEXT = new THREE.Color('#00FF9D');

function RailMarkers({
  mode,
  nextRailRef,
}: {
  mode: BoardModeId;
  nextRailRef: React.MutableRefObject<number>;
}) {
  const matRefs = useRef<THREE.MeshStandardMaterial[]>([]);

  // Precompute a transform for each rail segment (midpoint / length / yaw / y).
  const bars = useMemo(() => {
    const segs = RAIL_SEGMENTS[mode] ?? [];
    return segs.map((r: RailSegment) => {
      const mx = (r.ax + r.bx) / 2;
      const mz = (r.az + r.bz) / 2;
      const len = Math.max(0.5, Math.hypot(r.bx - r.ax, r.bz - r.az));
      const yaw = Math.atan2(r.bx - r.ax, r.bz - r.az);
      // snow rails are terrain-relative (y baseline 0) → sit the bar on the
      // sampled slope height; skate rails use world-absolute y.
      let wy = r.y + 0.02;
      if (mode === 'snow') {
        sampleTerrain(mode, mx, mz, 0, _terrArc);
        wy = _terrArc.h + r.y + 0.06;
      }
      return { mx, mz, len, yaw, wy };
    });
  }, [mode]);

  useFrame(() => {
    const nx = nextRailRef.current;
    const mats = matRefs.current;
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const isNext = i === nx;
      m.emissive.copy(isNext ? RAIL_NEXT : RAIL_NEUTRAL);
      m.emissiveIntensity = isNext ? 1.15 : 0.5;
      m.opacity = isNext ? 0.95 : 0.6;
    }
  });

  matRefs.current = [];
  return (
    <>
      {bars.map((b, i) => (
        <mesh key={i} position={[b.mx, b.wy, b.mz]} rotation={[0, b.yaw, 0]}>
          <boxGeometry args={[0.08, 0.08, b.len]} />
          <meshStandardMaterial
            ref={(m) => {
              if (m) matRefs.current[i] = m;
            }}
            color="#0a0f14"
            emissive={RAIL_NEUTRAL}
            emissiveIntensity={0.5}
            transparent
            opacity={0.6}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function BoardSports3D({
  mode,
  durationSec = 120,
  timeOfDay = 'auto',
  onGameEnd,
}: BoardSports3DProps) {
  const hudRef = useRef<BoardHudState>(createHudState());
  const bus = useMemo(() => createHudBus(), []);
  const inputRef = useRef<BoardInput>(new BoardInput());
  const audioRef = useRef<BoardAudio>(new BoardAudio());
  const physicsRef = useRef<BoardPhysics>(new BoardPhysics(mode));
  const playerRef = useRef<THREE.Group | null>(null);
  const fovKickRef = useRef(0);
  const shakeRef = useRef(0);
  const speedLinesRef = useRef(0);
  const speedLineColorRef = useRef(new THREE.Color('#eaf6ff'));
  const boostTrailRef = useRef(0);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  const tod: TimeOfDayId = useMemo(
    () => (timeOfDay === 'auto' ? pickTimeOfDay(Date.now() / 60000) : timeOfDay),
    [timeOfDay]
  );

  useEffect(() => {
    const input = inputRef.current;
    const audio = audioRef.current;
    input.attach(window);
    // Any key also drops in (keyboard players never get stuck on the overlay).
    const onFirstKey = () => {
      if (startedRef.current) return;
      handleStartGestureRef.current?.();
    };
    window.addEventListener('keydown', onFirstKey);
    return () => {
      window.removeEventListener('keydown', onFirstKey);
      input.detach();
      audio.dispose();
    };
  }, []);

  const handleStartGestureRef = useRef<(() => void) | null>(null);

  const handleStartGesture = useCallback(() => {
    if (started) return;
    setStarted(true);
    startedRef.current = true;
    const audio = audioRef.current;
    void audio.resume().then(() => {
      audio.matchStart();
      audio.startCarveLoop(mode);
    });
  }, [started, mode]);
  handleStartGestureRef.current = handleStartGesture;

  const handleEnd = useCallback(
    (r: BoardRunResult) => { onGameEnd?.(r); },
    [onGameEnd]
  );

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 bg-black shadow-[0_0_60px_rgba(0,229,255,0.06)]"
      style={{ aspectRatio: '16 / 9', maxWidth: 960 }}
      onPointerDown={handleStartGesture}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.1, far: 420, position: [0, 3, 7] }}
      >
        <BoardEnvironment mode={mode} tod={tod} targetRef={playerRef} />
        <TerrainPatch mode={mode} targetRef={playerRef} />
        {/*
          To mount the venue GLB visual on top of / instead of TerrainPatch:
          <MapLoader url={`/models/maps/${
            mode === 'skate' ? 'venice-skatepark'
            : mode === 'snow' ? 'mountain-slope' : 'surf-break'
          }.glb`} />
          Keep TerrainPatch as the collider truth until raycast colliders land.
        */}
        <Simulation
          mode={mode}
          durationSec={durationSec}
          hudRef={hudRef}
          bus={bus}
          inputRef={inputRef}
          audioRef={audioRef}
          playerRef={playerRef}
          fovKickRef={fovKickRef}
          shakeRef={shakeRef}
          speedLinesRef={speedLinesRef}
          speedLineColorRef={speedLineColorRef}
          boostTrailRef={boostTrailRef}
          physicsRef={physicsRef}
          startedRef={startedRef}
          onEnd={handleEnd}
        />
        <BoostTrail
          targetRef={playerRef as React.MutableRefObject<THREE.Object3D | null>}
          intensityRef={boostTrailRef}
        />
        <SpeedLines intensityRef={speedLinesRef} colorRef={speedLineColorRef} />
        <ChaseCamera
          targetRef={playerRef}
          physicsRef={physicsRef}
          fovKickRef={fovKickRef}
          shakeRef={shakeRef}
        />
      </Canvas>

      <BoardHud mode={mode} stateRef={hudRef} bus={bus} />

      {!started ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="text-xs tracking-[0.4em] text-slate-400">TAP TO DROP IN</div>
            <div className="mt-2 text-2xl font-black text-white">
              {mode === 'skate' ? 'SKATE' : mode === 'snow' ? 'SNOWBOARD' : 'SURF'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BoardSports3D;
