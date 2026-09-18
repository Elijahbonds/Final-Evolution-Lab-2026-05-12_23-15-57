'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';
import { gkGuess, resolvePenalty, zoneToSide, gkLean, type Side } from '@/lib/feel/rally-outcome';

// Penalty shootout: 5 rounds each, then sudden death. Shooter: lock aim, lock power. Keeper: pick a dive zone.
export default function SoccerGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/soccer.jpg';

    // goal geometry
    const gx = W / 2, gy = 150, gw = 480, gh = 170;
    const ZONES = [-2, -1, 0, 1, 2]; // left-high .. right-high across goal
    const zoneX = (z: number) => gx + z * (gw / 5);

    const st: any = {
      round: 1, pGoals: 0, aiGoals: 0, shotsP: 0, shotsAI: 0,
      role: 'shooter', // shooter | keeper
      phase: 'aim', // aim | power | ball | keeperPick | keeperBall | between
      aimT: 0, aim: 0, power: 0, powerT: 0, powerDir: 1,
      ball: null as any, keeper: { x: gx, dive: 0, diveDir: 0 },
      aiShotZone: 0, pDive: null as null | number,
      // PHASE 8 / Part 7 Fix 4: AI keeper commits a dive side BEFORE the shot,
      // and leans visibly during the shooter's windup so the player can read it.
      gkCommitSide: gkGuess(Math.random(), 0, 0, Math.random()) as Side, windupT: 0,
      msg: '', msgT: 0, msgColor: '#FFD700',
      startTime: Date.now(), last: 0, flash: 0, particles: [] as any[],
      betweenT: 0, sudden: false,
    };

    const speedMult = gradeRef.current?.speedMult ?? 1;

    const lockAim = () => {
      if (st.phase !== 'aim' || st.role !== 'shooter') return;
      st.phase = 'power'; st.power = 0; st.powerDir = 1;
    };
    const lockPower = () => {
      if (st.phase !== 'power') return;
      const zone = Math.round(st.aim * 2); // -2..2
      const accurate = st.power > 0.6 && st.power < 0.92;
      const wild = st.power >= 0.97;
      let target = zone;
      if (wild) { st.phase = 'ball'; st.ball = { x: gx - 0, y: H - 60, tx: zoneX(zone) + (Math.random() < 0.5 ? -140 : 140), ty: gy - 60, t: 0, wild: true }; return; }
      if (!accurate && Math.random() < 0.45) target = Math.max(-2, Math.min(2, target + (Math.random() < 0.5 ? -1 : 1)));
      // Fix 4: the keeper ALREADY committed a side (st.gkCommitSide) and leaned
      // during the windup. Outcome is a pure read: chip AWAY from the lean = goal,
      // into it = save. The keeper dives fully to its committed side now.
      st.keeper.diveDir = st.gkCommitSide * 2;
      const outcome = resolvePenalty(zoneToSide(target), st.gkCommitSide);
      st.phase = 'ball';
      st.ball = { x: gx, y: H - 60, tx: zoneX(target), ty: gy + gh * 0.35 - Math.abs(target) * 14, t: 0, target, saved: outcome === 'save', speed: 0.55 + st.power * 0.35 };
    };
    const dive = (z: number) => {
      if (st.phase !== 'keeperPick' || st.role !== 'keeper') return;
      st.pDive = z;
      st.phase = 'keeperBall';
      st.ball = { x: gx, y: H - 60, tx: zoneX(st.aiShotZone), ty: gy + gh * 0.35, t: 0 };
    };

    const kd = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      if (k === ' ') { e.preventDefault?.(); if (st.phase === 'aim') lockAim(); else if (st.phase === 'power') lockPower(); else if (st.phase === 'keeperPick') dive(0); }
      if (st.phase === 'keeperPick') {
        if (k === 'ArrowLeft') dive(-2);
        if (k === 'ArrowDown') dive(0);
        if (k === 'ArrowRight') dive(2);
      }
    };
    window.addEventListener('keydown', kd);
    (canvas as any).felSoccer = { act: () => { if (st.phase === 'aim') lockAim(); else if (st.phase === 'power') lockPower(); }, dive };

    const rec = new SessionRecorder();
    const say = (m: string, c: string) => { st.msg = m; st.msgColor = c; st.msgT = 1.5; };

    const checkEnd = () => {
      const done5 = st.shotsP >= 5 && st.shotsAI >= 5;
      // decided early (can't catch up)
      const pLeft = 5 - st.shotsP, aiLeft = 5 - st.shotsAI;
      const decided = !st.sudden && ((st.pGoals > st.aiGoals + aiLeft) || (st.aiGoals > st.pGoals + pLeft));
      if (decided || (done5 && st.pGoals !== st.aiGoals) || (st.sudden && st.shotsP === st.shotsAI && st.pGoals !== st.aiGoals)) {
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        const won = st.pGoals > st.aiGoals;
        onEndRef.current?.({ score: st.pGoals, opponentScore: st.aiGoals, won, duration: dur, headline: won ? 'SHOOTOUT WON' : 'SHOOTOUT LOST', tallies: rec.tallies(), maxCombo: rec.bestChain });
        return true;
      }
      if (done5 && st.pGoals === st.aiGoals) st.sudden = true;
      return false;
    };

    const nextTurn = () => {
      if (checkEnd()) return;
      st.ball = null; st.keeper.dive = 0; st.keeper.diveDir = 0; st.pDive = null;
      if (st.role === 'shooter') {
        st.role = 'keeper'; st.phase = 'keeperPick';
        st.aiShotZone = ZONES[Math.floor(Math.random() * 5)];
      } else {
        st.role = 'shooter'; st.phase = 'aim'; st.aimT = 0; st.round++;
        // commit the keeper's dive side up front; it leans during the windup.
        st.gkCommitSide = gkGuess(Math.random(), 0, 0, Math.random()) as Side;
        st.windupT = 0;
      }
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      if (st.msgT > 0) st.msgT -= dt;
      if (st.flash > 0) st.flash -= dt;

      if (st.role === 'shooter' && (st.phase === 'aim' || st.phase === 'power')) st.windupT += dt;
      if (st.phase === 'aim') { st.aimT += dt * 1.6 * speedMult; st.aim = Math.sin(st.aimT); }
      if (st.phase === 'power') { st.power += st.powerDir * dt * 1.3; if (st.power >= 1) { st.power = 1; st.powerDir = -1; } if (st.power <= 0) { st.power = 0; st.powerDir = 1; } }

      if ((st.phase === 'ball' || st.phase === 'keeperBall') && st.ball) {
        st.ball.t += dt * (st.ball.speed ? st.ball.speed * 2.4 : 1.5);
        st.keeper.dive = Math.min(st.keeper.dive + dt * 3, 1);
        if (st.ball.t >= 1) {
          const b = st.ball;
          if (st.phase === 'ball') {
            st.shotsP++;
            if (b.wild) { say('OFF TARGET!', '#FF3366'); rec.recordMiss(); }
            else if (b.saved) { say('SAVED BY KEEPER!', '#FF3366'); rec.recordMiss(); }
            else { st.pGoals++; rec.recordHit(true); say('GOOOAL!', '#00FF9D'); st.flash = 0.15; for (let i = 0; i < 16; i++) st.particles.push({ x: b.tx, y: b.ty, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 320, life: 0.8, color: '#00FF9D' }); }
          } else {
            st.shotsAI++;
            const guessed = st.pDive !== null && Math.abs((st.pDive ?? 99) - st.aiShotZone) <= 1;
            if (guessed) { rec.recordDodge(); say('WHAT A SAVE!', '#00E5FF'); st.flash = 0.15; for (let i = 0; i < 16; i++) st.particles.push({ x: b.tx, y: b.ty, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 320, life: 0.8, color: '#00E5FF' }); }
            else { st.aiGoals++; rec.recordMiss(); say('RIVAL SCORES', '#FF3366'); }
          }
          st.phase = 'between'; st.betweenT = 1.4;
        }
      }
      if (st.phase === 'between') { st.betweenT -= dt; if (st.betweenT <= 0) nextTurn(); }

      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; return p.life > 0; });
      if (endedRef.current) return;

      // RENDER
      ctx.clearRect(0, 0, W, H);
      if (bg.complete && bg.naturalWidth > 0) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,8,0.55)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0A140C'; ctx.fillRect(0, 0, W, H); }

      // pitch
      ctx.fillStyle = 'rgba(0,255,157,0.06)'; ctx.fillRect(0, gy + gh, W, H - gy - gh);
      // goal frame
      ctx.strokeStyle = '#EDEDF2'; ctx.lineWidth = 6;
      ctx.strokeRect(gx - gw / 2, gy, gw, gh);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
      for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(gx - gw / 2 + (gw / 12) * i, gy); ctx.lineTo(gx - gw / 2 + (gw / 12) * i, gy + gh); ctx.stroke(); }
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(gx - gw / 2, gy + (gh / 5) * i); ctx.lineTo(gx + gw / 2, gy + (gh / 5) * i); ctx.stroke(); }
      // penalty spot
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(gx, H - 60, 4, 0, Math.PI * 2); ctx.fill();

      // keeper (AI when shooting, player silhouette when keeping)
      const isPlayerKeeper = st.role === 'keeper';
      // Fix 4: AI keeper pre-lean during the shooter's windup (READABLE tell).
      const preLean = (!isPlayerKeeper && (st.phase === 'aim' || st.phase === 'power'))
        ? gkLean(st.windupT) : 0; // TUNE(elijah)
      let kx = gx;
      if (st.keeper.dive > 0) kx = gx + (isPlayerKeeper ? (st.pDive ?? 0) : st.keeper.diveDir) * (gw / 5) * st.keeper.dive;
      else if (preLean > 0) kx = gx + st.gkCommitSide * (gw / 5) * 1.6 * preLean; // TUNE(elijah)
      const kColor = isPlayerKeeper ? (gradeRef.current?.color ?? '#00E5FF') : '#FF3366';
      ctx.save();
      ctx.translate(kx, gy + gh - 8);
      if (st.keeper.dive > 0.2) ctx.rotate(((isPlayerKeeper ? (st.pDive ?? 0) : st.keeper.diveDir) >= 0 ? 1 : -1) * 0.7 * st.keeper.dive);
      else if (preLean > 0) ctx.rotate((st.gkCommitSide >= 0 ? 1 : -1) * 0.32 * preLean); // TUNE(elijah)
      ctx.strokeStyle = kColor; ctx.fillStyle = kColor; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.shadowColor = kColor; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, -78, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(0, -30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(20, -74); ctx.moveTo(0, -58); ctx.lineTo(-20, -74); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(12, 0); ctx.moveTo(0, -30); ctx.lineTo(-12, 0); ctx.stroke();
      ctx.restore();

      // ball
      if (st.ball) {
        const b = st.ball;
        const t = Math.min(b.t, 1);
        const bx = b.x + (b.tx - b.x) * t;
        const by = b.y + (b.ty - b.y) * t - Math.sin(t * Math.PI) * 60;
        ctx.fillStyle = '#EDEDF2'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#0F0F13'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.stroke();
      } else if (st.role === 'shooter') {
        ctx.fillStyle = '#EDEDF2'; ctx.beginPath(); ctx.arc(gx, H - 60, 10, 0, Math.PI * 2); ctx.fill();
      }

      // aim reticle
      if (st.phase === 'aim') {
        const ax = gx + st.aim * (gw / 2 - 30);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(ax, gy + gh * 0.4, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 30, gy + gh * 0.4); ctx.lineTo(ax + 30, gy + gh * 0.4); ctx.moveTo(ax, gy + gh * 0.4 - 30); ctx.lineTo(ax, gy + gh * 0.4 + 30); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center'; ctx.font = 'bold 15px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#00E5FF';
        ctx.fillText('READ THE KEEPER — AIM AWAY FROM THE LEAN', gx, H - 24);
      }
      // power bar
      if (st.phase === 'power') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(gx - 120, H - 40, 240, 14);
        ctx.fillStyle = st.power > 0.6 && st.power < 0.92 ? '#00FF9D' : st.power >= 0.97 ? '#FF3366' : '#00E5FF';
        ctx.fillRect(gx - 120, H - 40, 240 * st.power, 14);
        ctx.strokeStyle = '#00FF9D'; ctx.strokeRect(gx - 120 + 240 * 0.6, H - 42, 240 * 0.32, 18);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Barlow Condensed", sans-serif';
        ctx.fillText('TAP IN THE GREEN ZONE', gx, H - 48);
      }
      // keeper pick prompt
      if (st.phase === 'keeperPick') {
        ctx.textAlign = 'center'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#00E5FF';
        ctx.fillText('YOU ARE IN GOAL — PICK YOUR DIVE', gx, H - 46);
        ctx.font = '13px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('← DIVE LEFT · ↓ STAY CENTER · → DIVE RIGHT', gx, H - 26);
      }

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 1.4, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
      ctx.globalAlpha = 1;

      // HUD
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.textAlign = 'center'; ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00E5FF'; ctx.fillText(String(st.pGoals), W / 2 - 90, 46);
      ctx.fillStyle = '#FF3366'; ctx.fillText(String(st.aiGoals), W / 2 + 90, 46);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Barlow Condensed", sans-serif';
      ctx.fillText(st.sudden ? 'PENALTY SHOOTOUT · SUDDEN DEATH' : 'PENALTY SHOOTOUT · BEST OF 5', W / 2, 22);
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`YOU ${st.shotsP}/5`, W / 2 - 90, 57); ctx.fillText(`RIVAL ${st.shotsAI}/5`, W / 2 + 90, 57);
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 24);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(st.role === 'shooter' ? (st.phase === 'aim' ? 'SPACE / SHOOT — lock aim' : st.phase === 'power' ? 'SPACE / SHOOT — lock power' : '') : '', 16, H - 14);

      if (st.msgT > 0) {
        ctx.textAlign = 'center'; ctx.font = 'bold 40px "Barlow Condensed", sans-serif';
        ctx.fillStyle = st.msgColor; ctx.globalAlpha = Math.min(st.msgT, 1);
        ctx.fillText(st.msg, W / 2, H / 2 - 20); ctx.globalAlpha = 1;
      }
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (st.flash / 0.15)})`; ctx.fillRect(0, 0, W, H); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); };
  }, [started, prq]);

  const sc = () => (canvasRef.current as any)?.felSoccer;

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">PENALTY SHOOTOUT</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">Five shots each. As shooter: lock the moving aim, then nail the power zone. As keeper: read the shot and pick your dive.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>SPACE — lock aim / power</span><span>← ↓ → — dive as keeper</span>
              <span>Green power zone = accurate</span><span>Overpowered = off target</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              KICK OFF
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between gap-2 !hidden">
          <div className="flex gap-2">
            <button onClick={() => sc()?.dive?.(-2)} className="rounded-md border border-[#00E5FF]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#00E5FF]">← LEFT</button>
            <button onClick={() => sc()?.dive?.(0)} className="rounded-md border border-[#00FF9D]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#00FF9D]">↓ CENTER</button>
            <button onClick={() => sc()?.dive?.(2)} className="rounded-md border border-[#FF3366]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#FF3366]">→ RIGHT</button>
          </div>
          <button onClick={() => sc()?.act?.()} className="h-16 w-24 rounded-xl border border-[#00E5FF]/60 bg-[#00E5FF]/15 text-sm font-bold text-[#00E5FF]">
            SHOOT
          </button>
        </div>
      )}
    </div>
  );
}
