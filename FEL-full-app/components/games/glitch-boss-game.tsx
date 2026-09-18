'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import {
  createShake, triggerShake, updateShake, applyShake,
  createPopups, addPopup, updatePopups, drawPopups,
} from '@/lib/canvas-juice';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960, H = 540;

// Boss phases: dodge projectiles → combo (hit timing windows) → aerial QTE finisher
type BossPhase = 'intro' | 'dodge' | 'combo' | 'aerial' | 'victory' | 'defeat';

interface Projectile { x: number; y: number; vx: number; vy: number; }

export default function GlitchBossGame({ grade, prq, onEnd, gamepad }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const gradeRef = useRef(grade);
  gradeRef.current = grade;

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    canvas.width = W; canvas.height = H;

    const bossStrength = Math.max(10, 90 - (prq * 0.8)); // weaker PRQ = stronger boss
    const speedMult = gradeRef.current?.speedMult ?? 1;

    const st = {
      t: 0, last: 0, phase: 'intro' as BossPhase, phaseT: 0,
      // Player
      px: W * 0.3, py: H - 120, vy: 0, hp: 100, jumping: false,
      dodges: 0, comboHits: 0, qteHits: 0,
      rec: new SessionRecorder(),
      // Boss
      bx: W * 0.7, by: H - 150, bHp: 100, bFlash: 0,
      bAttackT: 0, bPhaseIdx: 0,
      // Projectiles (dodge phase)
      projs: [] as Projectile[],
      projSpawnT: 0,
      // Combo phase
      comboWindow: false, comboWindowT: 0, comboTarget: 0, comboCount: 0,
      // Aerial QTE
      qteActive: false, qteKey: '' as string, qteT: 0, qteTotal: 0, qteHitCount: 0, qteMissed: false,
      // General
      score: 0, keys: {} as Record<string, boolean>,
      startTime: Date.now(),
      shake: createShake(), popups: createPopups(),
      slowmo: 0, flash: 0,
      introT: 2.5,
    };

    const QTE_KEYS = ['J', 'K', 'L', 'SPACE'];
    const startPhase = (phase: BossPhase) => {
      st.phase = phase; st.phaseT = 0;
      if (phase === 'dodge') { st.projs = []; st.projSpawnT = 0; st.dodges = 0; }
      if (phase === 'combo') { st.comboCount = 0; st.comboTarget = 3 + Math.ceil(bossStrength / 25); st.comboWindow = false; st.comboWindowT = 0; }
      if (phase === 'aerial') { st.qteActive = false; st.qteT = 0; st.qteTotal = 4; st.qteHitCount = 0; st.qteMissed = false; st.vy = -600; st.jumping = true; st.py = H - 120; triggerNextQte(); }
    };

    const triggerNextQte = () => {
      st.qteActive = true;
      st.qteKey = QTE_KEYS[Math.floor(Math.random() * QTE_KEYS.length)];
      st.qteT = 1.5 - bossStrength * 0.005; // tighter window for harder boss
    };

    const hitBoss = (dmg: number) => {
      st.bHp -= dmg; st.bFlash = 0.12;
      triggerShake(st.shake, 6, 150);
      addPopup(st.popups, `-${dmg}`, st.bx, st.by - 40, '#00E5FF');
      st.score += dmg * 5;
      st.rec.recordHit(dmg >= 15); // QTE finishers count as perfect
      st.rec.recordChain(st.comboCount);
    };

    const playerHit = (dmg: number) => {
      st.hp -= dmg;
      triggerShake(st.shake, 8, 200);
      addPopup(st.popups, `-${dmg} HP`, st.px, st.py - 30, '#FF3366');
      st.flash = 0.1;
      st.rec.recordMiss();
    };

    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      st.keys[k] = true;
      // Dodge phase: jump to dodge
      if ((k === ' ' || k === 'w') && st.phase === 'dodge' && !st.jumping) {
        e.preventDefault(); st.jumping = true; st.vy = -520;
      }
      // Combo phase: hit in window
      if (st.phase === 'combo' && st.comboWindow && (k === 'j' || k === 'k' || k === ' ')) {
        e.preventDefault();
        st.comboWindow = false;
        st.comboCount++;
        hitBoss(8);
        addPopup(st.popups, 'HIT!', st.px + 60, st.py - 40, '#00FF9D');
      }
      // Aerial QTE
      if (st.phase === 'aerial' && st.qteActive) {
        const match = (st.qteKey === 'J' && k === 'j') || (st.qteKey === 'K' && k === 'k') || (st.qteKey === 'L' && k === 'l') || (st.qteKey === 'SPACE' && k === ' ');
        if (match) {
          e.preventDefault();
          st.qteActive = false; st.qteHitCount++;
          hitBoss(15);
          addPopup(st.popups, 'PERFECT', st.px, st.py - 50, '#FFD700');
          st.slowmo = 0.3;
        }
      }
    };
    const ku = (e: KeyboardEvent) => { st.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    (canvas as any).felBoss = {
      jump: () => { if (st.phase === 'dodge' && !st.jumping) { st.jumping = true; st.vy = -520; } },
      hit: () => {
        if (st.phase === 'combo' && st.comboWindow) { st.comboWindow = false; st.comboCount++; hitBoss(8); addPopup(st.popups, 'HIT!', st.px + 60, st.py - 40, '#00FF9D'); }
        if (st.phase === 'aerial' && st.qteActive) { st.qteActive = false; st.qteHitCount++; hitBoss(15); addPopup(st.popups, 'PERFECT', st.px, st.py - 50, '#FFD700'); st.slowmo = 0.3; }
      },
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const rawDt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      const dt = st.slowmo > 0 ? rawDt * 0.3 : rawDt;
      st.t += dt;
      st.phaseT += dt;
      if (st.slowmo > 0) st.slowmo -= rawDt;
      if (st.flash > 0) st.flash -= rawDt;
      if (st.bFlash > 0) st.bFlash -= rawDt;

      // Gamepad
      if (gamepad) {
        if (gamepad.a) { if (st.phase === 'dodge' && !st.jumping) { st.jumping = true; st.vy = -520; } }
        if (gamepad.x || gamepad.b) {
          if (st.phase === 'combo' && st.comboWindow) { st.comboWindow = false; st.comboCount++; hitBoss(8); }
          if (st.phase === 'aerial' && st.qteActive) { st.qteActive = false; st.qteHitCount++; hitBoss(15); st.slowmo = 0.3; }
        }
      }

      updateShake(st.shake, dt);
      updatePopups(st.popups, dt);

      // Intro countdown
      if (st.phase === 'intro') {
        st.introT -= rawDt;
        if (st.introT <= 0) startPhase('dodge');
      }

      // Player gravity
      if (st.jumping) {
        st.vy += 1200 * dt;
        st.py += st.vy * dt;
        if (st.py >= H - 120) { st.py = H - 120; st.vy = 0; st.jumping = false; }
      }

      // ===== DODGE PHASE =====
      if (st.phase === 'dodge') {
        st.projSpawnT -= dt;
        if (st.projSpawnT <= 0) {
          st.projs.push({ x: st.bx - 30, y: st.by - 20, vx: -350 - bossStrength * 2, vy: (Math.random() - 0.5) * 100 });
          st.projSpawnT = 0.6 - bossStrength * 0.003;
        }
        for (let i = st.projs.length - 1; i >= 0; i--) {
          const p = st.projs[i];
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -20) { st.projs.splice(i, 1); st.dodges++; st.rec.recordDodge(); continue; }
          if (Math.abs(p.x - st.px) < 25 && Math.abs(p.y - st.py + 40) < 35) {
            playerHit(8); st.projs.splice(i, 1);
          }
        }
        if (st.phaseT > 12 || st.dodges >= 10) { startPhase('combo'); }
      }

      // ===== COMBO PHASE =====
      if (st.phase === 'combo') {
        if (!st.comboWindow) {
          st.comboWindowT -= dt;
          if (st.comboWindowT <= 0) {
            st.comboWindow = true;
            st.comboWindowT = 0.8 - bossStrength * 0.004; // window duration
          }
        } else {
          st.comboWindowT -= dt;
          if (st.comboWindowT <= 0) {
            st.comboWindow = false;
            st.comboWindowT = 1.0 + Math.random() * 0.5;
            playerHit(5); // missed window
          }
        }
        if (st.comboCount >= st.comboTarget) { startPhase('aerial'); }
      }

      // ===== AERIAL QTE PHASE =====
      if (st.phase === 'aerial') {
        if (st.qteActive) {
          st.qteT -= dt;
          if (st.qteT <= 0) { st.qteActive = false; st.qteMissed = true; playerHit(10); }
        }
        if (!st.qteActive && st.qteHitCount < st.qteTotal && !st.qteMissed) {
          triggerNextQte();
        }
        if (st.qteHitCount >= st.qteTotal || st.qteMissed) {
          if (st.bHp <= 0) {
            st.phase = 'victory';
          } else if (st.hp <= 0) {
            st.phase = 'defeat';
          } else {
            // Cycle back
            startPhase('dodge');
          }
        }
      }

      // End conditions
      if ((st.phase === 'victory' || st.bHp <= 0) && !endedRef.current) {
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        onEndRef.current?.({ score: st.score + Math.round(st.hp * 3), won: true, duration: dur, headline: 'GLITCH DESTROYED — THE VERTIGO FALLS', tallies: st.rec.tallies(), maxCombo: st.rec.bestChain });
        return;
      }
      if ((st.phase === 'defeat' || st.hp <= 0) && !endedRef.current) {
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        onEndRef.current?.({ score: st.score, won: false, duration: dur, headline: 'THE VERTIGO PREVAILS', tallies: st.rec.tallies(), maxCombo: st.rec.bestChain });
        return;
      }

      // ===== RENDER =====
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      applyShake(ctx, st.shake);

      // Glitch arena bg
      ctx.fillStyle = '#08050F'; ctx.fillRect(0, 0, W, H);
      // Glitch scan lines
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = `rgba(168,85,247,${0.02 + Math.sin(st.t * 3 + y * 0.1) * 0.01})`;
        ctx.fillRect(0, y, W, 1);
      }
      // Arena floor
      ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, H - 100, W, 100);
      ctx.strokeStyle = 'rgba(168,85,247,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H - 100); ctx.lineTo(W, H - 100); ctx.stroke();

      // Boss
      const bGlow = st.bFlash > 0 ? '#fff' : '#FF3366';
      ctx.save(); ctx.shadowColor = bGlow; ctx.shadowBlur = 24;
      ctx.strokeStyle = st.bFlash > 0 ? '#fff' : '#FF3366'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(st.bx, st.by - 50, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(st.bx, st.by - 32); ctx.lineTo(st.bx, st.by + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(st.bx - 24, st.by - 20); ctx.lineTo(st.bx, st.by - 28); ctx.lineTo(st.bx + 24, st.by - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(st.bx, st.by + 10); ctx.lineTo(st.bx - 16, st.by + 40); ctx.moveTo(st.bx, st.by + 10); ctx.lineTo(st.bx + 16, st.by + 40); ctx.stroke();
      ctx.restore();
      // Boss HP
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(st.bx - 40, st.by - 75, 80, 8);
      ctx.fillStyle = '#FF3366'; ctx.fillRect(st.bx - 40, st.by - 75, 80 * Math.max(st.bHp / 100, 0), 8);
      ctx.font = 'bold 10px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.fillStyle = '#FF3366';
      ctx.fillText('THE VERTIGO', st.bx, st.by - 82);

      // Player
      const pGlow = gradeRef.current?.color ?? '#00E5FF';
      ctx.save(); ctx.shadowColor = pGlow; ctx.shadowBlur = 16;
      ctx.strokeStyle = '#EDEDF2'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(st.px, st.py - 55, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(st.px, st.py - 42); ctx.lineTo(st.px, st.py - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(st.px - 20, st.py - 30); ctx.lineTo(st.px, st.py - 38); ctx.lineTo(st.px + 20, st.py - 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(st.px, st.py - 5); ctx.lineTo(st.px - 14, st.py + 15); ctx.moveTo(st.px, st.py - 5); ctx.lineTo(st.px + 14, st.py + 15); ctx.stroke();
      ctx.restore();

      // Projectiles
      for (const p of st.projs) {
        ctx.fillStyle = '#FF3366';
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FF336633';
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
      }

      // ===== HUD =====
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 48);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(W * 0.2, 8, W * 0.6, 48);

      ctx.textAlign = 'center'; ctx.font = '600 12px "Barlow Condensed"'; ctx.fillStyle = '#A855F7';
      ctx.fillText(`GLITCH BOSS · PHASE: ${st.phase.toUpperCase()}`, W / 2, 24);
      ctx.font = 'bold 22px "JetBrains Mono"'; ctx.fillStyle = '#fff';
      ctx.fillText(`SCORE ${st.score}`, W / 2, 48);

      // Player HP
      ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono"'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('HP', 14, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(32, 16, 120, 10);
      ctx.fillStyle = st.hp > 50 ? '#00FF9D' : st.hp > 25 ? '#FFD700' : '#FF3366';
      ctx.fillRect(32, 16, 120 * Math.max(st.hp / 100, 0), 10);

      // Phase-specific HUD
      if (st.phase === 'intro') {
        ctx.textAlign = 'center'; ctx.font = 'bold 40px "Barlow Condensed"'; ctx.fillStyle = '#FF3366';
        ctx.fillText('THE VERTIGO', W / 2, H / 2 - 20);
        ctx.font = '16px "JetBrains Mono"'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`Your weakest stat manifested. Boss strength: ${Math.round(bossStrength)}`, W / 2, H / 2 + 16);
        ctx.fillText(`Starting in ${Math.ceil(st.introT)}...`, W / 2, H / 2 + 40);
      }

      if (st.phase === 'combo' && st.comboWindow) {
        ctx.textAlign = 'center'; ctx.font = 'bold 28px "Barlow Condensed"';
        ctx.fillStyle = '#00FF9D';
        ctx.fillText('STRIKE NOW! (J / K / SPACE)', W / 2, H / 2);
        // Window timer bar
        const bw = 200;
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - bw / 2, H / 2 + 10, bw, 6);
        ctx.fillStyle = '#00FF9D'; ctx.fillRect(W / 2 - bw / 2, H / 2 + 10, bw * Math.max(st.comboWindowT / 0.8, 0), 6);
      }

      if (st.phase === 'aerial' && st.qteActive) {
        ctx.textAlign = 'center'; ctx.font = 'bold 48px "Barlow Condensed"';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(st.qteKey, W / 2, H / 2);
        ctx.font = '14px "JetBrains Mono"'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`QTE ${st.qteHitCount + 1}/${st.qteTotal}`, W / 2, H / 2 + 24);
        // Timer ring
        const pct = Math.max(st.qteT / 1.5, 0);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(W / 2, H / 2 - 16, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
      }

      // Flash
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,51,102,${0.25 * (st.flash / 0.1)})`; ctx.fillRect(0, 0, W, H); }

      drawPopups(ctx, st.popups);
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [started, prq]);

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-[#A855F7]/20 bg-[#08050F]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/80 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-[#FF3366]">THE VERTIGO</h2>
            <p className="mt-1 font-mono text-xs text-[#A855F7]">GLITCH BOSS · CHAPTER 1</p>
            <p className="mt-3 max-w-md text-center text-sm text-white/60">
              A manifestation of your weakest stat. Three phases: dodge projectiles, land combo strikes in timing windows, then execute the aerial QTE finisher. The boss is stronger when your PRQ is lower.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>SPACE / W — Jump (dodge)</span><span>J / K — Strike (combo)</span>
              <span>QTE keys flash on screen</span><span>Boss strength: ~{Math.round(Math.max(10, 90 - prq * 0.8))}</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#FF3366] px-10 py-3 text-xl font-bold text-white transition-all hover:shadow-[0_0_28px_rgba(255,51,102,0.5)]">
              FACE THE GLITCH
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-center gap-4 !hidden">
          <button onTouchStart={() => (canvasRef.current as any)?.felBoss?.jump()} className="h-14 w-14 rounded-full border border-[#00E5FF]/50 bg-[#16161A] text-sm font-bold text-[#00E5FF]">↑</button>
          <button onTouchStart={() => (canvasRef.current as any)?.felBoss?.hit()} className="h-14 w-20 rounded-full border border-[#FF3366]/50 bg-[#16161A] text-sm font-bold text-[#FF3366]">HIT</button>
        </div>
      )}
    </div>
  );
}
