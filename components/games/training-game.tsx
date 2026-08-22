'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const GAME_LEN = 60;
const WIN_SCORE = 1000;

const EXERCISES = [
  { name: 'BENCH PRESS', zoneSize: 0.2, speed: 0.85 },
  { name: 'SQUATS', zoneSize: 0.16, speed: 1.0 },
  { name: 'BICEP CURLS', zoneSize: 0.13, speed: 1.2 },
  { name: 'OVERHEAD PRESS', zoneSize: 0.11, speed: 1.35 },
];

export default function TrainingGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/training.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    const zoneBonus = grade.key === 'ELITE' ? 1.25 : grade.key === 'PRIMED' ? 1.15 : grade.key === 'READY' ? 1.08 : 1.0;

    const startTime = Date.now();
    let timeLeft = GAME_LEN;
    let score = 0;
    let reps = 0;
    let streak = 0;
    const rec = new SessionRecorder();
    let bestStreak = 0;
    let exIdx = 0;
    let repsThisEx = 0;
    let holding = false;
    let power = 0; // 0..1 grows while holding
    let zoneLo = 0.6;
    let zoneHi = 0.8;
    let msg = '';
    let msgColor = '#FFFFFF';
    let msgTimer = 0;
    let liftAnim = 0;

    function rollZone() {
      const ex = EXERCISES[exIdx];
      const size = ex.zoneSize * zoneBonus;
      const lo = 0.45 + Math.random() * (0.95 - size - 0.45);
      zoneLo = lo;
      zoneHi = lo + size;
    }
    rollZone();

    function startHold() {
      if (endedRef.current || holding) return;
      holding = true;
      power = 0;
    }

    function endHold() {
      if (endedRef.current || !holding) return;
      holding = false;
      const mid = (zoneLo + zoneHi) / 2;
      if (power >= zoneLo && power <= zoneHi) {
        const perfect = Math.abs(power - mid) <= (zoneHi - zoneLo) * 0.18;
        const pts = perfect ? 80 : 50;
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        rec.recordHit(perfect); rec.recordChain(streak);
        const bonus = streak >= 3 ? 20 : 0;
        score += pts + bonus;
        reps += 1;
        repsThisEx += 1;
        msg = perfect ? `PERFECT REP +${pts + bonus}` : `CLEAN REP +${pts + bonus}`;
        msgColor = perfect ? '#FFD700' : '#00FF9D';
        liftAnim = 1;
        if (repsThisEx >= 4 && exIdx < EXERCISES.length - 1) {
          exIdx += 1;
          repsThisEx = 0;
          msg = `NEXT: ${EXERCISES[exIdx].name}`;
          msgColor = '#00E5FF';
        }
      } else if (power > zoneHi) {
        streak = 0; rec.recordMiss();
        msg = 'OVEREXTENDED! FORM BREAK';
        msgColor = '#FF3366';
      } else {
        streak = 0; rec.recordMiss();
        msg = 'TOO WEAK — DIG DEEPER';
        msgColor = '#FF3366';
      }
      msgTimer = 1.0;
      power = 0;
      rollZone();
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = score >= WIN_SCORE;
      onEndRef.current?.({
        score,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? `${reps} REPS — IRON PARADISE CONQUERED` : `${reps} REPS — THE IRON ALWAYS WINS`,
        tallies: rec.tallies(), maxCombo: bestStreak,
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startHold(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); endHold(); }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    (canvas as any).felTrain = { start: startHold, end: endHold };

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
      if (liftAnim > 0) liftAnim = Math.max(0, liftAnim - dt * 2.2);

      if (holding) {
        power = Math.min(1, power + dt * 0.55 * EXERCISES[exIdx].speed);
        if (power >= 1) {
          // auto-fail on max hold
          endHold();
        }
      }

      // ===== draw =====
      ctx.clearRect(0, 0, W, H);
      if (bgReady) {
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.fillStyle = 'rgba(10,6,4,0.5)';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#1A1008';
        ctx.fillRect(0, 0, W, H);
      }

      // lifter figure
      const lx = W / 2;
      const ly = H - 120;
      const barY = ly - 60 - (holding ? power * 70 : liftAnim * 70);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(lx, ly - 46, 13, 0, Math.PI * 2);
      ctx.moveTo(lx, ly - 33);
      ctx.lineTo(lx, ly);
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - 18, ly + 40);
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 18, ly + 40);
      // arms to bar
      ctx.moveTo(lx, ly - 28);
      ctx.lineTo(lx - 40, barY);
      ctx.moveTo(lx, ly - 28);
      ctx.lineTo(lx + 40, barY);
      ctx.stroke();
      // barbell
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(lx - 110, barY);
      ctx.lineTo(lx + 110, barY);
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.strokeStyle = '#666';
      for (const side of [-1, 1]) {
        ctx.fillRect(lx + side * 110 - 8, barY - 24, 16, 48);
        ctx.strokeRect(lx + side * 110 - 8, barY - 24, 16, 48);
        ctx.fillRect(lx + side * 128 - 6, barY - 16, 12, 32);
      }

      // power meter (vertical, right side)
      const mx = W - 110;
      const my = 100;
      const mh = 330;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(mx, my, 44, mh);
      // green zone
      ctx.fillStyle = 'rgba(0,255,157,0.35)';
      const zTop = my + mh * (1 - zoneHi);
      ctx.fillRect(mx, zTop, 44, mh * (zoneHi - zoneLo));
      ctx.strokeStyle = '#00FF9D';
      ctx.lineWidth = 2;
      ctx.strokeRect(mx, zTop, 44, mh * (zoneHi - zoneLo));
      // fill
      ctx.fillStyle = power > zoneHi ? '#FF3366' : '#00E5FF';
      ctx.fillRect(mx, my + mh * (1 - power), 44, mh * power);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeRect(mx, my, 44, mh);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('POWER', mx + 22, my - 10);
      ctx.fillText('RELEASE', mx + 22, zTop - 6);

      // exercise label
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 28px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(EXERCISES[exIdx].name, W / 2, 110);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.fillText(`SET ${repsThisEx}/4`, W / 2, 132);

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)';
      ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,215,0,0.4)';
      ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${score}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center';
      ctx.fillText(`⏱ ${Math.ceil(timeLeft)}s`, W / 2, 44);
      ctx.textAlign = 'right';
      ctx.fillStyle = streak >= 3 ? '#FFD700' : '#FFFFFF';
      ctx.fillText(`REPS ${reps} · STREAK x${streak}`, W * 0.8 - 16, 44);

      ctx.fillStyle = 'rgba(0,229,255,0.8)';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (msgTimer > 0) {
        ctx.fillStyle = msgColor;
        ctx.font = 'bold 32px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 60);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      delete (canvas as any).felTrain;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#1A1008]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">IRON PARADISE</h2>
            <p className="max-w-md text-sm text-gray-300">
              60 seconds at Muscle Beach. <span className="text-[#FFD700]">HOLD SPACE</span> to build lift power, release inside the green zone for a clean rep. Center of the zone = PERFECT. Exercises get harder as you go. Score {WIN_SCORE}+ to win.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="rounded-lg bg-[#FFD700] px-8 py-3 font-bold text-black transition hover:bg-[#e6c200]"
            >
              CHALK UP
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center !hidden">
        <button
          className="rounded-lg bg-[#FFD700]/20 px-14 py-5 font-bold text-[#FFD700] active:bg-[#FFD700]/40"
          onClick={() => { /* hold handled via pointer events */ }}
          onPointerDown={() => (canvasRef.current as any)?.felTrain?.start()}
          onPointerUp={() => (canvasRef.current as any)?.felTrain?.end()}
          onPointerLeave={() => (canvasRef.current as any)?.felTrain?.end()}
        >
          HOLD TO LIFT
        </button>
      </div>
    </div>
  );
}
