'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const TARGET = 21;
const GAME_LEN = 90;

type Phase = 'pass' | 'shot' | 'msg';

export default function ThreeVThreeGame({ grade, prq, onEnd, gamepad }: GameProps) {
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

    const sweet = grade.key === 'ELITE' ? 0.2 : grade.key === 'PRIMED' ? 0.17 : grade.key === 'READY' ? 0.14 : 0.12;

    const startTime = Date.now();
    let timeLeft = GAME_LEN;
    let myScore = 0;
    let aiScore = 0;
    let assists = 0;
    const rec = new SessionRecorder();
    let phase: Phase = 'pass';
    let openLane = Math.floor(Math.random() * 3); // 0,1,2
    let passTimer = 2.0;
    let barT = 0;
    let shotIsOpen = false;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;
    let aiTick = 0;

    function newPossession() {
      openLane = Math.floor(Math.random() * 3);
      passTimer = 2.0;
      phase = 'pass';
    }

    function showMsg(text: string, color: string) {
      msg = text; msgColor = color; msgTimer = 1.0; phase = 'msg';
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = myScore > aiScore;
      onEndRef.current?.({
        score: myScore * 100 + assists * 30,
        opponentScore: aiScore * 100,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? `${myScore}-${aiScore} — STREETBALL LEGENDS` : `${myScore}-${aiScore} — NEXT GAME, SAME COURT`,
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    function pass(lane: number) {
      if (endedRef.current || phase !== 'pass') return;
      if (lane === openLane) {
        assists += 1;
        rec.recordDodge();
        shotIsOpen = true;
        barT = 0;
        phase = 'shot';
      } else {
        showMsg('PICKED OFF! TURNOVER', '#FF3366');
        aiScore += 2;
        rec.recordMiss();
      }
    }

    function shoot() {
      if (endedRef.current || phase !== 'shot') return;
      const p = Math.abs(Math.sin(barT));
      const err = Math.abs(p - 0.75);
      const windowSize = shotIsOpen ? sweet * 1.4 : sweet;
      if (err < windowSize * 0.45) { myScore += 3; rec.recordHit(true); showMsg('SPLASH! +3', '#FFD700'); }
      else if (err < windowSize) { myScore += 2; rec.recordHit(); showMsg('AND ONE! +2', '#00FF9D'); }
      else { showMsg('RIMMED OUT', '#FF3366'); aiScore += 1; rec.recordMiss(); }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' || e.code === 'ArrowLeft') { e.preventDefault(); pass(0); }
      else if (e.code === 'Digit2' || e.code === 'ArrowUp') { e.preventDefault(); pass(1); }
      else if (e.code === 'Digit3' || e.code === 'ArrowRight') { e.preventDefault(); pass(2); }
      else if (e.code === 'Space') { e.preventDefault(); shoot(); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felThreeVThree = { pass, shoot };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!endedRef.current) {
        timeLeft -= dt;
        if (timeLeft <= 0 || myScore >= TARGET || aiScore >= TARGET) { finish(); return; }
      }
      aiTick += dt;
      if (aiTick > 8) { aiTick = 0; aiScore += Math.random() > 0.5 ? 2 : 1; }

      if (phase === 'pass') {
        passTimer -= dt;
        if (passTimer <= 0) { showMsg('SHOT CLOCK! TURNOVER', '#FF3366'); aiScore += 1; }
      }
      if (phase === 'shot') barT += dt * 3.2;
      if (phase === 'msg') {
        msgTimer -= dt;
        if (msgTimer <= 0) newPossession();
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,10,0.5)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0A1020'; ctx.fillRect(0, 0, W, H); }

      // teammates in 3 lanes
      if (phase === 'pass') {
        for (let i = 0; i < 3; i++) {
          const lx = W / 2 + (i - 1) * 240;
          const ly = H / 2 + 20;
          const open = i === openLane;
          // defender in front unless open
          if (!open) {
            ctx.strokeStyle = '#FF3366'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(lx, ly - 60, 10, 0, Math.PI * 2);
            ctx.moveTo(lx, ly - 50); ctx.lineTo(lx, ly - 20);
            ctx.moveTo(lx - 12, ly - 40); ctx.lineTo(lx + 12, ly - 40); ctx.stroke();
          }
          ctx.strokeStyle = open ? '#00FF9D' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(lx, ly, 11, 0, Math.PI * 2);
          ctx.moveTo(lx, ly + 11); ctx.lineTo(lx, ly + 44);
          ctx.moveTo(lx - 14, ly + 24); ctx.lineTo(lx + 14, ly + 24); ctx.stroke();
          if (open && Math.floor(passTimer * 5) % 2 === 0) {
            ctx.fillStyle = '#00FF9D'; ctx.font = 'bold 16px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('OPEN!', lx, ly + 70);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '13px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
          ctx.fillText(`${i + 1}`, lx, ly - 90);
        }
        ctx.fillStyle = '#FFF'; ctx.font = '14px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText('PASS TO THE OPEN MAN — 1 / 2 / 3', W / 2, H - 60);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - 120, H - 44, 240, 10);
        ctx.fillStyle = '#FFD700'; ctx.fillRect(W / 2 - 120, H - 44, 240 * Math.max(0, passTimer / 2), 10);
      }

      if (phase === 'shot') {
        ctx.strokeStyle = '#FF6B35'; ctx.lineWidth = 4;
        ctx.strokeRect(W / 2 - 45, 110, 90, 60);
        ctx.beginPath(); ctx.ellipse(W / 2, 178, 34, 10, 0, 0, Math.PI * 2); ctx.stroke();
        const px = W / 2 - 160, py = H - 90;
        const windowSize = sweet * 1.4;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px, py, 320, 20);
        ctx.fillStyle = 'rgba(0,255,157,0.35)'; ctx.fillRect(px + 320 * (0.75 - windowSize), py, 320 * windowSize * 2, 20);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 320 * 0.75, py - 4); ctx.lineTo(px + 320 * 0.75, py + 24); ctx.stroke();
        ctx.fillStyle = '#00E5FF'; ctx.fillRect(px, py, 320 * Math.abs(Math.sin(barT)), 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(px, py, 320, 20);
        ctx.fillStyle = '#FFF'; ctx.font = '13px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText('CATCH & SHOOT — SPACE AT THE GOLD LINE', W / 2, py - 12);
      }

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)'; ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(`SQUAD ${myScore}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center'; ctx.fillText(`⏱ ${Math.ceil(timeLeft)}s · TO ${TARGET}`, W / 2, 44);
      ctx.textAlign = 'right'; ctx.fillText(`RIVALS ${aiScore}`, W * 0.8 - 16, 44);
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (phase === 'msg' && msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 34px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 80);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felThreeVThree;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0A1020]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">3V3 STREETBALL</h2>
            <p className="max-w-md text-sm text-gray-300">
              Find the open man with <span className="text-[#00FF9D]">1 / 2 / 3</span> before the shot clock, then catch-and-shoot with <span className="text-[#00E5FF]">SPACE</span> on the gold line. Wrong pass = turnover. First to {TARGET} or best score in 90s.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]">BALL UP</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-2 !hidden">
        {[0, 1, 2].map((i) => (
          <button key={i} className="rounded-lg bg-[#00FF9D]/20 px-6 py-4 font-bold text-[#00FF9D] active:bg-[#00FF9D]/40" onClick={() => (canvasRef.current as any)?.felThreeVThree?.pass(i)}>{i + 1}</button>
        ))}
        <button className="rounded-lg bg-[#00E5FF]/20 px-7 py-4 font-bold text-[#00E5FF] active:bg-[#00E5FF]/40" onClick={() => (canvasRef.current as any)?.felThreeVThree?.shoot()}>SHOOT</button>
      </div>
    </div>
  );
}
