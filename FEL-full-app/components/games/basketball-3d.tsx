'use client';

/**
 * basketball-3d.tsx — M7c flagship hero mode: 1v1 Half-Court Basketball.
 * =====================================================================
 * A TRUE free-locomotion 3D half-court basketball game using ALL SIX M7a libs:
 *   • LocomotionController  — WASD/arrows camera-relative dribble drive
 *   • AnimDirectorFSM       — idle ⇆ locomotion ⇆ action (dribble/shoot/defend)
 *   • AvatarDriver          — blends FSM decisions onto the GLB mixer
 *   • BallStateMachine      — held → in_flight → loose → dead ball
 *   • camera rigs + CameraCut — follow rig on dribble, broadcast cut on shot
 *   • clip-registry         — basketball_h2h clips (dribble/shoot/block/score/defend)
 *
 * EXACT tuned constants from the proven 2D 1v1 scene are preserved verbatim.
 * // TUNE(elijah)
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { PerfSampler, PerfOverlay } from '@/components/three/perf-hud';
import { MapMesh } from '@/components/three/map-loader';
import { VeniceSurround } from '@/components/three/venice-surround';
import { SceneBackdrop } from '@/components/three/scene-backdrop';
import { PremiumHoop, DustMotes, HoopGlow, Basketball } from '@/components/three/basketball-court';
import { BallFlightRenderer, createBallFlightTracker, createNetHandle } from '@/components/three/ball-flight-renderer';
import { RimGlowPulse } from '@/components/three/effects';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';
import { MAPS } from '@/lib/map-data';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { LocomotionController } from '@/lib/loco/movement';
import { BallStateMachine } from '@/lib/ball/ball-state';
import { computeCamera, CameraCut, RIGS, type CameraFrame, type Subject } from '@/lib/camera/rigs';
import { createClutchTime, updateClutchTime, clutchTime3DParams, type ClutchTimeState } from '@/lib/camera-director';
import { createFlash, triggerFlash, updateFlash } from '@/lib/impact-system';
import { createPrqEmitter, spawnPrq, updatePrq, PrqFloatLayer, type PrqPop } from '@/components/games/prq-float';
import { createDefenderBite, resolveFake, crossover, updateDefenderBite, isOpen, BITE, type DefenderBite } from '@/lib/feel/defender-bite';

const HERO_URL = '/models/elijah-hero.glb';
const MAP = MAPS['venice-blue-court'];

// ── Court geometry ──
const HOOP_POS = new THREE.Vector3(0, 3.05, 0);
const COURT_BOUNDS = { minX: -7, maxX: 7, minZ: -1, maxZ: 9 }; // half-court
const THREE_PT_ARC = 6.75; // 3-point line radius from hoop
const PLAYER_START_Z = 6.0;
const DEFENDER_START_Z = 3.5;

// ── EXACT tuned scoring constants (verbatim from proven 2D 1v1) ──
const TARGET = 11; // TUNE(elijah) — first to 11
const AIM_RATE = 3.0; // TUNE(elijah)
const SHOT_BAR_RATE = 3.4; // TUNE(elijah)
const GOLD_LINE = 0.75; // TUNE(elijah)
const DEFENSE_TIMER = 1.5; // TUNE(elijah)
const DEF_AGGRESSION = 0.6; // TUNE(elijah) how readily the on-ball defender bites on a shot-fake
const LEAN_VIS_M = 0.9; // TUNE(elijah) metres the beaten defender slides off the shooting lane
const AIM_CENTER_THRESHOLD = 0.35; // TUNE(elijah)
const DEEP_AIM_THRESHOLD = 0.12; // TUNE(elijah)
// sweet spot is grade-dependent: set per game start

type Phase =
  | 'dribble'       // free-locomotion offense: move around the court
  | 'aim'           // locked position, oscillating aim reticle
  | 'power'         // oscillating power bar
  | 'shot'          // ball in flight, broadcast cam
  | 'defense'       // AI attacks, player guards
  | 'msg'           // message display (score/miss/steal)
  | 'between';      // brief reset pause

interface HudState {
  myScore: number; aiScore: number; phase: Phase;
  aim: number; power: number; defenseTimer: number;
  aiAttackZone: 'left' | 'center' | 'right';
  msg: string; msgColor: string; msgT: number;
  prqLabel: string; prqColor: string; camRig: string;
  distToHoop: number; isBeyondArc: boolean;
  clutchIntensity: number; // M8.2
  rimFlash: number; rimFlashColor: string; // M8.3 perfect-release rim reaction
  momentum: number; // M8.4 make/miss momentum, clamped -5..+5
  prqPops: PrqPop[]; // M8.4 floating +PRQ reward text
}

// ── Camera driver ── (same pattern as soccer-3d)
function CourtCamera({
  subjectRef, rigModeRef, cutRef,
}: {
  subjectRef: React.MutableRefObject<Subject>;
  rigModeRef: React.MutableRefObject<'follow' | 'broadcast'>;
  cutRef: React.MutableRefObject<CameraCut>;
}) {
  const camera = useThree((s) => s.camera);
  const smoothed = useRef<CameraFrame>({
    position: { x: 4, y: 2.8, z: 10 }, target: { x: 0, y: 1.2, z: 4 }, fov: 50,
  });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const rig = rigModeRef.current === 'broadcast' ? RIGS.broadcast : RIGS.follow;
    const target = computeCamera(subjectRef.current, rig);
    const frame = cutRef.current.active ? cutRef.current.update(dt, target) : target;
    const k = rig.stiffness + 0.04;
    const sm = smoothed.current;
    const rate = k * 6 * dt * 10;
    sm.position.x += (frame.position.x - sm.position.x) * rate;
    sm.position.y += (frame.position.y - sm.position.y) * rate;
    sm.position.z += (frame.position.z - sm.position.z) * rate;
    sm.target.x += (frame.target.x - sm.target.x) * rate;
    sm.target.y += (frame.target.y - sm.target.y) * rate;
    sm.target.z += (frame.target.z - sm.target.z) * rate;
    camera.position.set(sm.position.x, sm.position.y, sm.position.z);
    camera.lookAt(sm.target.x, sm.target.y, sm.target.z);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.fov += (frame.fov - cam.fov) * 0.1;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function BasketballScene({
  grade, prq, onEnd, gamepad, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const playerRef = useRef<AvatarHandle | null>(null);
  const defenderRef = useRef<AvatarHandle | null>(null);
  const ballMeshRef = useRef<THREE.Mesh>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  // EXACT tuned sweet spot (verbatim from 2D) TUNE(elijah)
  const sweet = grade.key === 'ELITE' ? 0.2 : grade.key === 'PRIMED' ? 0.17 : grade.key === 'READY' ? 0.14 : 0.12;

  // ── M7a libraries ──
  const loco = useRef(new LocomotionController({ speedScale: grade?.speedMult ?? 1 }, { x: 0, z: PLAYER_START_Z }));
  const dir = useRef(new AnimDirectorFSM());
  const drv = useRef(new AvatarDriver());
  const defDir = useRef(new AnimDirectorFSM());
  const defDrv = useRef(new AvatarDriver());
  const ballSM = useRef(new BallStateMachine());
  const flightTracker = useRef(createBallFlightTracker());
  const netHandle = useRef(createNetHandle());
  const cut = useRef(new CameraCut());
  const rigMode = useRef<'follow' | 'broadcast'>('follow');
  const clutchRef = useRef<ClutchTimeState>(createClutchTime());
  const camSubject = useRef<Subject>({ pos: { x: 0, y: 0, z: PLAYER_START_Z }, facing: Math.PI, speed01: 0 });
  const actionEvt = useRef<string | undefined>(undefined);
  const defActionEvt = useRef<string | undefined>(undefined);
  // Phase 4: shared fake-then-commit defender model (also used by 3v3)
  const bite = useRef<DefenderBite>(createDefenderBite());

  const st = useRef({
    t: 0,
    phase: 'dribble' as Phase,
    myScore: 0, aiScore: 0, steals: 0,
    momentum: 0, // M8.4 // TUNE(elijah) clamp range ±5
    prq: createPrqEmitter(), // M8.4 PRQ surfacing
    aimT: 0, aim: 0, power: 0, powerDir: 1,
    // defense
    defenseChoice: null as 'left' | 'center' | 'right' | null,
    aiAttack: 'center' as 'left' | 'center' | 'right',
    defenseTimer: DEFENSE_TIMER,
    // ball flight
    flight: null as null | { from: THREE.Vector3; to: THREE.Vector3; t: number; made: boolean; deep: boolean; perfect: boolean },
    // M8.3 rim reaction flash (perfect vs good release)
    rimFlash: createFlash(),
    // messaging
    msg: '', msgColor: '#FFD700', msgT: 0, nextPhase: 'dribble' as Phase,
    betweenT: 0,
    // defender position (AI tracks player)
    defX: 0, defZ: DEFENDER_START_Z,
    // timing
    startTime: Date.now(),
    keys: {} as Record<string, boolean>,
    // shot state
    shotPosX: 0, shotPosZ: 0,
    strikeResolved: false,
  });

  const say = useCallback((m: string, c: string) => {
    const s = st.current; s.msg = m; s.msgColor = c; s.msgT = 1.5;
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const won = s.myScore > s.aiScore;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    // EXACT scoring formula (verbatim from 2D) TUNE(elijah)
    onEndRef.current?.({
      score: s.myScore * 100 + s.steals * 50,
      opponentScore: s.aiScore * 100,
      won,
      duration: dur,
      headline: won ? `${s.myScore}-${s.aiScore} — KING OF THE COURT` : `${s.myScore}-${s.aiScore} — RUN IT BACK`,
    });
  }, []);

  const startDefense = useCallback(() => {
    const s = st.current;
    s.aiAttack = (['left', 'center', 'right'] as const)[Math.floor(Math.random() * 3)];
    s.defenseChoice = null;
    s.defenseTimer = DEFENSE_TIMER; // TUNE(elijah)
    s.phase = 'defense';
    // Reset loco to player-side of the court
    loco.current.state.pos.x = 0;
    loco.current.state.pos.z = 3;
    loco.current.state.facing = Math.PI;
    defActionEvt.current = 'defend';
  }, []);

  const resetOffense = useCallback(() => {
    const s = st.current;
    s.phase = 'dribble';
    s.aimT = Math.random() * Math.PI;
    s.flight = null;
    s.strikeResolved = false;
    bite.current = createDefenderBite(); // Phase 4: fresh possession = defender back on balance
    ballSM.current.reset();
    ballSM.current.gain('player');
    rigMode.current = 'follow';
    // Reset player to top of key
    loco.current.state.pos.x = 0;
    loco.current.state.pos.z = PLAYER_START_Z;
    loco.current.state.facing = Math.PI;
  }, []);

  const lockAim = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'aim') return;
    s.phase = 'power'; s.power = 0; s.powerDir = 1;
  }, []);

  const lockPower = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'power') return;
    const aimErr = Math.abs(s.aim);
    const powErr = Math.abs(s.power - GOLD_LINE);
    // Phase 4: an OPEN look (defender beaten by a fake) widens the release window;
    // an on-balance contest leaves the proven baseline untouched. // TUNE(elijah)
    const open = isOpen(bite.current);
    const effSweet = open ? sweet * BITE.OPEN_SWEET_MULT : sweet;
    // EXACT shot outcome math (verbatim from 2D) TUNE(elijah)
    const good = aimErr < AIM_CENTER_THRESHOLD && powErr < effSweet;
    const deep = aimErr < DEEP_AIM_THRESHOLD && powErr < effSweet * 0.5;
    // M8.3 PERFECT RELEASE tier — tighter than a normal good release // TUNE(elijah)
    const perfect = aimErr < AIM_CENTER_THRESHOLD * 0.4 && powErr < effSweet * 0.35;
    // Trigger shot animation + ball flight + broadcast cam
    actionEvt.current = 'shoot';
    defActionEvt.current = 'block'; // M8.6 AI defender contests the release with a visible reach // TUNE(elijah)
    ballSM.current.release();
    rigMode.current = 'broadcast';
    cut.current.begin(computeCamera(camSubject.current, RIGS.follow), 0.6);
    const from = new THREE.Vector3(s.shotPosX, 1.8, s.shotPosZ);
    const to = HOOP_POS.clone();
    s.flight = { from, to, t: 0, made: good, deep, perfect };
    s.phase = 'shot'; s.strikeResolved = false;
  }, [sweet]);

  const guard = useCallback((z: 'left' | 'center' | 'right') => {
    const s = st.current;
    if (s.phase !== 'defense' || s.defenseChoice) return;
    s.defenseChoice = z;
    actionEvt.current = 'block';
    if (z === s.aiAttack) {
      s.steals++;
      defActionEvt.current = 'block'; // M8.6 AI attacker is visibly deflected on the steal // TUNE(elijah)
      say('LOCKDOWN! STEAL', '#00E5FF');
      s.phase = 'msg'; s.nextPhase = 'dribble';
      s.msgT = 1.2;
    } else {
      s.aiScore++;
      defActionEvt.current = 'shoot'; // M8.6 AI attacker finishes the drive on blown coverage // TUNE(elijah)
      s.momentum = Math.max(-5, Math.min(5, s.momentum - 1)); // M8.4
      if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
      say('AI SCORES', '#FF3366');
      s.phase = 'msg'; s.nextPhase = 'dribble';
      s.msgT = 1.2;
    }
  }, [say, finish]);

  // Phase 4: shot-fake — sell the shot to make the defender bite, then commit. // TUNE(elijah)
  const doFake = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'dribble' && s.phase !== 'aim') return;
    if (isOpen(bite.current)) return; // already beaten — don't re-roll
    const { bit } = resolveFake(bite.current, DEF_AGGRESSION, Math.random());
    if (bit) {
      defActionEvt.current = 'block'; // defender lunges the wrong way
      say('CROSSED HIM — OPEN LOOK!', '#00E5FF');
    } else {
      defActionEvt.current = 'defend'; // defender stays home
      say('D STAYS DOWN', '#A855F7');
    }
  }, [say]);

  // Phase 4: crossover dribble — shift the defender's weight so the next fake bites easier. // TUNE(elijah)
  const doCross = useCallback((dir: -1 | 1) => {
    const s = st.current;
    if (s.phase !== 'dribble') return;
    crossover(bite.current, dir);
    actionEvt.current = 'dribble';
  }, []);

  // ── Input ──
  // ── M8.6 opponent-presence diagnostic: log the ACTUAL AI timing model on mount ──
  // FINDING (elijah): there is NO per-difficulty ("Elite/Legend") AI reaction-delay system in 1v1.
  // The only reaction window is the PLAYER's defense window (DEFENSE_TIMER); the AI opponent picks an
  // attack lane at random and the player must match it within that window. Elite/Primed/Ready are PRQ
  // *player* grades (they scale the shot sweet-spot + move speed), NOT AI difficulty tiers.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[FEL][1v1][AI-timing] model=fixed-random-lane', {
      defenseReactionWindowSec: DEFENSE_TIMER,       // TUNE(elijah) player must pick a lane within this window
      defenderTrackLerp: 2.5,                        // TUNE(elijah) off-ball tracking closing speed
      defenderContestLerp: 4.5,                      // TUNE(elijah) closing speed while contesting a shot
      defenderContestGapM: 1.15,                     // TUNE(elijah) how tight the defender crowds on release
      perDifficultyReactionDelay: 'NOT_IMPLEMENTED', // no Elite/Legend AI delay tiers exist in this mode
      note: 'Elite/Primed/Ready = PRQ player grades, not AI difficulty.',
    });
  }, []);

  useEffect(() => {
    const setKey = (k: string, down: boolean) => { st.current.keys[k] = down; };
    const kd = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase();
      setKey(k, true);
      const s = st.current;
      if (k === ' ') {
        e.preventDefault?.();
        if (s.phase === 'dribble') {
          // Lock aim — transition from dribble to aim
          s.shotPosX = loco.current.state.pos.x;
          s.shotPosZ = loco.current.state.pos.z;
          s.phase = 'aim'; s.aimT = 0;
        } else if (s.phase === 'aim') lockAim();
        else if (s.phase === 'power') lockPower();
      }
      if (k === 'f') { e.preventDefault?.(); doFake(); }
      if (k === 'q') { e.preventDefault?.(); doCross(-1); }
      if (k === 'e') { e.preventDefault?.(); doCross(1); }
      if (s.phase === 'defense') {
        if (e.key === 'ArrowLeft') { e.preventDefault?.(); guard('left'); }
        if (e.key === 'ArrowUp') { e.preventDefault?.(); guard('center'); }
        if (e.key === 'ArrowRight') { e.preventDefault?.(); guard('right'); }
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => setKey((e.key ?? '').toLowerCase(), false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felBball3D = {
      shoot: () => {
        const s = st.current;
        if (s.phase === 'dribble') {
          s.shotPosX = loco.current.state.pos.x;
          s.shotPosZ = loco.current.state.pos.z;
          s.phase = 'aim'; s.aimT = 0;
        } else if (s.phase === 'aim') lockAim();
        else if (s.phase === 'power') lockPower();
      },
      guard,
      fake: doFake,
      cross: doCross,
    };
    registerFelMode('basketball', {
      getState: () => { const s = st.current; return { phase: s.phase, myScore: s.myScore, aiScore: s.aiScore, steals: s.steals, momentum: s.momentum, defenderOpen: isOpen(bite.current) }; },
      sendInput: (a, p) => {
        if (a === 'shoot') (window as any).__felBball3D?.shoot();
        else if (a === 'guard') guard((p as 'left' | 'center' | 'right') ?? 'center');
        else if (a === 'fake') doFake();
        else if (a === 'cross') doCross((p as number) < 0 ? -1 : 1);
      },
    });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felBball3D;
      unregisterFelMode('basketball');
    };
  }, [lockAim, lockPower, guard, doFake, doCross]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  // ── Main loop ──
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    ballSM.current.update(dt);
    // Phase 4: advance the fake-then-commit defender model (lean eases back, open window decays)
    updateDefenderBite(bite.current, dt);

    // ── Free locomotion (dribble phase only) ──
    let moveX = 0, moveY = 0;
    const canMove = s.phase === 'dribble';
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

    // ── Aim / power oscillation (EXACT tuned rates) ──
    const speedMult = gradeRef.current?.speedMult ?? 1;
    if (s.phase === 'aim') { s.aimT += dt * AIM_RATE * speedMult; s.aim = Math.sin(s.aimT); } // TUNE(elijah)
    if (s.phase === 'power') {
      s.power += s.powerDir * dt * SHOT_BAR_RATE; // TUNE(elijah)
      if (s.power >= 1) { s.power = 1; s.powerDir = -1; }
      if (s.power <= 0) { s.power = 0; s.powerDir = 1; }
    }

    // ── Ball flight resolution ──
    if (s.phase === 'shot' && s.flight) {
      const f = s.flight;
      f.t += dt * 1.8;
      if (f.t >= 1 && !s.strikeResolved) {
        s.strikeResolved = true;
        s.myScore += f.made ? (f.deep ? 2 : 1) : 0; // TUNE(elijah)
        s.momentum = Math.max(-5, Math.min(5, s.momentum + (f.made ? 1 : -1))); // M8.4
        if (f.made) {
          actionEvt.current = 'score';
          netHandle.current.swish();
          // M8.4 — surface PRQ reward on the bucket. // TUNE(elijah) shard values
          spawnPrq(s.prq, f.perfect ? 18 : f.deep ? 12 : 8, f.perfect || f.deep ? '#FFD700' : '#00FF9D');
          // M8.3 rim reaction tier: GOLD bloom for a perfect/deep release, GREEN for a normal make.
          if (f.perfect) triggerFlash(s.rimFlash, '#FFD700', 0.85, 2.0);      // TUNE(elijah)
          else if (f.deep) triggerFlash(s.rimFlash, '#FFD700', 0.6, 2.8);      // TUNE(elijah)
          else triggerFlash(s.rimFlash, '#00FF9D', 0.5, 3.4);                  // TUNE(elijah)
          say(
            f.perfect ? `PERFECT RELEASE +${f.deep ? 2 : 1}` : f.deep ? 'DEEP BUCKET +2' : 'BUCKET +1',
            f.perfect || f.deep ? '#FFD700' : '#00FF9D',
          );
        } else {
          say('BRICK!', '#FF3366');
        }
        if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
        s.phase = 'msg';
        s.nextPhase = 'defense'; // switch to defense after offense
        s.msgT = 1.2;
      }
    }

    // ── Defense phase ──
    if (s.phase === 'defense') {
      s.defenseTimer -= dt;
      if (s.defenseTimer <= 0 && !s.defenseChoice) {
        s.aiScore++;
        s.momentum = Math.max(-5, Math.min(5, s.momentum - 1)); // M8.4
        if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
        say('TOO SLOW — AI SCORES', '#FF3366');
        s.phase = 'msg'; s.nextPhase = 'dribble'; s.msgT = 1.2;
      }
    }

    // ── Message phase ──
    if (s.phase === 'msg') {
      if (s.msgT <= 0) {
        if (s.nextPhase === 'defense') startDefense();
        else resetOffense();
      }
    }

    // ── Defender AI tracking (mirrors player during offense, drives during defense) ──
    if (s.phase === 'dribble' || s.phase === 'aim' || s.phase === 'power' || s.phase === 'shot') {
      // M8.6 defender tracks the ball-handler and CLOSES IN to contest during the shot windup // TUNE(elijah)
      const contesting = s.phase === 'aim' || s.phase === 'power' || s.phase === 'shot';
      const gap = contesting ? 1.15 : 2.5;   // TUNE(elijah) how tight the defender crowds the shooter
      const close = contesting ? 4.5 : 2.5;  // TUNE(elijah) closing speed (lerp) toward contest position
      // Phase 4: a beaten defender slides OFF the shooting lane (open look); crossover
      // lean nudges them too, so the fake reads visibly on the defender's body. // TUNE(elijah)
      const beatenSlide = isOpen(bite.current) ? LEAN_VIS_M : 0;
      const leanOffset = bite.current.lean * 0.5 + beatenSlide;
      const targetDefX = locoState.pos.x * (contesting ? 0.92 : 0.7) + leanOffset;
      const targetDefZ = Math.max(COURT_BOUNDS.minZ, locoState.pos.z - gap);
      s.defX += (targetDefX - s.defX) * close * dt;
      s.defZ += (targetDefZ - s.defZ) * close * dt;
    } else if (s.phase === 'defense') {
      // Defender drives toward basket from a random direction
      const attackX = s.aiAttack === 'left' ? -3 : s.aiAttack === 'right' ? 3 : 0;
      const attackZ = 2;
      s.defX += (attackX - s.defX) * 1.2 * dt;
      s.defZ += (attackZ - s.defZ) * 1.2 * dt;
    }

    // ── Drive player avatar through the FSM ──
    if (playerRef.current) {
      const g = playerRef.current.group;
      g.position.set(locoState.pos.x, MAP.floorY ?? 0, locoState.pos.z);
      g.rotation.y = locoState.facing;
      const modePhase = s.phase === 'shot' && s.flight?.made ? 'scored' : '';
      const decision = dir.current.update(dt, {
        modeId: 'basketball_h2h',
        speed01: canMove ? locoState.speed01 : 0,
        phase: modePhase,
        actionEvent: actionEvt.current,
      });
      actionEvt.current = undefined;
      drv.current.apply(decision);
      // Camera subject
      camSubject.current.pos.x = locoState.pos.x;
      camSubject.current.pos.y = 1.1;
      camSubject.current.pos.z = locoState.pos.z;
      camSubject.current.facing = locoState.facing;
      camSubject.current.speed01 = locoState.speed01;
    }

    // ── Drive defender avatar ──
    if (defenderRef.current) {
      const dg = defenderRef.current.group;
      dg.position.set(s.defX, MAP.floorY ?? 0, s.defZ);
      // Face toward player
      const dx = locoState.pos.x - s.defX;
      const dz = locoState.pos.z - s.defZ;
      if (Math.abs(dx) + Math.abs(dz) > 0.1) dg.rotation.y = Math.atan2(dx, dz);
      const defSpeed = Math.min(Math.sqrt(dx * dx + dz * dz) * 0.3, 0.8);
      const dDecision = defDir.current.update(dt, {
        modeId: 'basketball_h2h',
        speed01: defSpeed,
        phase: s.phase === 'defense' ? '' : '',
        actionEvent: defActionEvt.current,
      });
      defActionEvt.current = undefined;
      defDrv.current.apply(dDecision);
    }

    // ── Ball mesh follow ──
    if (ballMeshRef.current) {
      const bm = ballMeshRef.current;
      if (s.phase === 'shot' && s.flight) {
        const f = s.flight;
        const t = Math.min(f.t, 1);
        bm.visible = true;
        bm.position.set(
          f.from.x + (f.to.x - f.from.x) * t,
          f.from.y + (f.to.y - f.from.y) * t + Math.sin(t * Math.PI) * 2.5,
          f.from.z + (f.to.z - f.from.z) * t,
        );
        const ft = flightTracker.current;
        ft.airborne = true; ft.arcFrom = f.from; ft.arcTo = f.to; ft.arcApex = 2.5; ft.showArc = true;
      } else if (s.phase === 'dribble' || s.phase === 'aim' || s.phase === 'power') {
        // Ball follows player's hand area
        bm.visible = true;
        const hand = playerRef.current?.bone?.('RightHand');
        if (hand) {
          const wp = new THREE.Vector3();
          hand.getWorldPosition(wp);
          // Dribble bounce
          const bounce = s.phase === 'dribble' && locoState.speed01 > 0.1
            ? Math.abs(Math.sin(s.t * 8)) * 0.3
            : 0;
          bm.position.set(wp.x + 0.2, Math.max(0.12, wp.y - 0.4 - bounce), wp.z);
        } else {
          // Fallback: near player
          bm.position.set(
            locoState.pos.x + 0.3,
            0.6 + (s.phase === 'dribble' ? Math.abs(Math.sin(s.t * 8)) * 0.3 : 0),
            locoState.pos.z,
          );
        }
      } else {
        bm.visible = false;
      }
      if (s.phase !== 'shot') flightTracker.current.airborne = false;
    }

    // M8.2: Clutch time — activates when either score >= 8 (of 11) // TUNE(elijah)
    updateClutchTime(clutchRef.current, dt, s.myScore, s.aiScore, 8);
    const clutchParams = clutchTime3DParams(clutchRef.current);
    updateFlash(s.rimFlash, dt); // M8.3 rim reaction decay

    // Distance to hoop (for HUD)
    const distToHoop = Math.hypot(locoState.pos.x, locoState.pos.z);
    const isBeyondArc = distToHoop > THREE_PT_ARC;

    const prqPops = updatePrq(s.prq, dt); // M8.4 — particle life must decay every frame
    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        myScore: s.myScore, aiScore: s.aiScore, phase: s.phase,
        aim: s.aim, power: s.power, defenseTimer: s.defenseTimer,
        aiAttackZone: s.aiAttack,
        msg: s.msg, msgColor: s.msgColor, msgT: s.msgT,
        prqLabel: gradeRef.current?.label ?? '', prqColor: gradeRef.current?.color ?? '#00FF9D',
        camRig: rigMode.current,
        distToHoop, isBeyondArc,
        clutchIntensity: clutchRef.current.intensity,
        rimFlash: s.rimFlash.alpha, rimFlashColor: s.rimFlash.color,
        momentum: s.momentum,
        prqPops,
      });
    }
  });

  return (
    <>
      {MAP.backdrop && (
        <Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>
      )}
      <Suspense fallback={null}><MapMesh config={MAP} /></Suspense>
      <VeniceSurround boundsMin={MAP.boundsMin} boundsMax={MAP.boundsMax} />
      <PremiumHoop netHandle={netHandle} />
      <HoopGlow />
      <DustMotes count={50} />
      <RimGlowPulse color="#00E5FF" position={[-5, 3, -2]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#FF3366" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <Basketball ballRef={ballMeshRef} />
      <BallFlightRenderer ballRef={ballMeshRef} tracker={flightTracker} />

      {/* Player avatar — full lib-wired */}
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            playerRef.current = h;
            h.group.position.set(0, MAP.floorY ?? 0, PLAYER_START_Z);
            h.group.rotation.y = Math.PI;
            drv.current.attach(h);
            dir.current.reset();
            ballSM.current.gain('player');
            h.play('guard', { loop: true, timeScale: 1 });
          }}
        />
      </Suspense>

      {/* Defender avatar — tinted red, lib-wired */}
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          tint="#FF3366"
          onReady={(h) => {
            defenderRef.current = h;
            h.group.position.set(0, MAP.floorY ?? 0, DEFENDER_START_Z);
            h.group.rotation.y = 0;
            defDrv.current.attach(h);
            defDir.current.reset();
            h.play('guard', { loop: true, timeScale: 0.9 });
          }}
        />
      </Suspense>

      <CourtCamera subjectRef={camSubject} rigModeRef={rigMode} cutRef={cut} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function Basketball3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [showPerf, setShowPerf] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'p') setShowPerf((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const sweet = props.grade.key === 'ELITE' ? 0.2 : props.grade.key === 'PRIMED' ? 0.17 : props.grade.key === 'READY' ? 0.14 : 0.12;

  const shoot = () => (window as any).__felBball3D?.shoot();
  const doGuard = (z: 'left' | 'center' | 'right') => (window as any).__felBball3D?.guard(z);

  // M8.4: at ±3 the world responds — colours intensify hot, desaturate cold. // TUNE(elijah)
  const mo = hud?.momentum ?? 0;
  const worldFilter =
    mo >= 3 ? `saturate(${(1 + Math.min(mo - 2, 3) * 0.18).toFixed(2)}) brightness(${(1 + Math.min(mo - 2, 3) * 0.04).toFixed(2)})`
    : mo <= -3 ? `saturate(${Math.max(0.3, 1 + (mo + 2) * 0.22).toFixed(2)})`
    : 'none';

  const prompt = hud
    ? hud.phase === 'dribble'
      ? 'WASD — dribble around the court · SPACE — pull up for a shot'
      : hud.phase === 'aim'
      ? 'SPACE — lock your aim'
      : hud.phase === 'power'
      ? 'SPACE — release at the gold line'
      : hud.phase === 'defense'
      ? '← GUARD LEFT · ↑ CENTER · → GUARD RIGHT'
      : ''
    : '';

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
      style={{
        aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9',
        maxWidth: orient === 'portrait' ? 560 : 960,
        background: MAP.fogColor,
      }}
    >
      <Canvas
        dpr={dpr}
        shadows
        style={{ filter: worldFilter, transition: 'filter 0.5s ease' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1, powerPreference: 'high-performance' }}
        camera={{ fov: orient === 'portrait' ? 60 : 50, near: 0.1, far: 200, position: [4, 3, 12] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting />
          <BasketballScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* M8.4 — floating PRQ reward text */}
          <PrqFloatLayer pops={hud.prqPops} />
          {/* Scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div
              className="flex items-center gap-5 px-5 py-1.5 rounded-xl"
              style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,229,255,0.2)' }}
            >
              <span className="text-5xl font-black text-[#00E5FF] leading-none" style={{ textShadow: '0 0 18px rgba(0,229,255,0.55)' }}>{hud.myScore}</span>
              <span className="text-[11px] text-white/60 font-mono">1V1 · FIRST TO {TARGET}</span>
              <span className="text-5xl font-black text-[#FF3366] leading-none" style={{ textShadow: '0 0 18px rgba(255,51,102,0.5)' }}>{hud.aiScore}</span>
            </div>

            {/* M8.4: momentum meter — fills from centre toward hot (gold/green) or cold (red) */}
            <div className="flex items-center gap-2">
              <div className="relative h-2.5 w-48 rounded-full overflow-hidden" style={{ background: 'rgba(5,5,8,0.85)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/40" />
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: hud.momentum >= 0 ? '50%' : `${50 + (hud.momentum / 5) * 50}%`,
                    width: `${(Math.abs(hud.momentum) / 5) * 50}%`,
                    background: hud.momentum >= 0 ? (hud.momentum >= 3 ? '#FFD700' : '#00FF9D') : '#FF3366',
                    boxShadow: Math.abs(hud.momentum) >= 3 ? `0 0 12px ${hud.momentum >= 0 ? '#FFD700' : '#FF3366'}` : 'none',
                    transition: 'left 0.3s ease, width 0.3s ease',
                  }}
                />
              </div>
              <span
                className="font-mono text-[10px] font-bold"
                style={{
                  color: hud.momentum >= 3 ? '#FFD700' : hud.momentum <= -3 ? '#FF3366' : 'rgba(255,255,255,0.92)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.9)', // M8.4 fix: keep label legible over bright backdrops // TUNE(elijah)
                }}
              >
                {hud.momentum >= 3 ? 'HEATING UP' : hud.momentum <= -3 ? 'ICE COLD' : 'MOMENTUM'}
              </span>
            </div>
            <div
              className="flex gap-3 items-center px-3 py-0.5 rounded-lg font-mono text-[10px] text-white/70"
              style={{ background: 'rgba(5,5,8,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span style={{ color: hud.prqColor }}>{hud.prqLabel}</span>
              <span style={{ color: '#C99BF7' }}>CAM {hud.camRig.toUpperCase()}</span>
              {hud.phase === 'dribble' && (
                <span style={{ color: hud.isBeyondArc ? '#FFD700' : '#00FF9D' }}>
                  {hud.isBeyondArc ? 'BEHIND THE ARC' : `${hud.distToHoop.toFixed(1)}m`}
                </span>
              )}
            </div>
          </div>

          {/* Aim bar */}
          {hud.phase === 'aim' && (
            <div className="absolute left-1/2 bottom-20 -translate-x-1/2 w-64">
              <div className="text-center text-xs font-mono text-white/70 mb-2" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>LOCK YOUR AIM</div>
              <div className="relative h-2 rounded bg-black/60 overflow-hidden">
                <div className="absolute inset-y-0 bg-[#00FF9D]/25" style={{ left: `${(1 - AIM_CENTER_THRESHOLD) * 50}%`, width: `${AIM_CENTER_THRESHOLD * 100}%` }} />
                <div className="absolute h-full w-1 rounded bg-[#FFD700]" style={{ left: `${((hud.aim + 1) / 2) * 100}%`, transition: 'none' }} />
              </div>
            </div>
          )}

          {/* Power bar */}
          {hud.phase === 'power' && (
            <div className="absolute left-1/2 bottom-20 -translate-x-1/2 w-64">
              <div className="text-center text-xs font-mono text-white/70 mb-2" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>RELEASE AT THE GOLD LINE</div>
              <div className="relative h-3 rounded bg-black/60 overflow-hidden">
                <div className="absolute inset-y-0 bg-[#00FF9D]/30" style={{ left: `${(GOLD_LINE - sweet) * 100}%`, width: `${sweet * 200}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-[#FFD700]" style={{ left: `${GOLD_LINE * 100}%` }} />
                <div className="h-full rounded" style={{ width: `${hud.power * 100}%`, background: Math.abs(hud.power - GOLD_LINE) < sweet ? '#00FF9D' : '#00E5FF' }} />
              </div>
            </div>
          )}

          {/* Defense phase */}
          {hud.phase === 'defense' && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center pointer-events-auto">
              <div className="text-lg font-bold text-[#FF3366] mb-2" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>DEFENSE! GUARD THE DRIVE</div>
              <div className="flex gap-3 mb-2">
                {(['left', 'center', 'right'] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => doGuard(z)}
                    className={`px-5 py-3 rounded-lg font-bold text-sm transition ${
                      z === hud.aiAttackZone && Math.floor(hud.defenseTimer * 6) % 2 === 0
                        ? 'bg-[#FF3366]/40 text-[#FF3366] ring-1 ring-[#FF3366]/50 animate-pulse'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {z === 'left' ? '←' : z === 'center' ? '↑' : '→'}
                  </button>
                ))}
              </div>
              <div className="h-1.5 w-48 mx-auto rounded-full bg-black/60 overflow-hidden">
                <div className="h-full rounded-full bg-[#FFD700]" style={{ width: `${Math.max(0, hud.defenseTimer / DEFENSE_TIMER) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Prompt */}
          {prompt && hud.phase !== 'defense' && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-mono text-white/90 px-4 py-1.5 rounded-lg" style={{ background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {prompt}
            </div>
          )}

          {/* M8.3: Perfect-release rim reaction — gold (perfect/deep) vs green (good) bloom near the hoop */}
          {hud.rimFlash > 0.01 && (
            <div
              className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 22%, ${hud.rimFlashColor} 0%, transparent 55%)`,
                opacity: hud.rimFlash,
                mixBlendMode: 'screen',
              }}
            />
          )}

          {/* M8.2: Clutch time overlay — vignette + rim glow hint */}
          {hud.clutchIntensity > 0.01 && (
            <div className="absolute inset-0" style={{
              background: `radial-gradient(ellipse at center, transparent 30%, rgba(180,20,20,${hud.clutchIntensity * 0.18}) 100%)`,
              pointerEvents: 'none',
            }}>
              {/* CLUTCH TIME label */}
              <div className="absolute top-[68px] left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold tracking-widest" style={{
                color: `rgba(255,51,102,${Math.min(hud.clutchIntensity * 1.2, 1)})`,
                textShadow: '0 0 12px rgba(255,51,102,0.5)',
              }}>CLUTCH TIME</div>
            </div>
          )}

          {/* Center message */}
          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2">
              <div className="text-4xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>
                {hud.msg}
              </div>
            </div>
          )}

          {/* Touch controls */}
          <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto !hidden">
            <button onClick={() => doGuard('left')} className="h-11 w-11 rounded-full border border-[#FF3366]/50 bg-black/50 text-sm font-bold text-[#FF3366]">◀</button>
            <button onClick={() => shoot()} className="h-11 w-16 rounded-full border border-[#00E5FF]/60 bg-black/50 text-xs font-bold text-[#00E5FF]">SHOOT</button>
            <button onClick={() => doGuard('right')} className="h-11 w-11 rounded-full border border-[#FF3366]/50 bg-black/50 text-sm font-bold text-[#FF3366]">▶</button>
          </div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
