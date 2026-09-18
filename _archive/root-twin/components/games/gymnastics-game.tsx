'use client';

/**
 * components/games/gymnastics-game.tsx
 * ====================================
 * M10 Row 4 retrofit — gymnastics surface -> AirSessionCore (VAULT skin).
 *
 * REUSE directive (LINEUP_SPEC row 4: "gymnastics-game | AirSessionMode |
 * your gymnastics venue art"): we keep the app's gymnastics venue backdrop
 * and the cadence-tap input feel, and retrofit the mechanic onto the proven
 * M9 Air-session archetype. The vault skin (lib/feel/cores/vault-skin.ts)
 * already existed from M9 Step 8 — this surface just WEARS it.
 *
 * The floor-routine's arrow-rhythm becomes the vault's identity, exactly as
 * the spec's air-session family line reads ("Vault (gymnastics): cadence
 * run-up, auto-punch, AirTrick flips, stick-the-landing window"):
 *   - Run  : alternate LEFT/RIGHT foot taps -> core.runTap('L'|'R') to build
 *            speed down the runway (POSITIVE runDrag: you must pump).
 *   - Air  : auto-punch off the table; tap FLIP -> core.trick() for rotation;
 *            press STICK near touchdown -> core.stick() to nail the landing.
 *   - Land : the core judges stuck/clean/sketchy/crash and scores it.
 * Two attempts per round (VAULT_TUNING.attemptsPerRound), best effort counts.
 *
 * This component owns NO physics: every number lives in vault-constants.ts
 * (all // TUNE(elijah)) and every phase/impulse/judgement is the shared
 * AirSessionCore. Only WIN_SCORE below is a surface-local presentation cutoff.
 */

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { SessionRecorder } from '@/lib/game-systems';
import { makeVaultSession, VAULT_TUNING } from '@/lib/feel/cores/vault-skin';
import type { CadenceSide } from '@/lib/feel';
import type { TrickGrade } from '@/lib/feel';

const W = 960;
const H = 540;
// Surface-local presentation cutoff for the GOLD headline. A solid pair of
// vaults (e.g. one stuck double + one clean single) clears it; two sketchy
// hops do not. Not a core value. // TUNE(elijah)
const WIN_SCORE = 800;

const GRADE_COLOR: Record<TrickGrade, string> = {
  stuck: '#FFD700',
  clean: '#00FF9D',
  sketchy: '#00E5FF',
  crash: '#FF3366',
};
const GRADE_LABEL: Record<TrickGrade, string> = {
  stuck: 'STUCK IT!',
  clean: 'CLEAN LANDING',
  sketchy: 'SKETCHY — HOP OUT',
  crash: 'CRASH',
};

export default function GymnasticsGame({ grade, prq, onEnd, gamepad }: GameProps) {
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
    bg.src = '/backdrops/gymnastics.jpg';
    let bgReady = false;
    bg.onload = () => { bgReady = true; };

    const startTime = Date.now();
    const rec = new SessionRecorder();
    let combo = 0;
    let bestGrade: TrickGrade | null = null;
    const gradeRank: Record<TrickGrade, number> = { crash: 0, sketchy: 1, clean: 2, stuck: 3 };

    // ---- The core: an AirSessionCore already wearing the vault skin. --------
    // onLanding fires inside core.step() at touchdown; we tally there.
    const core = makeVaultSession(undefined, {
      onLanding: (g: TrickGrade) => {
        if (g === 'stuck' || g === 'clean') { combo += 1; rec.recordHit(g === 'stuck'); rec.recordChain(combo); }
        else if (g === 'sketchy') { combo = 0; rec.recordHit(); }
        else { combo = 0; rec.recordMiss(); }
        if (bestGrade === null || gradeRank[g] > gradeRank[bestGrade]) bestGrade = g;
        landMsg = GRADE_LABEL[g];
        landColor = GRADE_COLOR[g];
        landMsgTimer = VAULT_TUNING.landBeatMs / 1000;
      },
    });

    const t = VAULT_TUNING;
    let nextFoot: CadenceSide = 'L';
    let cadenceMsg = '';
    let cadenceColor = '#FFFFFF';
    let cadenceTimer = 0;
    let landMsg = '';
    let landColor = '#FFFFFF';
    let landMsgTimer = 0;
    let stuckThisAttempt = false;

    function runTap(side: CadenceSide) {
      if (endedRef.current || core.state.phase !== 'Run') return;
      const q = core.runTap(side);
      nextFoot = side === 'L' ? 'R' : 'L';
      if (q === 'perfect') { cadenceMsg = 'PERFECT STRIDE'; cadenceColor = '#FFD700'; }
      else if (q === 'good' || q === 'first') { cadenceMsg = 'GOOD'; cadenceColor = '#00FF9D'; }
      else if (q === 'fault') { cadenceMsg = 'STUMBLE!'; cadenceColor = '#FF3366'; }
      else { cadenceMsg = 'OFF-BEAT'; cadenceColor = '#00E5FF'; }
      cadenceTimer = 0.5;
    }
    function flip() {
      if (endedRef.current || core.state.phase !== 'Air') return;
      core.trick();
    }
    function stick() {
      if (endedRef.current || core.state.phase !== 'Air') return;
      core.stick();
      stuckThisAttempt = true;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') { e.preventDefault(); runTap('L'); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); runTap('R'); }
      else if (e.code === 'ArrowUp' || e.code === 'Space') { e.preventDefault(); flip(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); stick(); }
    };
    window.addEventListener('keydown', onKey);
    (canvas as any).felVault = { left: () => runTap('L'), right: () => runTap('R'), flip, stick };

    function finish() {
      if (endedRef.current) return;
      endedRef.current = true;
      const score = core.state.score;
      const won = score >= WIN_SCORE;
      const bg = bestGrade ?? 'crash';
      onEndRef.current?.({
        score,
        won,
        duration: Math.round((Date.now() - startTime) / 1000),
        headline: won
          ? `VAULT SCORE ${score} — ${GRADE_LABEL[bg]} FOR GOLD`
          : `VAULT SCORE ${score} — KEEP TRAINING`,
        tallies: rec.tallies(),
        maxCombo: rec.bestChain,
      });
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (cadenceTimer > 0) cadenceTimer -= dt;
      if (landMsgTimer > 0) landMsgTimer -= dt;

      if (!endedRef.current) {
        core.step(dt);
        if (core.state.phase === 'Run') stuckThisAttempt = false;
        if (core.state.finished) finish();
      }

      const s = core.state;
      const phase = s.phase;

      // ===== draw =====
      ctx.clearRect(0, 0, W, H);
      if (bgReady) {
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.fillStyle = 'rgba(8,5,12,0.5)';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#120A1C';
        ctx.fillRect(0, 0, W, H);
      }

      const groundY = H - 120;
      // runway
      ctx.fillStyle = 'rgba(168,85,247,0.16)';
      ctx.fillRect(70, groundY, 700, 34);
      ctx.strokeStyle = 'rgba(168,85,247,0.45)';
      ctx.strokeRect(70, groundY, 700, 34);
      // vault table
      ctx.fillStyle = 'rgba(0,229,255,0.22)';
      ctx.fillRect(775, groundY - 40, 60, 74);
      ctx.strokeStyle = 'rgba(0,229,255,0.6)';
      ctx.strokeRect(775, groundY - 40, 60, 74);

      // athlete position along runway from pos.z (0 -> launchZ)
      const runRatio = Math.max(0, Math.min(1, s.pos.z / t.launchZ));
      let ax = 90 + runRatio * (770 - 90);
      let ay = groundY;
      let rot = 0;
      if (phase === 'Air') {
        ax = 800 + Math.max(0, (-s.pos.z + t.launchZ)) * 4; // drift past the table
        ax = Math.min(ax, W - 60);
        ay = groundY - s.pos.y * 20; // ~20px per metre of height
        rot = s.spinTurns * Math.PI * 2;
      } else if (phase === 'Land' || phase === 'Done') {
        ax = W - 90;
        ay = groundY;
      }
      drawAthlete(ctx, ax, ay, rot, phase);

      // ---- phase-specific cues ----
      if (phase === 'Run') {
        // speed bar
        const sp = s.speed / t.maxRunSpeed;
        ctx.fillStyle = 'rgba(5,5,5,0.6)';
        ctx.fillRect(W / 2 - 160, H / 2 - 6, 320, 16);
        ctx.fillStyle = sp > 0.66 ? '#FFD700' : sp > 0.33 ? '#00FF9D' : '#A855F7';
        ctx.fillRect(W / 2 - 158, H / 2 - 4, 316 * sp, 12);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.strokeRect(W / 2 - 160, H / 2 - 6, 320, 16);
        // alternating foot cue
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SPRINT THE RUN-UP — ALTERNATE', W / 2, H / 2 - 30);
        ctx.font = 'bold 40px "Barlow Condensed", sans-serif';
        ctx.fillStyle = nextFoot === 'L' ? '#FFD700' : 'rgba(255,255,255,0.35)';
        ctx.fillText('← LEFT', W / 2 - 120, H / 2 + 54);
        ctx.fillStyle = nextFoot === 'R' ? '#FFD700' : 'rgba(255,255,255,0.35)';
        ctx.fillText('RIGHT →', W / 2 + 120, H / 2 + 54);
      } else if (phase === 'Air') {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`FLIP ↑  ·  ${s.spinTurns.toFixed(1)} ROTATIONS`, W / 2, 120);
        // stick window cue when falling
        if (s.vy < 0) {
          ctx.fillStyle = stuckThisAttempt ? '#00FF9D' : '#FFD700';
          ctx.font = 'bold 34px "Barlow Condensed", sans-serif';
          ctx.fillText(stuckThisAttempt ? 'HELD FOR THE STICK' : 'STICK IT ↓', W / 2, 158);
        }
      }

      // cadence flash
      if (cadenceTimer > 0 && phase === 'Run') {
        ctx.fillStyle = cadenceColor;
        ctx.font = 'bold 30px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cadenceMsg, W / 2, H / 2 - 70);
      }
      // landing verdict
      if (landMsgTimer > 0 && (phase === 'Land' || phase === 'Done')) {
        ctx.fillStyle = landColor;
        ctx.font = 'bold 42px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(landMsg, W / 2, H / 2);
        if (s.lastGrade) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
          ctx.fillText(`${s.lastRotations.toFixed(1)} ROTATIONS`, W / 2, H / 2 + 36);
        }
      }

      // ===== HUD =====
      ctx.fillStyle = 'rgba(5,5,5,0.72)';
      ctx.fillRect(W * 0.2, 10, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(168,85,247,0.4)';
      ctx.strokeRect(W * 0.2, 10, W * 0.6, 52);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${s.score}`, W * 0.2 + 16, 44);
      ctx.textAlign = 'center';
      ctx.fillText(`VAULT ${Math.min(s.attempt + (phase === 'Done' ? 0 : 1), t.attemptsPerRound)}/${t.attemptsPerRound}`, W / 2, 44);
      ctx.textAlign = 'right';
      ctx.fillStyle = combo >= 2 ? '#FFD700' : '#FFFFFF';
      ctx.fillText(`COMBO x${combo}`, W * 0.8 - 16, 44);

      ctx.fillStyle = 'rgba(0,229,255,0.8)';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`PRQ ${prq.toFixed(0)} · ${gradeRef.current.label}`, W - 14, 24);

      if (!endedRef.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      delete (canvas as any).felVault;
    };
  }, [started, prq]);

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#120A1C]" style={{ aspectRatio: '16/9' }}>
        <canvas ref={canvasRef} width={W} height={H} className="h-full w-full" />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
            <h2 className="fel-heading text-4xl text-white">THE VAULT</h2>
            <p className="max-w-md text-sm text-gray-300">
              Sprint the run-up by alternating <span className="text-[#FFD700]">← LEFT</span> and <span className="text-[#FFD700]">RIGHT →</span> in rhythm to build speed. Punch off the table, tap <span className="text-[#00E5FF]">↑ FLIP</span> for rotations, then press <span className="text-[#00FF9D]">↓ STICK</span> as you drop to nail the landing. Two vaults — score {WIN_SCORE}+ for gold.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="rounded-lg bg-[#A855F7] px-8 py-3 font-bold text-white transition hover:bg-[#9333ea]"
            >
              SALUTE THE JUDGES
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 md:hidden">
        <button className="rounded-lg bg-[#A855F7]/20 py-4 text-lg font-bold text-[#A855F7] active:bg-[#A855F7]/40" onClick={() => (canvasRef.current as any)?.felVault?.left()}>← L</button>
        <button className="rounded-lg bg-[#A855F7]/20 py-4 text-lg font-bold text-[#A855F7] active:bg-[#A855F7]/40" onClick={() => (canvasRef.current as any)?.felVault?.right()}>R →</button>
        <button className="rounded-lg bg-[#00E5FF]/20 py-4 text-lg font-bold text-[#00E5FF] active:bg-[#00E5FF]/40" onClick={() => (canvasRef.current as any)?.felVault?.flip()}>↑ FLIP</button>
        <button className="rounded-lg bg-[#00FF9D]/20 py-4 text-lg font-bold text-[#00FF9D] active:bg-[#00FF9D]/40" onClick={() => (canvasRef.current as any)?.felVault?.stick()}>↓ STICK</button>
      </div>
    </div>
  );
}

/** A tiny stick gymnast. In Air we rotate the whole figure by `rot` radians. */
function drawAthlete(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, phase: string) {
  ctx.save();
  ctx.translate(x, y - 26);
  if (rot) ctx.rotate(rot);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -20, 10, 0, Math.PI * 2); // head
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 14); // torso
  // arms
  const armUp = phase === 'Air';
  ctx.moveTo(0, -4);
  ctx.lineTo(-16, armUp ? -18 : 6);
  ctx.moveTo(0, -4);
  ctx.lineTo(16, armUp ? -18 : 6);
  // legs
  ctx.moveTo(0, 14);
  ctx.lineTo(-12, 30);
  ctx.moveTo(0, 14);
  ctx.lineTo(12, 30);
  ctx.stroke();
  ctx.restore();
}
