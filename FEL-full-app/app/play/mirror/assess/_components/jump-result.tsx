'use client';

// The jump-only result (SCREEN-JUMP-ONLY; VERTICAL-EASY 2026-10-27: "Measure my vertical").
//
// ONE BIG NUMBER, then three short lines (docs/CUE-STYLE.md §4): what we saw (the best of the jumps that counted), what it
// means (against the last one, or the number to beat), what to do next. Then ONE primary, "Done", and a quiet "Jump again".
// Everything else — inches or centimetres, the estimate line, the full screen, the dunk program, Brain Brawl, and for an
// adult the session card, the slow-mo and the other tests (`more`) — is one tap away under "More detail", so a first-timer
// reads a number and three lines, not a page. Before: two disclaimers, a label, the number, an estimate paragraph, the
// attempts, a unit toggle, a meaning line, five buttons, a privacy link, then three more cards.
//
// Under 18 and "rather not say": the number from page memory, the change since their last screen here, the save-your-number
// line, no program or game link (unchanged rules). The disclaimer and the stop line stay on the page, at the foot.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import {
  DISCLAIMER, JUMP_BUILD_PROGRAM, JUMP_ESTIMATE_LINE, JUMP_DO_FULL, JUMP_PLAY_FREE, KID_NO_JUMP, KID_SAVE_LINE,
  PRIVACY_LINK, STOP_LINE,
} from '@/lib/screen/copy';
import { readJumpUnit, writeJumpUnit, type JumpUnit } from '@/lib/screen/jump';
import { inches } from '@/lib/assess/why';
import { PRIVACY_PATH, programPath } from '@/lib/screen/routes';
import { tabStorage } from '@/lib/screen/store';
import {
  RESULT_AGAIN, RESULT_DONE, RESULT_LABEL, RESULT_MORE, RESULT_NEXT, RESULT_NONE_MEANS, RESULT_NONE_NEXT, RESULT_NONE_SAW,
  resultMeans, resultSaw,
} from '@/lib/vertical/copy';
import { changeOf, lastKeptCheckCm } from '@/lib/vertical/result';
import { primaryBtn, quietBtn } from './screen-ui';

const safeLocal = (): Pick<Storage, 'getItem'> | null => { try { return window.localStorage; } catch { return null; } };

/** Where "Done" goes: the app's front door (signed in it opens Play; signed out, the landing). */
export const RESULT_DONE_HREF = '/';

export function JumpResult({ heightCm, plusMinusCm = null, attempts, counted, kid, jumpIn, lastIn, onFull, onAgain, lastCm = null, more = null }: {
  heightCm: number | null;
  /** Jumps that counted (default: every attempt). */
  counted?: number;
  /** The grader's band (cm): shown as the ± range, never an exact number. */
  plusMinusCm?: number | null;
  attempts: number;
  kid: boolean;
  jumpIn: number | null;
  lastIn: number | null;
  onFull: () => void;
  onAgain: () => void;
  /** An adult's last kept live check on this device (lib/jump/historyStore.ts), for "what it means". Read, never written. */
  lastCm?: number | null;
  /** An adult's detail cards (session card, slow-mo, more tests), shown under "More detail". */
  more?: ReactNode;
}) {
  const [unit, setUnit] = useState<JumpUnit>(() => readJumpUnit(tabStorage()));
  // an adult's last kept check on this device, read once (never for a kid: their last number is page memory, lastIn)
  const [keptCm] = useState<number | null>(() => (kid || lastCm !== null || typeof window === 'undefined' ? lastCm : lastKeptCheckCm(safeLocal())));
  const pick = (u: JumpUnit) => { setUnit(u); writeJumpUnit(tabStorage(), u); };
  void jumpIn;                                                   // the kid's number is heightCm; lastIn is their last one here
  const change = heightCm === null ? null : changeOf(heightCm, kid ? (lastIn === null ? null : lastIn * 2.54) : keptCm, unit);
  const v = heightCm === null ? null : unit === 'cm' ? heightCm : inches(heightCm);
  const pm = heightCm === null || plusMinusCm === null || !Number.isFinite(plusMinusCm) ? null
    : Math.max(1, Math.round(unit === 'cm' ? plusMinusCm : inches(plusMinusCm)));
  const u = unit === 'cm' ? 'cm' : 'in';
  const estimate = v === null ? '' : `about ${Math.round(v)}${pm === null ? '' : ` ±${pm}`} ${u}`;
  return (
    <div data-jump-result={kid ? 'kid' : 'adult'} className="space-y-4">
      <section className="rounded-3xl border border-white/15 bg-white/[0.04] p-5 text-center">
        <p className="text-[16px] font-bold uppercase tracking-[0.16em] text-white/60">{RESULT_LABEL}</p>
        {v !== null ? (
          <p data-jump-number aria-label={estimate} className="mt-2 flex items-baseline justify-center gap-2 font-black leading-none text-white">
            <span className="sr-only">about </span>
            <span className="text-[88px] tracking-tight">{Math.round(v)}</span>{' '}
            <span className="text-[28px]">{pm === null ? '' : `±${pm} `}{u}</span>
          </p>
        ) : (
          <p data-jump-missing className="mt-2 text-[28px] font-black leading-tight">{KID_NO_JUMP}</p>
        )}
        <ul data-jump-lines className="mx-auto mt-4 max-w-sm space-y-2 text-left text-[16px] leading-snug">
          {v !== null ? (
            <>
              <li data-jump-saw className="font-bold text-white">{resultSaw(counted ?? attempts, `${Math.round(v)} ${u}`)}</li>
              <li data-jump-meaning className="text-white/80">{resultMeans(change)}</li>
              <li data-jump-next className="text-white/80">{RESULT_NEXT}</li>
            </>
          ) : (
            <>
              <li data-jump-saw className="font-bold text-white">{RESULT_NONE_SAW}</li>
              <li data-jump-meaning className="text-white/80">{RESULT_NONE_MEANS}</li>
              <li data-jump-next className="text-white/80">{RESULT_NONE_NEXT}</li>
            </>
          )}
        </ul>
        {kid && v !== null ? <p data-kid-save-line className="mt-3 text-[16px] leading-snug text-white/75">{KID_SAVE_LINE}</p> : null}
      </section>

      <Link href={RESULT_DONE_HREF} prefetch={false} data-primary data-done className={primaryBtn}>
        <Check aria-hidden className="mr-2 h-5 w-5" strokeWidth={3} />{RESULT_DONE}
      </Link>
      <button type="button" data-run-again onClick={onAgain} className={quietBtn}>{RESULT_AGAIN}</button>

      <details data-jump-more className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center text-[16px] font-bold text-white/80 underline underline-offset-4">{RESULT_MORE}</summary>
        <div className="mt-3 space-y-3 text-left">
          {v !== null ? <p data-jump-estimate className="text-[16px] leading-snug text-white/75">{JUMP_ESTIMATE_LINE} Today: {estimate}.</p> : null}
          <p data-jump-attempts className="text-[16px] text-white/75">{attempts} jumps, best one shown</p>
          <div className="flex justify-center gap-2" role="group" aria-label="Units">
            <button type="button" data-unit="in" aria-pressed={unit === 'in'} onClick={() => pick('in')} className={`${quietBtn} max-w-[10rem] ${unit === 'in' ? 'border-[#00E5FF] text-[#00E5FF]' : ''}`}>Inches</button>
            <button type="button" data-unit="cm" aria-pressed={unit === 'cm'} onClick={() => pick('cm')} className={`${quietBtn} max-w-[10rem] ${unit === 'cm' ? 'border-[#00E5FF] text-[#00E5FF]' : ''}`}>Centimetres</button>
          </div>
          <button type="button" data-do-full onClick={onFull} className={quietBtn}>{JUMP_DO_FULL}</button>
          {!kid ? (
            <>
              <Link href={programPath('dunking')} prefetch={false} data-cta="program" className={quietBtn}>{JUMP_BUILD_PROGRAM}</Link>
              <Link href="/play/brain-brawl" prefetch={false} data-cta="play" className={quietBtn}>{JUMP_PLAY_FREE}</Link>
            </>
          ) : null}
          {more}
        </div>
      </details>

      <div className="space-y-1 text-center text-[16px] text-white/60">
        <p data-disclaimer>{DISCLAIMER}</p>
        <p data-stop-line>{STOP_LINE}</p>
        <p><Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link></p>
      </div>
    </div>
  );
}
