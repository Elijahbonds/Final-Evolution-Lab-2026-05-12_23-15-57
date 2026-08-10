'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const TARGET = 7;

type Dir = 'left' | 'right';

export default function TiebreakGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/tennis.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    const reactBase = grade.key === 'ELITE' ? 1.15 : grade.key === 'PRIMED' ? 1.05 : grade.key === 'READY' ? 0.95 : 0.85;

    const startTime = Date.now();
    let myPts = 0;
    let aiPts = 0;
    let rallies = 0;
    let bestRally = 0;
    let rally = 0;
    const rec = new SessionRecorder();
    // ball state
    let incoming: Dir = 'left';
    let ballT = 0;
    let ballLen = 1.3;
    let awaiting = false; // waiting for player return
    let gap = 1.0;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;

    function serve() {
      incoming = Math.random() > 0.5 ? 'left' : 'right';
      ballLen = Math.max(0.55, (1.25 - rally * 0.07) * reactBase);
      ballT = 0;
      awaiting = true;
    }

    function point(mine: boolean, text: string, color: string) {
      if (mine) { myPts += 1; rec.recordHit(); rec.recordChain(rally); } else { aiPts += 1; rec.recordMiss(); }
      bestRally = Math.max(bestRally, rally);
      rallies += rally;
      rally = 0;
      msg = text; msgColor = color; msgTimer = 1.0;
      awaiting = false;
      gap = 1.1;
      if (myPts >= TARGET || aiPts >= TARGET) finish();
    }

    function swing(dir: Dir) {
      if (endedRef.current || !awaiting) return;
      const inWindow = ballT > ballLen * 0.62;
      if (dir === incoming && inWindow) {
        rally += 1;
        // chance AI misses grows with rally
        if (Math.random() < 0.16 + rally * 0.05) {
          point(true, rally >= 4 ? 'WINNER DOWN THE LINE!' : 'AI NETS IT! POINT YOU', '#00FF9D');
        } else {
          msg = `RETURNED x${rally}`; msgColor = '#00E5FF'; msgTimer = 0.5;
          serve();
        }
      } else if (dir !== incoming) {
        point(false, 'WRONG SIDE! POINT AI', '#FF3366');
      } else {
        point(false, 'SWUNG EARLY! POINT AI', '#FF3366');
      }
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = myPts > aiPts;
      onEndRef.current?.({
        score: myPts * 120 + bestRally * 30,
        opponentScore: aiPts * 120,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? `${myPts}-${aiPts} — TIEBREAK ICE IN THE VEINS` : `${myPts}-${aiPts} — NEXT BREAKER IS YOURS`,
        tallies: rec.tallies(), maxCombo: bestRally,
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') { e.preventDefault(); swing('left'); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); swing('right'); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felTiebreak = { swing };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (msgTimer > 0) msgTimer -= dt;

      if (!endedRef.current) {
        if (awaiting) {
          ballT += dt;
          if (ballT >= ballLen) point(false, 'ACE PAST YOU!', '#FF3366');
        } else {
          gap -= dt;
          if (gap <= 0) serve();
        }
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,10,8,0.55)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0B1F14'; ctx.fillRect(0, 0, W, H); }

      // court
      ctx.fillStyle = 'rgba(13,51,39,0.8)';
      ctx.fillRect(W / 2 - 300, 140, 600, 320);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 300, 140, 600, 320);
      ctx.beginPath(); ctx.moveTo(W / 2 - 300, 300); ctx.lineTo(W / 2 + 300, 300); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, 140); ctx.lineTo(W / 2, 460); ctx.stroke();

      // ball incoming
      if (awaiting) {
        const p = ballT / ballLen;
        const bx = incoming === 'left' ? W / 2 - 180 : W / 2 + 180;
        const by = 170 + p * 240;
        ctx.fillStyle = '#DFFF4F';
        ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
        // hit window indicator
        if (p > 0.62) {
          ctx.strokeStyle = '#00FF9D'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(bx, by, 18, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 16px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(incoming === 'left' ? '← COMING LEFT' : 'COMING RIGHT →', bx, 158);
      }

      // player paddle marker
      ctx.fillStyle = '#00E5FF';
      ctx.fillRect(W / 2 - 40, 470, 80, 8);

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)'; ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(0,255,157,0.35)'; ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(`YOU ${myPts}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center'; ctx.fillText(`TIEBREAK TO ${TARGET}`, W / 2, 44);
      ctx.textAlign = 'right'; ctx.fillText(`AI ${aiPts}`, W * 0.8 - 16, 44);
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 32px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, 110);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felTiebreak;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0B1F14]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">TIEBREAK BLITZ</h2>
            <p className="max-w-md text-sm text-gray-300">
              Sudden-death tiebreak to {TARGET}. Balls fire left or right — swing with <span className="text-[#00FF9D]">← / →</span> when the green ring appears. Long rallies force AI errors. Wrong side or early swing = point lost.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00FF9D] px-8 py-3 font-bold text-black transition hover:bg-[#00d986]">FIRST SERVE</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-3 !hidden">
        <button className="rounded-lg bg-[#00FF9D]/20 px-12 py-4 font-bold text-[#00FF9D] active:bg-[#00FF9D]/40" onClick={() => (canvasRef.current as any)?.felTiebreak?.swing('left')}>← SWING</button>
        <button className="rounded-lg bg-[#00FF9D]/20 px-12 py-4 font-bold text-[#00FF9D] active:bg-[#00FF9D]/40" onClick={() => (canvasRef.current as any)?.felTiebreak?.swing('right')}>SWING →</button>
      </div>
    </div>
  );
}
