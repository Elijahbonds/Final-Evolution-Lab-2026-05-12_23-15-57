'use client';

// The steps before the camera (SCREEN-SHIP, 2026-09-29; SCREEN-FIX), one per screen, each with its action in the first
// screen at 390×844 (gate 1): start → age → "A grown-up is with me" (under 18, or an age not given) → "Does anything
// hurt right now?" → the camera card.
//
// NOTHING IS SENT, EVER, and nothing is stored before the age answer. The answer itself is the one key written then
// (lib/screen/store.ts lockAge), so the question is asked once per run — every new Start resets it first (AGE-RESET,
// audit 2.2), so the next person on a shared phone answers for themselves. The gate record (age band, grown-up
// checkbox, timestamp, text version) is written to this tab's sessionStorage only with the result, and only after the
// grown-up step. A "yes" to pain ends the screen: no camera, no checks, nothing kept. The camera card says what the
// camera is for, and only its button asks the browser for the camera.
import { useState } from 'react';
import Link from 'next/link';
import {
  AGE_OPTIONS, AGE_QUESTION, CAMERA_INFO_BUTTON, CAMERA_INFO_LINES, CAMERA_INFO_TITLE, DISCLAIMER, GROWN_UP_BODY,
  GROWN_UP_CHECKBOX, GROWN_UP_TITLE, MORE_CHECKS_LINE, PAIN_QUESTION, PAIN_STOP, PRIVACY_LINK, SCREEN_TEST_NAMES,
} from '@/lib/screen/copy';
import type { AgeBand } from '@/lib/screen/age';
import { PRIVACY_PATH } from '@/lib/screen/routes';
import { PROTOCOL, type ProtocolTest } from '@/lib/assess/protocol';
import { PreviewLabel, StepCard, primaryBtn, quietBtn } from './screen-ui';

/** A check's name on the start card: the plain words where copy.ts has them (S-7), else the engine's name. */
const testName = (t: ProtocolTest): string => (SCREEN_TEST_NAMES as Partial<Record<string, string>>)[t.id] ?? t.name;

export function StartStep({ onStart }: { onStart: () => void }) {
  return (
    <StepCard testId="start">
      <p data-disclaimer className="text-[16px] font-bold leading-snug">{DISCLAIMER}</p>
      <div className="mt-2"><PreviewLabel /></div>
      <h2 className="mt-4 text-[18px] font-black">About five minutes, one camera</h2>
      <ul data-start-checks className="mt-2 space-y-1 text-[14px] text-white/75">
        {PROTOCOL.filter((t) => !t.notBuilt).map((t) => <li key={t.id}>{testName(t)}{t.sided ? ', each side' : ''}</li>)}
      </ul>
      <p data-more-checks className="mt-1 text-[12px] text-white/40">{MORE_CHECKS_LINE}</p>
      <p className="mt-3 text-[13px] leading-snug text-white/60">
        Everything runs on this device. The picture never leaves it, and nothing is sent anywhere.{' '}
        <Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link>
      </p>
      <button type="button" data-primary onClick={onStart} className={`${primaryBtn} mt-4`}>Start</button>
    </StepCard>
  );
}

/** Four answers, all alike: none pre-picked, none styled as the one to press, and no hint about what each allows. */
export function AgeStep({ onAnswer }: { onAnswer: (a: AgeBand) => void }) {
  return (
    <StepCard testId="age">
      <h2 className="text-[22px] font-black leading-tight">{AGE_QUESTION}</h2>
      <div role="group" aria-label={AGE_QUESTION} className="mt-4 space-y-2.5">
        {AGE_OPTIONS.map((o) => (
          <button key={o.band} type="button" data-age={o.band} onClick={() => onAnswer(o.band)} className={quietBtn}>{o.label}</button>
        ))}
      </div>
    </StepCard>
  );
}

export function GrownUpStep({ onContinue }: { onContinue: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <StepCard testId="grown-up">
      <h2 className="text-[21px] font-black leading-tight">{GROWN_UP_TITLE}</h2>
      <p className="mt-2 text-[14px] leading-snug text-white/75">{GROWN_UP_BODY}</p>
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/[0.03] p-3 text-[15px] font-bold leading-snug">
        <input type="checkbox" data-grown-up-box checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[#00E5FF]" />
        <span>{GROWN_UP_CHECKBOX}</span>
      </label>
      <button type="button" data-primary disabled={!ok} onClick={onContinue} className={`${primaryBtn} mt-4`}>Continue</button>
    </StepCard>
  );
}

export function PainStep({ onAnswer }: { onAnswer: (hurts: boolean) => void }) {
  return (
    <StepCard testId="pain">
      <h2 className="text-[22px] font-black leading-tight">{PAIN_QUESTION}</h2>
      <p className="mt-1 text-[13px] text-white/60">{DISCLAIMER}</p>
      <div className="mt-4 space-y-2.5">
        <button type="button" data-primary data-pain="no" onClick={() => onAnswer(false)} className={primaryBtn}>No, nothing hurts</button>
        <button type="button" data-pain="yes" onClick={() => onAnswer(true)} className={quietBtn}>Yes, something hurts</button>
      </div>
    </StepCard>
  );
}

/** S-3: before the browser's camera prompt, for every age: what the camera is for, where the video goes, what is asked. */
export function CameraInfoStep({ onCamera }: { onCamera: () => void }) {
  return (
    <StepCard testId="camera-info">
      <h2 className="text-[21px] font-black leading-tight">{CAMERA_INFO_TITLE}</h2>
      <ul data-camera-info className="mt-3 space-y-2 text-[15px] leading-snug text-white/85">
        {CAMERA_INFO_LINES.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <button type="button" data-primary onClick={onCamera} className={`${primaryBtn} mt-4`}>{CAMERA_INFO_BUTTON}</button>
    </StepCard>
  );
}

export function PainStopStep({ onRestart }: { onRestart: () => void }) {
  return (
    <StepCard testId="pain-stop">
      <h2 className="text-[21px] font-black leading-tight">Let&apos;s not run the screen today</h2>
      <p data-pain-stop className="mt-2 text-[16px] font-bold leading-snug text-[#FFB020]">{PAIN_STOP}</p>
      <p className="mt-2 text-[13px] text-white/60">{DISCLAIMER} Nothing was recorded.</p>
      <button type="button" data-primary onClick={onRestart} className={`${quietBtn} mt-4`}>Back to the start</button>
    </StepCard>
  );
}
