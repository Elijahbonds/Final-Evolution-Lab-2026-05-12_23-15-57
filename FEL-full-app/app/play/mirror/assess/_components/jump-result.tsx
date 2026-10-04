'use client';

// The jump-only result (SCREEN-JUMP-ONLY). Separate from ResultsView so the full screen's one next step stays the book.
//
// Adults see the number, the attempt count, the personal-best line, and three ways on: the rest of this screen
// (the jump is kept), the Dunking lane, and Brain Brawl. Under 18 and "rather not say" see the number, the
// attempts, the unit toggle, "Do the full screen", "Run it again" and the privacy page — no band and no link out.
import { useState } from 'react';
import Link from 'next/link';
import { jumpChange, jumpChangeLine } from '@/lib/screen/kid';
import {
  DISCLAIMER, JUMP_BUILD_PROGRAM, JUMP_DO_FULL, JUMP_MEANING, JUMP_PLAY_FREE, KID_JUMP, KID_NO_JUMP, KID_SAVE_LINE,
  PRIVACY_LINK, RUN_IT_AGAIN, STOP_LINE,
} from '@/lib/screen/copy';
import { formatJumpCm, readJumpUnit, writeJumpUnit, type JumpUnit } from '@/lib/screen/jump';
import { PRIVACY_PATH, programPath } from '@/lib/screen/routes';
import { tabStorage } from '@/lib/screen/store';
import { primaryBtn, quietBtn } from './screen-ui';

export function JumpResult({ heightCm, attempts, kid, jumpIn, lastIn, onFull, onAgain }: {
  heightCm: number | null;
  attempts: number;
  kid: boolean;
  jumpIn: number | null;
  lastIn: number | null;
  onFull: () => void;
  onAgain: () => void;
}) {
  const [unit, setUnit] = useState<JumpUnit>(() => readJumpUnit(tabStorage()));
  const pick = (u: JumpUnit) => { setUnit(u); writeJumpUnit(tabStorage(), u); };
  const change = kid ? jumpChange(jumpIn, lastIn) : null;
  return (
    <div data-jump-result={kid ? 'kid' : 'adult'} className="space-y-3">
      <p data-disclaimer className="text-[16px] font-bold leading-snug">{DISCLAIMER}</p>
      <p data-stop-line className="text-[16px] text-white/70">{STOP_LINE}</p>
      <section className="rounded-3xl border border-white/15 bg-white/[0.04] p-5 text-center">
        <p className="text-[16px] text-white/80">{KID_JUMP}</p>
        {heightCm !== null ? (
          <p data-jump-number className="mt-1 text-[40px] font-black leading-none text-white">{formatJumpCm(heightCm, unit)}</p>
        ) : (
          <p data-jump-missing className="mt-2 text-[18px] font-bold leading-snug">{KID_NO_JUMP}</p>
        )}
        <p data-jump-attempts className="mt-2 text-[16px] text-white/75">{attempts} attempts, best kept</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" data-unit="in" aria-pressed={unit === 'in'} onClick={() => pick('in')} className={`${unit === 'in' ? primaryBtn : quietBtn} min-h-12 max-w-[8rem]`}>Inches</button>
          <button type="button" data-unit="cm" aria-pressed={unit === 'cm'} onClick={() => pick('cm')} className={`${unit === 'cm' ? primaryBtn : quietBtn} min-h-12 max-w-[8rem]`}>Centimetres</button>
        </div>
        {!kid && heightCm !== null ? <p data-jump-meaning className="mt-3 text-[16px] text-white/80">{JUMP_MEANING}</p> : null}
        {change ? <p data-kid-change className="mt-2 text-[16px] font-bold text-white/85">{jumpChangeLine(change)}</p> : null}
        {kid && heightCm !== null ? <p data-kid-save-line className="mt-3 text-[16px] leading-snug text-white/75">{KID_SAVE_LINE}</p> : null}
      </section>
      <button type="button" data-primary data-do-full onClick={onFull} className={primaryBtn}>{JUMP_DO_FULL}</button>
      {!kid ? (
        <>
          <Link href={programPath('dunking')} prefetch={false} data-cta="program" className={quietBtn}>{JUMP_BUILD_PROGRAM}</Link>
          <Link href="/play/brain-brawl" prefetch={false} data-cta="play" className={quietBtn}>{JUMP_PLAY_FREE}</Link>
        </>
      ) : null}
      <button type="button" data-run-again onClick={onAgain} className={quietBtn}>{RUN_IT_AGAIN}</button>
      <p className="text-center text-[16px] text-white/70">
        <Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link>
      </p>
    </div>
  );
}
