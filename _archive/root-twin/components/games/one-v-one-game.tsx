'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

const W = 960;
const H = 540;
const TARGET = 11;

type Phase = 'offense-aim' | 'offense-shot' | 'defense' | 'msg';
type Zone = 'left' | 'center' | 'right';
const ZONES: Zone[] = ['left', 'center', 'right'];
const ZONE_LABEL: Record<Zone, string> = { left: '← LEFT', center: '↑ MIDDLE', right: 'RIGHT →' };

export default function OneVOneGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    let phase: Phase = 'offense-aim';
    let myScore = 0;
    let aiScore = 0;
    let steals = 0;
    const rec = new SessionRecorder();
    let aimT = 0; // reticle oscillation
    let barT = 0;
    let aimLocked = 0;
    let defenseChoice: Zone | null = null;
    let aiAttack: Zone = 'center';
    let defenseTimer = 0;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;
    let nextPhase: Phase = 'offense-aim';

    function showMsg(text: string, color: string, after: Phase) {
      msg = text; msgColor = color; msgTimer = 1.2; nextPhase = after; phase = 'msg';
    }

    function startDefense() {
      aiAttack = ZONES[Math.floor(Math.random() * 3)];
      defenseChoice = null;
      defenseTimer = 1.5;
      phase = 'defense';
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = myScore > aiScore;
      onEndRef.current?.({
        score: myScore * 100 + steals * 50,
        opponentScore: aiScore * 100,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? `${myScore}-${aiScore} — KING OF THE COURT` : `${myScore}-${aiScore} — RUN IT BACK`,
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    function checkWin(after: Phase) {
      if (myScore >= TARGET || aiScore >= TARGET) { finish(); return true; }
      nextPhase = after;
      return false;
    }

    function act() {
      if (endedRef.current) return;
      if (phase === 'offense-aim') {
        aimLocked = Math.sin(aimT);
        barT = 0;
        phase = 'offense-shot';
      } else if (phase === 'offense-shot') {
        const p = Math.abs(Math.sin(barT));
        const aimErr = Math.abs(aimLocked);
        const powErr = Math.abs(p - 0.75);
        const good = aimErr < 0.35 && powErr < sweet;
        if (good) {
          const deep = aimErr < 0.12 && powErr < sweet * 0.5;
          myScore += deep ? 2 : 1;
          rec.recordHit(deep);
          if (!checkWin('defense')) showMsg(deep ? 'DEEP BUCKET +2' : 'BUCKET +1', deep ? '#FFD700' : '#00FF9D', 'defense');
        } else {
          rec.recordMiss(); showMsg('BRICK! AI BALL', '#FF3366', 'defense');
        }
      }
    }

    function guard(z: Zone) {
      if (endedRef.current || phase !== 'defense' || defenseChoice) return;
      defenseChoice = z;
      if (z === aiAttack) {
        steals += 1;
        rec.recordDodge();
        showMsg('LOCKDOWN! STEAL +50', '#00E5FF', 'offense-aim');
      } else {
        aiScore += 1;
        rec.recordMiss();
        if (!checkWin('offense-aim')) showMsg('AI SCORES', '#FF3366', 'offense-aim');
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); act(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); guard('left'); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); guard('center'); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); guard('right'); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felOneVOne = { act, guard };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (phase === 'offense-aim') aimT += dt * 3.0;
      if (phase === 'offense-shot') barT += dt * 3.4;
      if (phase === 'defense') {
        defenseTimer -= dt;
        if (defenseTimer <= 0 && !defenseChoice) {
          aiScore += 1;
          rec.recordMiss();
          if (!checkWin('offense-aim')) showMsg('TOO SLOW — AI SCORES', '#FF3366', 'offense-aim');
        }
      }
      if (phase === 'msg') {
        msgTimer -= dt;
        if (msgTimer <= 0) {
          phase = nextPhase;
          if (phase === 'defense') startDefense();
          if (phase === 'offense-aim') aimT = Math.random() * Math.PI;
        }
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,10,0.5)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0A1020'; ctx.fillRect(0, 0, W, H); }

      // hoop
      ctx.strokeStyle = '#FF6B35'; ctx.lineWidth = 4;
      ctx.strokeRect(W / 2 - 45, 110, 90, 60);
      ctx.beginPath(); ctx.ellipse(W / 2, 178, 34, 10, 0, 0, Math.PI * 2); ctx.stroke();

      if (phase === 'offense-aim' || phase === 'offense-shot') {
        const cur = phase === 'offense-aim' ? Math.sin(aimT) : aimLocked;
        const rx = W / 2 + cur * 160;
        ctx.strokeStyle = Math.abs(cur) < 0.35 ? '#00FF9D' : '#FF3366';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(rx, 178, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx - 28, 178); ctx.lineTo(rx + 28, 178); ctx.moveTo(rx, 150); ctx.lineTo(rx, 206); ctx.stroke();
        ctx.fillStyle = '#FFF'; ctx.font = '13px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText(phase === 'offense-aim' ? 'TAP TO LOCK AIM' : 'TAP AT THE GOLD LINE', W / 2, H - 110);
      }
      if (phase === 'offense-shot') {
        const px = W / 2 - 160, py = H - 90;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px, py, 320, 20);
        ctx.fillStyle = 'rgba(0,255,157,0.35)'; ctx.fillRect(px + 320 * (0.75 - sweet), py, 320 * sweet * 2, 20);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px + 320 * 0.75, py - 4); ctx.lineTo(px + 320 * 0.75, py + 24); ctx.stroke();
        ctx.fillStyle = '#00E5FF'; ctx.fillRect(px, py, 320 * Math.abs(Math.sin(barT)), 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(px, py, 320, 20);
      }
      if (phase === 'defense') {
        ctx.fillStyle = '#FF3366'; ctx.font = 'bold 26px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('DEFENSE! GUARD THE DRIVE', W / 2, H / 2 - 60);
        // telegraph hint flashes toward attack side
        const hintX = aiAttack === 'left' ? W / 2 - 150 : aiAttack === 'right' ? W / 2 + 150 : W / 2;
        if (Math.floor(defenseTimer * 6) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,51,102,0.5)';
          ctx.beginPath(); ctx.arc(hintX, H / 2, 26, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#FFF'; ctx.font = '14px "JetBrains Mono", monospace';
        ctx.fillText('← / ↑ / → TO GUARD', W / 2, H / 2 + 60);
        // timer bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - 120, H / 2 + 80, 240, 10);
        ctx.fillStyle = '#FFD700'; ctx.fillRect(W / 2 - 120, H / 2 + 80, 240 * Math.max(0, defenseTimer / 1.5), 10);
      }

      // HUD
      ctx.fillStyle = 'rgba(5,5,5,0.72)'; ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(`YOU ${myScore}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center'; ctx.fillText(`FIRST TO ${TARGET}`, W / 2, 44);
      ctx.textAlign = 'right'; ctx.fillText(`AI ${aiScore}`, W * 0.8 - 16, 44);
      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (phase === 'msg' && msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 34px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2);
      }

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felOneVOne;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0A1020]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">1V1 HOOPS</h2>
            <p className="max-w-md text-sm text-gray-300">
              First to {TARGET}. On offense: tap <span className="text-[#00E5FF]">SPACE</span> to lock aim, tap again on the gold line — dead-center swishes count 2. On defense: read the flash and guard with <span className="text-[#FF3366]">← ↑ →</span>.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#00E5FF] px-8 py-3 font-bold text-black transition hover:bg-[#00c9e0]">CHECK BALL</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-2 !hidden">
        <button className="rounded-lg bg-[#FF3366]/20 px-5 py-4 font-bold text-[#FF3366] active:bg-[#FF3366]/40" onClick={() => (canvasRef.current as any)?.felOneVOne?.guard('left')}>←</button>
        <button className="rounded-lg bg-[#00E5FF]/20 px-8 py-4 font-bold text-[#00E5FF] active:bg-[#00E5FF]/40" onClick={() => (canvasRef.current as any)?.felOneVOne?.act()}>SHOOT</button>
        <button className="rounded-lg bg-[#FF3366]/20 px-5 py-4 font-bold text-[#FF3366] active:bg-[#FF3366]/40" onClick={() => (canvasRef.current as any)?.felOneVOne?.guard('center')}>↑</button>
        <button className="rounded-lg bg-[#FF3366]/20 px-5 py-4 font-bold text-[#FF3366] active:bg-[#FF3366]/40" onClick={() => (canvasRef.current as any)?.felOneVOne?.guard('right')}>→</button>
      </div>
    </div>
  );
}
