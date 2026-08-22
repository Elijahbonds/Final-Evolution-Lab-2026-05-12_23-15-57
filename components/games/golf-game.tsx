'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const TOTAL_SHOTS = 9;
const WIN_SCORE = 550;

type Phase = 'aim' | 'power' | 'flight' | 'result';

export default function GolfGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/golf.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    // grade helps steady the aim marker
    const steadiness = grade.key === 'ELITE' ? 0.7 : grade.key === 'PRIMED' ? 0.8 : grade.key === 'READY' ? 0.9 : 1.0;

    const startTime = Date.now();
    let phase: Phase = 'aim';
    let shot = 1;
    let score = 0;
    let combo = 0;
    let msg = '';
    let msgColor = '#FFFFFF';
    let msgTimer = 0;

    // aim marker oscillates left-right; target center = wind offset
    let aimT = 0;
    let aimLocked = 0; // -1..1 locked offset from center
    // power bar oscillates 0..1
    let powerT = 0;
    let powerLocked = 0;
    // wind -1..1 (shifts ideal aim)
    let wind = (Math.random() * 2 - 1) * 0.6;
    // flight
    let flightT = 0;
    let ballX = W / 2;
    let ballY = H - 70;
    let landDist = 0; // meters from pin
    let resultTimer = 0;
    const rec = new SessionRecorder();

    const idealPower = () => 0.72 + Math.random() * 0; // fixed sweet spot at 0.72

    function act() {
      if (endedRef.current) return;
      if (phase === 'aim') {
        aimLocked = Math.sin(aimT);
        phase = 'power';
        powerT = 0;
      } else if (phase === 'power') {
        powerLocked = Math.abs(Math.sin(powerT));
        phase = 'flight';
        flightT = 0;
        // compute landing error
        const aimErr = Math.abs(aimLocked - wind * 0.5); // ideal aim compensates wind
        const powErr = Math.abs(powerLocked - 0.72);
        landDist = Math.round((aimErr * 22 + powErr * 40) * 10) / 10;
      }
    }

    function scoreShot() {
      let pts = 10;
      let label = 'ON THE GREEN';
      let color = '#9CA3AF';
      if (landDist <= 3) { pts = 100; label = 'BIRDIE ZONE! +100'; color = '#FFD700'; combo += 1; rec.recordHit(true); rec.recordChain(combo); }
      else if (landDist <= 8) { pts = 60; label = 'GREAT SHOT +60'; color = '#00FF9D'; combo = 0; rec.recordHit(); }
      else if (landDist <= 15) { pts = 30; label = 'SOLID +30'; color = '#00E5FF'; combo = 0; rec.recordHit(); }
      else { label = 'ROUGH +10'; color = '#9CA3AF'; combo = 0; rec.recordMiss(); }
      if (combo >= 2) { pts += 25; label += ` STREAK +25`; }
      score += pts;
      msg = label;
      msgColor = color;
      msgTimer = 1.4;
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = score >= WIN_SCORE;
      onEndRef.current?.({
        score,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? 'CARD OF THE DAY — LINKS CONQUERED' : 'TOUGH ROUND — BACK TO THE RANGE',
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); act(); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felGolf = { act };

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (msgTimer > 0) msgTimer -= dt;

      if (phase === 'aim') aimT += dt * 2.6 * steadiness;
      if (phase === 'power') powerT += dt * 3.2 * steadiness;
      if (phase === 'flight') {
        flightT += dt;
        const p = Math.min(flightT / 1.4, 1);
        ballX = W / 2 + (aimLocked - wind * 0.5) * 180 * p;
        ballY = H - 70 - Math.sin(p * Math.PI) * 260 - p * 150;
        if (p >= 1) {
          phase = 'result';
          scoreShot();
          resultTimer = 1.5;
        }
      }
      if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (shot >= TOTAL_SHOTS) { finish(); return; }
          shot += 1;
          wind = (Math.random() * 2 - 1) * (0.5 + shot * 0.06);
          aimT = Math.random() * Math.PI;
          phase = 'aim';
          ballX = W / 2;
          ballY = H - 70;
        }
      }

      // ===== draw =====
      ctx.clearRect(0, 0, W, H);
      if (bgReady) {
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.fillStyle = 'rgba(5,10,8,0.45)';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#0B1F14';
        ctx.fillRect(0, 0, W, H);
      }

      // fairway strip
      ctx.fillStyle = 'rgba(20,80,45,0.55)';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 190, H);
      ctx.lineTo(W / 2 - 60, 150);
      ctx.lineTo(W / 2 + 60, 150);
      ctx.lineTo(W / 2 + 190, H);
      ctx.closePath();
      ctx.fill();

      // green + pin
      const pinX = W / 2 - wind * 0.5 * 0; // pin visually centered
      ctx.fillStyle = 'rgba(40,140,80,0.8)';
      ctx.beginPath();
      ctx.ellipse(W / 2, 175, 85, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 175);
      ctx.lineTo(W / 2, 118);
      ctx.stroke();
      ctx.fillStyle = '#FF3366';
      ctx.beginPath();
      ctx.moveTo(W / 2, 118);
      ctx.lineTo(W / 2 + 22, 126);
      ctx.lineTo(W / 2, 134);
      ctx.closePath();
      ctx.fill();

      // ball
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ballX, ballY, phase === 'flight' ? 7 : 8, 0, Math.PI * 2);
      ctx.fill();

      // aim arc
      if (phase === 'aim') {
        const cur = Math.sin(aimT);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 180, H - 130);
        ctx.quadraticCurveTo(W / 2, H - 200, W / 2 + 180, H - 130);
        ctx.stroke();
        const ax = W / 2 + cur * 180;
        const ay = H - 130 - Math.cos(cur * Math.PI / 2) * 60;
        ctx.fillStyle = '#00E5FF';
        ctx.beginPath();
        ctx.moveTo(ax, ay - 16);
        ctx.lineTo(ax - 10, ay + 4);
        ctx.lineTo(ax + 10, ay + 4);
        ctx.closePath();
        ctx.fill();
        // ideal marker (compensate wind)
        const ix = W / 2 + wind * 0.5 * 180;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ix, H - 205);
        ctx.lineTo(ix, H - 175);
        ctx.stroke();
        ctx.fillStyle = '#FFD700';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AIM HERE', ix, H - 212);
      }

      // power bar
      if (phase === 'power') {
        const px = W / 2 - 160;
        const py = H - 60;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(px, py, 320, 22);
        // sweet spot at 0.72
        ctx.fillStyle = 'rgba(0,255,157,0.35)';
        ctx.fillRect(px + 320 * 0.64, py, 320 * 0.16, 22);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 320 * 0.72, py - 4);
        ctx.lineTo(px + 320 * 0.72, py + 26);
        ctx.stroke();
        const cur = Math.abs(Math.sin(powerT));
        ctx.fillStyle = '#00E5FF';
        ctx.fillRect(px, py, 320 * cur, 22);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.strokeRect(px, py, 320, 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('POWER — TAP AT THE GOLD LINE', W / 2, py - 12);
      }

      // result distance
      if (phase === 'result') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${landDist.toFixed(1)}m FROM THE PIN`, W / 2, 230);
      }

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)';
      ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(0,229,255,0.35)';
      ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${score}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center';
      ctx.fillText(`SHOT ${shot}/${TOTAL_SHOTS}`, W / 2, 44);
      // wind
      ctx.textAlign = 'right';
      const wdir = wind > 0 ? '→' : '←';
      ctx.fillStyle = Math.abs(wind) > 0.5 ? '#FF3366' : '#00FF9D';
      ctx.fillText(`WIND ${wdir} ${Math.abs(wind * 10).toFixed(0)}`, W * 0.8 - 16, 44);

      ctx.fillStyle = 'rgba(0,229,255,0.8)';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (msgTimer > 0) {
        ctx.fillStyle = msgColor;
        ctx.font = 'bold 30px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 40);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felGolf;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0B1F14]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">LINKS CHALLENGE</h2>
            <p className="max-w-md text-sm text-gray-300">
              9 shots at the coastal links. Tap <span className="text-[#00E5FF]">SPACE</span> to lock your aim on the gold marker (watch the wind!), then tap again to stop the power bar at the gold line. Land inside 3m for BIRDIE points. Score {WIN_SCORE}+ to win.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]"
            >
              TEE OFF
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-3 !hidden">
        <button
          className="rounded-lg bg-[#00E5FF]/20 px-12 py-4 font-bold text-[#00E5FF] active:bg-[#00E5FF]/40"
          onClick={() => (canvasRef.current as any)?.felGolf?.act()}
        >
          SWING
        </button>
      </div>
    </div>
  );
}
