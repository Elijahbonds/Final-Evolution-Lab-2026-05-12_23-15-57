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
import { Grandstand } from '@/components/three/arena-dressing';
import { useOrientation } from '@/components/three/orientation';
import { PERF_BUDGET, gradePerf, HUD_SNAPSHOT_INTERVAL, type PerfSample } from '@/lib/three-budget';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';
import { MAPS } from '@/lib/map-data';
import { AnimDirectorFSM } from '@/lib/anim/state-machine';
import { AvatarDriver } from '@/lib/anim/avatar-driver';
import { createDragonMoment, triggerDragonMoment, updateDragonMoment } from '@/lib/camera-director';
import { createHitStop, triggerHitStop, updateHitStop } from '@/lib/impact-system';
import { createPrqEmitter, spawnPrq, updatePrq, PrqFloatLayer, type PrqPop } from '@/components/games/prq-float';
import {
  ECON, killReward, isEliteKill, enemyHpMult, enemySpeedMult, isSpikeRound, extractUnlocked,
  extractLc, downedExtractLc, BUY_ITEMS, buyItem, canAfford, rollPowerUp,
  createPowerups, activatePowerup, updatePowerups, instaKillActive, doublePointsActive,
  createDowned, goDown, updateDowned, reviveProgress01,
  type BuyEffect, type PowerUpKind,
} from '@/lib/feel/karate-endless-economy';

const HERO_URL = '/models/elijah-hero.glb';
const LEGACY_URL = '/models/elijah.glb';
const STRIKE_CLIPS: Record<string, string> = { jab: 'jab', kick: 'high_kick', special: 'roundhouse' };
const ALT_STRIKES = ['hook', 'uppercut'];
const MAP = MAPS['dojo'];
const FIGHT_Z = 0;
// Raised temple veranda deck height (model origin/stilts at y=0).
const DECK_Y = 1.25;
const ARENA_MIN = -6;
const ARENA_MAX = 6;
const MAX_FOES = 3;
const MAX_PICKUPS = 6; // M-handoff Phase6 — floor power-up pool
const EXTRACT_X = ARENA_MAX - 0.4; // glowing extract zone at the arena edge (round 10+)
// M-handoff Phase6 — power-up floor pickup + colour marker
type Pickup = { x: number; kind: PowerUpKind; t: number; taken: boolean };
const PICKUP_COLOR: Record<PowerUpKind, string> = {
  maxAmmo: '#00E5FF',      // TUNE(elijah) — refills Neural Burst
  instaKill: '#FF3366',    // TUNE(elijah)
  doublePoints: '#FFD700', // TUNE(elijah)
};
const PICKUP_LABEL: Record<PowerUpKind, string> = {
  maxAmmo: 'MAX NEURAL', instaKill: 'INSTA-KILL', doublePoints: 'DOUBLE POINTS',
};

// M8.4 — enemy archetypes: distinct silhouette (scale) + colour marker + stance at spawn.
const ARCH_KINDS = ['striker', 'grappler', 'rusher'] as const;
type ArchKind = typeof ARCH_KINDS[number];
const ARCH_STYLE: Record<ArchKind, { color: string; scale: number; label: string }> = {
  striker:  { color: '#FF3366', scale: 1.0,  label: 'STRIKER' },  // TUNE(elijah)
  grappler: { color: '#A855F7', scale: 1.22, label: 'GRAPPLER' }, // TUNE(elijah) heavier, taller
  rusher:   { color: '#FFD700', scale: 0.86, label: 'RUSHER' },   // TUNE(elijah) lean, low
};

interface FoeState {
  x: number; hp: number; maxHp: number; alive: boolean;
  attackCd: number; staggered: number; attacking: number; flinch: number;
  dying: number; // M8.3 — >0 = mid death stagger (knocked back) before removal
  kind: ArchKind; // M8.4 archetype
}

interface HudState {
  t: number;
  prqPops: PrqPop[]; // M8.4 floating +PRQ reward text
  score: number; wave: number; php: number; neural: number;
  combo: number; mult: number; burst: number; counter: number;
  aggr: number; spd: number; msg: string; msgColor: string; msgT: number;
  dragonFlash: number; dragonZoom: number;
  // M-handoff Phase6 — economy / roguelike round
  credits: number; buyMenuT: number;
  instaKillT: number; doublePointsT: number; speedBoostT: number;
  downed: boolean; reviveP: number; secondWinds: number;
  extractOpen: boolean; extractP: number;
}

function makeFoe(): FoeState {
  return { x: ARENA_MAX, hp: 1, maxHp: 1, alive: false, attackCd: 1, staggered: 0, attacking: 0, flinch: 0, dying: 0, kind: 'striker' };
}

// Camera that trails the player along X for a beat-em-up feel.
function TrackCamera({ playerX, dragonZoom }: {
  playerX: React.MutableRefObject<number>;
  dragonZoom: React.MutableRefObject<number>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const baseFov = useRef(camera.fov);
  const tgt = useRef(new THREE.Vector3(0, DECK_Y + 0.7, FIGHT_Z));
  useFrame(() => {
    const px = playerX.current;
    camera.position.x += ((px + 0.6) - camera.position.x) * 0.08;
    camera.position.y += (2.85 - camera.position.y) * 0.05;
    camera.position.z += (6.8 - camera.position.z) * 0.05;
    tgt.current.set(px, DECK_Y + 0.7, FIGHT_Z);
    camera.lookAt(tgt.current);
    // Dragon moment FOV push-in // TUNE(elijah)
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

function KarateScene({
  grade, prq, onEnd, gamepad, onHud, onPerf,
}: GameProps & { onHud: (h: HudState) => void; onPerf: (p: PerfSample) => void }) {
  const playerRef = useRef<AvatarHandle | null>(null);
  const foeRefs = useRef<(AvatarHandle | null)[]>([null, null, null]);
  const playerX = useRef(-2);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const gradeRef = useRef(grade); gradeRef.current = grade;
  const endedRef = useRef(false);

  const st = useRef({
    prq: createPrqEmitter(), // M8.4 PRQ surfacing
    t: 0, score: 0, wave: 1, combo: 0, comboT: 0, mult: 1,
    neural: 0, burst: 0, php: 100, pface: 1,
    attack: 0, block: false, counterT: 0,
    keys: {} as Record<string, boolean>,
    foes: [makeFoe(), makeFoe(), makeFoe()],
    msg: '', msgColor: '#FFF', msgT: 0,
    // M8.3 — impact hit-stop + wave-clear breather state
    hitStop: createHitStop(),
    pendingWave: 0, waveClearT: 0, waveKills: 0,
    startTime: Date.now(),
    // M-handoff Phase6 — economy / roguelike round (handoff Part 4)
    credits: 0, totalKills: 0, buyMenuT: 0, spikeShown: false,
    strikeDmgBonus: 0, speedBoostT: 0,
    powerups: createPowerups(),
    downed: createDowned(),
    pickups: [] as Pickup[],
    extractHoldT: 0,
  });

  const showMsg = useCallback((text: string, color: string) => {
    const s = st.current; s.msg = text; s.msgColor = color; s.msgT = 0.8;
  }, []);

  const spawnWave = useCallback((w: number) => {
    const s = st.current;
    const count = w >= 13 ? 3 : w >= 7 ? 2 : 1;
    for (let i = 0; i < MAX_FOES; i++) {
      const f = s.foes[i];
      if (i < count) {
        const hp = Math.round((40 + w * 8) * enemyHpMult(w)); // Phase6 round-10 spike +40% HP
        f.hp = hp; f.maxHp = hp; f.alive = true;
        f.x = 3.5 + i * 1.6; f.attackCd = 1.2 + Math.random(); f.staggered = 0; f.attacking = 0; f.flinch = 0; f.dying = 0;
        f.kind = ARCH_KINDS[(w + i) % 3]; // M8.4 rotate archetypes so single-foe waves vary too
      } else { f.alive = false; }
    }
  }, []);

  const strikeCount = useRef(0);

  // M7a — one animation state machine + driver per avatar (kills the waddle).
  const playerDir = useRef(new AnimDirectorFSM());
  const playerDrv = useRef(new AvatarDriver());
  const foeDirs = useRef([new AnimDirectorFSM(), new AnimDirectorFSM(), new AnimDirectorFSM()]);
  const foeDrvs = useRef([new AvatarDriver(), new AvatarDriver(), new AvatarDriver()]);
  const prevPlayerX = useRef(-2);
  const foePrevX = useRef<number[]>([ARENA_MAX, ARENA_MAX, ARENA_MAX]);
  const archRingRefs = useRef<(THREE.Mesh | null)[]>([null, null, null]); // M8.4 archetype floor markers
  const pickupRefs = useRef<(THREE.Group | null)[]>(Array(MAX_PICKUPS).fill(null)); // Phase6 power-up pool
  const extractRef = useRef<THREE.Mesh | null>(null); // Phase6 extract zone glow
  const playerAction = useRef<string | undefined>(undefined);
  const foeAction = useRef<(string | undefined)[]>([undefined, undefined, undefined]);

  // M8.2 — Dragon moment state for special strikes
  const dragonRef = useRef(createDragonMoment());
  const excitement = useRef(0); // M13 — drives the dojo gallery crowd (0..1)
  const dragonZoomRef = useRef(1);

  const doStrike = useCallback((type: 'jab' | 'kick' | 'special') => {
    const s = st.current;
    if (endedRef.current || s.attack > 0 || s.block || s.downed.downed) return;
    const pts = type === 'jab' ? 1 : type === 'kick' ? 2 : 3;
    const range = type === 'jab' ? 1.6 : type === 'kick' ? 2.1 : 2.5;
    // Phase6 — UPGRADE STRIKE buy item adds flat damage for the run.
    const baseDmg = (type === 'jab' ? 10 : type === 'kick' ? 16 : 26) + s.strikeDmgBonus;
    const dmg = baseDmg * (s.counterT > 0 ? 1.6 : 1);
    s.attack = type === 'jab' ? 0.22 : type === 'kick' ? 0.34 : 0.5;

    // M7a — route the strike through the animation state machine as an action
    // event. The director sequences windup→active→recovery and the driver
    // blends back to locomotion/idle afterwards (no snap, no T-pose).
    if (type === 'jab') playerAction.current = 'light_strike';
    else if (type === 'kick') playerAction.current = 'kick';
    else {
      strikeCount.current++;
      const r = strikeCount.current % 3;
      playerAction.current = r === 0 ? 'heavy_strike' : r === 1 ? 'counter' : 'kick';
    }
    let hit = false;
    for (const f of s.foes) {
      if (!f.alive) continue;
      if (Math.abs(f.x - playerX.current) < range && (f.x - playerX.current) * s.pface > -0.5) {
        f.hp -= dmg; f.staggered = 0.45; f.flinch = 0.3; hit = true;
        if (instaKillActive(s.powerups)) f.hp = 0; // Phase6 INSTA-KILL power-up
        // M8.3 — visible knockback proportional to hit power (dragon shoves hardest)
        f.x += s.pface * (type === 'special' ? 0.9 : type === 'kick' ? 0.5 : 0.32); // TUNE(elijah)
        f.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, f.x));
        if (f.hp <= 0 && f.dying <= 0) {
          // M8.3 — 2-frame death stagger + knockback BEFORE removal (hit reads first)
          f.dying = 0.06; // TUNE(elijah)
          f.x += s.pface * 0.6; f.x = Math.max(ARENA_MIN, Math.min(ARENA_MAX, f.x));
          const dbl = doublePointsActive(s.powerups); // Phase6 DOUBLE POINTS power-up
          s.score += dbl ? 30 : 15;
          // Phase6 — per-kill Lab currency (grows per wave, elite kills pay double).
          s.totalKills += 1;
          const elite = isEliteKill(s.totalKills);
          s.credits += killReward(s.wave, { elite, doublePoints: dbl });
          if (elite && s.pickups.filter((p) => !p.taken).length < MAX_PICKUPS) {
            // Phase6 — every 5th (elite) kill drops a physics power-up pickup.
            s.pickups.push({ x: f.x, kind: rollPowerUp(Math.random()), t: 0, taken: false });
          }
          spawnPrq(s.prq, s.burst > 0 ? 16 : 10, ARCH_STYLE[f.kind].color); // M8.4 // TUNE(elijah)
          triggerHitStop(s.hitStop, 0.04); // TUNE(elijah) — shared impact punch
        }
      }
    }
    if (hit) {
      s.combo += 1; s.comboT = 0.5;
      s.mult = (1 + Math.min(s.combo, 10) * 0.1) * (s.burst > 0 ? 1.5 : 1);
      s.score += Math.round(pts * s.mult * (s.counterT > 0 ? 2 : 1));
      s.neural = Math.min(100, s.neural + (type === 'special' ? 10 : 6));
      if (s.neural >= 80 && s.burst <= 0) s.burst = 6;
      s.counterT = 0;
      if (type === 'special') { showMsg('DRAGON PALM!', '#A855F7'); triggerDragonMoment(dragonRef.current); }
    } else { s.combo = 0; s.mult = s.burst > 0 ? 1.5 : 1; }
  }, [showMsg]);

  useEffect(() => {
    // Phase6 — apply a between-wave shop purchase (guarded by credits).
    const buy = (id: BuyEffect) => {
      const s = st.current;
      const it = buyItem(id);
      if (!it || !canAfford(s.credits, id)) return;
      s.credits -= it.cost;
      if (id === 'secondWind') s.downed.secondWinds += 1;
      else if (id === 'upgradeStrike') s.strikeDmgBonus += 15; // TUNE(elijah)
      else if (id === 'speedBoost') s.speedBoostT = 30; // TUNE(elijah)
      else if (id === 'healthRestore') s.php = 100;
      showMsg(`${it.label} ✓`, '#00FF9D');
    };
    const act = (a: string, down: boolean) => {
      const s = st.current;
      if (a === 'jab' && down) doStrike('jab');
      if (a === 'kick' && down) doStrike('kick');
      if (a === 'special' && down) doStrike('special');
      if (a === 'block') { if (down) s.block = true; else { s.block = false; s.counterT = 0.15; } }
      if (a === 'left') s.keys['a'] = down;
      if (a === 'right') s.keys['d'] = down;
      // Phase6 — shop actions from the between-wave buy menu (DOM buttons).
      if (down && a.startsWith('buy:')) buy(a.slice(4) as BuyEffect);
      if (down && a === 'skipbuy') s.buyMenuT = 0;
    };
    const kd = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase?.() ?? '';
      st.current.keys[k] = true;
      if (k === 'j') doStrike('jab');
      if (k === 'k') doStrike('kick');
      if (k === ';') doStrike('special');
      if (k === 'l') st.current.block = true;
      if (['j', 'k', 'l', ';', 'a', 'd'].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase?.() ?? '';
      st.current.keys[k] = false;
      if (k === 'l') { st.current.block = false; st.current.counterT = 0.15; }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (window as any).__felKarate3D = { act };
    registerFelMode('karate', {
      getState: () => { const s = st.current; return { score: s.score, wave: s.wave, combo: s.combo, mult: s.mult, php: s.php, neural: s.neural, credits: s.credits }; },
      sendInput: (a, p) => { act((p as string) ?? 'strike', true); },
    });
    spawnWave(1);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      delete (window as any).__felKarate3D;
      unregisterFelMode('karate');
    };
  }, [doStrike, spawnWave, showMsg]);

  const hudAcc = useRef(0); // M-perf: throttle HUD setState to 30Hz

  useFrame((_, dtRaw) => {
    const dtCapped = Math.min(dtRaw, 0.05);
    // M8.2 — Dragon moment: update with real dt, then scale game dt
    updateDragonMoment(dragonRef.current, dtCapped);
    // M8.3 — shared hit-stop punch on enemy death, scales game dt to 0 briefly.
    const hitScale = updateHitStop(st.current.hitStop, dtCapped);
    const dt = dtCapped * dragonRef.current.timeScale * hitScale;
    dragonZoomRef.current = dragonRef.current.zoomFactor;
    const s = st.current;
    if (endedRef.current) return;
    s.t += dt;
    if (s.msgT > 0) s.msgT -= dt;
    if (s.burst > 0) { s.burst -= dt; if (s.burst <= 0) { s.neural = 0; s.mult = 1 + Math.min(s.combo, 10) * 0.1; } }
    if (s.attack > 0) s.attack -= dt;
    if (s.counterT > 0) s.counterT -= dt;
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) { s.combo = 0; s.mult = s.burst > 0 ? 1.5 : 1; } }
    // Phase6 — power-up + boost timers decay in real time (immune to hit-stop).
    updatePowerups(s.powerups, dtCapped);
    if (s.speedBoostT > 0) s.speedBoostT = Math.max(0, s.speedBoostT - dtCapped);

    // gamepad
    if (gamepad) {
      s.keys['a'] = !!gamepad.left; s.keys['d'] = !!gamepad.right;
      if (gamepad.x) doStrike('jab');
      if (gamepad.y) doStrike('kick');
      if (gamepad.b) doStrike('special');
      if (gamepad.lb || gamepad.rb) s.block = true; else if (s.block && !s.keys['l']) { s.block = false; s.counterT = 0.15; }
    }

    // movement (Phase6 — SPEED BOOST buy item speeds you up; downed = slow crawl)
    const mv = 4.2 * (gradeRef.current?.speedMult ?? 1) * (s.speedBoostT > 0 ? 1.4 : 1) * (s.downed.downed ? 0.35 : 1);
    if (s.keys['a']) playerX.current -= mv * dt;
    if (s.keys['d']) playerX.current += mv * dt;
    playerX.current = Math.max(ARENA_MIN, Math.min(ARENA_MAX, playerX.current));
    // Player planar speed (normalized) from actual displacement this frame.
    const pdx = playerX.current - prevPlayerX.current;
    prevPlayerX.current = playerX.current;
    const pSpeed01 = Math.min(1, Math.abs(pdx) / ((mv * dt) || 1e-6));

    // face nearest alive foe
    let nearest: FoeState | null = null; let nd = Infinity;
    for (const f of s.foes) { if (f.alive) { const d = Math.abs(f.x - playerX.current); if (d < nd) { nd = d; nearest = f; } } }
    if (nearest) s.pface = nearest.x >= playerX.current ? 1 : -1;

    // foe AI
    const w = s.wave;
    const aggr = Math.min(0.6 + (w - 1) * 0.08, 1.4);
    const spd = (w >= 13 ? 1.15 : 1 + (w - 1) * 0.012) * (gradeRef.current?.speedMult ?? 1) * enemySpeedMult(w); // Phase6 round-10 +20% speed
    let aliveCount = 0;
    for (const f of s.foes) {
      // M8.3 — dying foes: hold a couple frames (knocked back), THEN vanish. They
      // still block wave-clear until they finish.
      if (f.dying > 0) {
        aliveCount++;
        f.dying -= dtCapped;
        if (f.dying <= 0) { f.dying = 0; f.alive = false; s.waveKills += 1; }
        continue;
      }
      if (!f.alive) continue;
      aliveCount++;
      if (f.flinch > 0) f.flinch = Math.max(0, f.flinch - dt * 3);
      if (f.staggered > 0) { f.staggered -= dt; continue; }
      const dx = playerX.current - f.x;
      if (Math.abs(dx) > 1.7) f.x += Math.sign(dx) * 1.9 * spd * dt;
      f.attackCd -= dt * aggr;
      if (f.attacking > 0) {
        f.attacking -= dt;
        if (f.attacking <= 0 && Math.abs(dx) < 2.0) {
          const facingFoe = (f.x - playerX.current) * s.pface > 0;
          if (s.block && facingFoe) { s.counterT = 0.15; }
          else { s.php -= 7 + w; }
        }
      } else if (f.attackCd <= 0 && Math.abs(dx) < 2.1) {
        f.attacking = 0.3; f.attackCd = Math.max(0.6, 1.6 - aggr * 0.6) + Math.random() * 0.5;
      }
    }
    // Phase6 — floor power-up pickups: age out, and get collected when walked over.
    for (const pu of s.pickups) {
      if (pu.taken) continue;
      pu.t += dtCapped;
      if (!s.downed.downed && Math.abs(pu.x - playerX.current) < 0.7) {
        pu.taken = true;
        const refill = activatePowerup(s.powerups, pu.kind);
        if (refill) { s.neural = 100; if (s.burst <= 0) s.burst = 6; } // MAX NEURAL → charge burst
        showMsg(PICKUP_LABEL[pu.kind] + '!', PICKUP_COLOR[pu.kind]);
      }
    }
    if (s.pickups.some((p) => p.taken || p.t >= 20)) s.pickups = s.pickups.filter((p) => !p.taken && p.t < 20);

    // M8.3 — WAVE CLEAR → Phase6 15s between-wave BUY MENU before next spawn.
    // Dying foes are counted above, so this only fires after death staggers end.
    if (aliveCount === 0 && s.pendingWave === 0) {
      s.pendingWave = s.wave + 1;
      s.buyMenuT = ECON.BUY_MENU_S; // Phase6 — shop window (skippable)
      s.score += 5 * s.wave;
      s.msg = `WAVE ${s.wave} CLEAR · ${s.waveKills} KO`; s.msgColor = '#FFD700'; s.msgT = 1.6;
    }
    if (s.pendingWave > 0) {
      if (s.buyMenuT > 0) s.buyMenuT -= dtCapped;
      if (s.buyMenuT <= 0) {
        s.wave = s.pendingWave; s.pendingWave = 0; s.waveKills = 0;
        spawnWave(s.wave);
        // Phase6 — round-10 critical-point spike banner (shown once).
        if (isSpikeRound(s.wave) && !s.spikeShown) {
          s.spikeShown = true;
          s.msg = 'ROUND 10 — CRITICAL POINT'; s.msgColor = '#FF3366'; s.msgT = 2.4;
        }
      }
    }

    // Phase6 — EXTRACT zone (round 10+): hold the glowing edge 3s to bank score→LC.
    if (extractUnlocked(s.wave) && !s.downed.downed && Math.abs(playerX.current - EXTRACT_X) < 0.85) {
      s.extractHoldT += dtCapped;
      if (s.extractHoldT >= ECON.EXTRACT_HOLD_S && !endedRef.current) {
        endedRef.current = true;
        const lc = extractLc(s.score);
        onEndRef.current?.({ score: s.score, won: true, duration: Math.round((Date.now() - s.startTime) / 1000), headline: `EXTRACTED · ${lc} LC` });
        return;
      }
    } else if (s.extractHoldT > 0) {
      s.extractHoldT = Math.max(0, s.extractHoldT - dtCapped * 2); // resets if you step out
    }

    // Phase6 — DOWNED / SECOND WIND (solo adaptation of co-op revive, Fix 5).
    if (s.php <= 0 && !s.downed.downed && !endedRef.current) {
      if (s.downed.secondWinds > 0) {
        goDown(s.downed); // banked self-revive available → go down instead of dying
        showMsg('DOWNED — HOLD BLOCK TO REVIVE', '#FF3366');
      } else {
        endedRef.current = true;
        onEndRef.current?.({ score: s.score, won: s.wave >= 5, duration: Math.round((Date.now() - s.startTime) / 1000), headline: `WAVE ${s.wave} · KO` });
        return;
      }
    }
    if (s.downed.downed) {
      const holding = !!s.keys['l'] || s.block; // hold BLOCK to spend a SECOND WIND
      const r = updateDowned(s.downed, dtCapped, holding);
      if (r === 'revived') { s.php = ECON.SECOND_WIND_HP; showMsg('SECOND WIND!', '#00FF9D'); }
      else if (r === 'expired' && !endedRef.current) {
        endedRef.current = true;
        const lc = downedExtractLc(s.score);
        onEndRef.current?.({ score: s.score, won: false, duration: Math.round((Date.now() - s.startTime) / 1000), headline: `DOWNED · ${lc} LC` });
        return;
      }
    }

    // drive avatars — mixer.update is handled by Avatar's useFrame.
    // Animation is now fully FSM-driven: the director enforces the invariant
    // "velocity>0 ⇒ a locomotion clip is playing", so movement never slides on
    // a stationary guard pose again.
    if (playerRef.current) {
      const lunge = s.attack > 0 ? 0.4 : 0;
      playerRef.current.group.position.set(playerX.current + s.pface * lunge, DECK_Y, FIGHT_Z);
      playerRef.current.group.rotation.y = s.pface > 0 ? -Math.PI / 2 : Math.PI / 2;
      const decision = playerDir.current.update(dt, {
        modeId: 'karate_endless',
        speed01: pSpeed01,
        phase: '',
        actionEvent: playerAction.current,
      });
      playerAction.current = undefined;
      playerDrv.current.apply(decision);
    }
    for (let i = 0; i < MAX_FOES; i++) {
      const ref = foeRefs.current[i];
      const f = s.foes[i];
      if (!ref) continue;
      ref.group.visible = f.alive || f.dying > 0;
      if (f.alive || f.dying > 0) {
        // M8.3 — dying foe plays a hit reaction while it is knocked back.
        if (f.dying > 0 && foeAction.current[i] === undefined) {
          foeAction.current[i] = 'hit';
        }
        // Foe attack becomes an action event exactly once per swing.
        if (f.alive && f.attacking > 0.28 && foeAction.current[i] === undefined) {
          foeAction.current[i] = 'light_strike';
        }
        const lunge = f.attacking > 0 ? -0.35 : 0;
        ref.group.position.set(f.x + lunge, DECK_Y, FIGHT_Z);
        ref.group.rotation.y = f.x >= playerX.current ? Math.PI / 2 : -Math.PI / 2;
        // M8.4 archetype silhouette + colour marker
        const style = ARCH_STYLE[f.kind];
        ref.group.scale.setScalar(style.scale);
        const ring = archRingRefs.current[i];
        if (ring) {
          ring.visible = f.alive;
          ring.position.set(f.x, DECK_Y + 0.02, FIGHT_Z);
          (ring.material as THREE.MeshBasicMaterial).color.set(style.color);
        }
        const fdx = f.x - foePrevX.current[i];
        foePrevX.current[i] = f.x;
        const fSpeed01 = Math.min(1, Math.abs(fdx) / ((1.9 * dt) || 1e-6));
        const decision = foeDirs.current[i].update(dt, {
          modeId: 'karate_endless',
          speed01: fSpeed01,
          phase: '',
          actionEvent: foeAction.current[i],
        });
        foeAction.current[i] = undefined;
        foeDrvs.current[i].apply(decision);
      }
    }

    // Phase6 — position the floor power-up pool + pulse the extract zone glow.
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const g = pickupRefs.current[i];
      if (!g) continue;
      const pu = s.pickups[i];
      const show = !!pu && !pu.taken;
      g.visible = show;
      if (show && pu) {
        g.position.set(pu.x, DECK_Y + 0.55 + Math.sin(s.t * 4 + i) * 0.12, FIGHT_Z);
        g.rotation.y += dtCapped * 2.2;
        const mat = ((g.children[0] as THREE.Mesh | undefined)?.material) as THREE.MeshStandardMaterial | undefined;
        if (mat) { mat.color.set(PICKUP_COLOR[pu.kind]); mat.emissive.set(PICKUP_COLOR[pu.kind]); }
      }
    }
    if (extractRef.current) {
      const open = extractUnlocked(s.wave);
      extractRef.current.visible = open;
      if (open) {
        const m = extractRef.current.material as THREE.MeshBasicMaterial;
        m.opacity = 0.22 + Math.sin(s.t * 3) * 0.1 + Math.min(0.4, s.extractHoldT * 0.13);
      }
    }

    // M13 — crowd excitement: rises with combo streak & dragon-moment pops.
    excitement.current = Math.max(dragonRef.current.flashAlpha, Math.min(1, s.combo / 12), excitement.current - dtCapped * 0.5);

    const prqPops = updatePrq(s.prq, dt); // M8.4 — particle life must decay every frame
    hudAcc.current += dtCapped;
    if (hudAcc.current >= HUD_SNAPSHOT_INTERVAL) {
      hudAcc.current = 0;
      onHud({
        t: s.t,
        prqPops,
        score: s.score, wave: s.wave, php: s.php, neural: s.neural,
        combo: s.combo, mult: s.mult, burst: s.burst, counter: s.counterT,
        aggr, spd, msg: s.msg, msgColor: s.msgColor, msgT: s.msgT,
        dragonFlash: dragonRef.current.flashAlpha, dragonZoom: dragonRef.current.zoomFactor,
        // Phase6 — economy / roguelike round
        credits: s.credits, buyMenuT: s.buyMenuT,
        instaKillT: s.powerups.instaKillT, doublePointsT: s.powerups.doublePointsT, speedBoostT: s.speedBoostT,
        downed: s.downed.downed, reviveP: reviveProgress01(s.downed), secondWinds: s.downed.secondWinds,
        extractOpen: extractUnlocked(s.wave), extractP: Math.min(1, s.extractHoldT / ECON.EXTRACT_HOLD_S),
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
      {/* M14-P6 — 4-wall dojo enclosure: box the fight hall in so it reads as a
          real room instead of an open void behind the backdrop. Walls sit just
          outside the navigable bounds; skybox/IBL still shows above them. */}
      <Enclosure boundsMin={MAP.boundsMin} boundsMax={MAP.boundsMax} height={7} pad={0.6} color="#170d09" />
      {/* M13 — living dojo gallery: seated spectators along the back wall so the
          hall no longer feels empty. Faces +Z toward the fight lane. */}
      <Grandstand position={[0, 0, -5.4]} rotationY={Math.PI} width={12} tiers={4} perTier={16} tierRise={0.42} tierDepth={0.7} excitement={excitement} seed={71} color="#241713" />
      <RimGlowPulse color="#ff4422" position={[-3, 3, 0]} baseIntensity={10} pulseAmp={5} pulseSpeed={1.0} />
      <RimGlowPulse color="#ffaa44" position={[3, 2.5, 0]} baseIntensity={8} pulseAmp={4} pulseSpeed={0.8} />
      <Suspense fallback={null}>
        <Avatar
          url={HERO_URL}
          onReady={(h) => {
            playerRef.current = h;
            h.group.rotation.y = -Math.PI / 2;
            h.group.position.set(playerX.current, DECK_Y, FIGHT_Z);
            // Attach the animation driver and let the FSM take over from here.
            playerDrv.current.attach(h);
            playerDir.current.reset();
            h.play('guard', { loop: true, timeScale: 1 });
          }}
        />
      </Suspense>
      {[0, 1, 2].map((i) => (
        <Suspense key={i} fallback={null}>
          <Avatar
            url={HERO_URL}
            tint="#ff5a6e"
            onReady={(h) => {
              foeRefs.current[i] = h;
              h.group.visible = false;
              h.group.rotation.y = Math.PI / 2;
              h.group.position.set(4 + i * 1.6, DECK_Y, FIGHT_Z);
              // Attach this foe's animation driver; the FSM drives it per frame.
              foeDrvs.current[i].attach(h);
              foeDirs.current[i].reset();
              h.play('guard', { loop: true, timeScale: 0.85 + i * 0.1 });
            }}
          />
        </Suspense>
      ))}
      {/* M8.4 archetype floor markers (colour set per-foe each frame) */}
      {[0, 1, 2].map((i) => (
        <mesh key={`ar${i}`} ref={(el) => { archRingRefs.current[i] = el; }} rotation={[-Math.PI / 2, 0, 0]} position={[4 + i * 1.6, DECK_Y + 0.02, FIGHT_Z]} visible={false}>
          <ringGeometry args={[0.34, 0.54, 36]} />
          <meshBasicMaterial color="#FF3366" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ))}
      {/* Phase6 — power-up floor pickups (octahedra; colour/position set per frame) */}
      {Array.from({ length: MAX_PICKUPS }).map((_, i) => (
        <group key={`pu${i}`} ref={(el) => { pickupRefs.current[i] = el; }} visible={false} position={[0, DECK_Y + 0.55, FIGHT_Z]}>
          <mesh>
            <octahedronGeometry args={[0.26, 0]} />
            <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.4} metalness={0.2} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* Phase6 — EXTRACT zone glow at the arena edge (visible from round 10) */}
      <mesh ref={extractRef} rotation={[-Math.PI / 2, 0, 0]} position={[EXTRACT_X, DECK_Y + 0.03, FIGHT_Z]} visible={false}>
        <ringGeometry args={[0.5, 1.05, 40]} />
        <meshBasicMaterial color="#00FF9D" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <TrackCamera playerX={playerX} dragonZoom={dragonZoomRef} />
      <PerfSampler onSample={onPerf} />
    </>
  );
}

export default function Karate3D(props: GameProps) {
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
  const act = (a: string, down: boolean) => (window as any).__felKarate3D?.act(a, down);

  if (!started) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: '#080604', minHeight: '60vh' }}>
        <h2 className="fel-heading text-4xl text-white">KARATE ENDLESS</h2>
        <p className="max-w-md text-sm text-gray-300">
          Survive escalating waves in the dojo. Chain strikes inside the 0.5s window to build your multiplier and charge Neural Burst.
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
          <span>J — Jab (1pt)</span><span>K — Kick (2pt)</span>
          <span>L — Block (hold)</span><span>; — Special (3pt)</span>
          <span>A / D — Move</span><span>Block → 0.15s counter</span>
        </div>
        <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]">FIGHT</button>
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
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
        camera={{ fov: orient === 'portrait' ? 64 : 54, near: 0.1, far: 200, position: [-1.4, 2.85, 6.8] }}
        scene={{ fog: new THREE.Fog(new THREE.Color(MAP.fogColor), MAP.fogNear, MAP.fogFar) }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, PERF_BUDGET.dprMax))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, PERF_BUDGET.dprMin))}
        >
          <DojoLighting />
          <KarateScene {...props} onHud={setHud} onPerf={setPerf} />
        </PerformanceMonitor>
      </Canvas>

      {hud && (
        <div className="absolute inset-0 pointer-events-none" style={{ fontFamily: 'var(--font-display), sans-serif' }}>
          {/* top scoreboard */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className="flex items-center gap-4 px-5 py-1.5 rounded-xl" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <span className="text-xs text-[#00E5FF] font-mono">WAVE {hud.wave}</span>
              <span className="text-2xl font-bold text-white">{hud.score}</span>
              {/* Phase6 — persistent Lab-credit balance */}
              <span className="flex items-center gap-1 text-lg font-bold" style={{ color: '#FFD700' }}>
                <span className="text-xs">◉</span>{hud.credits}
              </span>
            </div>
            {/* health */}
            <div className="w-60 h-2.5 rounded-full bg-black/60 overflow-hidden mt-0.5">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, hud.php)}%`, background: hud.php > 50 ? '#00FF9D' : hud.php > 25 ? '#FFD700' : '#FF3366' }} />
            </div>
            {/* Phase6 — active power-up + boost timers */}
            <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] font-bold">
              {hud.instaKillT > 0 && <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(255,51,102,0.2)', color: '#FF3366' }}>INSTA-KILL {Math.ceil(hud.instaKillT)}s</span>}
              {hud.doublePointsT > 0 && <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(255,215,0,0.2)', color: '#FFD700' }}>2× PTS {Math.ceil(hud.doublePointsT)}s</span>}
              {hud.speedBoostT > 0 && <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(0,229,255,0.2)', color: '#00E5FF' }}>SPEED {Math.ceil(hud.speedBoostT)}s</span>}
              {hud.secondWinds > 0 && <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(0,255,157,0.2)', color: '#00FF9D' }}>♥ {hud.secondWinds}</span>}
            </div>
          </div>

          {/* Wave indicator (replaces the old AGGR/SPD debug readout) */}
          <div className="absolute top-3 right-3 text-right font-mono text-[11px]">
            <div className="fel-heading tracking-[0.2em] text-white/50 text-[10px]">WAVE</div>
            <div className="text-lg font-bold" style={{ color: props.grade?.color ?? '#00FF9D' }}>{hud.wave}</div>
          </div>

          {/* M8.4 — floating PRQ reward text */}
          <PrqFloatLayer pops={hud.prqPops} />

          {/* neural burst bar (left edge) — M8.4 chakra buildup: pulsing glow as meter approaches 100 */}
          <div
            className="absolute left-3 top-1/3 h-1/3 w-2.5 rounded-full bg-black/60 overflow-hidden flex flex-col justify-end"
            style={{
              // TUNE(elijah) — glow ramps once neural >= 70 while burst not yet active
              boxShadow: hud.neural >= 70 && hud.burst <= 0
                ? `0 0 ${8 + (hud.neural - 70) * 0.8 + Math.sin(hud.t * 10) * 6}px ${2 + Math.sin(hud.t * 10) * 2}px #A855F7`
                : 'none',
              transition: 'box-shadow 0.1s linear',
            }}
          >
            <div className="w-full rounded-full transition-all" style={{ height: `${hud.neural}%`, background: hud.burst > 0 ? '#A855F7' : 'linear-gradient(to top,#00E5FF,#A855F7)' }} />
          </div>
          {hud.burst > 0 && <div className="absolute left-7 top-1/2 text-xs font-bold text-[#A855F7] font-mono">NEURAL BURST</div>}
          {/* M8.4 — DRAGON READY prompt pulses as chakra nears full */}
          {hud.neural >= 90 && hud.burst <= 0 && (
            <div
              className="absolute left-7 top-1/2 text-xs font-black text-[#A855F7] font-mono"
              style={{ opacity: 0.6 + Math.sin(hud.t * 12) * 0.4, textShadow: '0 0 12px #A855F7' }}
            >
              DRAGON READY
            </div>
          )}

          {/* combo — M8.4: floats above the fighter, larger & centered */}
          {hud.combo > 1 && (
            <div
              className="absolute left-1/2 top-[20%] -translate-x-1/2 text-center"
              style={{ transform: `translateX(-50%) scale(${1 + Math.min(hud.combo, 10) * 0.04})`, transformOrigin: 'center' }}
            >
              <div className="text-6xl font-black leading-none" style={{ color: hud.burst > 0 ? '#A855F7' : '#00E5FF', textShadow: `0 0 24px ${hud.burst > 0 ? '#A855F7' : '#00E5FF'}` }}>×{hud.mult.toFixed(1)}</div>
              <div className="text-sm font-bold text-white/80 tracking-widest mt-1">{hud.combo} CHAIN</div>
            </div>
          )}
          {hud.counter > 0 && <div className="absolute top-2/3 left-1/2 -translate-x-1/2 text-sm font-bold text-[#00FF9D]">COUNTER WINDOW</div>}

          {/* M8.2 — Dragon moment crimson flash overlay */}
          {hud.dragonFlash > 0.01 && (
            <div className="absolute inset-0" style={{ background: `rgba(180,20,20,${hud.dragonFlash * 0.55})`, pointerEvents: 'none' }} />
          )}

          {/* message */}
          {hud.msg && hud.msgT > 0 && (
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2">
              <div className="text-3xl font-bold" style={{ color: hud.msgColor, textShadow: `0 0 20px ${hud.msgColor}55` }}>{hud.msg}</div>
            </div>
          )}

          {/* Phase6 — EXTRACT progress prompt (round 10+) */}
          {hud.extractOpen && hud.extractP > 0 && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
              <div className="text-sm font-black tracking-widest" style={{ color: '#00FF9D', textShadow: '0 0 14px #00FF9D' }}>EXTRACTING…</div>
              <div className="w-44 h-2 rounded-full bg-black/70 overflow-hidden">
                <div className="h-full" style={{ width: `${Math.round(hud.extractP * 100)}%`, background: '#00FF9D' }} />
              </div>
            </div>
          )}
          {hud.extractOpen && hud.extractP <= 0 && (
            <div className="absolute bottom-24 right-4 text-right font-mono text-[10px] font-bold" style={{ color: '#00FF9D' }}>
              EXTRACT UNLOCKED → hold the glowing edge
            </div>
          )}

          {/* Phase6 — DOWNED overlay + SECOND WIND revive ring (solo co-op adaptation) */}
          {hud.downed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(10,0,4,0.55)', backdropFilter: 'grayscale(1) blur(1px)' }}>
              <div className="text-2xl font-black tracking-widest" style={{ color: '#FF3366', textShadow: '0 0 18px #FF3366' }}>DOWNED</div>
              <div className="text-xs font-mono text-white/80">HOLD BLOCK (L) TO SPEND A SECOND WIND</div>
              <div className="w-48 h-2.5 rounded-full bg-black/70 overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${Math.round(hud.reviveP * 100)}%`, background: '#00FF9D' }} />
              </div>
            </div>
          )}

          {/* Phase6 — between-wave BUY MENU (15s, skippable). Buttons are click-driven. */}
          {hud.buyMenuT > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-auto" style={{ background: 'rgba(5,5,8,0.72)', backdropFilter: 'blur(8px)' }}>
              <div className="flex items-center gap-3">
                <span className="fel-heading text-xl text-white tracking-widest">LAB SHOP</span>
                <span className="font-mono text-sm font-bold" style={{ color: '#FFD700' }}>◉ {hud.credits}</span>
                <span className="font-mono text-[10px] text-white/50">{Math.ceil(hud.buyMenuT)}s</span>
              </div>
              <div className="grid grid-cols-2 gap-2 w-[min(92%,440px)]">
                {BUY_ITEMS.map((it) => {
                  const afford = canAfford(hud.credits, it.id);
                  return (
                    <button
                      key={it.id}
                      onClick={() => act(`buy:${it.id}`, true)}
                      disabled={!afford}
                      className="flex flex-col items-start rounded-lg px-3 py-2 text-left transition"
                      style={{
                        background: afford ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${afford ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        opacity: afford ? 1 : 0.5,
                        cursor: afford ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className="text-sm font-bold text-white">{it.label}</span>
                        <span className="text-sm font-bold" style={{ color: '#FFD700' }}>◉{it.cost}</span>
                      </span>
                      <span className="text-[10px] text-white/60">{it.desc}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => act('skipbuy', true)} className="mt-1 rounded-lg bg-[#00E5FF] px-6 py-2 text-sm font-bold text-black transition hover:bg-[#00c9e0]">NEXT WAVE →</button>
            </div>
          )}

          {/* touch controls */}
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-3 !hidden pointer-events-auto">
            <div className="flex gap-2">
              <button onClick={() => {}} onTouchStart={() => act('left', true)} onTouchEnd={() => act('left', false)} onMouseDown={() => act('left', true)} onMouseUp={() => act('left', false)} className="h-14 w-14 rounded-full border border-white/20 bg-black/50 text-xl text-white">◀</button>
              <button onTouchStart={() => act('right', true)} onTouchEnd={() => act('right', false)} onMouseDown={() => act('right', true)} onMouseUp={() => act('right', false)} className="h-14 w-14 rounded-full border border-white/20 bg-black/50 text-xl text-white">▶</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => act('kick', true)} className="h-12 w-12 rounded-full border border-[#00FF9D]/50 bg-black/50 text-sm font-bold text-[#00FF9D]">KICK</button>
              <button onClick={() => act('special', true)} className="h-12 w-12 rounded-full border border-[#A855F7]/50 bg-black/50 text-[10px] font-bold text-[#A855F7]">SPCL</button>
              <button onClick={() => act('jab', true)} className="h-12 w-12 rounded-full border border-[#00E5FF]/50 bg-black/50 text-sm font-bold text-[#00E5FF]">JAB</button>
              <button onPointerDown={() => act('block', true)} onPointerUp={() => act('block', false)} onPointerLeave={() => act('block', false)} className="h-12 w-12 rounded-full border border-[#FFD700]/50 bg-black/50 text-[10px] font-bold text-[#FFD700]">BLOCK</button>
            </div>
          </div>
        </div>
      )}

      <PerfOverlay perf={perf} grade={grade} show={showPerf} />
    </div>
  );
}
