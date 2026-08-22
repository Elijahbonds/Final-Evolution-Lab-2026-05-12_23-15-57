'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

interface Trick { key: string; name: string; pts: number; color: string; lane: number }
const TRICKS: Trick[] = [
  { key: 'ArrowLeft', name: 'KICKFLIP', pts: 100, color: '#00E5FF', lane: 0 },
  { key: 'ArrowUp', name: 'HEELFLIP', pts: 100, color: '#00FF9D', lane: 1 },
  { key: 'ArrowRight', name: '360 FLIP', pts: 200, color: '#A855F7', lane: 2 },
  { key: 'ArrowDown', name: 'GRAB', pts: 120, color: '#FFD700', lane: 3 },
];
const LANE_LABELS = ['←', '↑', '→', '↓'];

export default function SkateboardGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    const W = 960, H = 540;
    canvas.width = W; canvas.height = H;

    const bg = new Image();
    bg.src = '/backdrops/skateboarding.jpg';

    const RUN_TIME = 120;
    const hitX = 200; // hit zone x
    const speedMult = gradeRef.current?.speedMult ?? 1;

    const st: any = {
      time: RUN_TIME, score: 0, combo: 0, bestCombo: 0, misses: 0,
      notes: [] as any[], spawnT: 1.2, noteSpeed: 260 * speedMult,
      grind: null as any, grindHold: false,
      msg: '', msgT: 0, msgColor: '#FFD700', flash: 0, bail: false, bailT: 0,
      startTime: Date.now(), last: 0, particles: [] as any[], wheelSpin: 0,
      spawnGap: 1.5,
    };
    const rec = new SessionRecorder();

    const groundY = H - 110;

    const judge = (note: any) => {
      const off = Math.abs(note.x - hitX);
      if (off < 26) return { grade: 'PERFECT', mult: 1.5 };
      if (off < 56) return { grade: 'GREAT', mult: 1.0 };
      if (off < 90) return { grade: 'GOOD', mult: 0.6 };
      return null;
    };

    const doTrick = (lane: number) => {
      if (st.bail || endedRef.current) return;
      // find nearest live note in this lane
      const cands = st.notes.filter((n: any) => !n.hit && n.lane === lane && Math.abs(n.x - hitX) < 110);
      if (!cands.length) { registerMiss('WRONG INPUT'); return; }
      cands.sort((a: any, b: any) => Math.abs(a.x - hitX) - Math.abs(b.x - hitX));
      const note = cands[0];
      const j = judge(note);
      if (!j) { registerMiss('TOO EARLY'); return; }
      note.hit = true;
      st.combo++; st.bestCombo = Math.max(st.bestCombo, st.combo);
      st.misses = 0;
      rec.recordHit(j.grade === 'PERFECT'); rec.recordChain(st.combo);
      const comboMult = 1 + Math.min(st.combo, 20) * 0.05;
      const pts = Math.round(note.trick.pts * j.mult * comboMult);
      st.score += pts;
      st.msg = `${j.grade} ${note.trick.name} +${pts}`; st.msgColor = note.trick.color; st.msgT = 1.1;
      st.flash = j.grade === 'PERFECT' ? 0.12 : 0;
      st.wheelSpin = 1;
      for (let i = 0; i < 10; i++) st.particles.push({ x: hitX, y: groundY - 60, vx: (Math.random() - 0.5) * 360, vy: -Math.random() * 320, life: 0.6, color: note.trick.color });
    };

    const registerMiss = (label: string) => {
      st.combo = 0; st.misses++;
      rec.recordMiss();
      st.msg = st.misses >= 3 ? 'BAIL!' : `${label} · MISS ${st.misses}/3`; st.msgColor = '#FF3366'; st.msgT = 1.1;
      if (st.misses >= 3) { st.bail = true; st.bailT = 1.4; }
    };

    const kd = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      const t = TRICKS.findIndex((tr) => tr.key === k);
      if (t >= 0) { e.preventDefault?.(); doTrick(t); }
      if (k === ' ') { e.preventDefault?.(); st.grindHold = true; }
    };
    const ku = (e: KeyboardEvent) => { if ((e?.key ?? '') === ' ') st.grindHold = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (canvas as any).felSkate = { doTrick, grindStart: () => (st.grindHold = true), grindEnd: () => (st.grindHold = false) };

    const endRun = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const dur = Math.round((Date.now() - st.startTime) / 1000);
      const won = st.score >= 2000;
      onEndRef.current?.({ score: st.score, won, duration: dur, headline: st.bail ? 'BAILED OUT' : won ? 'PARK LEGEND RUN' : 'RUN COMPLETE', tallies: rec.tallies(), maxCombo: rec.bestChain });
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      if (st.msgT > 0) st.msgT -= dt;
      if (st.flash > 0) st.flash -= dt;
      if (st.wheelSpin > 0) st.wheelSpin -= dt;

      if (st.bail) {
        st.bailT -= dt;
        if (st.bailT <= 0) { endRun(); return; }
      } else {
        st.time -= dt;
        if (st.time <= 0) { endRun(); return; }

        // spawn notes & grind rails
        st.spawnT -= dt;
        if (st.spawnT <= 0) {
          st.spawnGap = Math.max(0.75, st.spawnGap - 0.015);
          st.spawnT = st.spawnGap + Math.random() * 0.4;
          if (Math.random() < 0.18 && !st.grind) {
            st.grind = { x: W + 40, w: 220 + Math.random() * 120, scored: 0 };
          } else {
            const trick = TRICKS[Math.floor(Math.random() * TRICKS.length)];
            st.notes.push({ x: W + 30, lane: trick.lane, trick, hit: false });
          }
        }
        for (const n of st.notes) n.x -= st.noteSpeed * dt;
        // missed notes passing hit zone
        for (const n of st.notes) {
          if (!n.hit && !n.missed && n.x < hitX - 95) { n.missed = true; registerMiss(n.trick.name); }
        }
        st.notes = st.notes.filter((n: any) => n.x > -60);
        // grind rail
        if (st.grind) {
          st.grind.x -= st.noteSpeed * dt;
          const over = st.grind.x < hitX && st.grind.x + st.grind.w > hitX;
          if (over && st.grindHold) {
            const pts = 150 * dt;
            st.grind.scored += pts; st.score += Math.round(pts * 10) / 10;
            if (Math.random() < 0.35) st.particles.push({ x: hitX + (Math.random() - 0.5) * 20, y: groundY - 34, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 180, life: 0.4, color: '#FFD700' });
          }
          if (st.grind.x + st.grind.w < hitX - 40) {
            if (st.grind.scored > 10) { st.msg = `GRIND +${Math.round(st.grind.scored)}`; st.msgColor = '#FFD700'; st.msgT = 1.0; st.combo++; }
            st.grind = null;
          }
        }
        st.score = Math.round(st.score * 10) / 10;
      }

      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; return p.life > 0; });

      // RENDER
      ctx.clearRect(0, 0, W, H);
      if (bg.complete && bg.naturalWidth > 0) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,8,0.58)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0F0F13'; ctx.fillRect(0, 0, W, H); }

      // ground
      ctx.fillStyle = 'rgba(0,229,255,0.07)'; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = '#00E5FF44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

      // hit zone
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]); ctx.strokeRect(hitX - 34, groundY - 210, 68, 200); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(hitX - 34, groundY - 210, 68, 200);

      // grind rail
      if (st.grind) {
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 5; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(st.grind.x, groundY - 26); ctx.lineTo(st.grind.x + st.grind.w, groundY - 26); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFD70088';
        ctx.fillRect(st.grind.x, groundY - 26, 4, 26); ctx.fillRect(st.grind.x + st.grind.w - 4, groundY - 26, 4, 26);
        ctx.textAlign = 'center'; ctx.font = 'bold 13px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#FFD700';
        ctx.fillText('HOLD SPACE — GRIND', st.grind.x + st.grind.w / 2, groundY - 36);
      }

      // notes
      for (const n of st.notes) {
        if (n.hit) continue;
        const laneY = groundY - 190 + n.lane * 48;
        ctx.globalAlpha = n.missed ? 0.25 : 1;
        ctx.fillStyle = 'rgba(15,15,19,0.9)';
        ctx.strokeStyle = n.trick.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(n.x, laneY, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = n.trick.color; ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace';
        ctx.fillText(LANE_LABELS[n.lane], n.x, laneY + 6);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(n.trick.name, n.x, laneY - 26);
        ctx.globalAlpha = 1;
      }

      // skater
      const px = hitX, py = groundY;
      const auraColor = gradeRef.current?.color ?? '#00E5FF';
      const agr = ctx.createRadialGradient(px, py - 55, 8, px, py - 55, 80);
      agr.addColorStop(0, `${auraColor}30`); agr.addColorStop(1, 'transparent');
      ctx.fillStyle = agr; ctx.fillRect(px - 90, py - 150, 180, 190);
      ctx.save();
      ctx.translate(px, py);
      if (st.bail) ctx.rotate(0.9);
      const crouch = st.wheelSpin > 0 ? 6 : 0;
      ctx.strokeStyle = '#EDEDF2'; ctx.fillStyle = '#EDEDF2'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.shadowColor = auraColor; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(4, -96 + crouch, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, -82 + crouch); ctx.lineTo(-2, -42 + crouch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -72 + crouch); ctx.lineTo(24, -58 + crouch); ctx.moveTo(0, -72 + crouch); ctx.lineTo(-20, -52 + crouch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -42 + crouch); ctx.lineTo(16, -14); ctx.moveTo(-2, -42 + crouch); ctx.lineTo(-18, -14); ctx.stroke();
      // board
      ctx.shadowBlur = 8; ctx.strokeStyle = '#FF3366'; ctx.lineWidth = 6;
      const boardY = -8 + (st.wheelSpin > 0 ? -Math.sin(st.wheelSpin * Math.PI) * 26 : 0);
      ctx.beginPath(); ctx.moveTo(-30, boardY); ctx.lineTo(30, boardY); ctx.stroke();
      ctx.fillStyle = '#EDEDF2'; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(-18, boardY + 7, 5, 0, Math.PI * 2); ctx.arc(18, boardY + 7, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 1.6, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
      ctx.globalAlpha = 1;

      // HUD
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.textAlign = 'center'; ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00E5FF'; ctx.fillText(String(Math.round(st.score)), W / 2 - 110, 46);
      ctx.fillStyle = st.combo >= 5 ? '#FFD700' : '#EDEDF2'; ctx.fillText(`x${st.combo}`, W / 2 + 60, 46);
      ctx.fillStyle = '#FF3366'; ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.fillText(`${Math.max(Math.ceil(st.time), 0)}s`, W / 2 + 170, 44);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Barlow Condensed", sans-serif';
      ctx.fillText('SKATE RUN · SCORE 2000 TO WIN', W / 2, 22);
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('SCORE', W / 2 - 110, 57); ctx.fillText('COMBO', W / 2 + 60, 57);
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 24);
      // miss pips
      ctx.textAlign = 'left';
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < st.misses ? '#FF3366' : 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(24 + i * 20, 24, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('BAIL METER', 16, 44);

      if (st.msgT > 0) {
        ctx.textAlign = 'center'; ctx.font = 'bold 34px "Barlow Condensed", sans-serif';
        ctx.fillStyle = st.msgColor; ctx.globalAlpha = Math.min(st.msgT, 1);
        ctx.fillText(st.msg, W / 2, H / 2 - 40); ctx.globalAlpha = 1;
      }
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (st.flash / 0.12)})`; ctx.fillRect(0, 0, W, H); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [started, prq]);

  const sk = () => (canvasRef.current as any)?.felSkate;

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">SKATE RUN</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">Hit trick prompts as they cross the zone, hold grinds on gold rails, keep the combo alive. Three straight misses and you bail.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>← KICKFLIP · ↑ HEELFLIP</span><span>→ 360 FLIP · ↓ GRAB</span>
              <span>HOLD SPACE — Grind rails</span><span>120s run · 2000 pts to win</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              DROP IN
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between gap-2 !hidden">
          <div className="flex gap-2">
            <button onClick={() => sk()?.doTrick?.(0)} className="rounded-md border border-[#00E5FF]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#00E5FF]">← KICK</button>
            <button onClick={() => sk()?.doTrick?.(1)} className="rounded-md border border-[#00FF9D]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#00FF9D]">↑ HEEL</button>
            <button onClick={() => sk()?.doTrick?.(2)} className="rounded-md border border-[#A855F7]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#A855F7]">→ 360</button>
            <button onClick={() => sk()?.doTrick?.(3)} className="rounded-md border border-[#FFD700]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#FFD700]">↓ GRAB</button>
          </div>
          <button
            onTouchStart={() => sk()?.grindStart?.()}
            onTouchEnd={() => sk()?.grindEnd?.()}
            onMouseDown={() => sk()?.grindStart?.()}
            onMouseUp={() => sk()?.grindEnd?.()}
            className="h-16 w-24 rounded-xl border border-[#FFD700]/60 bg-[#FFD700]/15 text-sm font-bold text-[#FFD700]"
          >
            GRIND
          </button>
        </div>
      )}
    </div>
  );
}
