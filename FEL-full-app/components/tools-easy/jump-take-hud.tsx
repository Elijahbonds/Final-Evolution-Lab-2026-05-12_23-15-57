'use client';

// JumpTakeHud — what the readiness check and the combine jump station show over the camera (TOOLS-EASY, 2026-10-28).
// Before: one 18 px caption ("Hold still, hands on hips…", "Jump 1 of 3") and three dots. Now the Quick Screen's
// pattern, readable from across the room:
//   stand   the shared setup card: the fix in amber ("Step back", "Whole body in view") with the picture of where the
//           phone goes, or "Ready" in green with the hands-on-hips picture and "Stand still" while the stand is read
//   jump    "Jump!" and the count of jumps that counted, big; a refused jump's reason and fix in the card's place
// Every line here is also said (the page's one voice), and every spoken line is here, so a muted phone loses nothing.
import { RefusalCard, SetupCard } from './setup-card';
import type { SetupWord } from '@/lib/tools-easy/setup';
import { TAKE_JUMP_WORD, TAKE_READING, TAKE_STAND_LINE, TAKE_STAND_WORD, takeCount } from '@/lib/tools-easy/copy';

export interface JumpTakeHudView { step: 'stand' | 'jump' | 'done'; jumps: number; asked: number; why: string | null; refusal?: string | null }

export function JumpTakeHud({ v, setup, who }: { v: JumpTakeHudView; setup: SetupWord | null; who?: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-live="polite" data-take-hud={v.step}>
      {who ? <p className="absolute left-3 top-3 z-[6] rounded-full bg-black/65 px-3 py-1 text-[16px] font-bold text-white">{who}</p> : null}
      {v.step === 'stand' ? (
        setup && !setup.ready
          ? <SetupCard word={setup.word} ready={false} line={setup.line} picture="front" />
          : <SetupCard word={TAKE_STAND_WORD} ready line={v.why ?? TAKE_STAND_LINE} picture="hips" />
      ) : v.step === 'jump' ? (
        <>
          <div data-take-count className="absolute inset-x-0 top-10 z-[6] text-center font-black leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
            <span className="block text-[clamp(32px,9vw,44px)] text-[#00FF9D]">{TAKE_JUMP_WORD}</span>
            <span className="mt-2 block text-[clamp(64px,20vw,112px)] tabular-nums">{takeCount(v.jumps, v.asked)}</span>
          </div>
          {v.refusal ? <RefusalCard line={v.refusal} /> : null}
        </>
      ) : (
        <p className="absolute inset-x-3 top-10 z-[6] text-center text-[clamp(24px,7vw,32px)] font-black text-white">{TAKE_READING}</p>
      )}
    </div>
  );
}
