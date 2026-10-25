'use client';

// JumpSessionCard — every jump of a jump check, under the headline number (JUMP-PRO, 2026-10-24).
//
// Adults only (the caller never mounts it for an under-18 or "rather not say": lib/screen/kid.ts shows a kid their own
// number and nothing else). Each jump with its own ± (lib/jump/refine.ts), what kept it from being a clean read and the
// one tip that fixes it (lib/jump/session.ts TRIAL_TIPS), the set as mean ± SD, the smallest change that would be real
// next time, and whether the best is VERIFIED (the owner's rule, verifyJump).
//
// MIRROR-TRUST-RATING hook: `trustLevel` is PR #424's jump.height level. On 'low' that PR hides the number, so this
// card renders nothing; until #424 lands the caller passes null.
//
// Shows numbers the page already holds. Saves nothing, sends nothing.
import { BadgeCheck, CircleDashed } from 'lucide-react';
import type { T5Extra } from '@/lib/assess/scoring';
import { sessionTip, verifyJump, type TrialFlag, type TrustLevelHook, type VerifyBlock } from '@/lib/jump/session';

const IN = 2.54;
const inch = (cm: number) => (cm / IN).toFixed(1);
const pmIn = (cm: number) => Math.max(0.1, cm / IN).toFixed(1);

/** A flag in two or three words, beside the jump it belongs to. */
export const FLAG_WORDS: Record<TrialFlag, string> = {
  landedLow: 'landed low, corrected',
  feetUnclear: 'feet hard to see',
  moved: 'moved on landing',
  outlier: 'far above the rest',
  framesOnly: 'frame-timed',
  frameRate: 'estimate',
};

/** Why the best jump is not verified, in words. */
export const BLOCK_WORDS: Record<VerifyBlock, string> = {
  notValid: 'no valid jump',
  frameRate: 'the camera ran too slowly to verify (it needs 50 frames a second, or a slow-motion video)',
  landing: 'the landing was not tall',
  unclear: 'the read was not tight enough',
  moved: 'you moved toward or away from the camera',
  outlier: 'it was far above your other jumps',
  framesOnly: 'it could only be timed from whole frames',
  trustLow: 'the camera could not see clearly enough',
  notBest: 'not your best jump',
};

export function JumpSessionCard({ t5, trustLevel = null, source = 'live' }: { t5: T5Extra | null; trustLevel?: TrustLevelHook | null; source?: 'live' | 'slowmo' }) {
  if (!t5 || trustLevel === 'low') return null;
  const valid = t5.jumps.filter((j) => j.valid);
  if (!valid.length) return null;
  const s = t5.session;
  const best = valid.find((j) => j.index === t5.bestJump) ?? valid[0];
  const v = verifyJump(best, { poseHz: t5.poseFps, source, trust: trustLevel });
  // the best may be flagged (an outlier, a low landing) while a clean jump below it verifies: that one is the verified best
  const clean = !v.verified && s?.bestCleanIndex != null && s.bestCleanIndex !== best.index ? valid.find((j) => j.index === s.bestCleanIndex) ?? null : null;
  const vc = clean ? verifyJump(clean, { poseHz: t5.poseFps, source, trust: trustLevel }) : null;
  const tip = sessionTip(t5.jumps);
  return (
    <section data-jump-session className="rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">Your jumps</h2>
      <ul className="mt-2 space-y-1.5">
        {t5.jumps.map((j) => (
          <li key={j.index} data-jump-row={j.index} data-valid={j.valid} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[16px]">
            <span className="text-white/80">Jump {j.index}{j.index === t5.bestJump ? ' · best' : ''}</span>
            {j.valid ? (
              <span className="font-bold text-white">
                {inch(j.heightCm)} in{j.heightSdCm ? <span className="font-normal text-white/70"> ±{pmIn(1.96 * j.heightSdCm)}</span> : null}
                <span className="ml-1 font-normal text-white/60">({j.heightCm.toFixed(1)} cm)</span>
              </span>
            ) : <span className="text-white/70">not counted</span>}
            {j.valid && j.quality?.flags.length ? (
              <span data-jump-flags className="w-full text-[16px] text-white/65">{j.quality.flags.map((f) => FLAG_WORDS[f]).join(' · ')}</span>
            ) : !j.valid && j.invalidWhy ? <span className="w-full text-[16px] text-white/65">{j.invalidWhy}</span> : null}
          </li>
        ))}
      </ul>
      {s && s.n >= 2 && s.meanCm !== null && s.sdCm !== null ? (
        <p data-jump-mean className="mt-3 text-[16px] text-white/80">
          Average {inch(s.meanCm)} ± {pmIn(s.sdCm)} in{s.cvPct !== null ? ` · ${s.cvPct.toFixed(1)}% spread` : ''}
        </p>
      ) : null}
      {s?.realChangeCm ? (
        <p data-jump-real-change className="mt-1 text-[16px] text-white/70">
          Next time, a change of {pmIn(s.realChangeCm)} in or more is a real change; less is within the noise.
        </p>
      ) : null}
      {t5.rebounds?.bestRsi != null ? (
        <p data-jump-rebound className="mt-1 text-[16px] text-white/80">
          Rebound: {(t5.rebounds.bestContactMs! / 1000).toFixed(2)} s on the ground, RSI {t5.rebounds.bestRsi.toFixed(2)}
          {t5.rebounds.best5Rsi !== null ? ` · best-5 RSI ${t5.rebounds.best5Rsi.toFixed(2)}` : ''}{source === 'live' && t5.poseFps < 120 ? ' (estimate)' : ''}
        </p>
      ) : null}
      <p data-jump-verified={v.verified || !!vc?.verified} className="mt-3 flex items-start gap-1.5 text-[16px] font-bold" style={{ color: v.verified || vc?.verified ? '#00FF9D' : 'rgba(255,255,255,0.7)' }}>
        {v.verified || vc?.verified ? <BadgeCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleDashed aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{v.verified ? 'Verified jump' : vc?.verified && clean ? `Verified best: ${inch(clean.heightCm)} in (jump ${clean.index})` : `Not verified: ${BLOCK_WORDS[v.blocks[0]]}`}</span>
      </p>
      {tip ? <p data-jump-tip className="mt-2 text-[16px] leading-snug text-white/80">{tip}</p> : null}
    </section>
  );
}
