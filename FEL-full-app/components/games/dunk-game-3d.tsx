'use client';

/**
 * dunk-game-3d.tsx — M7c full-library 3D Dunk Contest.
 * ====================================================
 * TRUE free-locomotion 3D: drive to the rack, charge, launch, and nail the
 * mid-air QTE for a signature slam. First to 21 vs the rival. Uses ALL SIX
 * M7a libs plus the shared GameSystems combo/gating pipeline:
 *   • LocomotionController  — WASD/arrows approach drive
 *   • AnimDirectorFSM       — idle ⇆ run ⇆ launch/airborne/scored (basketball_dunk)
 *   • AvatarDriver          — blends FSM decisions onto the GLB mixer
 *   • BallStateMachine      — held → flight (slam) → dead ball
 *   • camera rigs + CameraCut — follow rig on approach, broadcast cut on the jam
 *   • clip-registry         — basketball_dunk clips (approach/launch/360/windmill/score)
 *
 * EXACT tuned scoring (complexity / hang / timing / combo) is preserved
 * verbatim from the proven 2D dunk contest. New jump PHYSICS values are fresh
 * 3D scaffolding, flagged // TUNE(elijah).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { reportEarn, buildDunkChain, newIdempotencyKey } from '@/lib/wallet/client';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { PerfSampler, PerfOverlay } from '@/components/three/perf-hud';
import { MapMesh } from '@/components/three/map-loader';
import { SceneBackdrop } from '@/components/three/scene-backdrop';
import { Grandstand, VeniceBackdrop } from '@/components/three/arena-dressing';
import { PremiumHoop, DustMotes, HoopGlow, Basketball } from '@/components/three/basketball-court';
import { BallFlightRenderer, createBallFlightTracker, createNetHandle } from '@/components/three/ball-flight-renderer';
import { RimGlowPulse } from '@/components/three/effects';
import { RivalFigure, type RivalHandle } from '@/components/three/rival-figure';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { MAPS } from '@/lib/map-data';
import { VENUE_VENICE_SUNSET } from '@/lib/scene/integrity';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { LocomotionController } from '@/lib/loco/movement';
import { updateFacing } from '@/lib/anim/facing';
import { BallStateMachine } from '@/lib/ball/ball-state';
import { computeCamera, CameraCut, RIGS, type CameraFrame, type Subject } from '@/lib/camera/rigs';
// M14-P5 — input-selected pre-launch dunk cinematics (pure timeline + camera track).
import { CinematicPlayer, sampleTrack } from '@/lib/cinematic/timeline';
import { buildDunkCinematic } from '@/lib/cinematic/dunk-cinematics';
import { createGameSystems, type GameSystems } from '@/lib/game-systems';
import { detectDevice, MODE_BINDINGS } from '@/lib/scene/input-manager';
import { createApexFollow, type ApexFollowState } from '@/lib/camera-director';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';
import { createPrqEmitter, spawnPrq, updatePrq, PrqFloatLayer, type PrqPop } from '@/components/games/prq-float';
import {
  createHitStop, triggerHitStop, updateHitStop,
  createFlash, triggerFlash, updateFlash,
  createSquash, triggerSquash, updateSquash,
} from '@/lib/impact-system';
// Phase 1 — shared PURE dunk scoring/feel core (gather/toss/modifier + zone grade).
// The live sim and scripts/dunk-feel-tests.ts import the SAME numbers; never fork.
import {
  computeDunkScore, gradeZoneRelease, qteResultToGrade,
  type TossType, type DunkModifier,
} from '@/lib/feel/cores/dunk-scoring';

const HERO_URL = '/models/elijah-hero.glb';
const MAP = MAPS['venice-blue-court'];

const HOOP_POS = new THREE.Vector3(0, 3.05, 0);
// Shared hero mesh art faces -Z, so logical forward yaw needs this offset
// when written to rotation.y (mirrors football-3d's known-good convention).
const MODEL_YAW = Math.PI;
const RIM_STAND = new THREE.Vector3(0, 0, 1.6); // where the player plants before the jam
// M12.1 — the rival's idle spot on court (off to the side of the rim) and the
// point it attacks on its own turn. Gives the opponent a physical presence so
// it never "scores from an empty court".
const RIVAL_HOME = new THREE.Vector3(2.9, 0, 2.6);
const RIVAL_RIM = new THREE.Vector3(0.5, 0, 1.5);
const COURT_BOUNDS = { minX: -7, maxX: 7, minZ: -1, maxZ: 9 };
// M8.5 — spawn the hero further back so the run-up before the jam is clearly in frame // TUNE(elijah)
const SPAWN_Z = 8.5;
// M8.5 — dunk plays under a Venice sunset for stronger outdoor identity (dunk-only override).
// Single-sourced from the scene-integrity venue manifest so the environment stays wired
// through the same gate that verifies venue identity. // TUNE(elijah)
const DUNK_BACKDROP = VENUE_VENICE_SUNSET.backdrop;

type Style = 'POWER' | 'FLASHY' | 'SIGNATURE';
type Phase = 'approach' | 'charge' | 'precut' | 'airborne' | 'land' | 'aiTurn' | 'msg';

// Airborne trick clip per style (all one-shot dunk clips). // TUNE(elijah)
const STYLE_ACTION: Record<Style, string> = {
  POWER: '360_eastbay',
  FLASHY: 'off_board_windmill',
  SIGNATURE: '360_scoop',
};

interface HudState {
  pScore: number; aiScore: number; phase: Phase;
  charge: number; style: Style; qteActive: boolean; qteT: number; qteWindow: number;
  qteResult: string; combo: number; comboMult: number;
  prqPops: PrqPop[]; // M8.4 floating +PRQ reward text
  msg: string; msgColor: string; msgT: number;
  prqLabel: string; prqColor: string; camRig: string;
  crowdFlash: number; // M8.3 crowd-pop overlay alpha (0..1)
  // Phase 1 — dunk depth surfacing
  tossType: TossType; modifier: DunkModifier; modifierArmed: boolean;
}

function CourtCamera({
  subjectRef, rigModeRef, cutRef, cineFrameRef,
}: {
  subjectRef: React.MutableRefObject<Subject>;
  rigModeRef: React.MutableRefObject<'follow' | 'broadcast'>;
  cutRef: React.MutableRefObject<CameraCut>;
  cineFrameRef: React.MutableRefObject<CameraFrame | null>;
}) {
  const camera = useThree((s) => s.camera);
  const smoothed = useRef<CameraFrame>({ position: { x: 4, y: 2.8, z: 10 }, target: { x: 0, y: 1.2, z: 4 }, fov: 50 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const rig = rigModeRef.current === 'broadcast' ? RIGS.broadcast : RIGS.follow;
    const live = computeCamera(subjectRef.current, rig);
    // M14-P5 — a pre-launch cinematic frame (when active) overrides the live rig.
    const cine = cineFrameRef.current;
    const frame = cine ? cine : (cutRef.current.active ? cutRef.current.update(dt, live) : live);
    const sm = smoothed.current;
    const rate = (rig.stiffness + 0.04) * 6 * dt * 10;
    sm.position.x += (frame.position.x - sm.position.x) * rate;
    sm.position.y += (frame.position.y - sm.position.y) * rate;
    sm.position.z += (frame.position.z - sm.position.z) * rate;
    sm.target.x += (frame.target.x - sm.target.x) * rate;
    sm.target.y += (frame.target.y - sm.target.y) * rate;
    sm.target.z += (frame.target.z - sm.target.z) * rate;
    camera.position.set(sm.position.x, sm.position.y, sm.position.z);
    camera.lookAt(sm.target.x, sm.target.y, sm.target.z);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) { cam.fov += (frame.fov - cam.fov) * 0.1; cam.updateProjectionMatrix(); }
  });
  return null;
}

// M8.5 — visible approach runway so the run-up before the jam reads clearly in-frame.
// A translucent lane bed, side rails, and transverse rungs that brighten toward the
// rim to imply direction. Cosmetic only — no collision, no gameplay math. // TUNE(elijah)
function RunwayLane({ groupRef }: { groupRef: React.RefObject<THREE.Group> }) {
  const y = (MAP.floorY ?? 0) + 0.02;
  const rungZ = [7.6, 6.4, 5.2, 4.0, 2.8]; // TUNE(elijah)
  return (
    <group ref={groupRef}>
      {/* translucent lane bed from spawn toward the rim */}
      <mesh position={[0, y, 5.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 7.2]} />
        <meshBasicMaterial color="#00FF9D" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      {/* side rails */}
      {[-1.15, 1.15].map((x) => (
        <mesh key={x} position={[x, y + 0.005, 5.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.08, 7.2]} />
          <meshBasicMaterial color="#00FF9D" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      {/* transverse rungs, brighter toward the rim to imply direction of the run-up */}
      {rungZ.map((z, i) => (
        <mesh key={z} position={[0, y + 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.3, 0.09]} />
          <meshBasicMaterial color="#00FF9D" transparent opacity={0.18 + i * 0.08} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function DunkScene({
  grade, prq, onEnd, gamepad, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const playerRef = useRef<AvatarHandle | null>(null);
  const rivalRef = useRef<RivalHandle | null>(null); // M12.1 on-court opponent
  const ballMeshRef = useRef<THREE.Mesh>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);
  // FEL wallet: one run id per contest so the server can group an attempt set.
  const runIdRef = useRef<string>(newIdempotencyKey());

  // Shared combo/gating systems — EXACT tuned config (verbatim from 2D) // TUNE(elijah)
  const sys = useRef<GameSystems>(createGameSystems({
    comboWindowMs: 8000,
    gate: { proximityThreshold: 999, minQteQuality: 0.15 },
  }));

  const loco = useRef(new LocomotionController({ speedScale: grade?.speedMult ?? 1 }, { x: 0, z: SPAWN_Z }));
  const laneRef = useRef<THREE.Group>(null); // M8.5 approach-runway visual
  const dir = useRef(new AnimDirectorFSM());
  const drv = useRef(new AvatarDriver());
  const ballSM = useRef(new BallStateMachine());
  const flightTracker = useRef(createBallFlightTracker());
  const netHandle = useRef(createNetHandle());
  const cut = useRef(new CameraCut());
  // M14-P5 — pre-launch cinematic player + the frame it currently authors.
  const cine = useRef(new CinematicPlayer());
  const cineFrame = useRef<CameraFrame | null>(null);
  const pendingPower = useRef(0);
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const camSubject = useRef<Subject>({ pos: { x: 0, y: 1.1, z: SPAWN_Z }, facing: Math.PI, speed01: 0 });
  const actionEvt = useRef<string | undefined>(undefined);
  const excitement = useRef(0); // M13 — drives the living crowd (0..1)
  const phaseEvt = useRef<string>('');

  const st = useRef({
    t: 0, phase: 'approach' as Phase,
    pScore: 0, aiScore: 0,
    prq: createPrqEmitter(), // M8.4 PRQ surfacing
    charge: 0, style: 'POWER' as Style,
    // Phase 1 — dunk depth: sticky toss selection, per-attempt modifier + run-up gather.
    tossType: 'arc' as TossType,       // Gap 4 sticky selection // TUNE(elijah)
    modifier: 'none' as DunkModifier,  // Gap 5 resolved at slam
    modifierArmed: false,              // Gap 5 second-touch held this attempt
    approachDist: 0,                   // Gap 2 run-up distance measured at launch
    // jump physics (fresh 3D scaffolding)
    y: 0, vy: 0, jumpX: 0, jumpZ: 0, launchX: 0, launchZ: 0,
    hangTime: 0,
    qteT: 0, qteWindow: 0.55, qteResult: '', qteActive: false, qteTapped: false,
    combo: 0, comboMult: 1,
    aiT: 0,
    aiSlammed: false, // M12.1 one-shot rival-slam feedback per turn
    landLock: 0,
    msg: '', msgColor: '#FFD700', msgT: 0,
    startTime: Date.now(),
    keys: {} as Record<string, boolean>,
    slammed: false,
    apexFollow: createApexFollow(),
    prevPhase: 'approach' as string,
    // M8.3 impact system (shared): hit-stop + crowd flash + landing squash
    hitStop: createHitStop(),
    crowdFlash: createFlash(),
    squash: createSquash(),
    lastDunkMade: false,
  });

  const say = useCallback((m: string, c: string) => {
    const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.6;
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    // FEL wallet: routine complete → flat coin reward + (on a win) a shard
    // milestone. Best-effort, never blocks the recap. Server owns the amounts.
    void reportEarn({
      idempotency_key: `${runIdRef.current}:routine`,
      event_type: 'dunk_routine_completed',
      payload: { run_id: runIdRef.current, score: Math.round(s.pScore), won: s.pScore > s.aiScore },
    });
    if (s.pScore > s.aiScore) {
      void reportEarn({
        idempotency_key: `${runIdRef.current}:contest`,
        event_type: 'dunk_contest_placed',
        payload: { run_id: runIdRef.current, placement: 1 },
      });
    }
    onEndRef.current?.({
      score: Math.round(s.pScore),
      opponentScore: Math.round(s.aiScore),
      won: s.pScore > s.aiScore,
      duration: dur,
      headline: s.pScore > s.aiScore ? 'CONTEST WON' : 'CONTEST LOST',
      tallies: sys.current.recorder.tallies(),
      maxCombo: sys.current.recorder.bestChain,
    });
  }, []);

  // EXACT scoring port (verbatim from 2D scoreDunk) // TUNE(elijah)
  const scoreDunk = useCallback(() => {
    const s = st.current;
    const grade = qteResultToGrade(s.qteResult);
    const isPerfect = grade === 'PERFECT';
    // Gap 5 — resolve the mid-air modifier: a second-touch clutch is a DOUBLE, or
    // a CHAINED clutch if you were already mid-combo (extending a streak).
    s.modifier = s.modifierArmed ? (s.combo > 0 ? 'chained' : 'double') : 'none';
    // Phase 1 — single source of truth for the score: hang + style + zone timing,
    // multiplied by the run-up gather (Gap 2), toss choice (Gap 4) and mid-air
    // modifier (Gap 5). comboMult is applied below via the shared combo system.
    const scored = computeDunkScore({
      hangSec: s.hangTime,
      style: s.style,
      timing: grade,
      approachDistM: s.approachDist,
      toss: s.tossType,
      modifier: s.modifier,
      comboMult: 1,
    });
    const gatePass = sys.current.gate.attemptByQuality(scored.quality);

    if (!gatePass) {
      sys.current.combo.breakCombo();
      sys.current.recorder.recordMiss();
      s.combo = 0; s.comboMult = 1;
      s.lastDunkMade = false;
      say('MISS · +0.0 PTS', '#FF3366');
      return;
    }
    s.comboMult = sys.current.combo.registerHit();
    s.combo = sys.current.combo.snapshot().chain;
    sys.current.recorder.recordHit(isPerfect);
    const total = Math.max(Math.round(scored.total * s.comboMult * 10) / 10, 0);
    sys.current.recorder.addScore(total);
    sys.current.recorder.recordChain(s.combo);
    s.pScore = Math.round((s.pScore + total) * 10) / 10;
    s.lastDunkMade = total > 0;
    // M8.4 — surface PRQ on a made dunk. // TUNE(elijah) shard scaling
    if (total > 0) spawnPrq(s.prq, Math.max(6, Math.round(total * 1.4)), isPerfect ? '#FFD700' : '#A855F7');
    const comboTag = s.comboMult > 1 ? ` · ${s.comboMult}×` : '';
    if (total > 0) netHandle.current.swish();
    // FEL wallet (best-effort, non-blocking): report the SCORED attempt as a
    // performance event. No amount is sent — the server computes coins from
    // its editable RewardRule and clamps the score to the trick-chain ceiling.
    if (total > 0) {
      const durMs = Math.max(400, Math.min(15000, Math.round((s.hangTime || 1.0) * 1000) + 800));
      void reportEarn({
        idempotency_key: newIdempotencyKey(),
        event_type: 'dunk_attempt_scored',
        payload: {
          run_id: runIdRef.current,
          score: Math.round(total),
          trick_chain: buildDunkChain(s.style, s.combo),
          duration_ms: durMs,
          client_ts: Date.now(),
        },
      });
    }
    say(`${s.qteResult || 'HIT'} · +${total.toFixed(1)} PTS${comboTag}`, total > 0 ? '#00FF9D' : '#FF3366');
    // slam animation + broadcast cut + ball to rim
    actionEvt.current = STYLE_ACTION[s.style];
    phaseEvt.current = 'airborne';
  }, [say]);

  const startCharge = useCallback(() => {
    const s = st.current;
    if (s.phase === 'approach') { s.phase = 'charge'; s.charge = 0; s.modifier = 'none'; s.modifierArmed = false; }
  }, []);

  // Gap 4 — sticky toss selection (straight/arc/backboard). Chosen before the finish.
  const setToss = useCallback((toss: TossType) => { st.current.tossType = toss; }, []);

  // Gap 5 — arm the mid-air second-touch clutch (only meaningful before the slam).
  const armModifier = useCallback(() => {
    const s = st.current;
    if (s.phase === 'charge' || s.phase === 'airborne') s.modifierArmed = true;
  }, []);

  // M14-P5 — the actual jump kickoff, shared by the cinematic's `launch` beat.
  // Jump PHYSICS are identical to the pre-P5 release; only the trigger moment
  // moved to the END of the input-selected pre-launch cinematic.
  const doLaunch = useCallback((power: number) => {
    const s = st.current;
    s.phase = 'airborne';
    s.y = 0;
    s.vy = 5.5 + power * 3.5; // // TUNE(elijah) fresh 3D jump velocity
    s.hangTime = 0; s.qteResult = ''; s.qteActive = false; s.qteTapped = false; s.slammed = false;
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.5);
    ballSM.current.release();
    phaseEvt.current = 'launch';
    actionEvt.current = 'launch';
  }, []);

  const releaseCharge = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'charge') return;
    const power = Math.min(s.charge, 1);
    pendingPower.current = power;
    // Plant the launch spot NOW so the cinematic framing + the airborne drift
    // both originate from where the hero committed. // TUNE(elijah)
    s.launchX = loco.current.state.pos.x; s.launchZ = loco.current.state.pos.z;
    s.jumpX = loco.current.state.pos.x; s.jumpZ = loco.current.state.pos.z;
    // Gap 2 — measure the run-up gather: launching from farther back is a bigger dunk.
    s.approachDist = Math.hypot(s.launchX - RIM_STAND.x, s.launchZ - RIM_STAND.z);
    // M14-P5 — the style the player picked selects a distinct pre-launch camera
    // sweep + wind-up that plays BEFORE the jump; its `launch` beat calls doLaunch.
    rigMode.current = 'broadcast';
    const cin = buildDunkCinematic(
      s.style,
      { x: s.launchX, y: 1.1, z: s.launchZ },
      { x: RIM_STAND.x, y: HOOP_POS.y, z: RIM_STAND.z },
    );
    cine.current.play(cin);
    cineFrame.current = sampleTrack(cin.track, 0);
    s.phase = 'precut';
  }, []);

  const pickStyle = useCallback((style: Style) => {
    const s = st.current;
    if (s.phase === 'charge' || s.phase === 'airborne') s.style = style;
  }, []);

  const qteTap = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'airborne' || !s.qteActive || s.qteTapped) return;
    s.qteTapped = true;
    // Gap 3 — zone hold-release grade: |offset| in seconds from the ideal release
    // (the window centre), tiered through the shared PERFECT/GREAT/GOOD windows.
    const offset = s.qteT - s.qteWindow / 2;
    const grade = gradeZoneRelease(offset);
    s.qteResult = grade === 'MISS' ? '' : grade;
    s.qteActive = false;
  }, []);

  useEffect(() => {
    const setKey = (k: string, down: boolean) => { st.current.keys[k] = down; };
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      setKey(k, true);
      const s = st.current;
      if (k === ' ') {
        e.preventDefault?.();
        if (s.phase === 'approach') startCharge();
        else if (s.phase === 'airborne' && s.qteActive) qteTap();
      }
      if (e.key === 'ArrowUp') pickStyle('POWER');
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') pickStyle('FLASHY');
      if (e.key === 'ArrowDown') pickStyle('SIGNATURE');
      // Phase 1 — toss select (Gap 4): 1 straight / 2 arc / 3 backboard.
      if (k === '1') setToss('straight');
      if (k === '2') setToss('arc');
      if (k === '3') setToss('backboard');
      // Phase 1 — modifier arm (Gap 5): Shift or E = mid-air clutch (double / chained).
      if (k === 'shift' || k === 'e') armModifier();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      setKey(k, false);
      if (k === ' ') releaseCharge();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felDunk3D = { startCharge, releaseCharge, qteTap, pickStyle, setToss, armModifier };
    registerFelMode('dunk', {
      getState: () => {
        const s = st.current;
        return {
          phase: s.phase, pScore: s.pScore, aiScore: s.aiScore,
          charge: s.charge, style: s.style, qteActive: s.qteActive,
          combo: s.combo, comboMult: s.comboMult,
          tossType: s.tossType, modifier: s.modifier, modifierArmed: s.modifierArmed,
        };
      },
      sendInput: (a, p) => {
        if (a === 'startCharge') startCharge();
        else if (a === 'releaseCharge') releaseCharge();
        else if (a === 'qteTap') qteTap();
        else if (a === 'pickStyle') pickStyle((p as Style) ?? 'POWER');
        else if (a === 'setToss') setToss((p as TossType) ?? 'arc');
        else if (a === 'armModifier') armModifier();
      },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felDunk3D;
      unregisterFelMode('dunk');
    };
  }, [startCharge, releaseCharge, qteTap, pickStyle, setToss, armModifier]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  useFrame((_, dtRaw) => {
    const s = st.current;
    if (endedRef.current) return;
    // M8.3 hit-stop: scale game dt toward 0 during a freeze so BOTH logic and
    // render hold consistently (same dt-scaling mechanism as the dragon slow-mo).
    const realDt = Math.min(dtRaw, 0.05);
    const timeScale = updateHitStop(s.hitStop, realDt);
    const dt = realDt * timeScale;
    updateFlash(s.crowdFlash, realDt); // crowd pop decays in real time
    // M13 — crowd excitement: spikes on a slam pop / while charging, decays otherwise.
    excitement.current = Math.max(s.crowdFlash.alpha, s.charge * 0.35, excitement.current - realDt * 0.5);
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    sys.current.combo.update(dt);
    ballSM.current.update(dt);

    // ── M14-P5 Pre-launch cinematic ──
    // The input-selected dunk cinematic drives the camera and fires beats; the
    // closing `launch` beat kicks off the real jump with the charged power.
    if (s.phase === 'precut') {
      const tick = cine.current.update(dt);
      cineFrame.current = tick.frame;
      for (const b of tick.fired) {
        if (b.id === 'gather') {
          triggerSquash(s.squash, 0.16, 0.24); // wind-up compression // TUNE(elijah)
        } else if (b.id === 'pop') {
          triggerFlash(s.crowdFlash, '#A855F7', 0.35, 2.2); // anticipation pop // TUNE(elijah)
        } else if (b.id === 'launch') {
          cineFrame.current = null; // hand the camera back to the live rig
          doLaunch(pendingPower.current);
        }
      }
      // Safety: if the timeline ended without an explicit launch beat, still launch.
      if (tick.done && s.phase === 'precut') {
        cineFrame.current = null;
        doLaunch(pendingPower.current);
      }
    }

    // ── Approach: free locomotion ──
    let moveX = 0, moveY = 0;
    const canMove = s.phase === 'approach';
    if (canMove) {
      if (s.keys['a'] || s.keys['arrowleft']) moveX -= 1;
      if (s.keys['d'] || s.keys['arrowright']) moveX += 1;
      if (s.keys['w'] || s.keys['arrowup']) moveY -= 1;
      if (s.keys['s'] || s.keys['arrowdown']) moveY += 1;
      if (gamepad) {
        if (gamepad.left) moveX -= 1; if (gamepad.right) moveX += 1;
        if (gamepad.up) moveY -= 1; if (gamepad.down) moveY += 1;
      }
    }
    const locoState = loco.current.step(dt, { moveX, moveY, camYaw: 0 });
    loco.current.clampPos(COURT_BOUNDS.minX, COURT_BOUNDS.maxX, COURT_BOUNDS.minZ, COURT_BOUNDS.maxZ);

    // ── Charge build (verbatim rate) // TUNE(elijah) ──
    if (s.phase === 'charge') s.charge = Math.min(s.charge + dt * 0.9, 1);

    // ── Airborne jump arc + QTE ──
    if (s.phase === 'airborne') {
      const nearApex = s.vy > -2.2 && s.vy < 2.2; // // TUNE(elijah)
      const hangScale = nearApex ? 0.65 : 1; // verbatim
      s.vy -= 13 * hangScale * dt; // // TUNE(elijah) gravity
      s.y = Math.max(0, s.y + s.vy * dt);
      // drift toward the rim while airborne
      s.jumpX += (RIM_STAND.x - s.jumpX) * 2.2 * dt;
      s.jumpZ += (RIM_STAND.z - s.jumpZ) * 2.2 * dt;
      if (nearApex) s.hangTime += dt + (gradeRef.current?.hangBonus ?? 0) * dt * 0.5; // verbatim
      // QTE opens once, at apex
      if (!s.qteActive && !s.qteTapped && s.vy <= 1 && s.vy > -1) {
        s.qteActive = true; s.qteT = 0;
        s.qteWindow = s.style === 'SIGNATURE' ? 0.34 : s.style === 'FLASHY' ? 0.42 : 0.55; // verbatim
        if (s.modifierArmed) s.qteWindow *= 0.7; // Gap 5 — the clutch tightens the finish window (risk)
      }
      if (s.qteActive) {
        s.qteT += dt;
        if (s.qteT > s.qteWindow) { s.qteResult = ''; s.qteActive = false; }
      }
      // landing
      if (s.y <= 0 && s.vy < 0) {
        s.y = 0; s.phase = 'land'; s.landLock = 0.7;
        scoreDunk();
        // M8.3 DUNK LANDING impact — only on a made slam (climax must be felt)
        if (s.lastDunkMade) {
          triggerHitStop(s.hitStop, 0.033);              // ~2 frames rim-contact hold // TUNE(elijah)
          triggerFlash(s.crowdFlash, '#FFD700', 0.55, 2.6); // crowd gold pop // TUNE(elijah)
          triggerSquash(s.squash, 0.24, 0.20);           // landing compression // TUNE(elijah)
        }
      }
    }

    // ── Land → (win?) → AI turn ──
    if (s.phase === 'land') {
      s.landLock -= dt;
      if (s.landLock <= 0) {
        loco.current.state.pos.x = 0; loco.current.state.pos.z = SPAWN_Z;
        rigMode.current = 'follow';
        if (s.pScore >= 21 || s.aiScore >= 21) { finish(); return; }
        s.phase = 'aiTurn'; s.aiT = 1.4; s.aiSlammed = false;
      }
    }

    // ── AI turn (verbatim) // TUNE(elijah) ──
    if (s.phase === 'aiTurn') {
      s.aiT -= dt;
      if (s.aiT <= 0) {
        const aiPts = Math.round((1.2 + Math.random() * 2.6) * 10) / 10;
        s.aiScore = Math.round((s.aiScore + aiPts) * 10) / 10;
        say(`RIVAL SCORES +${aiPts.toFixed(1)}`, '#FF3366');
        if (s.pScore >= 21 || s.aiScore >= 21) { finish(); return; }
        s.phase = 'approach';
      }
    }

    // M8.5 — runway guides are only shown while the player is lining up the run-up // TUNE(elijah)
    if (laneRef.current) laneRef.current.visible = s.phase === 'approach' || s.phase === 'charge';

    // ── Drive player avatar ──
    if (playerRef.current) {
      const g = playerRef.current.group;
      const px = s.phase === 'airborne' ? s.jumpX : locoState.pos.x;
      const pz = s.phase === 'airborne' ? s.jumpZ : locoState.pos.z;
      g.position.set(px, (MAP.floorY ?? 0) + s.y, pz);
      // Face travel direction while moving; aim the rim while planting/airborne.
      // Uses the shared facing core (+MODEL_YAW for the -Z mesh) so the dunker
      // no longer plants facing away from the hoop.
      g.rotation.y = updateFacing({
        current: g.rotation.y - MODEL_YAW,
        velX: locoState.vel.x,
        velZ: locoState.vel.z,
        targetX: HOOP_POS.x,
        targetZ: HOOP_POS.z,
        selfX: px,
        selfZ: pz,
        engaged: !canMove,
        dt,
      }) + MODEL_YAW;
      const decision = dir.current.update(dt, {
        modeId: 'basketball_dunk',
        speed01: canMove ? locoState.speed01 : 0,
        phase: phaseEvt.current,
        actionEvent: actionEvt.current,
      });
      actionEvt.current = undefined;
      phaseEvt.current = '';
      drv.current.apply(decision);
      // M8.3 landing squash — compress avatar height on the slam landing.
      // scaleY<=1 only, pivoted at the feet (group origin), so feet never clip.
      const sq = updateSquash(s.squash, dt);
      g.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      // M8.2 Apex follow: stronger camera lift during airborne, brief drop on slam
      const isAirborne = s.phase === 'airborne';
      const justLanded3D = s.prevPhase === 'airborne' && s.phase === 'land';
      if (isAirborne) {
        s.apexFollow.airborne = true;
        s.apexFollow.targetY = s.y * 0.75; // TUNE(elijah) — lift camera target with jump height
      } else if (justLanded3D) {
        s.apexFollow.airborne = false;
        s.apexFollow.targetY = -0.3; // TUNE(elijah) — brief downward slam feel
      } else {
        s.apexFollow.airborne = false;
        s.apexFollow.targetY = 0;
      }
      s.apexFollow.offsetY += (s.apexFollow.targetY - s.apexFollow.offsetY) * Math.min(4.0 * dt, 1);
      s.prevPhase = s.phase;

      camSubject.current.pos.x = px;
      camSubject.current.pos.y = 1.1 + s.apexFollow.offsetY;
      camSubject.current.pos.z = pz;
      camSubject.current.facing = g.rotation.y;
      camSubject.current.speed01 = locoState.speed01;
    }

    // ── Drive rival avatar (M12.1) ──
    // The rival idles on court during the player's turn, then visibly drives to
    // the rim and slams on its own turn so points never appear from nowhere.
    if (rivalRef.current) {
      const rg = rivalRef.current.group;
      if (s.phase === 'aiTurn') {
        const p = Math.max(0, Math.min(1, 1 - s.aiT / 1.4)); // 0 → 1 across the turn
        // Horizontal drive from the idle spot to the rim over the first ~45%.
        const move = Math.min(1, p / 0.45);
        rg.position.x = RIVAL_HOME.x + (RIVAL_RIM.x - RIVAL_HOME.x) * move;
        rg.position.z = RIVAL_HOME.z + (RIVAL_RIM.z - RIVAL_HOME.z) * move;
        // Vertical jump arc through the middle of the turn.
        let jy = 0;
        if (p >= 0.45 && p <= 0.85) jy = Math.sin(((p - 0.45) / 0.4) * Math.PI) * 2.3;
        rg.position.y = (MAP.floorY ?? 0) + jy;
        // Crouch wind-up before launch, release in the air.
        const crouch = p < 0.45 ? (p / 0.45) * 0.7 : 0;
        // Arm reaches up as the rival rises and holds through the slam.
        const arm = p < 0.5 ? 0 : Math.min(1, (p - 0.5) / 0.18);
        rivalRef.current.setPose(crouch, p > 0.9 ? Math.max(0, 1 - (p - 0.9) / 0.1) : arm);
        rg.rotation.y = Math.PI; // keep facing the rim
        // Slam feedback at the apex — net snap + crowd flash so the rival's points
        // are felt on court, not just printed as a toast (M12.1 / M12.6 parity).
        if (!s.aiSlammed && p >= 0.62) {
          s.aiSlammed = true;
          netHandle.current.swish();
          triggerFlash(s.crowdFlash, '#FF3366', 0.4, 2.4);
        }
      } else {
        // Idle: ease back to the home spot with a gentle breathing sway.
        rg.position.x += (RIVAL_HOME.x - rg.position.x) * Math.min(6 * dt, 1);
        rg.position.z += (RIVAL_HOME.z - rg.position.z) * Math.min(6 * dt, 1);
        rg.position.y += ((MAP.floorY ?? 0) - rg.position.y) * Math.min(8 * dt, 1);
        rivalRef.current.setPose(0.04 + Math.sin(s.t * 1.6) * 0.03, 0);
        rg.rotation.y = Math.PI;
      }
    }

    // ── Ball mesh follow ──
    if (ballMeshRef.current) {
      const bm = ballMeshRef.current;
      bm.visible = true;
      const ft = flightTracker.current;
      if (s.phase === 'airborne' || s.phase === 'land') {
        ft.airborne = true; ft.showArc = false; ft.arcFrom = null; ft.arcTo = null;
      } else {
        ft.airborne = false;
      }
      if (s.phase === 'airborne') {
        // ball rises with the player, then drops through the rim on the slam
        if (!s.slammed && s.hangTime > 0 && s.qteTapped) {
          bm.position.set(HOOP_POS.x, HOOP_POS.y + 0.2, HOOP_POS.z);
        } else {
          bm.position.set(s.jumpX + 0.25, (MAP.floorY ?? 0) + s.y + 1.4, s.jumpZ);
        }
      } else if (s.phase === 'land') {
        bm.position.set(HOOP_POS.x, Math.max(0.15, HOOP_POS.y - (0.7 - s.landLock) * 4), HOOP_POS.z);
      } else {
        const hand = playerRef.current?.bone?.('RightHand');
        if (hand) {
          const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
          const bounce = canMove && locoState.speed01 > 0.1 ? Math.abs(Math.sin(s.t * 8)) * 0.3 : 0;
          bm.position.set(wp.x + 0.2, Math.max(0.12, wp.y - 0.4 - bounce), wp.z);
        } else {
          bm.position.set(locoState.pos.x + 0.3, 0.9, locoState.pos.z);
        }
      }
    }

    const prqPops = updatePrq(s.prq, dt); // M8.4 — particle life must decay every frame
    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        pScore: s.pScore, aiScore: s.aiScore, phase: s.phase,
        charge: s.charge, style: s.style, qteActive: s.qteActive, qteT: s.qteT, qteWindow: s.qteWindow,
        qteResult: s.qteResult, combo: s.combo, comboMult: s.comboMult,
        prqPops,
        msg: s.msg, msgColor: s.msgColor, msgT: s.msgT,
        prqLabel: gradeRef.current?.label ?? '', prqColor: gradeRef.current?.color ?? '#00FF9D',
        camRig: rigMode.current,
        crowdFlash: s.crowdFlash.alpha,
        tossType: s.tossType, modifier: s.modifier, modifierArmed: s.modifierArmed,
      });
    }
  });

  return (
    <>
      <Suspense fallback={null}><SceneBackdrop url={DUNK_BACKDROP} /></Suspense>
      {/* M13 — kill the "island in outer space": keep the photographic sunset sky
          (boardwalk + palms + ocean already in the photo) but lay a real ground/
          ocean plane around the court so the camera never sees the void below it. */}
      <VeniceBackdrop withSky={false} withSilhouette={false} palette="golden"
        radius={120} innerRadius={15} baseY={(MAP.floorY ?? 0) - 0.02} groundColor="#3b3348" />
      {/* M13 — living sideline crowds around the blacktop */}
      <Grandstand position={[0, (MAP.floorY ?? 0), -9]} rotationY={Math.PI} width={26} tiers={7} perTier={26} excitement={excitement} seed={5} color="#141021" />
      <Grandstand position={[-15, (MAP.floorY ?? 0), 4]} rotationY={Math.PI / 2} width={22} tiers={6} perTier={20} excitement={excitement} seed={17} color="#141021" />
      <Grandstand position={[15, (MAP.floorY ?? 0), 4]} rotationY={-Math.PI / 2} width={22} tiers={6} perTier={20} excitement={excitement} seed={23} color="#141021" />
      <Suspense fallback={null}><MapMesh config={MAP} /></Suspense>
      <RunwayLane groupRef={laneRef} />
      <PremiumHoop netHandle={netHandle} />
      <HoopGlow />
      <DustMotes count={50} />
      <RimGlowPulse color="#A855F7" position={[-5, 3, -2]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#FFD700" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <Basketball ballRef={ballMeshRef} />
      <BallFlightRenderer ballRef={ballMeshRef} tracker={flightTracker} />

      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            playerRef.current = h;
            h.group.position.set(0, MAP.floorY ?? 0, SPAWN_Z);
            h.group.rotation.y = Math.PI;
            drv.current.attach(h);
            dir.current.reset();
            ballSM.current.gain('player');
            h.play('guard', { loop: true, timeScale: 0.18 }); // M7-QA1: calm idle
          }}
        />
      </Suspense>

      {/* M12.1 — visible on-court rival (see useFrame drive block). */}
      <RivalFigure
        ref={rivalRef}
        onReady={(h) => {
          h.group.position.copy(RIVAL_HOME);
          h.group.rotation.y = Math.PI; // face the rim at origin
          h.setPose(0, 0);
        }}
      />

      <CourtCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} cineFrameRef={cineFrame} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function Dunk3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [device] = useState(() => detectDevice());

  useEffect(() => {
    // M7-QA1: ensure canvas focus for keyboard input
    const el = canvasRef.current;
    if (el) { el.tabIndex = 0; el.style.outline = 'none'; el.focus(); }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p') setShowPerf((v) => !v);
      setShowControls(false);
    };
    const onTouch = () => setShowControls(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouch, { once: true });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('touchstart', onTouch); };
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const bridge = () => (window as any).__felDunk3D;

  const prompt = hud
    ? hud.phase === 'approach'
      ? 'WASD — drive the lane · HOLD SPACE — charge your jump'
      : hud.phase === 'charge'
      ? 'RELEASE SPACE to launch · ↑ POWER · ←→ FLASHY · ↓ SIGNATURE'
      : hud.phase === 'precut'
      ? 'SHOWTIME…'
      : hud.phase === 'airborne'
      ? (hud.qteActive ? 'SPACE — TIME THE SLAM!' : 'RISE…')
      : ''
    : '';

  return (
    <div
      ref={canvasRef}
      onClick={() => canvasRef.current?.focus()}
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(168,85,247,0.06)]"
      style={{ aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9', maxWidth: orient === 'portrait' ? 560 : 960, background: MAP.fogColor }}
    >
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1, powerPreference: 'high-performance' }}
        camera={{ fov: orient === 'portrait' ? 60 : 50, near: 0.1, far: 200, position: [4, 3, 12] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting />
          <DunkScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {/* M8.3 crowd-pop overlay — radial gold bloom on a made slam */}
      {hud && hud.crowdFlash > 0.01 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 42%, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0) 60%)',
            opacity: hud.crowdFlash,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* M8.4 — floating PRQ reward text */}
          <PrqFloatLayer pops={hud.prqPops} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-5 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(168,85,247,0.25)' }}>
              <span className="text-2xl font-bold text-[#A855F7]">{hud.pScore.toFixed(1)}</span>
              <span className="text-[11px] text-white/60 font-mono">DUNK · FIRST TO 21</span>
              <span className="text-2xl font-bold text-[#FF3366]">{hud.aiScore.toFixed(1)}</span>
            </div>
            <div className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70" style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: hud.prqColor }}>{hud.prqLabel}</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
              <span style={{ color: '#FFD700' }}>{hud.style}</span>
              <span style={{ color: '#00E5FF' }}>{hud.tossType.toUpperCase()}</span>
              {hud.modifierArmed && <span style={{ color: hud.modifier === 'chained' ? '#FFD700' : '#FF3366' }}>{(hud.modifier === 'none' ? (hud.combo > 0 ? 'CHAINED' : 'DOUBLE') : hud.modifier.toUpperCase())}!</span>}
              {hud.combo > 1 && <span style={{ color: '#00FF9D' }}>{hud.comboMult}× COMBO</span>}
            </div>
          </div>

          {/* M8.4 — Dunk style picker with distinct apex-silhouette micro-previews */}
          {(hud.phase === 'charge' || hud.phase === 'airborne') && (
            <div className="absolute left-1/2 bottom-40 -translate-x-1/2 flex gap-2 pointer-events-auto">
              {([
                // TUNE(elijah) — each silhouette hints the trick's apex shape
                { s: 'POWER' as Style, label: 'POWER', hint: '↑', color: '#00E5FF', path: 'M20 6 L20 20 M20 20 L12 30 M20 20 L28 30 M20 11 L9 15 M20 11 L31 15' },
                { s: 'FLASHY' as Style, label: 'FLASHY', hint: '←→', color: '#A855F7', path: 'M20 6 L20 20 M20 20 L11 26 M20 20 L30 32 M20 12 L6 10 M20 12 L33 20' },
                { s: 'SIGNATURE' as Style, label: 'SIG', hint: '↓', color: '#FFD700', path: 'M20 7 L18 21 M18 21 L10 31 M18 21 L27 28 M19 13 L8 20 M19 13 L32 11' },
              ]).map(({ s, label, hint, color, path }) => {
                const active = hud.style === s;
                return (
                  <button
                    key={s}
                    onPointerDown={() => bridge()?.pickStyle(s)}
                    className="rounded-lg px-2 pt-1.5 pb-1 flex flex-col items-center transition-all"
                    style={{
                      background: active ? 'rgba(10,10,20,0.92)' : 'rgba(5,5,8,0.62)',
                      border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
                      boxShadow: active ? `0 0 14px ${color}88` : 'none',
                      transform: active ? 'scale(1.08)' : 'scale(0.94)',
                      opacity: active ? 1 : 0.65,
                    }}
                  >
                    <svg width="40" height="38" viewBox="0 0 40 38" fill="none">
                      <circle cx="20" cy="5" r="3.4" fill={color} />
                      <path d={path} stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="text-[9px] font-bold tracking-widest" style={{ color }}>{label}</div>
                    <div className="text-[8px] font-mono text-white/40 leading-none">{hint}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Charge meter */}
          {hud.phase === 'charge' && (
            <div className="absolute left-1/2 bottom-24 -translate-x-1/2 w-56">
              <div className="text-center text-xs font-mono text-white/70 mb-2" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>CHARGE</div>
              <div className="relative h-3 rounded bg-black/60 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${hud.charge * 100}%`, background: 'linear-gradient(to right,#00E5FF,#A855F7)' }} />
              </div>
            </div>
          )}

          {/* Phase 1 — Toss select (Gap 4). Sticky lob choice picked during the run-up. */}
          {(hud.phase === 'charge' || hud.phase === 'approach') && (
            <div className="absolute left-1/2 bottom-10 -translate-x-1/2 flex gap-2 pointer-events-auto">
              {([
                { t: 'straight' as TossType, label: 'STRAIGHT', key: '1' },
                { t: 'arc' as TossType, label: 'ARC', key: '2' },
                { t: 'backboard' as TossType, label: 'OFF GLASS', key: '3' },
              ]).map(({ t, label, key }) => {
                const active = hud.tossType === t;
                return (
                  <button
                    key={t}
                    onPointerDown={() => bridge()?.setToss(t)}
                    onClick={() => bridge()?.setToss(t)}
                    className="rounded-md px-2.5 py-1 flex flex-col items-center transition-all select-none"
                    style={{
                      background: active ? 'rgba(0,229,255,0.16)' : 'rgba(5,5,8,0.6)',
                      border: `1px solid ${active ? '#00E5FF' : 'rgba(255,255,255,0.12)'}`,
                      boxShadow: active ? '0 0 12px rgba(0,229,255,0.5)' : 'none',
                    }}
                  >
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: active ? '#00E5FF' : 'rgba(255,255,255,0.75)' }}>{label}</span>
                    {device !== 'touch' && <span className="text-[8px] font-mono text-white/40 leading-none">{key}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* QTE ring */}
          {hud.phase === 'airborne' && hud.qteActive && (
            <div className="absolute left-1/2 top-[42%] -translate-x-1/2 text-center">
              <div className="text-2xl font-bold text-[#FFD700] mb-1" style={{ textShadow: '0 0 16px rgba(255,215,0,0.6)' }}>SLAM!</div>
              <div className="relative h-2 w-40 rounded bg-black/60 overflow-hidden mx-auto">
                <div className="absolute inset-y-0 bg-[#00FF9D]/40" style={{ left: '30%', width: '40%' }} />
                <div className="absolute inset-y-0 w-1 bg-[#FFD700]" style={{ left: `${Math.min(hud.qteT / hud.qteWindow, 1) * 100}%` }} />
              </div>
            </div>
          )}

          {hud.qteResult && hud.phase !== 'approach' && (
            <div className="absolute left-1/2 top-[54%] -translate-x-1/2 text-sm font-bold" style={{ color: hud.qteResult === 'PERFECT' ? '#FFD700' : '#00E5FF' }}>{hud.qteResult}</div>
          )}

          {prompt && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white px-4 py-1.5 rounded-lg" style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.18)' }}>
              {prompt}
            </div>
          )}

          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2">
              <div className="text-4xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* Touch controls — Gap 1 (M-handoff Step 1): visible + usable on mobile & guest /try.
             JUMP: hold to charge during APPROACH, release to launch. SLAM: tap to time the finish mid-air.
             pointer events (touchstart/end equivalent) for low latency — never debounced. */}
          {device === 'touch' && (
            <div
              className="absolute bottom-4 right-4 flex items-end gap-3 pointer-events-auto"
              style={{ touchAction: 'none' }}
            >
              <button
                aria-label="Jump — hold to charge, release to launch"
                onPointerDown={(e) => { e.preventDefault(); bridge()?.startCharge(); }}
                onPointerUp={(e) => { e.preventDefault(); bridge()?.releaseCharge(); }}
                onPointerCancel={() => bridge()?.releaseCharge()}
                onContextMenu={(e) => e.preventDefault()}
                className="h-20 w-20 rounded-full border-2 font-bold text-sm tracking-wider transition-all select-none"
                style={{
                  borderColor: hud.phase === 'charge' ? '#00E5FF' : '#A855F7',
                  background: hud.phase === 'charge' ? 'rgba(0,229,255,0.18)' : 'rgba(168,85,247,0.12)',
                  color: hud.phase === 'charge' ? '#00E5FF' : '#A855F7',
                  boxShadow: hud.phase === 'approach' || hud.phase === 'charge' ? '0 0 18px rgba(168,85,247,0.55)' : 'none',
                }}
              >
                {hud.phase === 'charge' ? 'LAUNCH' : 'JUMP'}
              </button>
              {/* Phase 1 — MOD: arm the mid-air clutch (Gap 5). Second finger, tighter finish, bigger score. */}
              <button
                aria-label="Modifier — arm the mid-air clutch for a bigger score"
                onPointerDown={(e) => { e.preventDefault(); bridge()?.armModifier(); }}
                onContextMenu={(e) => e.preventDefault()}
                className="h-16 w-16 rounded-full border-2 font-bold text-xs tracking-wider transition-all select-none"
                style={{
                  borderColor: hud.modifierArmed ? '#FF3366' : 'rgba(255,51,102,0.5)',
                  background: hud.modifierArmed ? 'rgba(255,51,102,0.28)' : 'rgba(255,51,102,0.08)',
                  color: '#FF3366',
                  boxShadow: hud.modifierArmed ? '0 0 18px rgba(255,51,102,0.6)' : 'none',
                  opacity: hud.phase === 'charge' || hud.phase === 'airborne' ? 1 : 0.4,
                }}
              >
                MOD
              </button>
              <button
                aria-label="Slam — time the finish"
                onPointerDown={(e) => { e.preventDefault(); bridge()?.qteTap(); }}
                onContextMenu={(e) => e.preventDefault()}
                className="h-24 w-24 rounded-full border-2 font-bold text-base tracking-wider transition-all select-none"
                style={{
                  borderColor: '#FFD700',
                  background: hud.phase === 'airborne' && hud.qteActive ? 'rgba(255,215,0,0.28)' : 'rgba(255,215,0,0.1)',
                  color: '#FFD700',
                  boxShadow: hud.phase === 'airborne' && hud.qteActive ? '0 0 26px rgba(255,215,0,0.7)' : 'none',
                  transform: hud.phase === 'airborne' && hud.qteActive ? 'scale(1.08)' : 'scale(1)',
                }}
              >
                SLAM
              </button>
            </div>
          )}
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />

      {/* M7-QA1: Controls overlay — shows on load, dismisses on first input */}
      {showControls && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(5,5,8,0.82)', backdropFilter: 'blur(6px)' }}>
          <div className="rounded-xl px-6 py-5 text-center" style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(168,85,247,0.25)' }}>
            <div className="text-sm font-bold text-[#A855F7] mb-3">CONTROLS — DUNK CONTEST</div>
            <div className="text-xs text-white/70 space-y-1 font-mono">
              {(device === 'touch' ? MODE_BINDINGS['basketball_dunk'].touch : MODE_BINDINGS['basketball_dunk'].desktop).map((b, i) => (
                <div key={i}><span className="text-white">{b.key}</span> — {b.label}</div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-white/40">{device === 'touch' ? 'TAP TO START' : 'PRESS ANY KEY TO START'}</div>
          </div>
        </div>
      )}
    </div>
  );
}