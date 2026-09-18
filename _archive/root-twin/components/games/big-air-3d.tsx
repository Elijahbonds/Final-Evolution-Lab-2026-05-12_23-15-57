'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { MapMesh } from '@/components/three/map-loader';
import { MAPS } from '@/lib/map-data';
import { DustMotes, RimGlowPulse, useImpactFlash, ImpactFlashLight } from '@/components/three/effects';
import { PerfSampler, PerfOverlay, useShowPerf } from '@/components/three/perf-hud';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';
import { makeBigAirSession, BIG_AIR_TUNING } from '@/lib/feel/cores/big-air-skin';
import type { AirSessionCore } from '@/lib/feel/cores/air-session-core';

// M10 Row 5 retrofit — Big Air's 3D slope scene, avatar and HUD are all KEPT;
// only the ad-hoc charge/air/land physics are replaced by the M9
// AirSessionCore (big-air skin): NEGATIVE runDrag slope build-up, launch
// impulse that scales with carried speed, AirTrick rotation + landing judge
// (stuck/clean/sketchy/crash), attempts-per-round loop. Feel numbers live in
// lib/feel/cores/big-air-constants.ts; only the view constants below are local.
// The contract is pinned by scripts/big-air-retrofit-tests.ts.

const MODEL_URL = '/models/elijah.glb';
const MAP = MAPS['mountain-slope'];
const SUB_START = 488, SUB_END = 582, CLIP_FPS = 30;
const MODEL_YAW = Math.PI;
// Attempts come from the core's tuned value (BIG_AIR_TUNING.attemptsPerRound).
const JUMPS = BIG_AIR_TUNING.attemptsPerRound;
const WIN_SCORE = 1000; // TUNE(elijah) — retuned for AirSessionCore scoring magnitudes
const TRICKS = ['INDY GRAB', 'BACKSIDE 360', 'METHOD', 'CORK 720'];
// Named prompt cycles per attempt (cosmetic only — scoring is core-owned).
const PUSH_INTERVAL_S = BIG_AIR_TUNING.cadenceTargetMs / 1000; // run-up push rhythm

type Phase = 'charge' | 'air' | 'land' | 'msg' | 'done';
interface HudState {
  score: number; jump: number; phase: Phase; charge: number;
  msg: string; msgColor: string; trickPrompt: string;
}

// ---------------------------------------------------------------- Scene
function BigAirScene({
  input, orientation, onHud, onPerf, gradeRef,
}: {
  input: React.RefObject<{ down: boolean; tap: boolean }>;
  orientation: string;
  onHud: (h: HudState) => void;
  onPerf: (s: PerfSample) => void;
  gradeRef: React.RefObject<any>;
}) {
  const avatar = useRef<AvatarHandle | null>(null);
  const { ref: flashRef, trigger: flashTrigger } = useImpactFlash();
  const camRef = useRef<THREE.PerspectiveCamera>(null);

  // M9 AirSessionCore drives all physics/scoring. View-only bits stay local.
  const core = useRef<AirSessionCore | null>(null);
  if (!core.current) {
    core.current = makeBigAirSession(undefined, {
      onLanding: (grade, rotations, pts) => {
        const v = view.current;
        const rot = Math.round(rotations * 360);
        if (grade === 'crash') { v.msg = `CRASH  ${rot}deg`; v.msgColor = '#FF3366'; }
        else if (grade === 'stuck') { v.msg = `STUCK IT!  +${pts}`; v.msgColor = '#FFD700'; }
        else if (grade === 'clean') { v.msg = `CLEAN  +${pts}`; v.msgColor = '#00FF9D'; }
        else { v.msg = `SKETCHY  +${pts}`; v.msgColor = '#A855F7'; }
        v.msgT = 1.5;
        const flashColor = grade === 'crash' ? '#FF3366' : grade === 'stuck' ? '#FFD700' : '#A855F7';
        flashTrigger(new THREE.Vector3(0, 0.2, 0), flashColor, 50, 0.3);
      },
    });
  }
  // Local view state: message ticker, run-up push cadence, one-shot stick.
  const view = useRef({
    elapsed: 0, msg: '', msgColor: '#FFD700', msgT: 0,
    pushT: 0, pushSide: 'L' as 'L' | 'R', stuckThisAir: false,
    trickPrompt: '',
  });
  const hudAcc = useRef(0);

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const c = core.current;
    const a = avatar.current;
    const v = view.current;
    if (!c || !a) return;

    const inp = input.current;
    v.elapsed += dt;

    // ---- Input mapping onto the core (phase-guarded inside the core) ------
    const phase = c.state.phase;
    if (phase === 'Run') {
      // Hold to add cadence pushes; the slope also self-accelerates.
      if (inp?.down) {
        v.pushT += dt;
        if (v.pushT >= PUSH_INTERVAL_S) {
          v.pushT = 0;
          c.runTap(v.pushSide);
          v.pushSide = v.pushSide === 'L' ? 'R' : 'L';
        }
      }
      v.stuckThisAir = false;
    } else if (phase === 'Air') {
      if (inp?.tap) { inp.tap = false; c.trick(); }
      // Holding through the descent sticks the landing (once per air).
      if (inp?.down && c.state.vy < 0 && !v.stuckThisAir) {
        v.stuckThisAir = true;
        c.stick();
      }
    }
    if (inp) inp.tap = false;

    // ---- Advance the simulation -----------------------------------------
    const s = c.step(dt);

    if (v.msgT > 0) v.msgT -= dt;

    // ---- Avatar ---------------------------------------------------------
    a.group.position.set(0, s.pos.y, 0);
    a.group.rotation.y = MODEL_YAW;
    // spinTurns (full turns) -> visible barrel roll during the air.
    a.group.rotation.z = s.phase === 'Air' ? s.spinTurns * Math.PI * 2 : 0;
    const clipT = (v.elapsed * 0.5) % (a.clipDuration || 1);
    a.scrub(clipT);

    // ---- Camera ---------------------------------------------------------
    const camY = 2.5 + s.pos.y * 0.4;
    camera.position.lerp(new THREE.Vector3(
      orientation === 'portrait' ? 2 : 4,
      camY,
      orientation === 'portrait' ? 8 : 7,
    ), Math.min(1, 5 * dt));
    camera.lookAt(0, s.pos.y * 0.6 + 1, 0);

    // ---- HUD ------------------------------------------------------------
    // Run: charge bar = carried speed fraction. Air: trick prompt hint.
    const chargeFrac = Math.min(1, s.speed / BIG_AIR_TUNING.maxRunSpeed);
    const hudPhase: Phase =
      s.phase === 'Run' ? 'charge'
      : s.phase === 'Air' ? 'air'
      : s.phase === 'Done' ? 'done'
      : 'land';
    v.trickPrompt = s.phase === 'Air' ? 'TAP TO SPIN, HOLD TO STICK' : '';

    hudAcc.current += dt;
    if (hudAcc.current > 0.05) {
      hudAcc.current = 0;
      onHud({
        score: s.score, jump: Math.min(JUMPS, s.attempt + (s.phase === 'Done' ? 0 : 1)),
        phase: hudPhase, charge: chargeFrac,
        msg: v.msgT > 0 ? v.msg : '', msgColor: v.msgColor,
        trickPrompt: v.trickPrompt,
      });
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0a14']} />
      <fog attach="fog" args={['#0a0a14', 18, 50]} />
      <SceneLighting shadows variant="venice" />
      {MAP && <MapMesh config={MAP} />}
      <DustMotes count={40} radius={12} speed={0.3} />
      <RimGlowPulse color="#A855F7" position={[-5, 3, 0]} baseIntensity={14} pulseAmp={7} />
      <RimGlowPulse color="#FFD700" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <ImpactFlashLight lightRef={flashRef} />
      <PerfSampler onSample={onPerf} />
      <Avatar
        url={MODEL_URL}
        subStartFrame={SUB_START}
        subEndFrame={SUB_END}
        clipFps={CLIP_FPS}
        onReady={(h) => { avatar.current = h; h.group.position.set(0, 0, 0); h.group.rotation.y = MODEL_YAW; h.scrub(0); }}
      />
    </>
  );
}

// ---------------------------------------------------------------- Main
export default function BigAir3D(props: GameProps) {
  const orientation = useOrientation();
  const input = useRef({ down: false, tap: false });
  const gradeRef = useRef(props.grade);
  gradeRef.current = props.grade;
  const [hud, setHud] = useState<HudState>({ score: 0, jump: 1, phase: 'charge', charge: 0, msg: '', msgColor: '#FFD700', trickPrompt: '' });
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const showPerf = useShowPerf();
  const grade = perf ? gradePerf(perf) : null;
  const endedRef = useRef(false);

  useEffect(() => {
    if (hud.phase === 'done' && !endedRef.current) {
      endedRef.current = true;
      const won = hud.score >= WIN_SCORE;
      setTimeout(() => {
        props.onEnd({ won, score: hud.score, duration: 90, headline: won ? 'GOLD MEDAL' : 'SILVER LANDING' });
      }, 1200);
    }
  }, [hud.phase, hud.score, props]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); input.current.down = true; input.current.tap = true; }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') input.current.down = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  return (
    <div className="select-none">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
        style={{
          aspectRatio: orientation === 'portrait' ? '3 / 4' : '16 / 9',
          maxWidth: orientation === 'portrait' ? 560 : 960,
          background: 'linear-gradient(180deg, #07070c 0%, #0a0a14 100%)',
        }}
      >
        <Canvas
          shadows
          dpr={[PERF_BUDGET.dprMin, PERF_BUDGET.dprMax]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          camera={{ fov: orientation === 'portrait' ? 56 : 48, near: 0.1, far: 60, position: [4, 2.5, 7] }}
        >
          <PerformanceMonitor onDecline={() => {}}>
            <BigAirScene input={input} orientation={orientation} onHud={setHud} onPerf={setPerf} gradeRef={gradeRef} />
          </PerformanceMonitor>
        </Canvas>

        <PerfOverlay perf={perf} grade={grade} show={showPerf} />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-white/8 bg-black/70 px-5 py-2 text-center backdrop-blur-md">
            <div className="fel-heading text-[10px] tracking-[0.2em] text-white/50">BIG AIR · JUMP {hud.jump}/{JUMPS}</div>
            <div className="font-mono text-2xl font-bold text-[#00E5FF]">{hud.score}</div>
          </div>

          {/* Charge bar */}
          {hud.phase === 'charge' && (
            <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2">
              <div className="mb-1 text-center font-mono text-xs text-white/50">HOLD SPACE TO CHARGE</div>
              <div className="relative h-3 w-44 overflow-hidden rounded-full bg-black/70">
                <div className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#A855F7] transition-all" style={{ width: `${hud.charge * 100}%` }} />
              </div>
            </div>
          )}

          {/* Trick prompt */}
          {hud.trickPrompt && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse">
              <div className="rounded-lg border border-[#A855F7]/60 bg-black/70 px-4 py-2 font-mono text-sm text-[#A855F7] backdrop-blur-sm">
                {hud.trickPrompt}
              </div>
            </div>
          )}

          {hud.msg && (
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 fel-heading text-3xl font-bold drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]" style={{ color: hud.msgColor }}>{hud.msg}</div>
          )}

          {hud.phase === 'done' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <div className="fel-heading text-4xl font-bold" style={{ color: hud.score >= WIN_SCORE ? '#FFD700' : '#00E5FF' }}>
                  {hud.score >= WIN_SCORE ? 'GOLD MEDAL!' : 'SILVER LANDING'}
                </div>
                <div className="mt-2 font-mono text-white/60">Final Score: {hud.score}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="mx-auto mt-4 flex max-w-[960px] justify-center px-3 !hidden">
        <button
          onTouchStart={(e) => { e.preventDefault(); input.current.down = true; input.current.tap = true; }}
          onTouchEnd={(e) => { e.preventDefault(); input.current.down = false; }}
          onClick={() => { input.current.tap = true; }}
          className="rounded-lg border border-[#A855F7]/40 bg-[#A855F7]/10 px-10 py-4 text-lg font-bold text-[#A855F7] transition-colors active:bg-[#A855F7]/25"
        >
          {hud.phase === 'charge' ? 'HOLD TO CHARGE' : hud.phase === 'air' ? 'TAP FOR TRICK' : 'WAIT...'}
        </button>
      </div>
    </div>
  );
}