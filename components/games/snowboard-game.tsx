'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

// Slalom descent: steer through gates, hit ramps and tap SPACE at the apex for tricks. 5 crashes ends the run.
export default function SnowboardGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/snowboard.jpg';

    const speedMult = gradeRef.current?.speedMult ?? 1;
    const riderY = H - 130;

    const st: any = {
      time: 90, score: 0, gates: 0, misses: 0, combo: 0,
      x: W / 2, vx: 0, steer: 0,
      objs: [] as any[], spawnT: 0.6, scroll: 300 * speedMult,
      air: 0, airT: 0, trickReady: false, trickDone: '',
      msg: '', msgT: 0, msgColor: '#FFD700', flash: 0, shake: 0,
      startTime: Date.now(), last: 0, particles: [] as any[],
    };
    const rec = new SessionRecorder();

    const kd = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      if (k === 'ArrowLeft') { e.preventDefault?.(); st.steer = -1; }
      if (k === 'ArrowRight') { e.preventDefault?.(); st.steer = 1; }
      if (k === ' ') { e.preventDefault?.(); doTrick(); }
    };
    const ku = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      if ((k === 'ArrowLeft' && st.steer === -1) || (k === 'ArrowRight' && st.steer === 1)) st.steer = 0;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (canvas as any).felSnow = {
      left: (on: boolean) => (st.steer = on ? -1 : st.steer === -1 ? 0 : st.steer),
      right: (on: boolean) => (st.steer = on ? 1 : st.steer === 1 ? 0 : st.steer),
      trick: () => doTrick(),
    };

    const say = (m: string, c: string) => { st.msg = m; st.msgColor = c; st.msgT = 1.2; };

    const doTrick = () => {
      if (st.air <= 0 || !st.trickReady) return;
      st.trickReady = false;
      const names = ['METHOD GRAB', 'BACKSIDE 360', 'TAIL GRAB', 'INDY SPIN'];
      const name = names[Math.floor(Math.random() * names.length)];
      const pts = 150 + Math.round((gradeRef.current?.hangBonus ?? 0) * 100);
      st.score += pts; st.combo++;
      rec.recordHit(); rec.recordChain(st.combo);
      st.trickDone = name;
      say(`${name} +${pts}`, '#A855F7'); st.flash = 0.12;
      for (let i = 0; i < 12; i++) st.particles.push({ x: st.x, y: riderY - 60, vx: (Math.random() - 0.5) * 380, vy: -Math.random() * 280, life: 0.7, color: '#A855F7' });
    };

    const crash = (label: string) => {
      st.misses++; st.combo = 0; st.shake = 0.35;
      rec.recordMiss();
      say(st.misses >= 5 ? 'WIPEOUT!' : `${label} · ${st.misses}/5`, '#FF3366');
      if (st.misses >= 5) endRun(true);
    };

    const endRun = (crashed = false) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const dur = Math.round((Date.now() - st.startTime) / 1000);
      const won = !crashed && st.score >= 1500;
      onEndRef.current?.({ score: Math.round(st.score), won, duration: dur, headline: crashed ? 'WIPED OUT' : won ? 'MOUNTAIN MASTERED' : 'RUN COMPLETE', tallies: rec.tallies(), maxCombo: rec.bestChain });
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      if (st.msgT > 0) st.msgT -= dt;
      if (st.flash > 0) st.flash -= dt;
      if (st.shake > 0) st.shake -= dt;

      st.time -= dt;
      if (st.time <= 0) { endRun(); return; }

      // steering
      st.vx += st.steer * 900 * dt;
      st.vx *= Math.pow(0.001, dt); // damping
      st.x = Math.max(70, Math.min(W - 70, st.x + st.vx * dt));

      // air
      if (st.air > 0) { st.airT += dt; if (st.airT > 0.9) { st.air = 0; st.trickReady = false; } }

      // spawn gates & ramps
      st.spawnT -= dt;
      if (st.spawnT <= 0) {
        st.spawnT = 1.15 + Math.random() * 0.5;
        if (Math.random() < 0.22) {
          st.objs.push({ type: 'ramp', x: 120 + Math.random() * (W - 240), y: -40 });
        } else {
          const gapX = 130 + Math.random() * (W - 260);
          st.objs.push({ type: 'gate', x: gapX, y: -40, gap: 130, passed: false });
        }
      }
      for (const o of st.objs) o.y += st.scroll * dt;
      for (const o of st.objs) {
        if (o.y > riderY - 8 && o.y < riderY + 20 && !o.passed) {
          o.passed = true;
          if (o.type === 'gate') {
            if (Math.abs(st.x - o.x) < o.gap / 2) {
              st.gates++; st.combo++;
              rec.recordHit(); rec.recordChain(st.combo);
              const pts = 100 + Math.min(st.combo, 10) * 10;
              st.score += pts; say(`GATE +${pts}`, '#00E5FF');
            } else if (st.air <= 0) crash('MISSED GATE');
          } else if (o.type === 'ramp') {
            if (Math.abs(st.x - o.x) < 70 && st.air <= 0) {
              st.air = 1; st.airT = 0; st.trickReady = true;
              say('AIR! TAP TRICK', '#FFD700');
            }
          }
        }
      }
      st.objs = st.objs.filter((o: any) => o.y < H + 60);

      // spray particles
      if (Math.random() < 0.5 && st.air <= 0) st.particles.push({ x: st.x + (Math.random() - 0.5) * 20, y: riderY + 10, vx: -st.vx * 0.4 + (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80, life: 0.4, color: '#EDEDF2' });
      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0; });

      // RENDER
      const sx = st.shake > 0 ? (Math.random() - 0.5) * 10 * st.shake : 0;
      ctx.save(); ctx.translate(sx, 0);
      ctx.clearRect(-20, 0, W + 40, H);
      if (bg.complete && bg.naturalWidth > 0) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(8,10,16,0.45)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0E1420'; ctx.fillRect(0, 0, W, H); }
      // piste
      ctx.fillStyle = 'rgba(230,240,255,0.10)';
      ctx.beginPath(); ctx.moveTo(W * 0.32, 0); ctx.lineTo(W * 0.68, 0); ctx.lineTo(W - 30, H); ctx.lineTo(30, H); ctx.closePath(); ctx.fill();

      // objects
      for (const o of st.objs) {
        const persp = 0.35 + 0.65 * (o.y / H);
        if (o.type === 'gate') {
          const half = (o.gap / 2) * persp + 20;
          for (const side of [-1, 1]) {
            const fx = o.x + side * half;
            ctx.strokeStyle = side < 0 ? '#FF3366' : '#00E5FF'; ctx.lineWidth = 4 * persp;
            ctx.beginPath(); ctx.moveTo(fx, o.y - 28 * persp); ctx.lineTo(fx, o.y); ctx.stroke();
            ctx.fillStyle = side < 0 ? '#FF3366' : '#00E5FF';
            ctx.fillRect(fx - (side < 0 ? 16 * persp : 0), o.y - 28 * persp, 16 * persp, 10 * persp);
          }
        } else {
          ctx.fillStyle = 'rgba(255,215,0,0.85)';
          ctx.beginPath(); ctx.moveTo(o.x - 55 * persp, o.y); ctx.lineTo(o.x + 55 * persp, o.y); ctx.lineTo(o.x + 30 * persp, o.y - 22 * persp); ctx.lineTo(o.x - 30 * persp, o.y - 22 * persp); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#0F0F13'; ctx.font = `bold ${Math.round(12 * persp + 4)}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center';
          ctx.fillText('RAMP', o.x, o.y - 6 * persp);
        }
      }

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 1.8, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;

      // rider
      const ry = riderY - (st.air > 0 ? Math.sin(Math.min(st.airT / 0.9, 1) * Math.PI) * 70 : 0);
      const lean = st.vx / 500;
      const auraColor = gradeRef.current?.color ?? '#00E5FF';
      ctx.save();
      ctx.translate(st.x, ry);
      ctx.rotate(lean * 0.5 + (st.air > 0 ? st.airT * 2.2 : 0) * (st.trickDone ? 1 : 0) * 0);
      ctx.rotate(lean * 0.4);
      ctx.strokeStyle = '#EDEDF2'; ctx.fillStyle = '#EDEDF2'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.shadowColor = auraColor; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(0, -72, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(18, -38); ctx.moveTo(0, -52); ctx.lineTo(-18, -38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(12, -4); ctx.moveTo(0, -28); ctx.lineTo(-12, -4); ctx.stroke();
      ctx.strokeStyle = '#FF3366'; ctx.lineWidth = 5; ctx.shadowColor = '#FF3366';
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke();
      ctx.restore();

      // HUD
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.textAlign = 'center'; ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00E5FF'; ctx.fillText(String(Math.round(st.score)), W / 2 - 110, 46);
      ctx.fillStyle = '#00FF9D'; ctx.fillText(String(st.gates), W / 2 + 40, 46);
      ctx.fillStyle = '#FF3366'; ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.fillText(`${Math.max(Math.ceil(st.time), 0)}s`, W / 2 + 160, 44);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Barlow Condensed", sans-serif';
      ctx.fillText('SLALOM DESCENT · SCORE 1500 TO WIN', W / 2, 22);
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('SCORE', W / 2 - 110, 57); ctx.fillText('GATES', W / 2 + 40, 57);
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 24);
      // crash pips
      ctx.textAlign = 'left';
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i < st.misses ? '#FF3366' : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(24 + i * 18, 24, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText('CRASH METER', 16, 44);

      if (st.msgT > 0) {
        ctx.textAlign = 'center'; ctx.font = 'bold 34px "Barlow Condensed", sans-serif';
        ctx.fillStyle = st.msgColor; ctx.globalAlpha = Math.min(st.msgT, 1);
        ctx.fillText(st.msg, W / 2, H / 2 - 40); ctx.globalAlpha = 1;
      }
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (st.flash / 0.12)})`; ctx.fillRect(0, 0, W, H); }
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [started, prq]);

  const sn = () => (canvasRef.current as any)?.felSnow;

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">SLALOM DESCENT</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">Carve through the gates, launch off gold ramps, and tap trick at the top of your air. Five crashes and the run is over.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>← → — steer</span><span>SPACE — trick in the air</span>
              <span>Gates +100 with combo bonus</span><span>90s run · 1500 pts to win</span>
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
            <button onTouchStart={() => sn()?.left?.(true)} onTouchEnd={() => sn()?.left?.(false)} onMouseDown={() => sn()?.left?.(true)} onMouseUp={() => sn()?.left?.(false)} className="h-14 w-20 rounded-xl border border-[#00E5FF]/50 bg-[#16161A] text-lg font-bold text-[#00E5FF]">←</button>
            <button onTouchStart={() => sn()?.right?.(true)} onTouchEnd={() => sn()?.right?.(false)} onMouseDown={() => sn()?.right?.(true)} onMouseUp={() => sn()?.right?.(false)} className="h-14 w-20 rounded-xl border border-[#00E5FF]/50 bg-[#16161A] text-lg font-bold text-[#00E5FF]">→</button>
          </div>
          <button onClick={() => sn()?.trick?.()} className="h-14 w-28 rounded-xl border border-[#A855F7]/60 bg-[#A855F7]/15 text-sm font-bold text-[#A855F7]">TRICK</button>
        </div>
      )}
    </div>
  );
}
