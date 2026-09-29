'use client';

// The steps before the camera (SCREEN-SHIP, 2026-09-29), one per screen, each with its action in the first screen at
// 390×844 (gate 1): start → age → a parent's consent (under 18, or an age not given) → "Does anything hurt right now?".
//
// NOTHING HAPPENS BEFORE THE AGE ANSWER: no request, no storage (gate 5). The answers live in the page's memory; the
// consent record (age band, parent checkbox, timestamp, text version) is written to this tab's sessionStorage only with
// the result, and only after consent (lib/screen/store.ts). A "yes" to pain ends the screen: no camera, no checks,
// nothing kept, nothing sent.
import { useState } from 'react';
import {
  AGE_OPTIONS, AGE_QUESTION, CONSENT_BODY, CONSENT_CHECKBOX, CONSENT_TITLE, DISCLAIMER, PAIN_QUESTION, PAIN_STOP,
} from '@/lib/screen/copy';
import type { AgeBand } from '@/lib/screen/store';
import { PROTOCOL, NOT_BUILT_LINE } from '@/lib/assess/protocol';
import { PreviewLabel, StepCard, primaryBtn, quietBtn } from './screen-ui';

export function StartStep({ onStart }: { onStart: () => void }) {
  return (
    <StepCard testId="start">
      <p data-disclaimer className="text-[16px] font-bold leading-snug">{DISCLAIMER}</p>
      <div className="mt-2"><PreviewLabel /></div>
      <h2 className="mt-4 text-[18px] font-black">About five minutes, one camera</h2>
      <ul className="mt-2 space-y-1 text-[14px] text-white/75">
        {PROTOCOL.filter((t) => !t.notBuilt).map((t) => <li key={t.id}>{t.name}{t.sided ? ' (each side)' : ''}</li>)}
      </ul>
      <p className="mt-1 text-[12px] text-white/40">More checks: {NOT_BUILT_LINE.toLowerCase()}.</p>
      <p className="mt-3 text-[13px] leading-snug text-white/60">Everything runs on this phone. The picture never leaves it, and nothing is sent anywhere.</p>
      <button type="button" data-primary onClick={onStart} className={`${primaryBtn} mt-4`}>Start</button>
    </StepCard>
  );
}

export function AgeStep({ onAnswer }: { onAnswer: (a: AgeBand) => void }) {
  return (
    <StepCard testId="age">
      <h2 className="text-[22px] font-black leading-tight">{AGE_QUESTION}</h2>
      <p className="mt-1 text-[13px] text-white/60">Under 18 needs a parent or guardian to say OK first.</p>
      <div className="mt-4 space-y-2.5">
        {AGE_OPTIONS.map((o, i) => (
          <button key={o.band} type="button" data-primary={i === 0 ? '' : undefined} data-age={o.band} onClick={() => onAnswer(o.band)}
            className={i === 0 ? primaryBtn : quietBtn}>{o.label}</button>
        ))}
      </div>
    </StepCard>
  );
}

export function ConsentStep({ onConsent, onBack }: { onConsent: () => void; onBack: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <StepCard testId="consent">
      <h2 className="text-[21px] font-black leading-tight">{CONSENT_TITLE}</h2>
      <p className="mt-2 text-[14px] leading-snug text-white/75">{CONSENT_BODY}</p>
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/[0.03] p-3 text-[14.5px] leading-snug">
        <input type="checkbox" data-consent-box checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[#00E5FF]" />
        <span>{CONSENT_CHECKBOX}</span>
      </label>
      <button type="button" data-primary disabled={!ok} onClick={onConsent} className={`${primaryBtn} mt-4`}>Continue</button>
      <button type="button" onClick={onBack} className="mt-2 w-full py-2 text-[13px] text-white/60">Back</button>
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
