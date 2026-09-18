'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { createGameSystems, type GameSystems } from '@/lib/game-systems';
import { createApexFollow, updateApexFollow, applyApexOffset, type ApexFollowState } from '@/lib/camera-director';
import {
  createHitStop, triggerHitStop, updateHitStop,
  createBurst, spawnBurst, updateBurst, drawBurst,
  createSquash, triggerSquash, updateSquash,
} from '@/lib/impact-system';

export default function DunkGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/dunk.jpg';

    // DeepMotion mocap — real capture data parsed from the user's BVH upload
    // Joint order: Hips,Spine1,Neck,Head,LArm,LForeArm,LHand,RArm,RForeArm,RHand,LUpLeg,LLeg,LFoot,RUpLeg,RLeg,RFoot
    let moFrames: number[][][] | null = null;
    const MO_TAKEOFF = 14, MO_LAND = 82, MO_LAST = 91;
    fetch('/mocap/dunk.json')
      .then((r) => r.json())
      .then((d) => {
        const raw: number[][][] = d?.frames ?? [];
        if (!raw.length) return;
        const f0 = raw[0];
        const standH = Math.max(f0[3][1] - Math.min(f0[12][1], f0[15][1]), 1);
        const s = 118 / standH;
        moFrames = raw.map((fr) => fr.map((p) => [p[0] * s, -p[1] * s]));
      })
      .catch(() => {});

    const moBones: [number, number][] = [
      [0, 1], [1, 2], [2, 3],
      [2, 4], [4, 5], [5, 6],
      [2, 7], [7, 8], [8, 9],
      [0, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15],
    ];

    // Game systems: combo tracking + miss gating + session recording
    const sys: GameSystems = createGameSystems({
      comboWindowMs: 8000,               // TUNE(elijah) — generous window for turn-based
      gate: { proximityThreshold: 999, minQteQuality: 0.15 }, // TUNE(elijah) — spatial N/A for 2D dunk
    });

    const st: any = {
      phase: 'idle', // idle | charge | rise | qte | fall | land | aiTurn
      charge: 0, y: 0, vy: 0, x: 200, vx: 0,
      style: 'POWER', qteT: 0, qteWindow: 0.5, qteResult: '', hangStart: 0, hangTime: 0,
      pScore: 0, aiScore: 0, msg: '', msgT: 0, flash: 0,
      startTime: Date.now(), last: 0, aiT: 0, turn: 'player', dunksDone: 0,
      combo: 0, comboMult: 1,
      particles: [] as any[],
      apexFollow: createApexFollow(),
      prevPhase: 'idle' as string,
      // M8.3 shared impact system: hit-stop + crowd burst + landing squash
      hitStop: createHitStop(),
      crowdBurst: createBurst(),
      squash: createSquash(),
      _sq: 0,
      lastDunkMade: false,
    };

    const groundY = H - 90;
    const rimX = 720, rimY = 210;

    const startCharge = () => { if (st.phase === 'idle' && st.turn === 'player') { st.phase = 'charge'; st.charge = 0; } };
    const releaseCharge = () => {
      if (st.phase !== 'charge') return;
      st.phase = 'rise';
      st.airStart = Date.now();
      const power = Math.min(st.charge, 1);
      st.vy = -(560 + power * 380);
      st.vx = 170;
      st.y = 0; st.qteResult = ''; st.hangStart = 0;
    };
    const pickStyle = (s: string) => { if (st.phase === 'rise' || st.phase === 'qte') st.style = s; };
    const qteTap = () => {
      if (st.phase !== 'qte') return;
      const t = st.qteT;
      const w = st.qteWindow;
      const off = Math.abs(t - w / 2) / (w / 2);
      st.qteResult = off < 0.2 ? 'PERFECT' : off < 0.5 ? 'GREAT' : 'GOOD';
      st.phase = 'fall';
      st.flash = 0.15;
      for (let i = 0; i < 14; i++) st.particles.push({ x: rimX, y: rimY, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 300, life: 0.7, color: st.qteResult === 'PERFECT' ? '#FFD700' : '#00E5FF' });
    };

    const kd = (e: KeyboardEvent) => {
      const k = e?.key ?? '';
      if (k === ' ') { e.preventDefault?.(); if (st.phase === 'idle') startCharge(); else if (st.phase === 'qte') qteTap(); }
      if (k === 'ArrowUp') pickStyle('POWER');
      if (k === 'ArrowLeft' || k === 'ArrowRight') pickStyle('FLASHY');
      if (k === 'ArrowDown') pickStyle('SIGNATURE');
    };
    const ku = (e: KeyboardEvent) => { if ((e?.key ?? '') === ' ') releaseCharge(); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    (canvas as any).felDunk = { startCharge, releaseCharge, qteTap, pickStyle };

    const scoreDunk = () => {
      const complexity = st.style === 'SIGNATURE' ? 2 : st.style === 'FLASHY' ? 1.4 : 0.9;
      const hangPts = Math.min(st.hangTime / 0.9, 2);
      const timing = st.qteResult === 'PERFECT' ? 1 : st.qteResult === 'GREAT' ? 0.5 : st.qteResult === 'GOOD' ? 0 : -1;
      const isPerfect = st.qteResult === 'PERFECT';

      // Miss gating: QTE quality maps to 0..1 normalised
      const qteQuality = st.qteResult === 'PERFECT' ? 1 : st.qteResult === 'GREAT' ? 0.7 : st.qteResult === 'GOOD' ? 0.4 : 0;
      const gatePass = sys.gate.attemptByQuality(qteQuality);

      if (!gatePass) {
        // Total miss — combo breaks, no points
        sys.combo.breakCombo();
        sys.recorder.recordMiss();
        st.combo = 0; st.comboMult = 1;
        st.lastDunkMade = false;
        st.msg = 'MISS · +0.0 PTS'; st.msgT = 1.6;
        st.dunksDone++;
        return;
      }

      // Successful dunk — register hit + combo
      st.comboMult = sys.combo.registerHit();
      st.combo = sys.combo.snapshot().chain;
      sys.recorder.recordHit(isPerfect);

      const total = Math.max(Math.round((hangPts + complexity + timing) * st.comboMult * 10) / 10, 0);
      sys.recorder.addScore(total);
      sys.recorder.recordChain(st.combo);
      st.pScore = Math.round((st.pScore + total) * 10) / 10;
      st.lastDunkMade = total > 0;
      const comboTag = st.comboMult > 1 ? ` · ${st.comboMult}×` : '';
      st.msg = `${st.qteResult || 'HIT'} · +${total.toFixed(1)} PTS${comboTag}`; st.msgT = 1.6;
      st.dunksDone++;
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      // M8.3 hit-stop: scale game dt toward 0 during a freeze (logic + render hold together).
      const realDt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      const timeScale = updateHitStop(st.hitStop, realDt);
      const dt = realDt * timeScale;
      updateBurst(st.crowdBurst, realDt);       // crowd pop advances in real time
      st._sq = updateSquash(st.squash, dt);     // landing squash holds during freeze then plays
      if (st.msgT > 0) st.msgT -= dt;
      if (st.flash > 0) st.flash -= dt;
      sys.combo.update(dt);

      if (st.phase === 'charge') st.charge = Math.min(st.charge + dt * 0.9, 1);
      if (st.phase === 'rise' || st.phase === 'fall' || st.phase === 'qte') {
        const nearApex = st.vy > -120 && st.vy < 120;
        const hangScale = nearApex ? 0.65 : 1;
        st.vy += 900 * hangScale * dt;
        st.y += st.vy * dt;
        st.x += st.vx * dt;
        if (nearApex) st.hangTime += dt + (gradeRef.current?.hangBonus ?? 0) * dt * 0.5;
        if (st.phase === 'rise' && st.vy >= -60) { st.phase = 'qte'; st.qteT = 0; st.qteWindow = st.style === 'SIGNATURE' ? 0.34 : st.style === 'FLASHY' ? 0.42 : 0.55; }
        if (st.phase === 'qte') {
          st.qteT += dt;
          if (st.qteT > st.qteWindow) { st.qteResult = ''; st.phase = 'fall'; }
        }
        if (st.y >= 0 && st.vy > 0) {
          st.y = 0; st.phase = 'land'; st.landAt = Date.now();
          scoreDunk();
          // M8.3 DUNK LANDING impact — only on a made slam
          if (st.lastDunkMade) {
            triggerHitStop(st.hitStop, 0.033);                 // ~2 frames // TUNE(elijah)
            triggerSquash(st.squash, 0.24, 0.20);              // landing compression // TUNE(elijah)
            spawnBurst(st.crowdBurst, rimX, rimY, 22, {         // crowd pop // TUNE(elijah)
              colors: ['#FFD700', '#00E5FF', '#ffffff'], speed: 260, spread: -80, life: 0.8, size: 3.2,
            });
            st.flash = Math.max(st.flash, 0.15);
          }
          setTimeout(() => {
            st.x = 200; st.hangTime = 0;
            if (st.pScore >= 21 || st.aiScore >= 21) return;
            st.turn = 'ai'; st.phase = 'aiTurn'; st.aiT = 1.4;
          }, 700);
        }
      }
      if (st.phase === 'aiTurn') {
        st.aiT -= dt;
        if (st.aiT <= 0) {
          const aiPts = Math.round((1.2 + Math.random() * 2.6) * 10) / 10;
          st.aiScore = Math.round((st.aiScore + aiPts) * 10) / 10;
          st.msg = `RIVAL SCORES +${aiPts.toFixed(1)}`; st.msgT = 1.4;
          st.turn = 'player'; st.phase = 'idle';
        }
      }

      if ((st.pScore >= 21 || st.aiScore >= 21) && !endedRef.current && st.phase !== 'rise' && st.phase !== 'qte' && st.phase !== 'fall') {
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        onEndRef.current?.({ score: Math.round(st.pScore), opponentScore: Math.round(st.aiScore), won: st.pScore > st.aiScore, duration: dur, headline: st.pScore > st.aiScore ? 'CONTEST WON' : 'CONTEST LOST', tallies: sys.recorder.tallies(), maxCombo: sys.recorder.bestChain });
        return;
      }

      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; return p.life > 0; });

      // Apex follow: track how far above ground the player is (st.y is negative when airborne in this coord system)
      const inAirNow = st.phase === 'rise' || st.phase === 'qte' || st.phase === 'fall';
      const playerAboveGround = inAirNow ? Math.abs(st.y) * 0.45 : 0; // TUNE(elijah) — scale canvas px
      const justLandedNow = st.prevPhase !== 'land' && st.phase === 'land';
      updateApexFollow(st.apexFollow, dt, playerAboveGround, justLandedNow);
      st.prevPhase = st.phase;

      // RENDER
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      applyApexOffset(ctx, st.apexFollow);
      if (bg.complete && bg.naturalWidth > 0) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(5,5,8,0.62)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#0F0F13'; ctx.fillRect(0, 0, W, H); }
      // court floor
      ctx.fillStyle = 'rgba(0,229,255,0.08)'; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = '#00E5FF44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
      // hoop
      ctx.strokeStyle = '#EDEDF2'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(rimX + 60, groundY); ctx.lineTo(rimX + 60, rimY - 55); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(rimX + 20, rimY - 75, 46, 62);
      ctx.strokeStyle = '#FF3366'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(rimX - 30, rimY); ctx.lineTo(rimX + 22, rimY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(rimX - 28 + i * 12, rimY); ctx.lineTo(rimX - 18 + i * 8, rimY + 26); ctx.stroke(); }

      // player
      const px = st.x, py = groundY + st.y;
      const auraColor = gradeRef.current?.color ?? '#00E5FF';
      const agr = ctx.createRadialGradient(px, py - 55, 8, px, py - 55, 80);
      agr.addColorStop(0, `${auraColor}30`); agr.addColorStop(1, 'transparent');
      ctx.fillStyle = agr; ctx.fillRect(px - 90, py - 150, 180, 190);
      ctx.save();
      ctx.translate(px, py);
      // M8.3 landing squash — compress the figure toward the feet (origin), feet stay planted.
      if (st._sq > 0) ctx.scale(1 + st._sq * 0.5, 1 - st._sq);
      ctx.strokeStyle = '#EDEDF2'; ctx.fillStyle = '#EDEDF2'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.shadowColor = auraColor; ctx.shadowBlur = 16;
      const inAir = st.phase === 'rise' || st.phase === 'qte' || st.phase === 'fall';
      if (moFrames && st.turn === 'player') {
        // real DeepMotion mocap pose, driven by game phase
        let fi = 0;
        if (st.phase === 'charge') fi = st.charge * MO_TAKEOFF;
        else if (inAir) {
          const at = (Date.now() - (st.airStart ?? Date.now())) / 1000;
          fi = MO_TAKEOFF + Math.min(at / 1.7, 1) * (MO_LAND - MO_TAKEOFF);
        } else if (st.phase === 'land') {
          fi = MO_LAND + Math.min((Date.now() - (st.landAt ?? Date.now())) / 600, 1) * (MO_LAST - MO_LAND);
        }
        const fr = moFrames[Math.min(Math.floor(fi), moFrames.length - 1)];
        const hx = fr[0][0], hy = fr[0][1];
        const jx = (i: number) => fr[i][0] - hx;
        const jy = (i: number) => fr[i][1] - hy - 58;
        ctx.beginPath();
        for (const [a, b] of moBones) { ctx.moveTo(jx(a), jy(a)); ctx.lineTo(jx(b), jy(b)); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(jx(3), jy(3) - 6, 11, 0, Math.PI * 2); ctx.fill();
        if (inAir || st.phase === 'charge' || st.phase === 'idle') {
          ctx.shadowBlur = 10; ctx.fillStyle = '#FF8C00';
          ctx.beginPath(); ctx.arc(jx(9) + 6, jy(9) - 4, 11, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.beginPath(); ctx.arc(0, -100, 13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -85); ctx.lineTo(0, -40); ctx.stroke();
        ctx.beginPath();
        if (inAir) { ctx.moveTo(0, -78); ctx.lineTo(26, -118); ctx.moveTo(0, -70); ctx.lineTo(-20, -95); }
        else if (st.phase === 'charge') { ctx.moveTo(0, -75); ctx.lineTo(20, -55); ctx.moveTo(0, -75); ctx.lineTo(-20, -55); }
        else { ctx.moveTo(0, -75); ctx.lineTo(20, -60); ctx.moveTo(0, -75); ctx.lineTo(-20, -60); }
        ctx.stroke();
        ctx.beginPath();
        if (inAir) { ctx.moveTo(0, -40); ctx.lineTo(20, -14); ctx.moveTo(0, -40); ctx.lineTo(-18, -20); }
        else if (st.phase === 'charge') { const c = st.charge * 14; ctx.moveTo(0, -40); ctx.lineTo(16, -c); ctx.moveTo(0, -40); ctx.lineTo(-16, -c); }
        else { ctx.moveTo(0, -40); ctx.lineTo(12, 0); ctx.moveTo(0, -40); ctx.lineTo(-12, 0); }
        ctx.stroke();
        if (inAir || st.phase === 'charge' || st.phase === 'idle') {
          ctx.shadowBlur = 10; ctx.fillStyle = '#FF8C00';
          ctx.beginPath(); ctx.arc(inAir ? 28 : 22, inAir ? -120 : -50, 11, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 1.6, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
      ctx.globalAlpha = 1;
      drawBurst(ctx, st.crowdBurst); // M8.3 crowd celebration burst on made slam

      // HUD scoreboard
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.textAlign = 'center'; ctx.font = 'bold 28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00E5FF'; ctx.fillText(st.pScore.toFixed(1), W / 2 - 90, 46);
      ctx.fillStyle = '#FF3366'; ctx.fillText(st.aiScore.toFixed(1), W / 2 + 90, 46);
      ctx.fillStyle = '#fff'; ctx.font = '600 14px "Barlow Condensed", sans-serif';
      ctx.fillText('DUNK CONTEST · FIRST TO 21', W / 2, 22);
      if (moFrames) {
        ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = '#00E5FF';
        ctx.fillText('DEEPMOTION MOCAP · LIVE CAPTURE', W / 2, H - 12);
      }
      ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('YOU', W / 2 - 90, 57); ctx.fillText('RIVAL', W / 2 + 90, 57);
      // ticker
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''} · HANG +${(gradeRef.current?.hangBonus ?? 0).toFixed(2)}`, W - 14, 24);
      // charge bar
      if (st.phase === 'charge') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px - 40, py - 160, 80, 10);
        ctx.fillStyle = st.charge > 0.75 ? '#00FF9D' : '#00E5FF'; ctx.fillRect(px - 40, py - 160, 80 * st.charge, 10);
        ctx.strokeStyle = '#00FF9D'; ctx.strokeRect(px - 40 + 80 * 0.75, py - 162, 80 * 0.25, 14);
      }
      // QTE ring
      if (st.phase === 'qte') {
        const prog = st.qteT / st.qteWindow;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(px, py - 130, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = prog > 0.35 && prog < 0.65 ? '#FFD700' : '#00E5FF';
        ctx.beginPath(); ctx.arc(px, py - 130, 34, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 15px "Barlow Condensed", sans-serif';
        ctx.fillText('TAP!', px, py - 125);
      }
      // style + turn
      ctx.textAlign = 'left'; ctx.font = 'bold 16px "Barlow Condensed", sans-serif';
      ctx.fillStyle = st.style === 'SIGNATURE' ? '#A855F7' : st.style === 'FLASHY' ? '#FF3366' : '#00E5FF';
      ctx.fillText(`STYLE: ${st.style}`, 16, H - 18);
      // combo chain HUD
      if (st.combo > 1) {
        ctx.textAlign = 'left'; ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#FFD700'; ctx.fillText(`${st.combo} CHAIN · ${st.comboMult}×`, 16, H - 60);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(st.turn === 'player' ? (st.phase === 'idle' ? 'HOLD SPACE / HOLD BUTTON TO CHARGE' : '') : 'RIVAL TURN…', 16, H - 40);
      if (st.msgT > 0) {
        ctx.textAlign = 'center'; ctx.font = 'bold 34px "Barlow Condensed", sans-serif';
        ctx.fillStyle = '#FFD700'; ctx.globalAlpha = Math.min(st.msgT, 1);
        ctx.fillText(st.msg, W / 2, H / 2 - 40); ctx.globalAlpha = 1;
      }
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (st.flash / 0.15)})`; ctx.fillRect(0, 0, W, H); }
      ctx.restore(); // end apex follow transform

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [started, prq]);

  const dunk = () => (canvasRef.current as any)?.felDunk;

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">DUNK CONTEST</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">Charge the jump, tap the apex QTE, pick your style. First to 21 style points beats the rival.</p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>HOLD SPACE — Charge</span><span>RELEASE — Jump</span>
              <span>SPACE at apex — Trick QTE</span><span>↑ POWER · ←→ FLASHY · ↓ SIGNATURE</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              TIP OFF
            </button>
          </div>
        )}
      </div>
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between gap-2 !hidden">
          <div className="flex gap-2">
            <button onClick={() => dunk()?.pickStyle?.('POWER')} className="rounded-md border border-[#00E5FF]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#00E5FF]">↑ POWER</button>
            <button onClick={() => dunk()?.pickStyle?.('FLASHY')} className="rounded-md border border-[#FF3366]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#FF3366]">↔ FLASHY</button>
            <button onClick={() => dunk()?.pickStyle?.('SIGNATURE')} className="rounded-md border border-[#A855F7]/50 bg-[#16161A] px-3 py-2 text-xs font-bold text-[#A855F7]">↓ SIG</button>
          </div>
          <button
            onTouchStart={() => { const d = dunk(); d?.startCharge?.(); d?.qteTap?.(); }}
            onTouchEnd={() => dunk()?.releaseCharge?.()}
            onMouseDown={() => { const d = dunk(); d?.startCharge?.(); d?.qteTap?.(); }}
            onMouseUp={() => dunk()?.releaseCharge?.()}
            className="h-16 w-24 rounded-xl border border-[#00E5FF]/60 bg-[#00E5FF]/15 text-sm font-bold text-[#00E5FF]"
          >
            JUMP / TAP
          </button>
        </div>
      )}
    </div>
  );
}
