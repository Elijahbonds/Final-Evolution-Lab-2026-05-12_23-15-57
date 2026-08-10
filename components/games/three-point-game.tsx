'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const RACKS = 5;
const BALLS_PER_RACK = 5;
const GAME_LEN = 60;
const WIN_PTS = 18;

export default function ThreePointGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = new Image();
    bg.src = '/backdrops/dunk.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    const sweet = grade.key === 'ELITE' ? 0.16 : grade.key === 'PRIMED' ? 0.13 : grade.key === 'READY' ? 0.11 : 0.09;

    const startTime = Date.now();
    let timeLeft = GAME_LEN;
    let rack = 0;
    let ball = 0;
    let pts = 0;
    let makes = 0;
    let streak = 0;
    const rec = new SessionRecorder();
    let barT = 0;
    let anim = 0; // ball flight anim 0..1, -1 idle
    let animMade = false;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;

    function isMoneyBall() { return ball === BALLS_PER_RACK - 1; }

    function shoot() {
      if (endedRef.current || anim >= 0) return;
      const p = Math.abs(Math.sin(barT));
      const err = Math.abs(p - 0.72);
      animMade = err < sweet;
      const perfect = err < sweet * 0.4;
      anim = 0;
      if (animMade) {
        const v = isMoneyBall() ? 2 : 1;
        pts += v;
        makes += 1;
        streak += 1;
        rec.recordHit(perfect); rec.recordChain(streak);
        msg = perfect ? `SWISH +${v}` : `GOOD +${v}`;
        msgColor = perfect ? '#FFD700' : '#00FF9D';
      } else {
        streak = 0;
        rec.recordMiss();
        msg = 'OFF THE IRON';
        msgColor = '#FF3366';
      }
      msgTimer = 0.8;
    }

    function advance() {
      ball += 1;
      if (ball >= BALLS_PER_RACK) {
        ball = 0;
        rack += 1;
        if (rack >= RACKS) { finish(); return; }
      }
      barT = Math.random() * Math.PI;
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const score = pts * 40 + streak * 10;
      const won = pts >= WIN_PTS;
      onEndRef.current?.({
        score,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? `${pts} PTS — RANGE UNLOCKED` : `${pts} PTS — KEEP SHOOTING`,
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); shoot(); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felThreePoint = { shoot };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!endedRef.current) {
        timeLeft -= dt;
        if (timeLeft <= 0) { finish(); return; }
      }
      if (msgTimer > 0) msgTimer -= dt;
      if (anim >= 0) {
        anim += dt * 1.6;
        if (anim >= 1) { anim = -1; advance(); if (endedRef.current) return; }
      } else {
        barT += dt * (3.0 + rack * 0.25);
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,10,0.5)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0A1020'; ctx.fillRect(0, 0, W, H); }

      // hoop
      ctx.strokeStyle = '#FF6B35'; ctx.lineWidth = 4;
      ctx.strokeRect(W / 2 - 45, 100, 90, 60);
      ctx.beginPath(); ctx.ellipse(W / 2, 168, 34, 10, 0, 0, Math.PI * 2); ctx.stroke();

      // rack markers
      for (let i = 0; i < RACKS; i++) {
        const rx = 120 + i * ((W - 240) / (RACKS - 1));
        ctx.fillStyle = i === rack ? '#00E5FF' : i < rack ? 'rgba(0,255,157,0.5)' : 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(rx, H - 150, 8, 0, Math.PI * 2); ctx.fill();
      }
      // rack balls
      const shooterX = 120 + rack * ((W - 240) / (RACKS - 1));
      for (let b = 0; b < BALLS_PER_RACK; b++) {
        if (b < ball) continue;
        const money = b === BALLS_PER_RACK - 1;
        ctx.fillStyle = money ? '#FFD700' : '#FF6B35';
        ctx.beginPath(); ctx.arc(shooterX - 30 + b * 15, H - 120, 6, 0, Math.PI * 2); ctx.fill();
      }

      // ball flight
      if (anim >= 0) {
        const p = Math.min(anim, 1);
        const bx = shooterX + (W / 2 - shooterX) * p;
        const by = H - 160 - Math.sin(p * Math.PI) * 240 - p * 90;
        ctx.fillStyle = isMoneyBall() ? '#FFD700' : '#FF6B35';
        ctx.beginPath(); ctx.arc(bx, animMade ? by : by + p * 40, 9, 0, Math.PI * 2); ctx.fill();
      } else {
        // power bar
        const px = W / 2 - 160, py = H - 70;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px, py, 320, 20);
        ctx.fillStyle = 'rgba(0,255,157,0.35)'; ctx.fillRect(px + 320 * (0.72 - sweet), py, 320 * sweet * 2, 20);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 320 * 0.72, py - 4); ctx.lineTo(px + 320 * 0.72, py + 24); ctx.stroke();
        ctx.fillStyle = '#00E5FF'; ctx.fillRect(px, py, 320 * Math.abs(Math.sin(barT)), 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(px, py, 320, 20);
        ctx.fillStyle = '#FFF'; ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(isMoneyBall() ? 'MONEY BALL — WORTH 2!' : 'SPACE AT THE GOLD LINE', W / 2, py - 10);
      }

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)'; ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(`PTS ${pts}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center'; ctx.fillText(`RACK ${rack + 1}/${RACKS} · ⏱ ${Math.ceil(timeLeft)}s`, W / 2, 44);
      ctx.textAlign = 'right';
      ctx.fillStyle = streak >= 3 ? '#FFD700' : '#FFF';
      ctx.fillText(`STREAK x${streak}`, W * 0.8 - 16, 44);
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 32px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 40);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felThreePoint;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0A1020]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">THREE-POINT SHOOTOUT</h2>
            <p className="max-w-md text-sm text-gray-300">
              5 racks, 5 balls each, 60 seconds. Tap <span className="text-[#00E5FF]">SPACE</span> to release at the gold line. The last ball of every rack is a <span className="text-[#FFD700]">MONEY BALL</span> worth 2. Hit {WIN_PTS}+ points to win.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]">LIGHT IT UP</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center !hidden">
        <button className="rounded-lg bg-[#00E5FF]/20 px-12 py-4 font-bold text-[#00E5FF] active:bg-[#00E5FF]/40" onClick={() => (canvasRef.current as any)?.felThreePoint?.shoot()}>SHOOT</button>
      </div>
    </div>
  );
}
