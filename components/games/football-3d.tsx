'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { SceneLighting } from '@/components/three/lighting';
import { DustMotes, RimGlowPulse, useImpactFlash, ImpactFlashLight } from '@/components/three/effects';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { updateFacing } from '@/lib/anim/facing';
import { Grandstand } from '@/components/three/arena-dressing';
import { PerfSampler, PerfOverlay, useShowPerf } from '@/components/three/perf-hud';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, type PerfSample } from '@/lib/three-budget';
import { makeFootballRun, type FootballRun, type Tackler } from '@/lib/feel/football/football-core';
import { FOOTBALL_TUNING } from '@/lib/feel/football/football-constants';
import {
  FOOTBALL_FOV,
  countConverging,
  makeBroadcastCutState,
  updateBroadcastCut,
  broadcastBlend,
} from '@/lib/feel/football-cam';

// M10 Row A retrofit — Street Football (SYNTH APPROXIMATION). There was no
// live football surface to retrofit, so per the lineup directive this scene
// COMPOSES the proven Court / free-3D locomotion archetype (via FootballRun,
// which wraps a CourtCore for the grounded run + shared variable-gravity jump)
// and layers the original abstracted-tackler + juke/spin/stiff-arm/hurdle evade
// system on top. No core is forked. All feel numbers live in
// lib/feel/football/football-constants.ts; the contract is pinned by
// scripts/football-retrofit-tests.ts. Only view constants are local below.

const MODEL_URL = '/models/elijah-hero.glb'; // rigged hero w/ named run + strike clips
const MODEL_YAW = Math.PI; // hero mesh art faces -Z (downfield)
// Skinned, animated defenders (small low-poly NPC rigs, each with a run clip).
const DEF_URLS = ['/models/clips/npc_tall_run.glb', '/models/clips/npc_ericnash_run.glb'] as const;
const DEF_TINTS = ['#FF3366', '#ff6b8a'] as const; // jersey tints so they read as the defense
const T = FOOTBALL_TUNING;
const FIELD_LEN = T.fieldLengthYd;
const LANE = T.laneHalfWidth;
const END_MARGIN = T.endZoneMargin;

type Phase = 'run' | 'done';
interface HudState {
  yards: number; toGo: number; score: number; evaded: number;
  phase: Phase; won: boolean; msg: string; msgColor: string; speed: number;
}

interface InputState {
  steer: number;
  jukeL: boolean; jukeR: boolean; spin: boolean; stiff: boolean; hurdle: boolean;
}

// ------------------------------------------------------------ Skinned defenders
// M13 game-feel: the pink capsules are gone. Each abstracted tackler now drives
// a small skinned NPC rig that runs in place, PURSUES the ball-carrier laterally
// as he approaches, and always FACES him (shared facing system). When a defender
// is beaten (juked/spun/stiff-armed/passed) he peels off and slows. This is a
// VIEW layer only — tackle detection stays in the pinned football core.
function FootballDefenders({ coreRef }: { coreRef: React.RefObject<FootballRun | null> }) {
  const handles = useRef<(AvatarHandle | null)[]>([]);
  const yaw = useRef<number[]>([]);
  const beatenX = useRef<number[]>([]); // lateral peel-off offset once beaten
  const [tacklers, setTacklers] = useState<Tackler[]>([]);

  useEffect(() => {
    const c = coreRef.current;
    if (c) {
      setTacklers(c.tacklers.map((t) => ({ ...t })));
      yaw.current = c.tacklers.map(() => 0);
      beatenX.current = c.tacklers.map(() => 0);
    }
  }, [coreRef]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const c = coreRef.current;
    if (!c) return;
    const rz = c.state.pos.z; // runner downfield (negative)
    const rx = c.state.pos.x;
    c.tacklers.forEach((t, i) => {
      const h = handles.current[i];
      if (!h) return;
      const defZ = -t.yd;
      const downfieldGap = defZ - rz; // >0 while runner is short of this defender
      let px = t.x;
      if (!t.cleared) {
        // Pursue laterally toward the runner's x as he closes (visual pursuit).
        const closing = THREE.MathUtils.clamp(1 - Math.abs(downfieldGap) / 16, 0, 1);
        px = t.x + (rx - t.x) * closing * 0.85;
      } else {
        // Beaten — drift aside and let him past.
        beatenX.current[i] += ((t.x < rx ? -1 : 1) * 2.2 - beatenX.current[i]) * Math.min(1, 3 * dt);
        px = t.x + beatenX.current[i];
      }
      h.group.position.set(px, 0, defZ);
      // Face the ball-carrier (or downfield once beaten).
      const tx = t.cleared ? px : rx;
      const tz = t.cleared ? defZ - 4 : rz;
      const nextYaw = updateFacing({
        current: yaw.current[i], engaged: true,
        selfX: px, selfZ: defZ, targetX: tx, targetZ: tz, dt,
      });
      yaw.current[i] = nextYaw;
      h.group.rotation.y = nextYaw;
      const s = h.group.scale;
      if (s.x === 1 && s.y === 1) h.group.scale.setScalar(1.0);
    });
  });

  return (
    <group>
      {tacklers.map((t, i) => (
        <Avatar
          key={i}
          url={DEF_URLS[i % DEF_URLS.length]}
          tint={DEF_TINTS[i % DEF_TINTS.length]}
          onReady={(h) => {
            handles.current[i] = h;
            h.group.position.set(t.x, 0, -t.yd);
            const clip = h.clipNames[0];
            if (clip) h.play(clip, { loop: true, timeScale: 1.1 + (i % 3) * 0.12, fadeIn: 0.1 });
          }}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- Stadium bowl
// A dark enclosing dome + horizon ring so the field never floats in a void.
function StadiumBowl() {
  return (
    <group>
      {/* Sky dome (interior-facing) */}
      <mesh position={[0, 0, -(FIELD_LEN + END_MARGIN) / 2]}>
        <sphereGeometry args={[120, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#070b14" side={THREE.BackSide} fog={false} />
      </mesh>
      {/* Distant stadium wall ring */}
      <mesh position={[0, 6, -(FIELD_LEN + END_MARGIN) / 2]}>
        <cylinderGeometry args={[70, 70, 22, 48, 1, true]} />
        <meshStandardMaterial color="#0a0f18" side={THREE.BackSide} roughness={0.9} emissive="#0a1420" emissiveIntensity={0.25} />
      </mesh>
      {/* Ground apron beyond the turf so no black abyss shows past sidelines */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -(FIELD_LEN + END_MARGIN) / 2]}>
        <circleGeometry args={[70, 48]} />
        <meshStandardMaterial color="#08100a" roughness={1} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Field
function Field() {
  const lines: number[] = [];
  for (let y = 10; y < FIELD_LEN; y += 10) lines.push(y);
  return (
    <group>
      {/* Turf */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -(FIELD_LEN + END_MARGIN) / 2 + 2]} receiveShadow>
        <planeGeometry args={[LANE * 2 + 2, FIELD_LEN + END_MARGIN + 8]} />
        <meshStandardMaterial color="#06140c" roughness={0.95} />
      </mesh>
      {/* Yard lines */}
      {lines.map((y) => (
        <mesh key={y} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -y]}>
          <planeGeometry args={[LANE * 2, 0.18]} />
          <meshStandardMaterial color="#0f3d24" emissive="#0a2a19" emissiveIntensity={0.4} />
        </mesh>
      ))}
      {/* Sidelines */}
      {[-LANE, LANE].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -(FIELD_LEN + END_MARGIN) / 2 + 2]}>
          <planeGeometry args={[0.2, FIELD_LEN + END_MARGIN + 8]} />
          <meshStandardMaterial color="#14513a" emissive="#0d3325" emissiveIntensity={0.5} />
        </mesh>
      ))}
      {/* End zone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -(FIELD_LEN + END_MARGIN / 2)]}>
        <planeGeometry args={[LANE * 2, END_MARGIN]} />
        <meshStandardMaterial color="#0d2b52" emissive="#00E5FF" emissiveIntensity={0.35} roughness={0.6} />
      </mesh>
      {/* Goal line glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -FIELD_LEN]}>
        <planeGeometry args={[LANE * 2, 0.4]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Scene
function FootballScene({
  input, orientation, onHud, onPerf,
}: {
  input: React.RefObject<InputState>;
  orientation: string;
  onHud: (h: HudState) => void;
  onPerf: (s: PerfSample) => void;
}) {
  const avatar = useRef<AvatarHandle | null>(null);
  const { ref: flashRef, trigger: flashTrigger } = useImpactFlash();
  const core = useRef<FootballRun | null>(null);
  const view = useRef<{ elapsed: number; msg: string; msgColor: string; msgT: number; lean: number; animEvent?: string; yaw: number }>({ elapsed: 0, msg: '', msgColor: '#FFD700', msgT: 0, lean: 0, animEvent: undefined, yaw: 0 });
  // PART 5.2 stacked-tackle broadcast-cut director (pure state machine).
  const cut = useRef(makeBroadcastCutState());
  const hudAcc = useRef(0);
  const dir = useRef(new AnimDirectorFSM());
  const drv = useRef(new AvatarDriver());
  const excitement = useRef(0);

  if (!core.current) {
    core.current = makeFootballRun({
      seed: (Math.floor(Math.random() * 100000) + 1) >>> 0,
      onEvade: (kind) => {
        const v = view.current;
        if (kind === 'juke') { v.msg = 'JUKE!'; v.msgColor = '#00FF9D'; }
        else if (kind === 'spin') { v.msg = 'SPIN MOVE!'; v.msgColor = '#A855F7'; }
        else if (kind === 'stiffArm') { v.msg = 'STIFF ARM!'; v.msgColor = '#FFD700'; }
        else { v.msg = 'HURDLE!'; v.msgColor = '#00E5FF'; }
        v.msgT = 0.9;
        flashTrigger(new THREE.Vector3(0, 0.5, 0), v.msgColor, 40, 0.25);
      },
      onTackled: () => {
        const v = view.current;
        v.msg = 'TACKLED'; v.msgColor = '#FF3366'; v.msgT = 2.0;
        flashTrigger(new THREE.Vector3(0, 0.4, 0), '#FF3366', 60, 0.35);
      },
      onTouchdown: () => {
        const v = view.current;
        v.msg = 'TOUCHDOWN!'; v.msgColor = '#FFD700'; v.msgT = 3.0;
        flashTrigger(new THREE.Vector3(0, 0.6, 0), '#FFD700', 80, 0.4);
      },
    });
  }

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const c = core.current;
    const a = avatar.current;
    const v = view.current;
    if (!c || !a) return;
    v.elapsed += dt;

    // ---- Input -> one-shot evades ---------------------------------------
    const inp = input.current;
    if (inp) {
      if (inp.jukeL) { c.juke('L'); inp.jukeL = false; v.animEvent = 'juke_left'; }
      if (inp.jukeR) { c.juke('R'); inp.jukeR = false; v.animEvent = 'juke_right'; }
      if (inp.spin) { c.spin(); inp.spin = false; v.animEvent = 'spin'; }
      if (inp.stiff) { c.stiffArm(); inp.stiff = false; v.animEvent = 'stiff_arm'; }
      if (inp.hurdle) { c.hurdle(); inp.hurdle = false; v.animEvent = 'hurdle'; }
    }
    const steer = inp?.steer ?? 0;

    // ---- Advance the sim ------------------------------------------------
    const s = c.step(dt, { steerX: steer, sprint: true });
    if (v.msgT > 0) v.msgT -= dt;

    // ---- Avatar (FSM-driven clip selection + shared facing) -------------
    a.group.position.set(s.pos.x, s.pos.y, s.pos.z);
    // lean into the steer / evade for readability
    const targetLean = -steer * 0.35 + (s.phase === 'Juking' ? -0.2 : 0);
    v.lean += (targetLean - v.lean) * Math.min(1, 8 * dt);
    const phaseTag = s.touchdown ? 'touchdown' : (s.phase === 'Tackled' ? 'tackled' : '');
    const decision = dir.current.update(dt, {
      modeId: 'football', speed01: s.speed01, phase: phaseTag, actionEvent: v.animEvent,
    });
    drv.current.apply(decision);
    v.animEvent = undefined;
    // Facing: spin whirls, otherwise converge on downfield (-Z) so he never back-pedals.
    if (s.phase === 'Spin') {
      a.group.rotation.set(0, MODEL_YAW + v.elapsed * 12, v.lean);
    } else {
      v.yaw = updateFacing({ current: v.yaw, velX: steer * 0.3, velZ: -1, dt });
      a.group.rotation.set(0, v.yaw + MODEL_YAW, v.lean);
    }
    // Excitement drives the crowd — spikes on evades / TD, decays otherwise.
    excitement.current = Math.max(
      s.speed01 * 0.5 + (v.msgT > 0 ? 0.5 : 0),
      excitement.current - dt * 0.6,
    );

    // ---- Chase camera + stacked-tackle broadcast cut (PART 5.2) --------
    // Detect defenders converging for a stack tackle; when 3+ close in, briefly
    // cut to an overhead/behind broadcast framing so the player reads the gap
    // before contact, then blend back to the chase cam.
    const converging = countConverging(c.tacklers, { x: s.pos.x, z: s.pos.z });
    updateBroadcastCut(cut.current, converging, dt);
    const bc = broadcastBlend(cut.current); // 0 = chase, 1 = full broadcast

    const chase = new THREE.Vector3(
      s.pos.x * 0.4,
      3.4 + s.pos.y * 0.5,
      s.pos.z + (orientation === 'portrait' ? 8.5 : 7.5),
    );
    // Broadcast framing: higher + slightly further back, centered over the lane.
    const broadcast = new THREE.Vector3(
      s.pos.x * 0.15,
      9.5, // TUNE(elijah) broadcast height
      s.pos.z + 11.5, // TUNE(elijah) broadcast pull-back
    );
    const camTarget = chase.clone().lerp(broadcast, bc);
    // snap harder into the cut, ease back out via the standard chase lerp
    const follow = bc > 0 ? Math.min(1, (4 + 6 * bc) * dt) : Math.min(1, 4 * dt);
    camera.position.lerp(camTarget, follow);
    // look further downfield during the cut to expose the developing gap
    const lookZ = s.pos.z - (6 + 6 * bc); // TUNE(elijah) broadcast look-ahead
    camera.lookAt(s.pos.x * 0.5, 1.0 + 0.5 * bc, lookZ);

    // ---- HUD ------------------------------------------------------------
    hudAcc.current += dt;
    if (hudAcc.current > 0.05) {
      hudAcc.current = 0;
      onHud({
        yards: Math.round(s.yards),
        toGo: Math.max(0, Math.round(s.yardsToGo)),
        score: s.score,
        evaded: s.tacklersEvaded,
        phase: s.finished ? 'done' : 'run',
        won: s.touchdown,
        msg: v.msgT > 0 ? v.msg : '',
        msgColor: v.msgColor,
        speed: s.speed01,
      });
    }
  });

  return (
    <>
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 22, 70]} />
      <SceneLighting shadows variant="venice" />
      <Field />
      <StadiumBowl />
      {/* Living sideline crowds on both flanks, staggered downfield */}
      <Grandstand position={[-(LANE + 3.5), 0, -20]} rotationY={Math.PI / 2} width={26} tiers={6} perTier={22} excitement={excitement} seed={11} color="#101826" />
      <Grandstand position={[LANE + 3.5, 0, -20]} rotationY={-Math.PI / 2} width={26} tiers={6} perTier={22} excitement={excitement} seed={29} color="#101826" />
      <Grandstand position={[-(LANE + 3.5), 0, -55]} rotationY={Math.PI / 2} width={26} tiers={6} perTier={22} excitement={excitement} seed={41} color="#101826" />
      <Grandstand position={[LANE + 3.5, 0, -55]} rotationY={-Math.PI / 2} width={26} tiers={6} perTier={22} excitement={excitement} seed={57} color="#101826" />
      <FootballDefenders coreRef={core} />
      <DustMotes count={30} radius={14} speed={0.25} />
      <RimGlowPulse color="#00E5FF" position={[-6, 3, -30]} baseIntensity={10} pulseAmp={5} />
      <RimGlowPulse color="#FF3366" position={[6, 3, -50]} baseIntensity={9} pulseAmp={4} />
      <ImpactFlashLight lightRef={flashRef} />
      <PerfSampler onSample={onPerf} />
      <Avatar
        url={MODEL_URL}
        onReady={(h) => { avatar.current = h; h.group.position.set(0, 0, 0); h.group.rotation.y = MODEL_YAW; drv.current.attach(h); }}
      />
    </>
  );
}

// ---------------------------------------------------------------- Main
export default function Football3D(props: GameProps) {
  const orientation = useOrientation();
  const input = useRef<InputState>({ steer: 0, jukeL: false, jukeR: false, spin: false, stiff: false, hurdle: false });
  const [hud, setHud] = useState<HudState>({ yards: 0, toGo: FIELD_LEN, score: 0, evaded: 0, phase: 'run', won: false, msg: '', msgColor: '#FFD700', speed: 0 });
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const showPerf = useShowPerf();
  const grade = perf ? gradePerf(perf) : null;
  const endedRef = useRef(false);
  const held = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

  useEffect(() => {
    if (hud.phase === 'done' && !endedRef.current) {
      endedRef.current = true;
      const won = hud.won;
      setTimeout(() => {
        props.onEnd({
          won,
          score: hud.score,
          duration: 60,
          headline: won ? 'TOUCHDOWN!' : `TACKLED · ${hud.yards} YD`,
        });
      }, 1400);
    }
  }, [hud.phase, hud.won, hud.score, hud.yards, props]);

  useEffect(() => {
    const applySteer = () => {
      input.current.steer = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
    };
    const kd = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': held.current.left = true; applySteer(); break;
        case 'ArrowRight': case 'd': case 'D': held.current.right = true; applySteer(); break;
        case 'q': case 'Q': input.current.jukeL = true; break;
        case 'e': case 'E': input.current.jukeR = true; break;
        case 's': case 'S': input.current.spin = true; break;
        case 'f': case 'F': input.current.stiff = true; break;
        case ' ': case 'w': case 'W': e.preventDefault(); input.current.hurdle = true; break;
      }
    };
    const ku = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': held.current.left = false; applySteer(); break;
        case 'ArrowRight': case 'd': case 'D': held.current.right = false; applySteer(); break;
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const pct = Math.min(100, (hud.yards / FIELD_LEN) * 100);

  return (
    <div className="select-none">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
        style={{
          aspectRatio: orientation === 'portrait' ? '3 / 4' : '16 / 9',
          maxWidth: orientation === 'portrait' ? 560 : 960,
          background: 'linear-gradient(180deg, #030307 0%, #050505 100%)',
        }}
      >
        <Canvas
          shadows
          dpr={[PERF_BUDGET.dprMin, PERF_BUDGET.dprMax]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          camera={{ fov: orientation === 'portrait' ? 72 : FOOTBALL_FOV, near: 0.1, far: 90, position: [0, 3.4, 9] }}
        >
          <PerformanceMonitor onDecline={() => {}}>
            <FootballScene input={input} orientation={orientation} onHud={setHud} onPerf={setPerf} />
          </PerformanceMonitor>
        </Canvas>

        <PerfOverlay perf={perf} grade={grade} show={showPerf} />

        <div className="pointer-events-none absolute inset-0">
          {/* Top HUD */}
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-white/8 bg-black/70 px-5 py-2 text-center backdrop-blur-md">
            <div className="fel-heading text-[10px] tracking-[0.2em] text-white/50">STREET FOOTBALL</div>
            <div className="font-mono text-2xl font-bold text-[#00E5FF]">{hud.score}</div>
          </div>

          {/* Yardage rail */}
          <div className="absolute left-4 right-4 top-[70px]">
            <div className="mb-1 flex justify-between font-mono text-[11px] text-white/60">
              <span>{hud.yards} YD</span>
              <span className="text-[#00FF9D]">EVADED {hud.evaded}</span>
              <span>{hud.toGo} TO GO</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/60">
              <div className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] to-[#00FF9D] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Center message */}
          {hud.msg && hud.phase !== 'done' && (
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 fel-heading text-4xl font-bold drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]" style={{ color: hud.msgColor }}>{hud.msg}</div>
          )}

          {/* End screen */}
          {hud.phase === 'done' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/65">
              <div className="text-center">
                <div className="fel-heading text-5xl font-bold" style={{ color: hud.won ? '#FFD700' : '#FF3366' }}>
                  {hud.won ? 'TOUCHDOWN!' : 'TACKLED'}
                </div>
                <div className="mt-3 font-mono text-white/70">{hud.yards} yards · {hud.evaded} evaded</div>
                <div className="mt-1 font-mono text-white/50">Final Score: {hud.score}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls hint */}
      <div className="mx-auto mt-3 max-w-[960px] px-3 text-center font-mono text-[11px] text-white/40">
        ←/→ or A/D steer · Q/E juke · S spin · F stiff-arm · SPACE hurdle
      </div>

      {/* Mobile touch controls */}
      <div className="mx-auto mt-3 flex max-w-[960px] flex-wrap items-center justify-center gap-2 px-3 md:hidden">
        <button
          onTouchStart={(e) => { e.preventDefault(); held.current.left = true; input.current.steer = -1; }}
          onTouchEnd={(e) => { e.preventDefault(); held.current.left = false; input.current.steer = held.current.right ? 1 : 0; }}
          className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-5 py-3 font-bold text-[#00E5FF] active:bg-[#00E5FF]/25"
        >◀</button>
        <button onClick={() => { input.current.jukeL = true; }} className="rounded-lg border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-4 py-3 text-sm font-bold text-[#00FF9D] active:bg-[#00FF9D]/25">JUKE L</button>
        <button onClick={() => { input.current.spin = true; }} className="rounded-lg border border-[#A855F7]/40 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#A855F7] active:bg-[#A855F7]/25">SPIN</button>
        <button onClick={() => { input.current.stiff = true; }} className="rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/10 px-4 py-3 text-sm font-bold text-[#FFD700] active:bg-[#FFD700]/25">STIFF</button>
        <button onClick={() => { input.current.hurdle = true; }} className="rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white active:bg-white/25">HURDLE</button>
        <button onClick={() => { input.current.jukeR = true; }} className="rounded-lg border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-4 py-3 text-sm font-bold text-[#00FF9D] active:bg-[#00FF9D]/25">JUKE R</button>
        <button
          onTouchStart={(e) => { e.preventDefault(); held.current.right = true; input.current.steer = 1; }}
          onTouchEnd={(e) => { e.preventDefault(); held.current.right = false; input.current.steer = held.current.left ? -1 : 0; }}
          className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-5 py-3 font-bold text-[#00E5FF] active:bg-[#00E5FF]/25"
        >▶</button>
      </div>
    </div>
  );
}