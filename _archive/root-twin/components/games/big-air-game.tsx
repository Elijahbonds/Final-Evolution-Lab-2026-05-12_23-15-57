'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const JUMPS = 5;
const WIN_SCORE = 1100;

const TRICKS = ['INDY GRAB', 'BACKSIDE 360', 'METHOD', 'CORK 720'];

type Phase = 'charge' | 'air' | 'land' | 'msg';

export default function BigAirGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/snowboard.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    const hang = 1 + (grade.hangBonus ?? 0);

    const startTime = Date.now();
    let jump = 1;
    let score = 0;
    let phase: Phase = 'charge';
    let charging = false;
    let charge = 0;
    let airT = 0;
    let airLen = 1.5;
    let tricksHit = 0;
    let trickPromptT = 0;
    let trickActive = false;
    const rec = new SessionRecorder();
    let trickName = '';
    let landWindow = false;
    let jumpPts = 0;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;

    function beginCharge() { if (phase === 'charge' && !charging) { charging = true; charge = 0; } }
    function releaseCharge() {
      if (phase !== 'charge' || !charging) return;
      charging = false;
      airLen = (1.0 + charge * 1.6) * hang;
      airT = 0;
      tricksHit = 0;
      jumpPts = Math.round(charge * 100);
      trickActive = false;
      trickPromptT = 0.4;
      phase = 'air';
    }
    function trick() {
      if (phase !== 'air' || !trickActive) return;
      trickActive = false;
      tricksHit += 1;
      jumpPts += 90;
      rec.recordHit(true); rec.recordChain(tricksHit);
      msg = `${trickName} +90`; msgColor = '#FFD700'; msgTimer = 0.7;
      trickPromptT = 0.5 + Math.random() * 0.4;
    }
    function land() {
      if (phase !== 'air') return;
      // landing quality based on how close to end of air
      const remain = airLen - airT;
      if (remain < 0.25) { jumpPts += 60; msg = 'STOMPED IT! +60'; msgColor = '#00FF9D'; rec.recordHit(true); }
      else if (remain < 0.6) { msg = 'ROLLED THROUGH'; msgColor = '#00E5FF'; rec.recordHit(false); }
      else { jumpPts = Math.round(jumpPts * 0.4); msg = 'BAILED EARLY!'; msgColor = '#FF3366'; rec.recordMiss(); }
      score += jumpPts;
      msgTimer = 1.2;
      phase = 'msg';
    }

    function nextJump() {
      jump += 1;
      if (jump > JUMPS) { finish(); return; }
      phase = 'charge';
      charge = 0;
      charging = false;
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = score >= WIN_SCORE;
      onEndRef.current?.({
        score,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? 'BIG AIR CHAMPION — SEND IT FOREVER' : 'MORE AMPLITUDE NEXT TIME',
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        if (phase === 'charge') beginCharge();
        else if (phase === 'air') { if (trickActive) trick(); else land(); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && phase === 'charge') { e.preventDefault(); releaseCharge(); }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    (canvas as any).felBigAir = {
      down: () => { if (phase === 'charge') beginCharge(); else if (phase === 'air') { if (trickActive) trick(); else land(); } },
      up: () => { if (phase === 'charge') releaseCharge(); },
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (msgTimer > 0) msgTimer -= dt;

      if (phase === 'charge' && charging) charge = Math.min(1, charge + dt * 0.7);
      if (phase === 'air') {
        airT += dt;
        if (!trickActive) {
          trickPromptT -= dt;
          if (trickPromptT <= 0 && airLen - airT > 0.6) {
            trickActive = true;
            trickName = TRICKS[Math.floor(Math.random() * TRICKS.length)];
          }
        }
        if (airT >= airLen) {
          // auto crash landing
          jumpPts = Math.round(jumpPts * 0.3);
          score += jumpPts;
          rec.recordMiss();
          msg = 'CRASHED THE LANDING!'; msgColor = '#FF3366'; msgTimer = 1.2;
          phase = 'msg';
        }
      }
      if (phase === 'msg' && msgTimer <= 0) nextJump();

      // draw
      ctx.clearRect(0, 0, W, H);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,8,14,0.45)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0A1220'; ctx.fillRect(0, 0, W, H); }

      // kicker ramp
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(80, H - 60); ctx.lineTo(320, H - 60); ctx.lineTo(320, H - 170); ctx.closePath(); ctx.fill();

      // rider
      let rx = 200, ry = H - 120, rot = 0;
      if (phase === 'air' || (phase === 'msg' && false)) {
        const p = Math.min(airT / airLen, 1);
        rx = 320 + p * 420;
        ry = H - 170 - Math.sin(p * Math.PI) * (140 + charge * 120);
        rot = p * Math.PI * 2 * (tricksHit + 1) * 0.4;
      }
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rot);
      ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-22, 12); ctx.lineTo(22, 12); ctx.stroke(); // board
      ctx.strokeStyle = '#FFF'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -30, 9, 0, Math.PI * 2);
      ctx.moveTo(0, -21); ctx.lineTo(0, 2);
      ctx.moveTo(0, -14); ctx.lineTo(-14, -4); ctx.moveTo(0, -14); ctx.lineTo(14, -4);
      ctx.moveTo(0, 2); ctx.lineTo(-10, 12); ctx.moveTo(0, 2); ctx.lineTo(10, 12);
      ctx.stroke();
      ctx.restore();

      // charge bar
      if (phase === 'charge') {
        const px = W / 2 - 160, py = H - 60;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px, py, 320, 20);
        ctx.fillStyle = charge > 0.85 ? '#FFD700' : '#00E5FF'; ctx.fillRect(px, py, 320 * charge, 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(px, py, 320, 20);
        ctx.fillStyle = '#FFF'; ctx.font = '13px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(charging ? 'RELEASE TO LAUNCH!' : 'HOLD SPACE TO CHARGE THE KICKER', W / 2, py - 10);
      }

      if (phase === 'air') {
        if (trickActive) {
          ctx.fillStyle = '#FFD700'; ctx.font = 'bold 30px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(`${trickName} — TAP NOW!`, W / 2, 130);
        } else {
          const remain = airLen - airT;
          if (remain < 0.7) {
            ctx.fillStyle = remain < 0.25 ? '#00FF9D' : '#FFF';
            ctx.font = 'bold 24px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('TAP TO STOMP THE LANDING!', W / 2, 130);
          }
        }
      }

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)'; ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(`SCORE ${score}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center'; ctx.fillText(`JUMP ${Math.min(jump, JUMPS)}/${JUMPS}`, W / 2, 44);
      ctx.textAlign = 'right'; ctx.fillText(`TRICKS ${tricksHit}`, W * 0.8 - 16, 44);
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 34px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 40);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      delete (canvas as any).felBigAir;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0A1220]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">BIG AIR</h2>
            <p className="max-w-md text-sm text-gray-300">
              5 jumps off the mega kicker. <span className="text-[#00E5FF]">HOLD SPACE</span> to charge, release to launch. Tap when a trick flashes gold, then tap again just before touchdown to stomp the landing. Score {WIN_SCORE}+ to win.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]">DROP IN</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center !hidden">
        <button
          className="rounded-lg bg-[#00E5FF]/20 px-14 py-5 font-bold text-[#00E5FF] active:bg-[#00E5FF]/40"
          onClick={() => { /* handled via pointer events */ }}
          onPointerDown={() => (canvasRef.current as any)?.felBigAir?.down()}
          onPointerUp={() => (canvasRef.current as any)?.felBigAir?.up()}
        >
          CHARGE / TRICK / LAND
        </button>
      </div>
    </div>
  );
}
