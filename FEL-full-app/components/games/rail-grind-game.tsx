'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import {
  createShake, triggerShake, updateShake, applyShake,
  createPopups, addPopup, updatePopups, drawPopups,
  createGamepadState, pollGamepad,
} from '@/lib/canvas-juice';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960, H = 540;
const GRAVITY = 1400;
const RAIL_Y = H - 160;
const RAIL2_Y = H - 280;
const GROUND_Y = H - 80;

interface Obstacle { x: number; type: 'gap' | 'barrier' | 'spark'; w: number; }
interface Orb { x: number; y: number; type: 'xp' | 'shard'; collected: boolean; }

export default function RailGrindGame({ grade, prq, onEnd, gamepad }: GameProps) {
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

    const st = {
      t: 0, last: 0, score: 0, dist: 0, speed: 400,
      px: 120, py: RAIL_Y, vy: 0, onRail: true, grindRail: 1 as 1 | 2,
      ducking: false, jumping: false, airTime: 0,
      balance: 50, balanceDir: 1, balanceDrift: 0,
      hp: 100, combo: 0, comboT: 0,
      obstacles: [] as Obstacle[], orbs: [] as Orb[],
      rec: new SessionRecorder(),
      spawnT: 0, orbT: 0,
      keys: {} as Record<string, boolean>,
      startTime: Date.now(),
      shake: createShake(), popups: createPopups(),
      finished: false, flashT: 0,
    };

    const speedMult = gradeRef.current?.speedMult ?? 1;
    const TARGET_DIST = 3000;

    const spawnObstacle = () => {
      const types: Obstacle['type'][] = ['gap', 'barrier', 'spark'];
      const type = types[Math.floor(Math.random() * types.length)];
      st.obstacles.push({ x: W + 50, type, w: type === 'gap' ? 80 : 40 });
    };

    const spawnOrb = () => {
      const y = Math.random() > 0.5 ? RAIL_Y - 40 : RAIL2_Y - 40;
      st.orbs.push({ x: W + 50, y, type: Math.random() > 0.7 ? 'shard' : 'xp', collected: false });
    };

    const jump = () => {
      if (!st.jumping) {
        st.jumping = true; st.onRail = false; st.vy = -580;
        st.airTime = 0;
      }
    };

    const duck = (down: boolean) => { st.ducking = down; };

    const switchRail = () => {
      if (st.onRail) {
        st.grindRail = st.grindRail === 1 ? 2 : 1;
        st.py = st.grindRail === 1 ? RAIL_Y : RAIL2_Y;
      }
    };

    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      st.keys[k] = true;
      if (k === ' ' || k === 'w' || k === 'arrowup') { e.preventDefault(); jump(); }
      if (k === 's' || k === 'arrowdown') { e.preventDefault(); duck(true); }
      if (k === 'a' || k === 'arrowleft' || k === 'd' || k === 'arrowright') { e.preventDefault(); switchRail(); }
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      st.keys[k] = false;
      if (k === 's' || k === 'arrowdown') duck(false);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    (canvas as any).felRail = { jump, duck, switchRail };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now; st.t += dt;

      // Gamepad
      if (gamepad) {
        if (gamepad.a) jump();
        if (gamepad.down) duck(true); else if (!st.keys['s'] && !st.keys['arrowdown']) duck(false);
        if (gamepad.left || gamepad.right) switchRail();
      }

      // Speed scales with PRQ
      st.speed = (400 + st.dist * 0.02) * speedMult;
      st.dist += st.speed * dt;

      // Physics
      if (st.jumping) {
        st.vy += GRAVITY * dt;
        st.py += st.vy * dt;
        st.airTime += dt;
        const targetY = st.grindRail === 1 ? RAIL_Y : RAIL2_Y;
        if (st.py >= targetY) {
          st.py = targetY; st.vy = 0; st.jumping = false; st.onRail = true;
          if (st.airTime > 0.3) {
            st.combo++; st.comboT = 1;
            st.rec.recordHit(); st.rec.recordChain(st.combo);
            const pts = Math.round(20 * (1 + st.combo * 0.1));
            st.score += pts;
            addPopup(st.popups, `+${pts} AIR`, st.px, st.py - 30, '#00E5FF');
          }
        }
      }

      // Balance meter (on rail)
      if (st.onRail && !st.ducking) {
        st.balanceDrift += (Math.random() - 0.5) * 80 * dt;
        st.balance += st.balanceDrift * dt;
        st.balance = Math.max(0, Math.min(100, st.balance));
        if (st.balance < 15 || st.balance > 85) {
          st.hp -= 15 * dt;
          triggerShake(st.shake, 3, 60);
        }
      }

      // Spawn
      st.spawnT -= dt;
      if (st.spawnT <= 0) { spawnObstacle(); st.spawnT = 1.2 + Math.random() * 0.8; }
      st.orbT -= dt;
      if (st.orbT <= 0) { spawnOrb(); st.orbT = 0.6 + Math.random() * 0.4; }

      // Move obstacles & check collisions
      for (let i = st.obstacles.length - 1; i >= 0; i--) {
        const o = st.obstacles[i];
        o.x -= st.speed * dt;
        if (o.x + o.w < -20) { st.obstacles.splice(i, 1); continue; }
        // Collision check (player at st.px, st.py)
        if (Math.abs(o.x - st.px) < 40 && st.onRail) {
          if (o.type === 'gap' && !st.jumping) {
            st.hp -= 20; st.rec.recordMiss(); triggerShake(st.shake, 8, 150);
            addPopup(st.popups, '-20 HP', st.px, st.py - 20, '#FF3366');
            st.obstacles.splice(i, 1);
          } else if (o.type === 'barrier' && !st.ducking) {
            st.hp -= 15; st.rec.recordMiss(); triggerShake(st.shake, 6, 120);
            addPopup(st.popups, '-15 HP', st.px, st.py - 20, '#FF3366');
            st.obstacles.splice(i, 1);
          } else if (o.type === 'spark' && st.balance < 30) {
            st.hp -= 10; st.rec.recordMiss(); triggerShake(st.shake, 4, 80);
            st.obstacles.splice(i, 1);
          }
        }
      }

      // Orbs
      for (let i = st.orbs.length - 1; i >= 0; i--) {
        const o = st.orbs[i];
        o.x -= st.speed * dt;
        if (o.x < -20) { st.orbs.splice(i, 1); continue; }
        if (!o.collected && Math.abs(o.x - st.px) < 35 && Math.abs(o.y - st.py) < 50) {
          o.collected = true;
          const pts = o.type === 'shard' ? 50 : 20;
          st.score += pts;
          st.rec.recordHit();
          addPopup(st.popups, o.type === 'shard' ? '+SHARD' : `+${pts}`, o.x, o.y - 10, o.type === 'shard' ? '#A855F7' : '#00FF9D');
        }
      }

      // Update juice
      updateShake(st.shake, dt);
      updatePopups(st.popups, dt);
      if (st.comboT > 0) st.comboT -= dt;
      if (st.flashT > 0) st.flashT -= dt;

      // End conditions
      if (st.hp <= 0 && !st.finished) {
        st.finished = true;
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        onEndRef.current?.({ score: st.score, won: st.dist >= TARGET_DIST, duration: dur, headline: st.dist >= TARGET_DIST ? 'RAIL CLEARED' : 'DERAILED', tallies: st.rec.tallies(), maxCombo: st.rec.bestChain });
        return;
      }
      if (st.dist >= TARGET_DIST && !st.finished) {
        st.finished = true;
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        onEndRef.current?.({ score: st.score + Math.round(st.hp * 2), won: true, duration: dur, headline: 'NEXUS RAIL CLEARED', tallies: st.rec.tallies(), maxCombo: st.rec.bestChain });
        return;
      }

      // ===== RENDER =====
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      applyShake(ctx, st.shake);

      // Dark nexus background with parallax grid
      ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, W, H);
      // Scrolling grid lines
      const gridOff = (st.dist * 0.3) % 60;
      ctx.strokeStyle = 'rgba(0,229,255,0.06)'; ctx.lineWidth = 1;
      for (let x = -gridOff; x < W + 60; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Rails
      const drawRail = (ry: number, active: boolean) => {
        ctx.strokeStyle = active ? '#00E5FF' : 'rgba(0,229,255,0.2)';
        ctx.lineWidth = active ? 3 : 1.5;
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke();
        if (active) {
          // Grind sparks
          ctx.fillStyle = '#00E5FF';
          for (let i = 0; i < 4; i++) {
            const sx = st.px - 10 - Math.random() * 30;
            const sy = ry - Math.random() * 6;
            ctx.fillRect(sx, sy, 2, 2);
          }
        }
      };
      drawRail(RAIL_Y, st.grindRail === 1 && st.onRail);
      drawRail(RAIL2_Y, st.grindRail === 2 && st.onRail);

      // Ground
      ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

      // Obstacles
      for (const o of st.obstacles) {
        if (o.type === 'gap') {
          ctx.fillStyle = '#FF336633'; ctx.fillRect(o.x, RAIL_Y - 5, o.w, 10);
          ctx.fillStyle = '#FF3366'; ctx.font = 'bold 10px "JetBrains Mono"'; ctx.textAlign = 'center';
          ctx.fillText('GAP', o.x + o.w / 2, RAIL_Y - 12);
        } else if (o.type === 'barrier') {
          ctx.fillStyle = '#FFD700'; ctx.fillRect(o.x - 3, RAIL_Y - 50, 6, 50);
          ctx.fillRect(o.x - 15, RAIL_Y - 50, 30, 6);
        } else {
          ctx.fillStyle = '#FF336688';
          ctx.beginPath(); ctx.arc(o.x, RAIL_Y - 15, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#FF3366'; ctx.font = 'bold 8px "JetBrains Mono"'; ctx.textAlign = 'center';
          ctx.fillText('⚡', o.x, RAIL_Y - 12);
        }
      }

      // Orbs
      for (const o of st.orbs) {
        if (o.collected) continue;
        ctx.fillStyle = o.type === 'shard' ? '#A855F7' : '#00FF9D';
        ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(o.type === 'shard' ? '◆' : '●', o.x, o.y + 3);
      }

      // Player (stick figure on rail)
      const px = st.px, py = st.py;
      const playerColor = st.hp < 30 ? '#FF3366' : '#EDEDF2';
      const glow = gradeRef.current?.color ?? '#00E5FF';
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 16;
      ctx.strokeStyle = playerColor; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const headY = st.ducking ? py - 30 : py - 70;
      const bodyTop = st.ducking ? py - 25 : py - 60;
      const bodyBot = py - 10;
      // head
      ctx.beginPath(); ctx.arc(px, headY, 8, 0, Math.PI * 2); ctx.stroke();
      // body
      ctx.beginPath(); ctx.moveTo(px, bodyTop); ctx.lineTo(px, bodyBot); ctx.stroke();
      // arms
      ctx.beginPath(); ctx.moveTo(px - 18, bodyTop + 10); ctx.lineTo(px, bodyTop + 5); ctx.lineTo(px + 18, bodyTop + 10); ctx.stroke();
      // legs
      ctx.beginPath(); ctx.moveTo(px, bodyBot); ctx.lineTo(px - 12, py); ctx.moveTo(px, bodyBot); ctx.lineTo(px + 12, py); ctx.stroke();
      ctx.restore();

      // ===== HUD =====
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.15, 8, W * 0.7, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(W * 0.15, 8, W * 0.7, 52);

      // Distance progress
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(st.dist)}m / ${TARGET_DIST}m`, W / 2, 42);
      ctx.font = '600 12px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#00E5FF';
      ctx.fillText('NEXUS RAIL · CHAPTER 1', W / 2, 20);

      // Progress bar
      const pbW = W * 0.5, pbX = W * 0.25, pbY = 66;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(pbX, pbY, pbW, 6);
      ctx.fillStyle = '#00E5FF'; ctx.fillRect(pbX, pbY, pbW * Math.min(st.dist / TARGET_DIST, 1), 6);

      // HP bar
      ctx.textAlign = 'left'; ctx.font = '10px "JetBrains Mono"'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('HP', 14, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(32, 16, 100, 10);
      ctx.fillStyle = st.hp > 50 ? '#00FF9D' : st.hp > 25 ? '#FFD700' : '#FF3366';
      ctx.fillRect(32, 16, Math.max(st.hp, 0), 10);

      // Balance meter
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('BAL', 14, 42);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(32, 34, 100, 10);
      const balColor = (st.balance > 35 && st.balance < 65) ? '#00E5FF' : (st.balance > 20 && st.balance < 80) ? '#FFD700' : '#FF3366';
      ctx.fillStyle = balColor; ctx.fillRect(32 + st.balance - 3, 34, 6, 10);

      // Score
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono"'; ctx.fillStyle = '#FFD700';
      ctx.fillText(`SCORE ${st.score}`, W - 14, 24);
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 42);

      // Speed indicator
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText(`${Math.round(st.speed)} px/s`, W - 14, 56);

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
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#050508]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">NEXUS RAIL</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">
              Grind the rail to the Arena District. Jump gaps, duck barriers, keep your balance.
              Collect orbs for score. Reach {3000}m to clear.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>SPACE / W / ↑ — Jump</span><span>S / ↓ — Duck</span>
              <span>A / D / ← → — Switch rail</span><span>Balance auto-drifts</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              GRIND
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between gap-2 !hidden">
          <div className="flex gap-2">
            <button onTouchStart={() => (canvasRef.current as any)?.felRail?.switchRail()} className="h-14 w-14 rounded-full border border-white/20 bg-[#16161A] text-xl text-white">⇅</button>
          </div>
          <div className="flex gap-2">
            <button onTouchStart={() => (canvasRef.current as any)?.felRail?.duck(true)} onTouchEnd={() => (canvasRef.current as any)?.felRail?.duck(false)} className="h-14 w-14 rounded-full border border-[#FFD700]/50 bg-[#16161A] text-sm font-bold text-[#FFD700]">↓</button>
            <button onTouchStart={() => (canvasRef.current as any)?.felRail?.jump()} className="h-14 w-14 rounded-full border border-[#00E5FF]/50 bg-[#16161A] text-sm font-bold text-[#00E5FF]">↑</button>
          </div>
        </div>
      )}
    </div>
  );
}
