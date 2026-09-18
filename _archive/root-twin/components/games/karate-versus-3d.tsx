'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { GameProps } from '@/components/games/game-shell';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';
import { DojoLighting, IncenseEmbers } from '@/components/three/dojo-scene';
import { Enclosure } from '@/components/three/enclosure';
import { RimGlowPulse } from '@/components/three/effects';
import { PerfSampler, PerfOverlay } from '@/components/three/perf-hud';
import { MapMesh } from '@/components/three/map-loader';
import { SceneBackdrop } from '@/components/three/scene-backdrop';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';
import { MAPS } from '@/lib/map-data';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { MatchGate } from '@/lib/scene/match-gate';
import { detectDevice, MODE_BINDINGS } from '@/lib/scene/input-manager';
import { createDragonMoment, triggerDragonMoment, updateDragonMoment } from '@/lib/camera-director';
import { createHitStop, triggerHitStop, updateHitStop, createFlash, triggerFlash, updateFlash } from '@/lib/impact-system';
import { createClashQTE, startClash, registerMash, updateClashQTE, clashActive } from '@/lib/feel/clash-qte';
import { createCameraKick, triggerKick, updateCameraKick, type CameraKick } from '@/lib/feel/camera-kick';
import {
  resolveAttack, ATTACK_TABLE, GUARD_BREAK_THRESHOLD,
  type AttackClass, type GuardState, type DefenderMotion,
} from '@/lib/combat/duel-core';
import { weaponForCharacter } from '@/lib/combat/weapons';

const HERO_URL = '/models/elijah-hero.glb';
const MAP = MAPS['dojo'];

// M14-P8 — the player's signature weapon skin. COSMETIC ONLY: it tints the
// strike VFX and names the HUD badge; it carries no stats (see lib/combat/weapons).
const PLAYER_WEAPON = weaponForCharacter('elijah');
// Perfect-guard window: a GUARD pressed this recently negates the hit entirely.
const PERFECT_GUARD_MS = 160; // TUNE(elijah)
// Guard meter bleeds off while not blocking so chip pressure isn't permanent.
const GUARD_REGEN_PER_SEC = 12; // TUNE(elijah)

// --- tuned versus constants (RESERVED FOR ELIJAH — copied verbatim) ---
const ROUNDS_TO_WIN = 2;
// --- new free-locomotion scaffolding (open for tuning) ---
const FIGHT_Z = 0;
const DECK_Y = 1.25;
const ARENA_MIN = -6; // TUNE(elijah)
const ARENA_MAX = 6; // TUNE(elijah)
const MOVE_SPEED = 4.2; // TUNE(elijah)
const FOE_APPROACH_SPEED = 2.0; // TUNE(elijah)
const STRIKE_RANGE = 2.3; // TUNE(elijah) — combat only resolves when in range
const PLAYER_START_X = -2; // TUNE(elijah)
const FOE_START_X = 2.4; // TUNE(elijah)

type AiState = 'idle' | 'windup' | 'attack' | 'stunned';

interface HudState {
  round: number; myWins: number; aiWins: number;
  myHp: number; aiHp: number; chi: number; guardMeter: number;
  aiState: AiState; inRange: boolean; msg: string; msgColor: string;
  gatePhase: 'ready' | 'countdown' | 'fight'; gateCountdown: number;
  dragonFlash: number; dragonZoom: number;
  koFlash: number;
}

/**
 * M7-QA1 §5: Fight camera that keeps both fighters visible.
 * No pillar occlusion — camera is placed on the +Z side (audience-view)
 * looking at the midpoint between fighters, with dynamic zoom based on
 * fighter separation.
 */
function FightCamera({ playerX, foeX, dragonZoom, kick }: {
  playerX: React.MutableRefObject<number>;
  foeX: React.MutableRefObject<number>;
  dragonZoom: React.MutableRefObject<number>;
  kick: React.MutableRefObject<CameraKick>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const baseFov = useRef(camera.fov);
  const tgt = useRef(new THREE.Vector3());
  const smoothPos = useRef(new THREE.Vector3(0, DECK_Y + 1.6, 7));

  useFrame(() => {
    const px = playerX.current;
    const fx = foeX.current;
    const midX = (px + fx) / 2;
    const sep = Math.abs(px - fx);
    // Pull camera back when fighters separate. // TUNE(elijah)
    const dist = 5.5 + sep * 0.45;
    const camHeight = DECK_Y + 1.6 + sep * 0.08;

    const idealPos = new THREE.Vector3(midX, camHeight, FIGHT_Z + dist);
    smoothPos.current.lerp(idealPos, 0.07);
    camera.position.copy(smoothPos.current);

    tgt.current.set(midX, DECK_Y + 0.7, FIGHT_Z);
    camera.lookAt(tgt.current);

    // M-handoff Phase5 — impact camera swing (scene useFrame owns the update;
    // FightCamera only reads the current offsets so the jolt rides on top of
    // the smoothed follow position). // TUNE(elijah)
    const kk = kick.current;
    camera.position.x += kk.offX;
    camera.position.y += kk.offY;
    camera.rotateZ(kk.roll);

    // M8.2 — Dragon moment FOV push-in // TUNE(elijah)
    const z = dragonZoom.current;
    if (z > 1.001) {
      camera.fov = baseFov.current / z;
      camera.updateProjectionMatrix();
    } else if (camera.fov !== baseFov.current) {
      camera.fov = baseFov.current;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function KarateVsScene({
  grade, prq, onEnd, gamepad, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const player = useRef<AvatarHandle | null>(null);
  const foe = useRef<AvatarHandle | null>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  const dmgMult = grade.key === 'ELITE' ? 1.25 : grade.key === 'PRIMED' ? 1.15 : grade.key === 'READY' ? 1.05 : 1.0;
  // M-handoff Phase5 — how hard the AI pushes in a clash (drives mash target). // TUNE(elijah)
  const AI_CLASH_POWER = grade.key === 'ELITE' ? 0.9 : grade.key === 'PRIMED' ? 0.6 : grade.key === 'READY' ? 0.4 : 0.2;

  const st = useRef({
    round: 1, myWins: 0, aiWins: 0,
    myHp: 100, aiHp: 100, chi: 0, totalDamage: 0,
    aiState: 'idle' as AiState, aiTimer: 1.2, windupLen: 0.9,
    blockHeld: false, blockPressAt: -1e9, guardMeter: 0,
    playerX: PLAYER_START_X, foeX: FOE_START_X, pface: 1,
    playerFlinch: 0, foeFlinch: 0, attack: 0,
    foeKnock: 0, playerKnock: 0, // TUNE(elijah) — M8.3 impact knockback (world-X)
    keys: {} as Record<string, boolean>,
    msg: '', msgColor: '#FFF', msgTimer: 0,
    startTime: Date.now(),
  });

  // M7-QA1 §3: Round-state gate — NO AI or player action before FIGHT.
  const gate = useRef(new MatchGate());

  const playerDir = useRef(new AnimDirectorFSM());
  const playerDrv = useRef(new AvatarDriver());
  const foeDir = useRef(new AnimDirectorFSM());
  const foeDrv = useRef(new AvatarDriver());
  const prevPlayerX = useRef(PLAYER_START_X);
  const prevFoeX = useRef(FOE_START_X);
  const camPlayerX = useRef(PLAYER_START_X);
  const camFoeX = useRef(FOE_START_X);
  const playerAction = useRef<string | undefined>(undefined);
  const foeAction = useRef<string | undefined>(undefined);
  const strikeCount = useRef(0);

  // M8.2 — Dragon moment state for special strikes
  const dragonRef = useRef(createDragonMoment());
  const dragonZoomRef = useRef(1);

  // M8.3 — Impact system: KO hit-stop + white flash + deferred banner
  const impactRef = useRef(createHitStop());
  const koFlashRef = useRef(createFlash());
  const koPendingRef = useRef<boolean | null>(null);

  // M-handoff Phase5 — clash QTE (replaces the old auto-loss trade) + impact camera swing
  const clashRef = useRef(createClashQTE());
  const kickRef = useRef<CameraKick>(createCameraKick());

  const inRange = useCallback(() => Math.abs(st.current.foeX - st.current.playerX) <= STRIKE_RANGE, []);

  const showMsg = useCallback((text: string, color: string) => {
    const s = st.current; s.msg = text; s.msgColor = color; s.msgTimer = 0.9;
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const s = st.current;
    const won = s.myWins > s.aiWins;
    onEndRef.current?.({
      score: Math.round(s.totalDamage * 10 + s.myWins * 300),
      opponentScore: s.aiWins * 300,
      won,
      duration: Math.round((Date.now() - s.startTime) / 1000),
      headline: won ? `${s.myWins}-${s.aiWins} — SENSEI APPROVED` : `${s.myWins}-${s.aiWins} — MEDITATE AND RETURN`,
    });
  }, []);

  const newRound = useCallback(() => {
    const s = st.current;
    s.myHp = 100; s.aiHp = 100; s.chi = Math.min(s.chi, 50);
    s.aiState = 'idle'; s.aiTimer = 1.2;
    s.blockHeld = false; s.guardMeter = 0;
    s.playerX = PLAYER_START_X; s.foeX = FOE_START_X;
    // M-handoff Phase5 — clear any in-flight clash on a fresh round.
    clashRef.current = createClashQTE();
    // Reset the gate for the new round.
    gate.current.reset();
  }, []);

  const endRound = useCallback((playerWon: boolean) => {
    const s = st.current;
    if (playerWon) s.myWins += 1; else s.aiWins += 1;
    if (s.myWins >= ROUNDS_TO_WIN || s.aiWins >= ROUNDS_TO_WIN) { finish(); return; }
    s.round += 1;
    showMsg(playerWon ? 'ROUND WON!' : 'ROUND LOST', playerWon ? '#00FF9D' : '#FF3366');
    newRound();
  }, [finish, newRound, showMsg]);

  // M8.3 — KO is FELT before it is announced: freeze-frame + flash fire
  // immediately; the ROUND banner (endRound) is deferred until the 0.30s
  // hit-stop releases (see useFrame KO-release block).
  const checkHp = useCallback(() => {
    const s = st.current;
    if (s.aiHp > 0 && s.myHp > 0) return;
    const playerWon = s.aiHp <= 0;
    triggerHitStop(impactRef.current, 0.30); // TUNE(elijah) — KO freeze-frame
    triggerFlash(koFlashRef.current, '#ffffff', 0.7, 2.2); // TUNE(elijah)
    if (playerWon) s.foeKnock = 0.9; else s.playerKnock = 0.9; // TUNE(elijah)
    // M-handoff Phase5 — the KO lands the biggest camera swing of the match.
    triggerKick(kickRef.current, playerWon ? s.pface : -s.pface, 1.2); // TUNE(elijah)
    koPendingRef.current = playerWon;
  }, []);

  useEffect(() => {
    // M14-P8 — Soul-Calibur-style class attack. A=horizontal(slash),
    // B=vertical(heavy), X=kick. Damage & reach come ONLY from ATTACK_TABLE via
    // resolveAttack (lib/combat/duel-core) so every character fights identical
    // math. The signature AI interactions (counter on windup/stun, clash on the
    // foe's live attack) are preserved on top of the class numbers.
    const doAttack = (cls: AttackClass) => {
      const s = st.current;
      if (endedRef.current) return;
      // While a clash is live, every attack press is a mash.
      if (clashActive(clashRef.current)) { registerMash(clashRef.current); return; }
      if (!gate.current.canAct) return;
      const prof = ATTACK_TABLE[cls];
      s.attack = cls === 'vertical' ? 0.5 : cls === 'kick' ? 0.24 : 0.3;
      strikeCount.current++;
      playerAction.current = cls === 'kick' ? 'kick' : cls === 'vertical' ? 'heavy_strike' : 'light_strike';
      const spacing = Math.abs(s.foeX - s.playerX);
      // The 1-D bot never guards or side-steps, so resolveAttack governs the
      // range gate + base damage; the AI-state branches layer the fighter feel.
      const base = resolveAttack({ attack: cls, guard: 'none', defenderMotion: 'still', spacing, guardMeter: 0 });
      if (base.outcome === 'whiff') { showMsg('WHIFF', '#8899aa'); return; }
      const tint = PLAYER_WEAPON.trailColor;
      if (s.aiState === 'windup' || s.aiState === 'stunned') {
        const dmg = (base.damage + (s.aiState === 'stunned' ? 6 : 0)) * dmgMult; // TUNE(elijah) — stun counter bonus
        s.aiHp -= dmg; s.totalDamage += dmg; s.chi = Math.min(100, s.chi + 18);
        s.foeFlinch = 0.35; foeAction.current = 'hit';
        s.foeKnock = s.aiState === 'stunned' ? 0.5 : 0.35; // TUNE(elijah) — M8.3 clean-hit knockback
        showMsg(s.aiState === 'stunned' ? `COUNTER! -${Math.round(dmg)}` : `CLEAN HIT! -${Math.round(dmg)}`, '#00FF9D');
        triggerKick(kickRef.current, s.pface, cls === 'vertical' ? 0.8 : 0.6); // TUNE(elijah)
        s.aiState = 'idle'; s.aiTimer = 0.8 + Math.random() * 0.8;
      } else if (s.aiState === 'attack') {
        // Attacking into the foe's live attack opens a mash-off clash.
        startClash(clashRef.current, AI_CLASH_POWER);
        registerMash(clashRef.current);
        showMsg('CLASH! MASH!', '#FFD700');
        triggerKick(kickRef.current, s.pface, 0.4);
      } else {
        // Neutral pressure: the class lands for reduced (chip) damage.
        const dmg = Math.round(base.damage * 0.55) * dmgMult; // TUNE(elijah) — neutral poke scale
        s.aiHp -= dmg; s.totalDamage += dmg; s.chi = Math.min(100, s.chi + 8);
        s.foeFlinch = 0.2; foeAction.current = 'hit';
        showMsg(`${prof.tracksLateral ? cls.toUpperCase() : 'HEAVY'} -${Math.round(dmg)}`, tint);
        triggerKick(kickRef.current, s.pface, cls === 'vertical' ? 0.5 : 0.3);
      }
      checkHp();
    };
    const special = () => {
      const s = st.current;
      if (endedRef.current || s.chi < 100 || !gate.current.canAct) return;
      s.chi = 0; s.attack = 0.5;
      playerAction.current = 'heavy_strike';
      if (!inRange()) { showMsg('DRAGON PALM WHIFFED', '#8899aa'); return; }
      const dmg = 30 * dmgMult;
      s.aiHp -= dmg; s.totalDamage += dmg; s.foeFlinch = 0.5; foeAction.current = 'hit';
      s.foeKnock = 0.75; // TUNE(elijah) — M8.3 dragon-strike knockback (proportional to big damage)
      s.aiState = 'stunned'; s.aiTimer = 1.2;
      showMsg('DRAGON PALM! -30', '#FFD700');
      triggerDragonMoment(dragonRef.current);
      triggerKick(kickRef.current, s.pface, 1.0); // TUNE(elijah) — ultimate connect swing
      checkHp();
    };
    // HEAVY button: a full-chi press becomes the Dragon super, otherwise it is
    // the linear vertical class attack.
    const heavy = () => { if (st.current.chi >= 100) special(); else doAttack('vertical'); };
    // Back-compat alias for the playtest harness (old 'strike' action).
    const strike = () => doAttack('horizontal');
    const blockOn = () => { if (!gate.current.canAct) return; const s = st.current; if (!s.blockHeld) { playerAction.current = 'block'; s.blockPressAt = Date.now(); } s.blockHeld = true; };
    const blockOff = () => { st.current.blockHeld = false; };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase?.() ?? '';
      // M14-P8 Soul-Calibur layout: j=slash(horizontal) k=heavy(vertical) u=kick l=guard(hold)
      if (k === 'j') { e.preventDefault(); if (!e.repeat) doAttack('horizontal'); }
      else if (k === 'k') { e.preventDefault(); if (!e.repeat) heavy(); }
      else if (k === 'u') { e.preventDefault(); if (!e.repeat) doAttack('kick'); }
      else if (k === 'l') { e.preventDefault(); blockOn(); }
      // Legacy bindings kept for muscle memory / harness compatibility.
      else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) doAttack('horizontal'); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyS') { e.preventDefault(); special(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyB') { e.preventDefault(); blockOn(); }
      else if (k === 'a' || k === 'd') { st.current.keys[k] = true; e.preventDefault(); }
      else if (e.code === 'ArrowLeft') { st.current.keys['a'] = true; }
      else if (e.code === 'ArrowRight') { st.current.keys['d'] = true; }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase?.() ?? '';
      if (k === 'l' || e.code === 'ArrowDown' || e.code === 'KeyB') blockOff();
      else if (k === 'a' || k === 'd') st.current.keys[k] = false;
      else if (e.code === 'ArrowLeft') st.current.keys['a'] = false;
      else if (e.code === 'ArrowRight') st.current.keys['d'] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    (window as any).__felKarateVs3D = {
      // New Soul-Calibur verbs.
      slash: () => doAttack('horizontal'), heavy, kick: () => doAttack('kick'),
      guardOn: blockOn, guardOff: blockOff,
      // Back-compat verbs.
      strike, special, blockOn, blockOff,
      move: (dir: 'left' | 'right', down: boolean) => { st.current.keys[dir === 'left' ? 'a' : 'd'] = down; },
    };
    registerFelMode('karateVs', {
      getState: () => { const s = st.current; return { round: s.round, myWins: s.myWins, aiWins: s.aiWins, myHp: s.myHp, aiHp: s.aiHp, chi: s.chi }; },
      sendInput: (a) => {
        const api = (window as any).__felKarateVs3D;
        if (a === 'slash' || a === 'strike') api?.slash();
        else if (a === 'heavy') api?.heavy();
        else if (a === 'kick') api?.kick();
        else if (a === 'special') api?.special();
        else if (a === 'blockOn' || a === 'guardOn') api?.guardOn();
        else if (a === 'blockOff' || a === 'guardOff') api?.guardOff();
      },
    });
    newRound();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      delete (window as any).__felKarateVs3D;
      unregisterFelMode('karateVs');
    };
  }, [dmgMult, AI_CLASH_POWER, checkHp, newRound, showMsg, inRange]);

  const gpPrev = useRef({ a: false, b: false, x: false, guard: false });
  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  useFrame((_, dtRaw) => {
    const dtCapped = Math.min(dtRaw, 0.05);
    // M8.2 — Dragon moment: update with real dt, then scale game dt
    updateDragonMoment(dragonRef.current, dtCapped);
    // M8.3 — hit-stop scales game dt to 0 during the KO freeze (same dt-scaling
    // mechanism as the M8.2 dragon slow-mo). Its own countdown uses real dt.
    const hitScale = updateHitStop(impactRef.current, dtCapped);
    const dt = dtCapped * dragonRef.current.timeScale * hitScale;
    dragonZoomRef.current = dragonRef.current.zoomFactor;
    updateFlash(koFlashRef.current, dtCapped);
    // M-handoff Phase5 — impact camera swing advances on REAL dt so the jolt
    // still animates during the KO/dragon hit-stop.
    updateCameraKick(kickRef.current, dtCapped);
    const s = st.current;
    // M8.3 — KO release: once the freeze-frame ends, announce the round.
    if (koPendingRef.current !== null && !impactRef.current.active) {
      const pw = koPendingRef.current; koPendingRef.current = null; endRound(pw);
    }
    if (endedRef.current) return;
    // M-handoff Phase5 — advance the active clash QTE and resolve win/lose.
    const clashEv = updateClashQTE(clashRef.current, dt);
    if (clashEv === 'win') {
      const dmg = 15 * dmgMult; // TUNE(elijah)
      s.aiHp -= dmg; s.totalDamage += dmg;
      s.aiState = 'stunned'; s.aiTimer = 1.2;
      s.foeFlinch = 0.5; foeAction.current = 'hit'; s.foeKnock = 0.6;
      s.chi = Math.min(100, s.chi + 20);
      showMsg('CLASH WON! -15', '#00FF9D');
      triggerKick(kickRef.current, s.pface, 0.8);
      checkHp();
    } else if (clashEv === 'lose') {
      s.myHp -= 14; s.playerFlinch = 0.35; // TUNE(elijah)
      showMsg('OVERPOWERED! -14', '#FF3366');
      triggerKick(kickRef.current, -s.pface, 0.6);
      checkHp();
    }
    // M8.3 — ease knockback offsets back to neutral (frozen while dt≈0).
    s.foeKnock += (0 - s.foeKnock) * Math.min(dt * 3, 1);
    s.playerKnock += (0 - s.playerKnock) * Math.min(dt * 3, 1);

    // M7-QA1 §3: advance the round-state gate.
    gate.current.update(dt);

    if (s.msgTimer > 0) s.msgTimer -= dt;
    // M14-P8 — guard meter bleeds off while not actively guarding.
    if (!s.blockHeld && s.guardMeter > 0) s.guardMeter = Math.max(0, s.guardMeter - GUARD_REGEN_PER_SEC * dt);
    if (s.playerFlinch > 0) s.playerFlinch = Math.max(0, s.playerFlinch - dt * 3);
    if (s.foeFlinch > 0) s.foeFlinch = Math.max(0, s.foeFlinch - dt * 3);
    if (s.attack > 0) s.attack -= dt;

    // gamepad
    if (gamepad && gate.current.canAct) {
      const api = (window as any).__felKarateVs3D;
      s.keys['a'] = !!gamepad.left; s.keys['d'] = !!gamepad.right;
      // M14-P8 Soul-Calibur face mapping: A=slash B=heavy X=kick Y=guard(hold).
      if (gamepad.a && !gpPrev.current.a) api?.slash();
      if (gamepad.b && !gpPrev.current.b) api?.heavy();
      if (gamepad.x && !gpPrev.current.x) api?.kick();
      const guardDown = !!(gamepad.y || gamepad.lb || gamepad.rb);
      if (guardDown) api?.guardOn(); else if (gpPrev.current.guard) api?.guardOff();
      gpPrev.current = { a: !!gamepad.a, b: !!gamepad.b, x: !!gamepad.x, guard: guardDown };
    }

    // player movement — BLOCKED before FIGHT.
    const canAct = gate.current.canAct;
    const mv = MOVE_SPEED * (gradeRef.current?.speedMult ?? 1);
    if (canAct && !s.blockHeld) {
      if (s.keys['a']) s.playerX -= mv * dt;
      if (s.keys['d']) s.playerX += mv * dt;
    }
    s.playerX = Math.max(ARENA_MIN, Math.min(ARENA_MAX, s.playerX));
    camPlayerX.current = s.playerX;
    camFoeX.current = s.foeX;
    const pdx = s.playerX - prevPlayerX.current;
    prevPlayerX.current = s.playerX;
    const pSpeed01 = Math.min(1, Math.abs(pdx) / ((mv * dt) || 1e-6));

    // face the opponent
    s.pface = s.foeX >= s.playerX ? 1 : -1;

    // AI — ALL GATED behind canAct.
    const dx = s.playerX - s.foeX;
    const spd = FOE_APPROACH_SPEED * (gradeRef.current?.speedMult ?? 1);
    if (canAct && !clashActive(clashRef.current) && s.aiState !== 'stunned' && Math.abs(dx) > STRIKE_RANGE - 0.4) {
      s.foeX += Math.sign(dx) * spd * dt;
    }
    s.foeX = Math.max(ARENA_MIN, Math.min(ARENA_MAX, s.foeX));
    const fdx = s.foeX - prevFoeX.current;
    prevFoeX.current = s.foeX;
    const fSpeed01 = Math.min(1, Math.abs(fdx) / ((spd * dt) || 1e-6));

    if (canAct && !clashActive(clashRef.current)) {
      s.aiTimer -= dt;
      if (s.aiTimer <= 0) {
        if (s.aiState === 'idle') { s.aiState = 'windup'; s.windupLen = 0.55 + Math.random() * 0.5; s.aiTimer = s.windupLen; }
        else if (s.aiState === 'windup') {
          s.aiState = 'attack'; s.aiTimer = 0.35; foeAction.current = 'light_strike';
          // M14-P8 — the AI's swing resolves through the SAME duel-core the
          // player uses, so the player's GUARD (hold Y), the guard meter and
          // guard-break are all real, exercised mechanics. The bot throws a
          // tracking horizontal (can't be side-stepped in this 1-D skin).
          const pGuard: GuardState = s.blockHeld
            ? (Date.now() - s.blockPressAt < PERFECT_GUARD_MS ? 'perfect' : 'guarding')
            : 'none';
          const res = resolveAttack({
            attack: 'horizontal', guard: pGuard, defenderMotion: 'still' as DefenderMotion,
            spacing: Math.abs(s.foeX - s.playerX), guardMeter: s.guardMeter,
          });
          s.guardMeter = res.guardMeter;
          if (res.outcome === 'whiff' || res.outcome === 'sidestepped') { showMsg('DODGED!', '#00FF9D'); }
          else if (res.outcome === 'perfectBlocked') { s.chi = Math.min(100, s.chi + 16); showMsg('PERFECT GUARD! CHI +16', '#00E5FF'); }
          else if (res.outcome === 'blocked') { s.myHp -= res.damage; s.chi = Math.min(100, s.chi + 10); showMsg(`GUARD — ${Math.round((s.guardMeter / GUARD_BREAK_THRESHOLD) * 100)}%`, '#00E5FF'); checkHp(); }
          else if (res.outcome === 'guardBreak') { s.myHp -= res.damage; s.playerFlinch = 0.5; s.blockHeld = false; showMsg('GUARD BROKEN!', '#FF3366'); checkHp(); }
          else { s.myHp -= res.damage; s.playerFlinch = 0.35; showMsg(`HIT! -${res.damage}`, '#FF3366'); checkHp(); }
        } else if (s.aiState === 'attack' || s.aiState === 'stunned') { s.aiState = 'idle'; s.aiTimer = 0.9 + Math.random() * 1.1; }
      }
    }

    // Drive player avatar via FSM.
    if (player.current) {
      const lunge = s.attack > 0 ? s.pface * 0.35 : 0;
      player.current.group.position.set(s.playerX + lunge - s.playerFlinch * 0.4 * s.pface - s.pface * s.playerKnock, DECK_Y, FIGHT_Z);
      player.current.group.rotation.y = s.pface > 0 ? -Math.PI / 2 : Math.PI / 2;
      const decision = playerDir.current.update(dt, {
        modeId: 'karate_endless',
        speed01: pSpeed01,
        phase: '',
        actionEvent: playerAction.current,
      });
      playerAction.current = undefined;
      playerDrv.current.apply(decision);
    }
    // Drive foe avatar via FSM — same FSM as player, not frozen.
    if (foe.current) {
      const fface = s.playerX >= s.foeX ? 1 : -1;
      const lunge = s.aiState === 'attack' ? fface * 0.35 : 0;
      foe.current.group.position.set(s.foeX + lunge - s.foeFlinch * 0.4 * fface - fface * s.foeKnock, DECK_Y, FIGHT_Z);
      foe.current.group.rotation.y = fface > 0 ? -Math.PI / 2 : Math.PI / 2;
      const decision = foeDir.current.update(dt, {
        modeId: 'karate_endless',
        speed01: fSpeed01,
        phase: '',
        actionEvent: foeAction.current,
      });
      foeAction.current = undefined;
      foeDrv.current.apply(decision);
    }

    hudAcc.current += dtCapped;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        round: s.round, myWins: s.myWins, aiWins: s.aiWins,
        myHp: s.myHp, aiHp: s.aiHp, chi: s.chi, guardMeter: s.guardMeter,
        aiState: s.aiState, inRange: Math.abs(s.foeX - s.playerX) <= STRIKE_RANGE,
        msg: s.msg, msgColor: s.msgColor,
        gatePhase: gate.current.state.phase, gateCountdown: gate.current.state.countdownDisplay,
        dragonFlash: dragonRef.current.flashAlpha, dragonZoom: dragonRef.current.zoomFactor,
        koFlash: koFlashRef.current.alpha,
      });
    }
  });

  return (
    <>
      {MAP.backdrop && (
        <Suspense fallback={null}><SceneBackdrop url={MAP.backdrop} /></Suspense>
      )}
      <Suspense fallback={null}>
        <MapMesh config={MAP} />
      </Suspense>
      <IncenseEmbers count={36} />
      {/* M14-P6 — 4-wall dojo enclosure (see karate-3d). */}
      <Enclosure boundsMin={MAP.boundsMin} boundsMax={MAP.boundsMax} height={7} pad={0.6} color="#170d09" />
      <RimGlowPulse color="#ff4422" position={[-3, 3, 0]} baseIntensity={10} pulseAmp={5} pulseSpeed={1.0} />
      <RimGlowPulse color="#ffaa44" position={[3, 2.5, 0]} baseIntensity={8} pulseAmp={4} pulseSpeed={0.8} />
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            player.current = h;
            h.group.rotation.y = -Math.PI / 2;
            h.group.position.set(PLAYER_START_X, DECK_Y, FIGHT_Z);
            playerDrv.current.attach(h);
            playerDir.current.reset();
            h.play('guard', { loop: true, timeScale: 0.18 });
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          tint="#ff5a6e"
          onReady={(h) => {
            foe.current = h;
            h.group.rotation.y = Math.PI / 2;
            h.group.position.set(FOE_START_X, DECK_Y, FIGHT_Z);
            foeDrv.current.attach(h);
            foeDir.current.reset();
            h.play('guard', { loop: true, timeScale: 0.18 });
          }}
        />
      </Suspense>
      <FightCamera playerX={camPlayerX} foeX={camFoeX} dragonZoom={dragonZoomRef} kick={kickRef} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function KarateVersus3D(props: GameProps) {
  const orient = useOrientation();
  const [dpr, setDpr] = useState(1.5);
  const [hud, setHud] = useState<HudState | null>(null);
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const device = useRef(detectDevice());
  const bindings = MODE_BINDINGS['karate_versus'];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'p') setShowPerf((v) => !v); };
    window.addEventListener('keydown', onKey);
    // M7-QA1 §4: ensure canvas focus so keyboard input works.
    const el = canvasRef.current;
    if (el) { el.tabIndex = 0; el.style.outline = 'none'; el.focus(); }
    // Hide controls overlay after first input.
    const hide = () => { setShowControls(false); window.removeEventListener('keydown', hide); window.removeEventListener('touchstart', hide); };
    window.addEventListener('keydown', hide);
    window.addEventListener('touchstart', hide);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', hide); window.removeEventListener('touchstart', hide); };
  }, []);

  const grade = perf ? gradePerf(perf) : null;
  const api = () => (window as any).__felKarateVs3D;
  const isMobile = device.current === 'touch';

  return (
    <div
      ref={canvasRef}
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-white/5 shadow-[0_0_60px_rgba(0,229,255,0.06)]"
      style={{ aspectRatio: orient === 'portrait' ? '3 / 4' : '16 / 9', maxWidth: orient === 'portrait' ? 560 : 960, background: MAP.fogColor }}
      onClick={() => canvasRef.current?.focus()}
    >
      <Canvas
        dpr={dpr}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
        camera={{ fov: orient === 'portrait' ? 62 : 52, near: 0.1, far: 200, position: [0, DECK_Y + 1.6, 7] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <DojoLighting />
          <KarateVsScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* M7-QA1 §3: gate overlay — READY / COUNTDOWN */}
          {hud.gatePhase === 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="text-3xl font-bold text-white animate-pulse">GET READY</div>
            </div>
          )}
          {hud.gatePhase === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-7xl font-bold text-[#FFD700]" style={{ textShadow: '0 0 40px #FFD70088' }}>{hud.gateCountdown}</div>
            </div>
          )}

          {/* HP bars */}
          <div className="absolute top-3 left-0 right-0 flex items-start justify-between px-4">
            <div className="w-[42%]">
              <div className="flex justify-between text-xs font-bold text-white/80 mb-1"><span>YOU</span><span>{Math.max(0, Math.round(hud.myHp))}</span></div>
              <div className="h-3 rounded-full bg-black/60 overflow-hidden"><div className="h-full rounded-full bg-[#00FF9D] transition-all" style={{ width: `${Math.max(0, hud.myHp)}%` }} /></div>
            </div>
            <div className="flex flex-col items-center pt-1">
              <span className="text-sm font-bold text-white">ROUND {hud.round}</span>
              <span className="text-xs text-white/60">{hud.myWins} – {hud.aiWins}</span>
            </div>
            <div className="w-[42%]">
              <div className="flex justify-between text-xs font-bold text-white/80 mb-1"><span>{Math.max(0, Math.round(hud.aiHp))}</span><span>RIVAL SENSEI</span></div>
              <div className="h-3 rounded-full bg-black/60 overflow-hidden flex justify-end"><div className="h-full rounded-full bg-[#FF3366] transition-all" style={{ width: `${Math.max(0, hud.aiHp)}%` }} /></div>
            </div>
          </div>

          {/* chi bar */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-52">
            <div className="h-2 rounded-full bg-black/60 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${hud.chi}%`, background: hud.chi >= 100 ? '#FFD700' : '#A855F7' }} />
            </div>
            {hud.chi >= 100 && <div className="text-center text-[11px] font-mono text-[#FFD700] mt-1 animate-pulse">DRAGON PALM READY — HEAVY (K / B)</div>}
            {/* M14-P8 — guard meter: fills as blocked hits chip it; a full bar breaks the guard. */}
            {hud.guardMeter > 0.5 && (
              <div className="mt-1">
                <div className="flex justify-between text-[9px] font-mono text-white/50 mb-0.5"><span>GUARD</span><span>{Math.round((hud.guardMeter / GUARD_BREAK_THRESHOLD) * 100)}%</span></div>
                <div className="h-1.5 rounded-full bg-black/60 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (hud.guardMeter / GUARD_BREAK_THRESHOLD) * 100)}%`, background: hud.guardMeter >= GUARD_BREAK_THRESHOLD * 0.75 ? '#FF3366' : '#00E5FF' }} /></div>
              </div>
            )}
          </div>

          {/* M14-P8 — signature weapon badge (cosmetic; carries no stats). */}
          <div className="absolute top-14 left-4 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: PLAYER_WEAPON.glowColor, boxShadow: `0 0 8px ${PLAYER_WEAPON.glowColor}` }} />
            <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: PLAYER_WEAPON.bladeColor }}>{PLAYER_WEAPON.label}</span>
          </div>

          {/* range / telegraph cues — only during FIGHT */}
          {hud.gatePhase === 'fight' && !hud.inRange && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 px-3 py-1 rounded text-sm font-bold text-white font-mono" style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.18)' }}>CLOSE THE GAP — A / D</div>
          )}
          {hud.gatePhase === 'fight' && hud.aiState === 'windup' && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-lg font-bold text-[#FFD700] animate-pulse">⚠ INCOMING — BLOCK OR COUNTER!</div>
          )}
          {hud.gatePhase === 'fight' && hud.aiState === 'stunned' && (
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-lg font-bold text-[#A855F7] animate-pulse">STUNNED — STRIKE NOW!</div>
          )}

          {/* M8.2 — Dragon moment crimson flash overlay */}
          {hud.dragonFlash > 0.01 && (
            <div className="absolute inset-0" style={{ background: `rgba(180,20,20,${hud.dragonFlash * 0.55})`, pointerEvents: 'none' }} />
          )}

          {/* M8.3 — KO freeze-frame white flash (fires BEFORE the round banner) */}
          {hud.koFlash > 0.01 && (
            <div className="absolute inset-0" style={{ background: `rgba(255,255,255,${Math.min(0.85, hud.koFlash)})`, pointerEvents: 'none' }} />
          )}

          {/* message banner */}
          {hud.gatePhase === 'fight' && hud.msg && hud.msgColor && (
            <div className="absolute top-[42%] left-1/2 -translate-x-1/2">
              <div className="text-2xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* touch controls — visible on mobile devices */}
          {isMobile && hud.gatePhase === 'fight' && (
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-3 pointer-events-auto">
              <div className="flex gap-2">
                <button onClick={() => {}} onTouchStart={() => api()?.move('left', true)} onTouchEnd={() => api()?.move('left', false)} className="h-14 w-14 rounded-full border border-white/20 bg-black/50 text-xl text-white">◀</button>
                <button onClick={() => {}} onTouchStart={() => api()?.move('right', true)} onTouchEnd={() => api()?.move('right', false)} className="h-14 w-14 rounded-full border border-white/20 bg-black/50 text-xl text-white">▶</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => api()?.slash()} className="rounded-lg bg-[#00E5FF]/25 px-4 py-3 text-sm font-bold text-[#00E5FF] active:bg-[#00E5FF]/45">SLASH</button>
                <button onClick={() => api()?.heavy()} className="rounded-lg bg-[#FF3366]/25 px-4 py-3 text-sm font-bold text-[#FF3366] active:bg-[#FF3366]/45">HEAVY</button>
                <button onClick={() => api()?.kick()} className="rounded-lg bg-[#00FF9D]/25 px-4 py-3 text-sm font-bold text-[#00FF9D] active:bg-[#00FF9D]/45">KICK</button>
                <button onClick={() => {}} onPointerDown={() => api()?.guardOn()} onPointerUp={() => api()?.guardOff()} onPointerLeave={() => api()?.guardOff()} className="rounded-lg bg-[#FFD700]/25 px-4 py-3 text-sm font-bold text-[#FFD700] active:bg-[#FFD700]/45">GUARD</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* M7-QA1 §4: Controls overlay */}
      {showControls && bindings && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-xl px-6 py-4 text-center pointer-events-none" style={{ background: 'rgba(5,5,5,0.92)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="text-sm font-bold text-white/80 mb-3">CONTROLS</div>
          {(isMobile ? bindings.touch : bindings.desktop).map((b) => (
            <div key={b.key} className="flex justify-between gap-6 text-xs mb-1">
              <span className="text-[#00E5FF] font-mono">{b.key}</span>
              <span className="text-white/70">{b.label}</span>
            </div>
          ))}
          <div className="text-[10px] text-white/40 mt-2">Press any key to dismiss</div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
