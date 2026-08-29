'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { RivalFigure, type RivalHandle } from '@/components/three/rival-figure';
import { SceneLighting } from '@/components/three/lighting';
import { FollowCamera } from '@/components/three/follow-camera';
import { PerfSampler, PerfOverlay } from '@/components/three/perf-hud';
import { MapMesh } from '@/components/three/map-loader';
import { VeniceSurround } from '@/components/three/venice-surround';
import { SceneBackdrop } from '@/components/three/scene-backdrop';
import { PremiumHoop, DustMotes, HoopGlow, Basketball } from '@/components/three/basketball-court';
import { RimGlowPulse } from '@/components/three/effects';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { MAPS } from '@/lib/map-data';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';

const MODEL_URL = '/models/elijah.glb';
const MODEL_YAW = Math.PI;
const SUB_START = 488, SUB_END = 582, CLIP_FPS = 30;
const MAP = MAPS['venice-blue-court'];
const TARGET = 11;

type Phase = 'offense-aim' | 'offense-shot' | 'defense' | 'msg';
type Zone = 'left' | 'center' | 'right';
const ZONES: Zone[] = ['left', 'center', 'right'];

interface HudState {
  myScore: number; aiScore: number; phase: Phase; msg: string; msgColor: string;
  aimVal: number; barVal: number; defenseTimer: number; aiAttackZone: Zone;
}

// ---- 3D Scene ----
function OneVOneScene({
  grade, prq, onEnd, gamepad, orientation, onHud, onPerf,
}: GameProps & {
  orientation: 'landscape' | 'portrait';
  onHud: (h: HudState) => void;
  onPerf: (p: PerfSample) => void;
}) {
  const avatar = useRef<AvatarHandle | null>(null);
  const rivalRef = useRef<RivalHandle | null>(null);
  const ballRef = useRef<THREE.Mesh>(null);
  const camTarget = useRef(new THREE.Vector3(0, 1.1, 6));
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  const sweet = grade.key === 'ELITE' ? 0.2 : grade.key === 'PRIMED' ? 0.17 : grade.key === 'READY' ? 0.14 : 0.12;

  const st = useRef({
    phase: 'offense-aim' as Phase,
    myScore: 0, aiScore: 0, steals: 0,
    aimT: 0, barT: 0, aimLocked: 0,
    defenseChoice: null as Zone | null,
    aiAttack: 'center' as Zone, defenseTimer: 0,
    tRival: 0,
    msg: '', msgColor: '#FFF', msgTimer: 0,
    nextPhase: 'offense-aim' as Phase,
    startTime: Date.now(),
  });

  const showMsg = useCallback((text: string, color: string, after: Phase) => {
    const s = st.current;
    s.msg = text; s.msgColor = color; s.msgTimer = 1.2; s.nextPhase = after; s.phase = 'msg';
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const won = s.myScore > s.aiScore;
    onEndRef.current?.({
      score: s.myScore * 100 + s.steals * 50,
      opponentScore: s.aiScore * 100,
      won,
      duration: Math.round((Date.now() - s.startTime) / 1000),
      headline: won ? `${s.myScore}-${s.aiScore} — KING OF THE COURT` : `${s.myScore}-${s.aiScore} — RUN IT BACK`,
    });
  }, []);

  // Input handling
  useEffect(() => {
    const act = () => {
      if (endedRef.current) return;
      const s = st.current;
      if (s.phase === 'offense-aim') {
        s.aimLocked = Math.sin(s.aimT);
        s.barT = 0;
        s.phase = 'offense-shot';
      } else if (s.phase === 'offense-shot') {
        const p = Math.abs(Math.sin(s.barT));
        const aimErr = Math.abs(s.aimLocked);
        const powErr = Math.abs(p - 0.75);
        const good = aimErr < 0.35 && powErr < sweet;
        if (good) {
          const deep = aimErr < 0.12 && powErr < sweet * 0.5;
          s.myScore += deep ? 2 : 1;
          if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
          showMsg(deep ? 'DEEP BUCKET +2' : 'BUCKET +1', deep ? '#FFD700' : '#00FF9D', 'defense');
        } else {
          showMsg('BRICK! AI BALL', '#FF3366', 'defense');
        }
      }
    };
    const guard = (z: Zone) => {
      if (endedRef.current) return;
      const s = st.current;
      if (s.phase !== 'defense' || s.defenseChoice) return;
      s.defenseChoice = z;
      if (z === s.aiAttack) {
        s.steals += 1;
        showMsg('LOCKDOWN! STEAL', '#00E5FF', 'offense-aim');
      } else {
        s.aiScore += 1;
        if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
        showMsg('AI SCORES', '#FF3366', 'offense-aim');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); act(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); guard('left'); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); guard('center'); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); guard('right'); }
    };
    window.addEventListener('keydown', onKey);
    (window as any).__felOneVOne3D = { act, guard };
    registerFelMode('onevone', {
      getState: () => {
        const s = st.current;
        return {
          phase: s.phase, myScore: s.myScore, aiScore: s.aiScore,
          steals: s.steals, defenseChoice: s.defenseChoice, aiAttack: s.aiAttack,
        };
      },
      sendInput: (a, p) => {
        if (a === 'act') act();
        else if (a === 'guard') guard((p as Zone) ?? 'center');
      },
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      delete (window as any).__felOneVOne3D;
      unregisterFelMode('onevone');
    };
  }, [sweet, finish, showMsg]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  // Main game loop
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    if (endedRef.current) return;

    if (s.phase === 'offense-aim') s.aimT += dt * 3.0;
    if (s.phase === 'offense-shot') s.barT += dt * 3.4;
    if (s.phase === 'defense') {
      s.defenseTimer -= dt;
      if (s.defenseTimer <= 0 && !s.defenseChoice) {
        s.aiScore += 1;
        if (s.myScore >= TARGET || s.aiScore >= TARGET) { finish(); return; }
        showMsg('TOO SLOW — AI SCORES', '#FF3366', 'offense-aim');
      }
    }
    if (s.phase === 'msg') {
      s.msgTimer -= dt;
      if (s.msgTimer <= 0) {
        s.phase = s.nextPhase;
        if (s.phase === 'defense') {
          s.aiAttack = ZONES[Math.floor(Math.random() * 3)];
          s.defenseChoice = null;
          s.defenseTimer = 1.5;
        }
        if (s.phase === 'offense-aim') s.aimT = Math.random() * Math.PI;
      }
    }

    // Avatar idle animation
    if (avatar.current) {
      avatar.current.mixer.update(dt * 0.3);
    }

    // Live rival defender — never an empty court. On offense the rival
    // contests the shot (arms up, weight-shift sway); on defense the rival
    // drives at the player and finishes the possession with a raised-arm
    // attack pose, so every AI bucket has a visible actor behind it (M12.1/3).
    const rv = rivalRef.current;
    if (rv) {
      const tt = (s.tRival += dt);
      if (s.phase === 'offense-aim' || s.phase === 'offense-shot') {
        // contest the shooter: stand tall between player and hoop, arms raised
        rv.group.position.set(0.5 + Math.sin(tt * 1.4) * 0.25, 0, 3.4);
        rv.group.rotation.y = Math.PI; // face the player (+z)
        rv.setPose(0.12, 0.7 + Math.sin(tt * 6) * 0.25);
      } else if (s.phase === 'defense') {
        // AI attacks: drive toward the player as the clock runs
        const adv = 1 - Math.max(0, Math.min(1, s.defenseTimer / 1.5)); // 0..1
        rv.group.position.set(0.2, 0, 3.2 + adv * 1.9);
        rv.group.rotation.y = Math.PI;
        rv.setPose(0.28 - adv * 0.2, adv * 0.9);
      } else {
        rv.group.position.set(0.5, 0, 3.4);
        rv.group.rotation.y = Math.PI;
        rv.setPose(0.1 + Math.sin(tt * 1.6) * 0.04, 0.15);
      }
    }

    // Ball follows player hand area
    if (ballRef.current && avatar.current) {
      const hand = avatar.current.bone('mixamorigRightHand') || avatar.current.bone('RightHand');
      if (hand) {
        const wp = new THREE.Vector3();
        hand.getWorldPosition(wp);
        ballRef.current.position.copy(wp);
      } else {
        ballRef.current.position.set(0.3, 1.0, 5.8);
      }
    }

    hudAcc.current += dt;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        myScore: s.myScore, aiScore: s.aiScore, phase: s.phase,
        msg: s.msg, msgColor: s.msgColor,
        aimVal: s.phase === 'offense-aim' ? Math.sin(s.aimT) : s.aimLocked,
        barVal: Math.abs(Math.sin(s.barT)),
        defenseTimer: s.defenseTimer, aiAttackZone: s.aiAttack,
      });
    }
  });

  const camOffset = useMemo(
    () => orientation === 'portrait' ? new THREE.Vector3(3.0, 2.7, 6.6) : new THREE.Vector3(3.6, 2.3, 5.4),
    [orientation]
  );

  return (
    <>
      {MAP.backdrop && (
        <Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>
      )}
      <Suspense fallback={null}>
        <MapMesh config={MAP} />
      <VeniceSurround boundsMin={MAP.boundsMin} boundsMax={MAP.boundsMax} />
      </Suspense>
      <PremiumHoop />
      <HoopGlow />
      <DustMotes count={50} />
      <RimGlowPulse color="#00e5ff" position={[-5, 3, -2]} baseIntensity={12} pulseAmp={6} />
      <RimGlowPulse color="#ff3366" position={[5, 2.5, 0]} baseIntensity={10} pulseAmp={5} />
      <Basketball ballRef={ballRef} />
      <RivalFigure
        ref={rivalRef}
        onReady={(h) => {
          h.group.position.set(0.5, 0, 3.4);
          h.group.rotation.y = Math.PI;
          rivalRef.current = h;
        }}
      />
      <Suspense fallback={null}>
        <Avatar
          url={MODEL_URL}
          subStartFrame={SUB_START}
          subEndFrame={SUB_END}
          clipFps={CLIP_FPS}
          onReady={(h) => {
            avatar.current = h;
            h.group.rotation.y = MODEL_YAW;
            h.group.position.set(0, 0, 6);
            if (h.action) { h.action.setLoop(THREE.LoopRepeat, Infinity); h.action.timeScale = 0.3; h.action.play(); }
          }}
        />
      </Suspense>
      <FollowCamera
        target={camTarget}
        offset={camOffset}
        boundsMin={new THREE.Vector3(...MAP.boundsMin)}
        boundsMax={new THREE.Vector3(...MAP.boundsMax)}
        floorY={MAP.floorY}
        ceilingY={MAP.ceilingY}
      />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

// ---- Main Component ----
export default function OneVOne3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [started, setStarted] = useState(true);
  const [showPerf, setShowPerf] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'p') setShowPerf((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const sweet = props.grade.key === 'ELITE' ? 0.2 : props.grade.key === 'PRIMED' ? 0.17 : props.grade.key === 'READY' ? 0.14 : 0.12;

  if (!started) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: '#050508', minHeight: '60vh' }}>
        <h2 className="fel-heading text-4xl text-white">1V1 HOOPS</h2>
        <p className="max-w-md text-sm text-gray-300">
          First to {TARGET}. On offense: tap <span className="text-[#00E5FF]">SPACE</span> to lock aim, tap again on the gold line — dead-center swishes count 2. On defense: read the flash and guard with <span className="text-[#FF3366]">← ↑ →</span>.
        </p>
        <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]">CHECK BALL</button>
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
      style={{ aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9', maxWidth: orient === 'portrait' ? 560 : 960, background: MAP.fogColor }}
    >
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1, powerPreference: 'high-performance' }}
        camera={{ fov: orient === 'portrait' ? 65 : 55, near: 0.1, far: 200, position: [3.6, 2.3, 11.4] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <SceneLighting />
          <OneVOneScene {...props} orientation={orient} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {/* HUD Overlay */}
      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* Scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,229,255,0.2)' }}>
            <span className="text-xl font-bold text-white">YOU {hud.myScore}</span>
            <span className="text-xs text-white/50">FIRST TO {TARGET}</span>
            <span className="text-xl font-bold text-white">AI {hud.aiScore}</span>
          </div>

          {/* Phase indicators */}
          {(hud.phase === 'offense-aim' || hud.phase === 'offense-shot') && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-80">
              {hud.phase === 'offense-aim' && (
                <div className="text-center">
                  <div className="text-xs text-white font-mono mb-2" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)' }}>TAP SPACE TO LOCK AIM</div>
                  <div className="h-2 rounded-full bg-black/60 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(hud.aimVal + 1) * 50}%`, background: Math.abs(hud.aimVal) < 0.35 ? '#00FF9D' : '#FF3366' }} />
                  </div>
                </div>
              )}
              {hud.phase === 'offense-shot' && (
                <div className="text-center">
                  <div className="text-xs text-white/60 font-mono mb-2">TAP AT THE GOLD LINE</div>
                  <div className="relative h-3 rounded-full bg-black/60 overflow-hidden">
                    <div className="absolute h-full bg-[#00FF9D]/30" style={{ left: `${(0.75 - sweet) * 100}%`, width: `${sweet * 200}%` }} />
                    <div className="absolute h-full w-0.5 bg-[#FFD700]" style={{ left: '75%' }} />
                    <div className="h-full rounded-full bg-[#00E5FF]" style={{ width: `${hud.barVal * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {hud.phase === 'defense' && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center pointer-events-auto">
              <div className="text-lg font-bold text-[#FF3366] mb-2">DEFENSE! GUARD THE DRIVE</div>
              <div className="flex gap-3">
                {ZONES.map((z) => (
                  <button key={z} onClick={() => (window as any).__felOneVOne3D?.guard(z)}
                    className="px-5 py-3 rounded-lg bg-[#FF3366]/20 text-[#FF3366] font-bold text-sm active:bg-[#FF3366]/40 transition">
                    {z === 'left' ? '←' : z === 'center' ? '↑' : '→'}
                  </button>
                ))}
              </div>
              <div className="mt-2 h-1.5 w-48 mx-auto rounded-full bg-black/60 overflow-hidden">
                <div className="h-full rounded-full bg-[#FFD700]" style={{ width: `${Math.max(0, hud.defenseTimer / 1.5) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Center message */}
          {hud.phase === 'msg' && hud.msg && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-3xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}40` }}>{hud.msg}</div>
            </div>
          )}

          {/* Mobile shoot button */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 !hidden pointer-events-auto">
            <button onClick={() => (window as any).__felOneVOne3D?.act()}
              className="px-10 py-4 rounded-xl bg-[#00E5FF]/20 text-[#00E5FF] font-bold text-lg active:bg-[#00E5FF]/40">
              SHOOT
            </button>
          </div>
        </div>
      )}

      {/* Perf badge */}
      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
