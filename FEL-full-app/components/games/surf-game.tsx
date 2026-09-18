'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

// Surf Break: ride the pocket. Keep your board inside the moving sweet spot to build flow; hit CUTBACK prompts for bonus. Balance empties = wipeout.
export default function SurfGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/surf.jpg';

    const speedMult = gradeRef.current?.speedMult ?? 1;
    const rideY = H - 150;

    const st: any = {
      time: 90, score: 0, flow: 0, balance: 100, combo: 0,
      x: W / 2, steer: 0,
      pocketX: W / 2, pocketT: 0, pocketW: 150,
      cutback: null as any, cutbackT: 3 + Math.random() * 3,
      msg: '', msgT: 0, msgColor: '#FFD700', flash: 0,
      startTime: Date.now(), last: 0, particles: [] as any[], wob: 0,
    };
    const rec = new SessionRecorder();

    const kd = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      if (k === 'ArrowLeft') { e.preventDefault?.(); st.steer = -1; }
      if (k === 'ArrowRight') { e.preventDefault?.(); st.steer = 1; }
      if (k === ' ') { e.preventDefault?.(); doCutback(); }
    };
    const ku = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      if ((k === 'ArrowLeft' && st.steer === -1) || (k === 'ArrowRight' && st.steer === 1)) st.steer = 0;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (canvas as any).felSurf = {
      left: (on: boolean) => (st.steer = on ? -1 : st.steer === -1 ? 0 : st.steer),
      right: (on: boolean) => (st.steer = on ? 1 : st.steer === 1 ? 0 : st.steer),
      cutback: () => doCutback(),
    };

    const say = (m: string, c: string) => { st.msg = m; st.msgColor = c; st.msgT = 1.2; };

    const doCutback = () => {
      if (!st.cutback) return;
      const rem = st.cutback.t;
      st.cutback = null;
      if (rem > 0.55) { say('TOO EARLY', '#FF3366'); st.balance -= 10; st.combo = 0; rec.recordMiss(); return; }
      const perfect = rem > 0.2;
      const pts = perfect ? 200 : 120;
      st.score += pts; st.combo++;
      rec.recordHit(perfect); rec.recordChain(st.combo);
      say(`${perfect ? 'PERFECT ' : ''}CUTBACK +${pts}`, '#A855F7'); st.flash = 0.12;
      for (let i = 0; i < 14; i++) st.particles.push({ x: st.x, y: rideY, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 320, life: 0.7, color: '#00E5FF' });
    };

    const endRide = (wiped = false) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const dur = Math.round((Date.now() - st.startTime) / 1000);
      const won = !wiped && st.score >= 1200;
      onEndRef.current?.({ score: Math.round(st.score), won, duration: dur, headline: wiped ? 'WIPEOUT' : won ? 'WAVE OF THE DAY' : 'RIDE OVER', tallies: rec.tallies(), maxCombo: rec.bestChain });
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      if (st.msgT > 0) st.msgT -= dt;
      if (st.flash > 0) st.flash -= dt;
      st.wob += dt;

      st.time -= dt;
      if (st.time <= 0) { endRide(); return; }

      // pocket drifts (sine + wander), shrinks over time
      st.pocketT += dt * (0.5 + st.time < 45 ? 0.75 : 0.5) * speedMult;
      st.pocketX = W / 2 + Math.sin(st.pocketT * 1.1) * 250 + Math.sin(st.pocketT * 2.7) * 90;
      st.pocketW = Math.max(96, 150 - (90 - st.time) * 0.5);

      // steering
      st.x = Math.max(60, Math.min(W - 60, st.x + st.steer * 420 * dt));

      const inPocket = Math.abs(st.x - st.pocketX) < st.pocketW / 2;
      if (inPocket) {
        st.flow = Math.min(st.flow + dt * 24, 100);
        st.balance = Math.min(st.balance + dt * 6, 100);
        st.score += dt * (20 + st.flow * 0.35);
        if (Math.random() < 0.4) st.particles.push({ x: st.x + (Math.random() - 0.5) * 30, y: rideY + 12, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 100, life: 0.4, color: '#00E5FF' });
      } else {
        st.flow = Math.max(st.flow - dt * 35, 0);
        st.balance -= dt * 16;
        if (st.balance <= 0) { endRide(true); return; }
      }

      // cutback prompts
      if (!st.cutback) {
        st.cutbackT -= dt;
        if (st.cutbackT <= 0 && inPocket) { st.cutback = { t: 0.9 }; st.cutbackT = 4 + Math.random() * 4; }
      } else {
        st.cutback.t -= dt;
        if (st.cutback.t <= 0) { st.cutback = null; st.combo = 0; rec.recordMiss(); say('MISSED SECTION', '#FF3366'); st.balance -= 8; }
      }

      st.score = Math.round(st.score * 10) / 10;
      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; return p.life > 0; });

      // RENDER
      ctx.clearRect(0, 0, W, H);
      if (bg.complete && bg.naturalWidth > 0) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(4,10,14,0.45)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#06131C'; ctx.fillRect(0, 0, W, H); }

      // wave face band
      const waveTop = rideY - 90;
      const grd = ctx.createLinearGradient(0, waveTop, 0, H);
      grd.addColorStop(0, 'rgba(0,229,255,0.10)'); grd.addColorStop(1, 'rgba(0,80,120,0.35)');
      ctx.fillStyle = grd; ctx.fillRect(0, waveTop, W, H - waveTop);
      // foam line
      ctx.strokeStyle = 'rgba(237,237,242,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, waveTop + Math.sin(x * 0.03 + st.wob * 3) * 7);
      ctx.stroke();

      // pocket zone
      ctx.fillStyle = 'rgba(0,255,157,0.13)';
      ctx.fillRect(st.pocketX - st.pocketW / 2, waveTop, st.pocketW, H - waveTop);
      ctx.strokeStyle = '#00FF9D66'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.strokeRect(st.pocketX - st.pocketW / 2, waveTop, st.pocketW, H - waveTop); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.font = 'bold 12px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#00FF9D';
      ctx.fillText('THE POCKET', st.pocketX, waveTop - 8);

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 1.8, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;

      // surfer
      const lean = st.steer * 0.35 + Math.sin(st.wob * 2.4) * 0.05;
      const auraColor = gradeRef.current?.color ?? '#00E5FF';
      ctx.save();
      ctx.translate(st.x, rideY);
      ctx.rotate(lean);
      ctx.strokeStyle = '#EDEDF2'; ctx.fillStyle = '#EDEDF2'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.shadowColor = auraColor; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(2, -74, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -62); ctx.lineTo(-2, -30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -54); ctx.lineTo(20, -42); ctx.moveTo(0, -54); ctx.lineTo(-18, -60); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -30); ctx.lineTo(14, -4); ctx.moveTo(-2, -30); ctx.lineTo(-16, -4); ctx.stroke();
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 5; ctx.shadowColor = '#FFD700';
      ctx.beginPath(); ctx.moveTo(-30, 2); ctx.quadraticCurveTo(0, 8, 32, 0); ctx.stroke();
      ctx.restore();

      // cutback prompt
      if (st.cutback) {
        const prog = st.cutback.t / 0.9;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(st.x, rideY - 120, 32, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = prog < 0.62 && prog > 0.2 ? '#FFD700' : '#A855F7';
        ctx.beginPath(); ctx.arc(st.x, rideY - 120, 32, -Math.PI / 2, -Math.PI / 2 + (1 - prog) * Math.PI * 2); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 14px "Barlow Condensed", sans-serif';
        ctx.fillText('CUTBACK!', st.x, rideY - 116);
      }

      // HUD
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.textAlign = 'center'; ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00E5FF'; ctx.fillText(String(Math.round(st.score)), W / 2 - 110, 46);
      ctx.fillStyle = '#FF3366'; ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.fillText(`${Math.max(Math.ceil(st.time), 0)}s`, W / 2 + 160, 44);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Barlow Condensed", sans-serif';
      ctx.fillText('SURF BREAK · SCORE 1200 TO WIN', W / 2, 22);
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('SCORE', W / 2 - 110, 57);
      // flow bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - 40, 34, 120, 10);
      ctx.fillStyle = '#00FF9D'; ctx.fillRect(W / 2 - 40, 34, 120 * (st.flow / 100), 10);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('FLOW', W / 2 + 20, 57);
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 24);
      // balance bar
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(16, 16, 140, 12);
      ctx.fillStyle = st.balance > 40 ? '#00E5FF' : '#FF3366'; ctx.fillRect(16, 16, 140 * (Math.max(st.balance, 0) / 100), 12);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('BALANCE', 16, 42);

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

  const sf = () => (canvasRef.current as any)?.felSurf;

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">SURF BREAK</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">Stay in the moving pocket to build flow and score. Nail CUTBACK prompts for big bonuses. Fall out of the pocket and your balance drains — empty means wipeout.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>← → — carve</span><span>SPACE — cutback on prompt</span>
              <span>Flow multiplies your score</span><span>90s ride · 1200 pts to win</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              PADDLE OUT
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between gap-2 !hidden">
          <div className="flex gap-2">
            <button onTouchStart={() => sf()?.left?.(true)} onTouchEnd={() => sf()?.left?.(false)} onMouseDown={() => sf()?.left?.(true)} onMouseUp={() => sf()?.left?.(false)} className="h-14 w-20 rounded-xl border border-[#00E5FF]/50 bg-[#16161A] text-lg font-bold text-[#00E5FF]">←</button>
            <button onTouchStart={() => sf()?.right?.(true)} onTouchEnd={() => sf()?.right?.(false)} onMouseDown={() => sf()?.right?.(true)} onMouseUp={() => sf()?.right?.(false)} className="h-14 w-20 rounded-xl border border-[#00E5FF]/50 bg-[#16161A] text-lg font-bold text-[#00E5FF]">→</button>
          </div>
          <button onClick={() => sf()?.cutback?.()} className="h-14 w-28 rounded-xl border border-[#A855F7]/60 bg-[#A855F7]/15 text-sm font-bold text-[#A855F7]">CUTBACK</button>
        </div>
      )}
    </div>
  );
}
