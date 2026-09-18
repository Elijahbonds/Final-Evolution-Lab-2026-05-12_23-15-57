'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';

interface PitchType { name: string; speed: number; wobble: number; color: string }
const PITCHES: PitchType[] = [
  { name: 'FASTBALL', speed: 1.25, wobble: 0, color: '#FF3366' },
  { name: 'CURVEBALL', speed: 0.85, wobble: 46, color: '#A855F7' },
  { name: 'CHANGEUP', speed: 0.68, wobble: 14, color: '#FFD700' },
];

// Home Run Derby: 10 outs. Non-HR contact or miss = out. Most homers + distance score.
export default function BaseballGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/baseball.jpg';

    const speedMult = gradeRef.current?.speedMult ?? 1;
    const plateX = 240, plateY = H - 130; // batter zone
    const mound = { x: 760, y: 300 };

    const st: any = {
      outs: 0, homers: 0, totalDist: 0, best: 0,
      phase: 'windup', // windup | pitch | swing | result | flight
      windT: 1.2, pitch: null as any, pitchT: 0,
      swing: 0, swungAt: -1,
      hit: null as any,
      msg: '', msgT: 0, msgColor: '#FFD700', flash: 0,
      startTime: Date.now(), last: 0, particles: [] as any[],
    };

    const newPitch = () => {
      const p = PITCHES[Math.floor(Math.random() * PITCHES.length)];
      st.pitch = { type: p, t: 0 };
      st.phase = 'pitch'; st.swungAt = -1; st.swing = 0;
    };

    const doSwing = () => {
      if (endedRef.current) return;
      if (st.phase !== 'pitch' || st.swungAt >= 0) return;
      st.swungAt = st.pitch.t;
      st.swing = 0.25;
      // contact quality: ball reaches plate at t=1
      const off = Math.abs(st.pitch.t - 0.88);
      let result: string; let dist = 0;
      if (off < 0.045) { result = 'PERFECT'; dist = 125 + Math.random() * 35 + (gradeRef.current?.hangBonus ?? 0) * 40; }
      else if (off < 0.09) { result = 'SOLID'; dist = 95 + Math.random() * 40; }
      else if (off < 0.16) { result = 'CLIPPED'; dist = 45 + Math.random() * 45; }
      else { result = 'WHIFF'; dist = 0; }
      st.pendingResult = { result, dist: Math.round(dist) };
    };

    const kd = (e: KeyboardEvent) => { if ((e?.key ?? '') === ' ') { e.preventDefault?.(); doSwing(); } };
    window.addEventListener('keydown', kd);
    (canvas as any).felBaseball = { swing: doSwing };

    const rec = new SessionRecorder();
    const say = (m: string, c: string) => { st.msg = m; st.msgColor = c; st.msgT = 1.5; };

    const resolvePitch = () => {
      const pr = st.pendingResult;
      st.pendingResult = null;
      if (!pr || pr.dist === 0) {
        st.outs++; rec.recordMiss();
        say(pr ? 'SWING AND A MISS' : 'CALLED STRIKE', '#FF3366');
        st.phase = 'result'; st.resultT = 1.2;
        return;
      }
      const hr = pr.dist >= 120;
      st.totalDist += pr.dist; st.best = Math.max(st.best, pr.dist);
      if (hr) {
        st.homers++; rec.recordHit(true);
        say(`HOME RUN! ${pr.dist}m`, '#00FF9D'); st.flash = 0.18;
        for (let i = 0; i < 20; i++) st.particles.push({ x: plateX + 40, y: plateY - 80, vx: (Math.random() - 0.2) * 460, vy: -Math.random() * 420, life: 0.9, color: i % 2 ? '#FFD700' : '#00FF9D' });
      } else {
        st.outs++; rec.recordMiss();
        say(`${pr.result} — ${pr.dist}m · CAUGHT`, '#FFD700');
      }
      st.hit = { t: 0, dist: pr.dist, hr };
      st.phase = 'flight';
    };

    const endDerby = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const dur = Math.round((Date.now() - st.startTime) / 1000);
      const won = st.homers >= 4;
      onEndRef.current?.({ score: st.homers * 100 + Math.round(st.totalDist / 10), won, duration: dur, headline: `${st.homers} HOMERS · BEST ${st.best}m`, tallies: rec.tallies(), maxCombo: rec.bestChain });
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      if (st.msgT > 0) st.msgT -= dt;
      if (st.flash > 0) st.flash -= dt;
      if (st.swing > 0) st.swing -= dt;

      if (st.phase === 'windup') { st.windT -= dt; if (st.windT <= 0) newPitch(); }
      if (st.phase === 'pitch' && st.pitch) {
        st.pitch.t += dt * 0.62 * st.pitch.type.speed * speedMult;
        if (st.pitch.t >= 1) {
          resolvePitch();
        }
      }
      if (st.phase === 'flight' && st.hit) {
        st.hit.t += dt * 1.1;
        if (st.hit.t >= 1) { st.phase = 'result'; st.resultT = 0.9; st.hit = null; }
      }
      if (st.phase === 'result') {
        st.resultT -= dt;
        if (st.resultT <= 0) {
          if (st.outs >= 10 || st.homers >= 6) { endDerby(); return; }
          st.phase = 'windup'; st.windT = 0.9 + Math.random() * 0.8;
        }
      }

      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; return p.life > 0; });

      // RENDER
      ctx.clearRect(0, 0, W, H);
      if (bg.complete && bg.naturalWidth > 0) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,8,0.58)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0F1410'; ctx.fillRect(0, 0, W, H); }

      // field line
      ctx.fillStyle = 'rgba(0,255,157,0.06)'; ctx.fillRect(0, H - 90, W, 90);
      ctx.strokeStyle = '#00FF9D33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, H - 90); ctx.lineTo(W, H - 90); ctx.stroke();

      // pitcher
      ctx.save();
      ctx.translate(mound.x, mound.y + 90);
      ctx.strokeStyle = '#FF3366'; ctx.fillStyle = '#FF3366'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.shadowColor = '#FF3366'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, -80, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -68); ctx.lineTo(0, -32); ctx.stroke();
      const windArm = st.phase === 'windup' ? -28 : 18;
      ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(-18, -60 + windArm); ctx.moveTo(0, -60); ctx.lineTo(14, -46); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(12, 0); ctx.moveTo(0, -32); ctx.lineTo(-12, 0); ctx.stroke();
      ctx.restore();

      // batter (player)
      const auraColor = gradeRef.current?.color ?? '#00E5FF';
      const agr = ctx.createRadialGradient(plateX, plateY - 55, 8, plateX, plateY - 55, 80);
      agr.addColorStop(0, `${auraColor}30`); agr.addColorStop(1, 'transparent');
      ctx.fillStyle = agr; ctx.fillRect(plateX - 90, plateY - 150, 180, 190);
      ctx.save();
      ctx.translate(plateX, plateY);
      ctx.strokeStyle = '#EDEDF2'; ctx.fillStyle = '#EDEDF2'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.shadowColor = auraColor; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, -100, 13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -85); ctx.lineTo(0, -40); ctx.stroke();
      // bat swing
      const swinging = st.swing > 0;
      ctx.beginPath();
      if (swinging) { ctx.moveTo(0, -75); ctx.lineTo(34, -78); } else { ctx.moveTo(0, -75); ctx.lineTo(18, -95); }
      ctx.stroke();
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 6; ctx.shadowColor = '#FFD700';
      ctx.beginPath();
      if (swinging) { ctx.moveTo(34, -78); ctx.lineTo(74, -84); } else { ctx.moveTo(18, -95); ctx.lineTo(34, -132); }
      ctx.stroke();
      ctx.strokeStyle = '#EDEDF2'; ctx.lineWidth = 7; ctx.shadowColor = auraColor;
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(14, 0); ctx.moveTo(0, -40); ctx.lineTo(-14, 0); ctx.stroke();
      ctx.restore();

      // incoming pitch ball
      if (st.phase === 'pitch' && st.pitch) {
        const t = st.pitch.t;
        const bx = mound.x - (mound.x - (plateX + 50)) * t;
        const wob = Math.sin(t * Math.PI * 2) * st.pitch.type.wobble * t;
        const by = mound.y + (plateY - 90 - mound.y) * t + wob;
        ctx.fillStyle = '#EDEDF2'; ctx.shadowColor = st.pitch.type.color; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        // hit zone indicator
        const inZone = t > 0.79 && t < 0.97;
        ctx.strokeStyle = inZone ? '#00FF9D' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); ctx.strokeRect(plateX + 20, plateY - 130, 70, 80); ctx.setLineDash([]);
        ctx.textAlign = 'left'; ctx.font = 'bold 14px "Barlow Condensed", sans-serif'; ctx.fillStyle = st.pitch.type.color;
        ctx.fillText(st.pitch.type.name, mound.x - 40, mound.y - 30);
      }

      // hit flight
      if (st.phase === 'flight' && st.hit) {
        const t = Math.min(st.hit.t, 1);
        const fx = plateX + 60 + (W - plateX + 100) * t * (st.hit.dist / 160);
        const fy = plateY - 100 - Math.sin(t * Math.PI) * (60 + st.hit.dist * 1.1);
        ctx.fillStyle = '#EDEDF2'; ctx.shadowColor = st.hit.hr ? '#00FF9D' : '#FFD700'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        if (st.hit.hr) { ctx.strokeStyle = '#00FF9D55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(plateX + 60, plateY - 100); ctx.quadraticCurveTo((plateX + fx) / 2, fy - 60, fx, fy); ctx.stroke(); }
      }

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 1.4, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
      ctx.globalAlpha = 1;

      // HUD
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.textAlign = 'center'; ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00FF9D'; ctx.fillText(String(st.homers), W / 2 - 110, 46);
      ctx.fillStyle = '#FF3366'; ctx.fillText(`${st.outs}/10`, W / 2 + 100, 46);
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 20px "JetBrains Mono", monospace';
      ctx.fillText(`${st.best}m`, W / 2, 44);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Barlow Condensed", sans-serif';
      ctx.fillText('HOME RUN DERBY · 6 HRs TO WIN', W / 2, 22);
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('HOMERS', W / 2 - 110, 57); ctx.fillText('BEST', W / 2, 57); ctx.fillText('OUTS', W / 2 + 100, 57);
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 24);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(st.phase === 'pitch' ? 'SPACE / SWING when the ball enters the green zone' : st.phase === 'windup' ? 'PITCHER WINDING UP…' : '', 16, H - 14);

      if (st.msgT > 0) {
        ctx.textAlign = 'center'; ctx.font = 'bold 40px "Barlow Condensed", sans-serif';
        ctx.fillStyle = st.msgColor; ctx.globalAlpha = Math.min(st.msgT, 1);
        ctx.fillText(st.msg, W / 2, H / 2 - 30); ctx.globalAlpha = 1;
      }
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (st.flash / 0.18)})`; ctx.fillRect(0, 0, W, H); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); };
  }, [started, prq]);

  const bb = () => (canvasRef.current as any)?.felBaseball;

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">HOME RUN DERBY</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">Read the pitch — fastball, curveball or changeup — and swing as it crosses the green zone. Perfect timing clears the 120m fence. 10 outs, 6 homers wins it.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>SPACE / SWING — swing</span><span>Perfect contact = HOME RUN</span>
              <span>Weak contact = caught (out)</span><span>Watch curveball drop late</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              STEP UP
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-center !hidden">
          <button onClick={() => bb()?.swing?.()} className="h-16 w-40 rounded-xl border border-[#FFD700]/60 bg-[#FFD700]/15 text-lg font-bold text-[#FFD700]">
            SWING
          </button>
        </div>
      )}
    </div>
  );
}
