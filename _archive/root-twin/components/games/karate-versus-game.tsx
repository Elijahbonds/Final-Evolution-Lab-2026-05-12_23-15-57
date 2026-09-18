'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';
import { createDragonMoment, triggerDragonMoment, updateDragonMoment, drawDragonOverlay, applyDragonZoom } from '@/lib/camera-director';
import {
  createHitStop, triggerHitStop, updateHitStop,
  createFlash, triggerFlash, updateFlash, drawFlash,
  createBurst, spawnBurst, updateBurst, drawBurst,
} from '@/lib/impact-system';

const W = 960;
const H = 540;
const ROUNDS_TO_WIN = 2;

type Action = 'strike' | 'block' | 'special';

export default function KarateVersusGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/karate.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    const dmgMult = grade.key === 'ELITE' ? 1.25 : grade.key === 'PRIMED' ? 1.15 : grade.key === 'READY' ? 1.05 : 1.0;

    const startTime = Date.now();
    let round = 1;
    let myWins = 0;
    let aiWins = 0;
    let myHp = 100;
    let aiHp = 100;
    let chi = 0; // builds on hits; 100 = special ready
    let totalDamage = 0;
    const rec = new SessionRecorder();
    // AI telegraph cycle
    let aiState: 'idle' | 'windup' | 'attack' | 'stunned' = 'idle';
    let aiTimer = 1.2;
    let windupLen = 0.9;
    let playerAnim = 0; // strike anim
    let blockHeld = false;
    let msg = '';
    let msgColor = '#FFF';
    let msgTimer = 0;
    let roundMsgTimer = 0;
    // M8.3 impact system (shared): KO freeze + flash + burst, and dragon knockback
    const impactHitStop = createHitStop();
    const koFlash = createFlash();
    const koBurst = createBurst();
    let koPending: boolean | null = null; // playerWon, resolved AFTER the freeze
    let aiKnock = 0;   // horizontal displacement of the AI fighter (px) // TUNE(elijah)
    let myKnock = 0;   // horizontal displacement of the player (px)

    function showMsg(text: string, color: string) { msg = text; msgColor = color; msgTimer = 0.9; }

    function newRound() {
      myHp = 100; aiHp = 100; chi = Math.min(chi, 50);
      aiState = 'idle'; aiTimer = 1.2;
      roundMsgTimer = 1.4;
    }

    function endRound(playerWon: boolean) {
      if (playerWon) myWins += 1; else aiWins += 1;
      if (myWins >= ROUNDS_TO_WIN || aiWins >= ROUNDS_TO_WIN) { finish(); return; }
      round += 1;
      // M8.3 KO banner drops AFTER the freeze (KO felt first, then announced)
      showMsg(playerWon ? 'K.O. — ROUND WON!' : 'K.O. — ROUND LOST', playerWon ? '#00FF9D' : '#FF3366');
      newRound();
    }

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const won = myWins > aiWins;
      onEndRef.current?.({
        score: Math.round(totalDamage * 10 + myWins * 300),
        opponentScore: aiWins * 300,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won ? `${myWins}-${aiWins} — SENSEI APPROVED` : `${myWins}-${aiWins} — MEDITATE AND RETURN`,
        tallies: rec.tallies(), maxCombo: rec.bestChain,
      });
    }

    function strike() {
      if (endedRef.current || roundMsgTimer > 0) return;
      playerAnim = 1;
      if (aiState === 'windup' || aiState === 'stunned') {
        const dmg = (aiState === 'stunned' ? 18 : 12) * dmgMult;
        aiHp -= dmg; totalDamage += dmg;
        chi = Math.min(100, chi + 18);
        rec.recordHit(aiState === 'stunned');
        showMsg(aiState === 'stunned' ? 'COUNTER STRIKE!' : 'CLEAN HIT!', '#00FF9D');
        aiKnock = aiState === 'stunned' ? 30 : 20; // M8.3 stagger proportional to hit // TUNE(elijah)
        aiState = 'idle'; aiTimer = 0.8 + Math.random() * 0.8;
      } else if (aiState === 'attack') {
        myHp -= 10; rec.recordMiss(); showMsg('TRADED — TOO SLOW', '#FF3366');
        aiState = 'idle'; aiTimer = 1.0;
      } else {
        // idle: chip damage but AI may punish
        if (Math.random() < 0.5) {
          const dmg = 6 * dmgMult; aiHp -= dmg; totalDamage += dmg; chi = Math.min(100, chi + 8);
          rec.recordHit();
          showMsg('JAB +6', '#00E5FF');
        } else {
          myHp -= 8; rec.recordMiss(); showMsg('PARRIED!', '#FF3366');
        }
      }
      checkHp();
    }

    function special() {
      if (endedRef.current || chi < 100 || roundMsgTimer > 0) return;
      chi = 0;
      const dmg = 30 * dmgMult;
      aiHp -= dmg; totalDamage += dmg;
      rec.recordHit(true);
      aiState = 'stunned'; aiTimer = 1.2;
      showMsg('DRAGON PALM! -30', '#FFD700');
      // M8.2: Dragon Strike Moment
      triggerDragonMoment(dragon);
      // M8.3 DRAGON STRIKE knockback — visible displacement proportional to the 30 dmg
      aiKnock = 48; // TUNE(elijah)
      checkHp();
    }

    function checkHp() {
      if (aiHp > 0 && myHp > 0) return;
      const playerWon = aiHp <= 0;
      // M8.3 KO — FREEZE first (0.3s), then the banner drops (see loop koPending release).
      triggerHitStop(impactHitStop, 0.30);            // TUNE(elijah)
      triggerFlash(koFlash, '#ffffff', 0.7, 2.2);     // TUNE(elijah)
      const loserX = playerWon ? (W / 2 + 140) : (W / 2 - 140);
      spawnBurst(koBurst, loserX, H - 190, 26, {       // KO impact debris // TUNE(elijah)
        colors: ['#FF3366', '#FFD700', '#ffffff'], speed: 300, spread: -40, life: 0.9, size: 3.4,
      });
      // big knockback on the loser
      if (playerWon) aiKnock = 72; else myKnock = -72; // TUNE(elijah)
      koPending = playerWon;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) strike(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyB') { e.preventDefault(); blockHeld = true; }
      else if (e.code === 'ArrowUp' || e.code === 'KeyS') { e.preventDefault(); special(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyB') blockHeld = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    (canvas as any).felKarateVs = {
      strike,
      special,
      blockOn: () => { blockHeld = true; },
      blockOff: () => { blockHeld = false; },
    };

    newRound();

    const dragon = createDragonMoment();

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const rawDt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // M8.2: Dragon moment — slow-mo + camera zoom
      updateDragonMoment(dragon, rawDt);
      // M8.3 hit-stop: stack the KO freeze on top of the dragon slow-mo (all dt scaling).
      const hitScale = updateHitStop(impactHitStop, rawDt);
      const dt = (dragon.active ? rawDt * dragon.timeScale : rawDt) * hitScale;
      updateFlash(koFlash, rawDt);
      updateBurst(koBurst, rawDt);
      // knockback eases back in game time (holds displaced during the freeze, then recovers)
      if (aiKnock !== 0) aiKnock += (0 - aiKnock) * Math.min(dt * 3, 1);
      if (myKnock !== 0) myKnock += (0 - myKnock) * Math.min(dt * 3, 1);
      // M8.3 release the KO once the freeze finishes — banner drops now, not before.
      if (koPending !== null && !impactHitStop.active) {
        const pw = koPending; koPending = null;
        endRound(pw);
      }
      if (msgTimer > 0) msgTimer -= dt;
      if (roundMsgTimer > 0) roundMsgTimer -= dt;
      if (playerAnim > 0) playerAnim = Math.max(0, playerAnim - dt * 4);

      if (!endedRef.current && roundMsgTimer <= 0) {
        aiTimer -= dt;
        if (aiTimer <= 0) {
          if (aiState === 'idle') { aiState = 'windup'; windupLen = 0.55 + Math.random() * 0.5; aiTimer = windupLen; }
          else if (aiState === 'windup') {
            aiState = 'attack'; aiTimer = 0.35;
            if (blockHeld) {
              chi = Math.min(100, chi + 12);
              showMsg('BLOCKED! CHI +12', '#00E5FF');
            } else {
              myHp -= 14; showMsg('HIT! -14', '#FF3366');
              checkHp();
            }
          } else if (aiState === 'attack' || aiState === 'stunned') { aiState = 'idle'; aiTimer = 0.9 + Math.random() * 1.1; }
        }
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      applyDragonZoom(ctx, W, H, dragon);
      if (bgReady) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(10,5,5,0.5)'; ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = '#160A0A'; ctx.fillRect(0, 0, W, H); }

      // fighters
      const py = H - 130;
      const px = W / 2 - 140 + playerAnim * 50 + myKnock;
      const ex = W / 2 + 140 + (aiState === 'attack' ? -40 : 0) + aiKnock;
      // player
      ctx.strokeStyle = blockHeld ? '#00E5FF' : '#FFFFFF'; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(px, py - 70, 13, 0, Math.PI * 2);
      ctx.moveTo(px, py - 57); ctx.lineTo(px, py - 10);
      ctx.moveTo(px, py - 45); ctx.lineTo(px + 40 + playerAnim * 20, py - 50);
      ctx.moveTo(px, py - 40); ctx.lineTo(px - 20, py - 15);
      ctx.moveTo(px, py - 10); ctx.lineTo(px - 14, py + 32);
      ctx.moveTo(px, py - 10); ctx.lineTo(px + 16, py + 32);
      ctx.stroke();
      if (blockHeld) { ctx.strokeStyle = 'rgba(0,229,255,0.6)'; ctx.beginPath(); ctx.arc(px + 24, py - 45, 26, -1.2, 1.2); ctx.stroke(); }
      // AI
      const aiColor = aiState === 'windup' ? '#FFD700' : aiState === 'attack' ? '#FF3366' : aiState === 'stunned' ? '#A855F7' : '#FF8888';
      ctx.strokeStyle = aiColor; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ex, py - 70, 13, 0, Math.PI * 2);
      ctx.moveTo(ex, py - 57); ctx.lineTo(ex, py - 10);
      ctx.moveTo(ex, py - 45); ctx.lineTo(ex - (aiState === 'attack' ? 55 : aiState === 'windup' ? -25 : 20), py - 48);
      ctx.moveTo(ex, py - 40); ctx.lineTo(ex + 20, py - 15);
      ctx.moveTo(ex, py - 10); ctx.lineTo(ex - 16, py + 32);
      ctx.moveTo(ex, py - 10); ctx.lineTo(ex + 14, py + 32);
      ctx.stroke();
      if (aiState === 'windup') {
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 18px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('⚠ INCOMING — BLOCK OR COUNTER!', ex, py - 100);
      }
      if (aiState === 'stunned') {
        ctx.fillStyle = '#A855F7'; ctx.font = 'bold 18px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('STUNNED — STRIKE NOW!', ex, py - 100);
      }

      // HP bars
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(30, 20, 380, 26); ctx.fillRect(W - 410, 20, 380, 26);
      ctx.fillStyle = '#00FF9D'; ctx.fillRect(32, 22, 376 * Math.max(0, myHp / 100), 22);
      ctx.fillStyle = '#FF3366';
      const aw = 376 * Math.max(0, aiHp / 100);
      ctx.fillRect(W - 32 - aw, 22, aw, 22);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.strokeRect(30, 20, 380, 26); ctx.strokeRect(W - 410, 20, 380, 26);
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 15px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left'; ctx.fillText('YOU', 34, 62);
      ctx.textAlign = 'right'; ctx.fillText('RIVAL SENSEI', W - 34, 62);
      ctx.textAlign = 'center'; ctx.fillText(`ROUND ${round} · ${myWins}-${aiWins}`, W / 2, 38);

      // chi bar
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(W / 2 - 100, 48, 200, 12);
      ctx.fillStyle = chi >= 100 ? '#FFD700' : '#A855F7'; ctx.fillRect(W / 2 - 100, 48, 200 * (chi / 100), 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.strokeRect(W / 2 - 100, 48, 200, 12);
      if (chi >= 100 && Math.floor(now / 300) % 2 === 0) {
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillText('SPECIAL READY — ↑', W / 2, 78);
      }

      ctx.fillStyle = 'rgba(0,229,255,0.8)'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 90);

      if (roundMsgTimer > 0) {
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 46px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`ROUND ${round}`, W / 2, H / 2 - 20);
        ctx.font = 'bold 22px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#FF3366';
        ctx.fillText('FIGHT!', W / 2, H / 2 + 20);
      } else if (msgTimer > 0) {
        ctx.fillStyle = msgColor; ctx.font = 'bold 32px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(msg, W / 2, H / 2 - 60);
      }

      // M8.3 KO debris + flash
      drawBurst(ctx, koBurst);
      drawFlash(ctx, W, H, koFlash);
      // M8.2: Dragon moment crimson overlay
      drawDragonOverlay(ctx, W, H, dragon);
      ctx.restore(); // end dragon zoom

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      delete (canvas as any).felKarateVs;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#160A0A]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">KARATE VS</h2>
            <p className="max-w-md text-sm text-gray-300">
              Best of 3 vs the Rival Sensei. <span className="text-[#00FF9D]">SPACE</span> strikes — punish gold wind-ups. Hold <span className="text-[#00E5FF]">↓</span> to block incoming red attacks and build chi. Full chi? <span className="text-[#FFD700]">↑</span> unleashes the Dragon Palm.
            </p>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#FF3366] px-8 py-3 font-bold text-white transition hover:bg-[#e02050]">BOW & FIGHT</button>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-2 !hidden">
        <button className="rounded-lg bg-[#FF3366]/20 px-7 py-4 font-bold text-[#FF3366] active:bg-[#FF3366]/40" onClick={() => (canvasRef.current as any)?.felKarateVs?.strike()}>STRIKE</button>
        <button
          className="rounded-lg bg-[#00E5FF]/20 px-7 py-4 font-bold text-[#00E5FF] active:bg-[#00E5FF]/40"
          onClick={() => { /* hold handled via pointer events */ }}
          onPointerDown={() => (canvasRef.current as any)?.felKarateVs?.blockOn()}
          onPointerUp={() => (canvasRef.current as any)?.felKarateVs?.blockOff()}
          onPointerLeave={() => (canvasRef.current as any)?.felKarateVs?.blockOff()}
        >
          BLOCK
        </button>
        <button className="rounded-lg bg-[#FFD700]/20 px-7 py-4 font-bold text-[#FFD700] active:bg-[#FFD700]/40" onClick={() => (canvasRef.current as any)?.felKarateVs?.special()}>SPECIAL</button>
      </div>
    </div>
  );
}
