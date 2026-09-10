'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';
import { makeSprintRace, SPRINT_TUNING } from '@/lib/feel/cores/sprint-skin';

// M10 Row 1 retrofit — this 2D surface now runs on the M9 SprintCore
// (RhythmCadence): READY→SET→GO gate with REAL false starts, cadence-window
// scoring, and same-side stumbles. All feel numbers live in SPRINT_TUNING
// (// TUNE(elijah)); this component keeps its own rendering + track art.

const W = 960;
const H = 540;
const RACE_DIST = SPRINT_TUNING.raceDistanceM; // meters (core-owned)
const WIN_TIME = 13.0;

export default function SprintGame({ grade, prq, onEnd, gamepad }: GameProps) {
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

    const startTime = Date.now();
    const rec = new SessionRecorder();
    let taps = 0;
    let stumbles = 0;
    let lastSide: 'L' | 'R' | null = null;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;

    // Photo-finish beat (QC Retention): when the runner crosses the line we hold
    // a frozen frame showing the margin vs the rival before ending the race.
    let photoT = -1;            // <0 = not triggered; >=0 = seconds of hold left
    let photoMargin = 0;        // seconds ahead (+) / behind (-) the rival
    let photoClose = false;     // true when it was a genuine photo finish
    let photoTime = 0;          // captured finish time to report on end

    // AI rival (component-owned, unchanged pacing)
    let aiDist = 0;
    const aiSpeed = 7.4; // ~13.5s pace

    // The M9 headless core drives the race: gate, cadence, physics, finish.
    // NOTE: the core fires onFinish synchronously inside tick(); instead of
    // ending immediately we enter the photo-finish hold and end after it.
    const core = makeSprintRace(undefined, {
      onFinish: (timeS) => enterPhoto(timeS),
    });

    function enterPhoto(timeS: number) {
      if (photoT >= 0 || endedRef.current) return;
      photoTime = timeS;
      const rivalRemaining = Math.max(0, RACE_DIST - aiDist);
      const rivalEta = timeS + rivalRemaining / aiSpeed;
      photoMargin = rivalEta - timeS;              // >0 => player crossed first
      photoClose = Math.abs(photoMargin) < 0.35;   // TUNE(elijah) photo-finish window
      photoT = photoClose ? 1.5 : 0.7;             // TUNE(elijah) hold durations
    }

    function finish(timeS: number) {
      if (endedRef.current) return;
      endedRef.current = true;
      const raceTime = timeS;
      const won = raceTime <= WIN_TIME && core.state.distanceM >= RACE_DIST;
      const score = Math.max(0, Math.round((20 - raceTime) * 120) - stumbles * 40);
      onEndRef.current?.({
        score,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: `${raceTime.toFixed(2)}s — ${won ? 'BLAZING SPEED, NEW PB!' : 'CHASE THAT SUB-13'}`,
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    function pressStep(side: 'L' | 'R') {
      if (endedRef.current) return;
      const beforeFalse = core.state.falseStarts;
      core.step(side);
      const st = core.state;
      if (st.falseStarts > beforeFalse) {
        stumbles += 1;
        rec.recordMiss();
        msg = 'FALSE START!'; msgColor = '#FF3366'; msgTimer = 0.9;
        lastSide = null;
      } else if (st.lastStep === 'STUMBLE') {
        stumbles += 1;
        rec.recordMiss();
        msg = 'STUMBLE!'; msgColor = '#FF3366'; msgTimer = 0.5;
      } else {
        taps += 1;
        rec.recordHit(); rec.recordChain(taps);
        lastSide = side;
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); pressStep('L'); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); pressStep('R'); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felSprint = { step: (s: 'left' | 'right') => pressStep(s === 'left' ? 'L' : 'R') };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dtMs = Math.min(now - last, 50);
      last = now;
      if (msgTimer > 0) msgTimer -= dtMs / 1000;

      if (photoT < 0) core.tick(dtMs); // freeze the sim during the photo-finish hold
      const st = core.state;
      const racing = (st.phase === 'Go' || st.phase === 'Run') && photoT < 0;
      if (racing) aiDist += aiSpeed * (dtMs / 1000);

      // Safety net: enter the hold if the core somehow passed the line without
      // firing onFinish (e.g. long overrun).
      if (photoT < 0 && !endedRef.current && st.timeS > 25) enterPhoto(st.timeS);
      if (photoT >= 0) {
        photoT -= dtMs / 1000;
        if (photoT <= 0 && !endedRef.current) { finish(photoTime); return; }
      }

      const dist = st.distanceM;
      const speed = st.speed;
      const raceTime = st.timeS;
      const nextExpected: 'L' | 'R' = lastSide === 'L' ? 'R' : 'L';

      // draw
      ctx.clearRect(0, 0, W, H);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(10,6,4,0.5)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#1A1008'; ctx.fillRect(0, 0, W, H); }

      // track lanes
      ctx.fillStyle = 'rgba(180,80,40,0.4)';
      ctx.fillRect(60, H - 240, W - 120, 180);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.strokeRect(60, H - 240, W - 120, 180);
      ctx.beginPath(); ctx.moveTo(60, H - 150); ctx.lineTo(W - 60, H - 150); ctx.stroke();
      // finish line
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(W - 90, H - 240, 8, 180);

      // runners
      const px = 80 + (dist / RACE_DIST) * (W - 180);
      const ax = 80 + (Math.min(aiDist, RACE_DIST) / RACE_DIST) * (W - 180);
      const bob = Math.sin(now / 60) * (speed / 4);
      // player
      ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px, H - 205 + bob, 9, 0, Math.PI * 2);
      ctx.moveTo(px, H - 196 + bob); ctx.lineTo(px, H - 172 + bob);
      ctx.moveTo(px, H - 188 + bob); ctx.lineTo(px - 12, H - 180 + bob); ctx.moveTo(px, H - 188 + bob); ctx.lineTo(px + 12, H - 182 + bob);
      ctx.moveTo(px, H - 172 + bob); ctx.lineTo(px - 10 - bob, H - 154); ctx.moveTo(px, H - 172 + bob); ctx.lineTo(px + 10 + bob, H - 154);
      ctx.stroke();
      // AI
      ctx.strokeStyle = '#FF3366'; ctx.lineWidth = 4;
      const abob = Math.sin(now / 70 + 2) * 1.6;
      ctx.beginPath();
      ctx.arc(ax, H - 115 + abob, 9, 0, Math.PI * 2);
      ctx.moveTo(ax, H - 106 + abob); ctx.lineTo(ax, H - 82 + abob);
      ctx.moveTo(ax, H - 98 + abob); ctx.lineTo(ax - 12, H - 90 + abob); ctx.moveTo(ax, H - 98 + abob); ctx.lineTo(ax + 12, H - 92 + abob);
      ctx.moveTo(ax, H - 82 + abob); ctx.lineTo(ax - 10, H - 64); ctx.moveTo(ax, H - 82 + abob); ctx.lineTo(ax + 10, H - 64);
      ctx.stroke();

      if (photoT >= 0) {
        // ---- Photo-finish freeze --------------------------------------
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = photoClose ? '#FFD700' : (photoMargin >= 0 ? '#00FF9D' : '#FF3366');
        ctx.font = 'bold 62px "Barlow Condensed", sans-serif';
        ctx.fillText(photoClose ? 'PHOTO FINISH!' : (photoMargin >= 0 ? 'AT THE LINE' : 'PIPPED!'), W / 2, H / 2 - 18);
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 24px "JetBrains Mono", monospace';
        const marginTxt = photoMargin >= 0
          ? `WON BY ${Math.abs(photoMargin).toFixed(2)}s`
          : `LOST BY ${Math.abs(photoMargin).toFixed(2)}s`;
        ctx.fillText(marginTxt, W / 2, H / 2 + 26);
      } else if (!racing) {
        const gate = st.phase === 'Ready' ? 'ON YOUR MARKS' : st.phase === 'Set' ? 'SET' : 'GO!';
        ctx.fillStyle = st.phase === 'Set' ? '#FF3366' : '#FFD700';
        ctx.font = 'bold 64px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(gate, W / 2, H / 2 - 40);
        ctx.fillStyle = '#FFF'; ctx.font = '15px "JetBrains Mono", monospace';
        ctx.fillText('ALTERNATE ← → — DON\u0027T JUMP THE GUN', W / 2, H / 2 + 10);
      } else {
        // next-step indicator
        ctx.fillStyle = '#00FF9D'; ctx.font = 'bold 30px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(nextExpected === 'L' ? '← LEFT' : 'RIGHT →', W / 2, H - 30);
      }

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)'; ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,215,0,0.4)'; ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(`${dist.toFixed(0)}m / ${RACE_DIST}m`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center'; ctx.fillText(`⏱ ${raceTime.toFixed(2)}s`, W / 2, 44);
      ctx.textAlign = 'right'; ctx.fillText(`SPD ${speed.toFixed(1)} m/s`, W * 0.8 - 16, 44);
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 32px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 80);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felSprint;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#1A1008]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">BEACH SPRINT</h2>
            <p className="max-w-md text-sm text-gray-300">
              100m dash on the boardwalk. Wait for the gun — tap before <span className="text-[#FF3366]">GO</span> and it&apos;s a false start. Alternate <span className="text-[#00FF9D]">← →</span> in rhythm to build speed; mistime a step and you stumble. Clock under {WIN_TIME.toFixed(0)}s to win.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#FFD700] px-8 py-3 font-bold text-black transition hover:bg-[#e6c200]">ON YOUR MARKS</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-3 !hidden">
        <button className="rounded-lg bg-[#FFD700]/20 px-14 py-5 font-bold text-[#FFD700] active:bg-[#FFD700]/40" onClick={() => (canvasRef.current as any)?.felSprint?.step('left')}>← STEP</button>
        <button className="rounded-lg bg-[#FFD700]/20 px-14 py-5 font-bold text-[#FFD700] active:bg-[#FFD700]/40" onClick={() => (canvasRef.current as any)?.felSprint?.step('right')}>STEP →</button>
      </div>
    </div>
  );
}
