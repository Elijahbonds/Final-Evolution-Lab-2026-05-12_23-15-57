'use client';

// MIRROR-COACH P5 (2026-09-29): the pre-participation intake, mounted in front of the Mirror (app/play/mirror/page.tsx).
//
// Consent screen FIRST (owner decision #4/#18), one question per screen after it, every question skippable. The
// question text and the red-flag rule both live in lib/health/intake.ts (and lib/health/painRule.ts) and nowhere else —
// for a verified adult this component asks GET /api/health/intake what to show and POSTs the answers back; it never
// writes a line of pain/consent copy itself (PHASE-5 CONTRACT: one reviewable module for that).
//
// R-HEALTH-CLIENT (2026-09-30; FE PM 19:31, 19:46, 19:53 and 19:56 PT): WHEN THE ANSWERS MUST NOT BE SAVED, NOTHING IS
// SENT. `canWriteHealth` is page.tsx's server-side canWriteHealthData (lib/privacy/healthWriteGate.ts: the database's
// dobYear verified 18+). False — unknown age, under 18, 17 with a parent's yes — means the browser-only path: the
// questions come from lib/health/intake.ts's PUBLIC_INTAKE_QUESTIONS, the red-flag rule is that file's own (applied in
// page memory through ./intake-refusal.ts, imported, never copied), and no request of any kind goes out (no status GET,
// no submit, no clear). A red flag still stops with the same guidance; none continues into the Mirror. A verified adult
// who declines the consent screen ('No thanks, continue without saving') takes the same path, and one whose submit is
// refused anyway (403 health_data_adults_only) lands on it too. Nothing is remembered: a reload asks again.
//
// `children` (the gated session) renders only once the athlete is neither newly-due for an intake nor hard-stopped
// by a standing red flag. A hard stop shows RED_FLAG_COPY and a single "I've checked — mark cleared" action: a
// dated, self-attested tick (HealthIntake.clearedAt), never a verification and never a diagnosis.
//
// REUSABLE ON PURPOSE. This file is colocated under app/play/mirror because the Mirror is this phase's own mount
// point, but it depends on nothing Mirror-specific — a coached-session or pain-check-in entry point in another part
// of the app can wrap its own content in the same `<HealthIntakeGate>` (see lib/health/intake.ts's PUBLIC_INTAKE_
// QUESTIONS / HEALTH_DATA_CONSENT_COPY for the shapes this reads from the API).

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { PUBLIC_INTAKE_QUESTIONS, RED_FLAG_COPY, isValidBirthYear } from '@/lib/health/intake';
import {
  BROWSER_ONLY_LINE, DECLINED_LINE, DECLINE_LABEL, LOCAL_CLEARED, NOTHING_SAVED_LINE, NOT_KEPT_LINE, clearOnce,
  localIntakeOutcome, localIntakeStart, submitIntakeOnce, type LocalIntakeStatus,
} from './intake-refusal';

interface PublicIntakeQuestion {
  id: string;
  prompt: string;
  help?: string;
  type: 'yes_no' | 'birth_year';
  skippable: true;
}

interface ConsentCopy {
  title: string;
  bullets: readonly string[];
}

interface LatestIntake {
  id: string;
  version: string;
  redFlags: string[];
  birthYear: number | null;
  consentedAt: string;
  clearedAt: string | null;
  createdAt: string;
}

interface StatusResponse {
  questions: PublicIntakeQuestion[];
  consent: ConsentCopy;
  latest: LatestIntake | null;
  needsIntake: boolean;
  hardStopped: boolean;
  redFlagCopy: string | null;
  isMinor: boolean;
}

type AnswerValue = boolean | number;
// 'stopped_local' and 'ready_unsaved' are the browser-only path's stop and go (R-HEALTH-CLIENT): nothing was sent or saved.
type Stage = 'loading' | 'error' | 'stopped' | 'consent' | 'question' | 'guardian_needed' | 'ready' | 'stopped_local' | 'ready_unsaved';

/** The one error code app/api/health/intake's POST returns when submitIntake() held the WHOLE submission because
 *  this athlete needs a guardian first (lib/health/intake.ts's own doc comment on submitIntake). Nothing was
 *  written — not even the health_data consent grant — so this stage links out to the same guardian-ask screen the
 *  Mirror session gates behind and the intake simply re-asks once that clears (see this file's header). */
const GUARDIAN_NEEDED = 'guardian_consent_required';

async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/health/intake');
  if (!res.ok) throw new Error('status_failed');
  return res.json();
}

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5">{children}</div>
    </div>
  );
}

const primaryBtn =
  'w-full rounded-xl bg-[#00E5FF] py-3 text-[15px] font-bold text-black disabled:opacity-50';
const quietBtn =
  'w-full rounded-xl border border-white/15 bg-transparent py-3 text-[14px] font-semibold text-white/70 disabled:opacity-50';
// the consent screen's refusal (R-HEALTH-CLIENT, FE PM 19:56 PT): an outline, beside the primary agree
const outlineBtn =
  'w-full rounded-xl border border-[#00E5FF]/40 bg-transparent py-3 text-[14px] font-semibold text-[#00E5FF] disabled:opacity-50';

/**
 * `canWriteHealth` (default FALSE: a missing prop never sends): page.tsx's canWriteHealthData for this user. False → the
 * browser-only path, started from `localStatus` (page.tsx's server-side read of the stored intake; absent → due, no stop).
 */
export function HealthIntakeGate({ children, canWriteHealth = false, localStatus }: {
  children: ReactNode;
  canWriteHealth?: boolean;
  localStatus?: LocalIntakeStatus;
}) {
  const [stage, setStage] = useState<Stage>(() => (canWriteHealth ? 'loading' : localIntakeStart(localStatus)));
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [yearInput, setYearInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a verified adult chose 'No thanks, continue without saving': from that click on, this mount sends nothing
  const [declined, setDeclined] = useState(false);
  // the browser-only path asked something this mount (a question or a stop), so "nothing you answered was kept" is true
  const [askedLocally, setAskedLocally] = useState(() => !canWriteHealth && localIntakeStart(localStatus) !== 'ready_unsaved');
  const browserOnly = !canWriteHealth || declined;
  const questions = browserOnly ? PUBLIC_INTAKE_QUESTIONS : status?.questions ?? [];

  useEffect(() => {
    // browser-only: no status GET (the page's server render already read what this path needs)
    if (!canWriteHealth) return;
    let cancelled = false;
    fetchStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setStage(data.hardStopped ? 'stopped' : data.needsIntake ? 'consent' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setStage('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAnswers(finalAnswers: Record<string, AnswerValue>) {
    // BROWSER-ONLY: lib/health/intake.ts's red-flag rule, in page memory. Nothing is sent, so nothing can be saved.
    if (browserOnly) {
      setStage(localIntakeOutcome(finalAnswers).stage);
      return;
    }
    setBusy(true);
    setError(null);
    // today's single POST (./intake-refusal.ts submitIntakeOnce). The legacy 412 (GUARDIAN_NEEDED) still gets its own
    // stage; a 403 health_data_adults_only is answered in page memory, never with "That didn't save".
    const outcome = await submitIntakeOnce(fetch, finalAnswers);
    setBusy(false);
    if (outcome.stage === 'error') {
      setError("That didn't save — check your connection and try again.");
      return;
    }
    if (outcome.stage === 'stopped_local' || outcome.stage === 'ready_unsaved') setAskedLocally(true);
    setStage(outcome.stage);
    if (outcome.stage === 'ready' || outcome.stage === 'stopped') {
      const data = outcome.data;
      setStatus((s) => (s ? { ...s, hardStopped: data.hardStopped, redFlagCopy: data.redFlagCopy, latest: data.intake as LatestIntake } : s));
    }
  }

  async function markCleared() {
    // a stop that was decided in page memory is cleared in page memory: no request, no row (a reload asks again)
    if (browserOnly || stage === 'stopped_local') {
      setStage(LOCAL_CLEARED);
      return;
    }
    if (!status?.latest?.id) return;
    setBusy(true);
    setError(null);
    // today's single clear POST; an adults-only refusal (an old intake row on an account that isn't a verified adult)
    // gets the same page-memory tick
    const next = await clearOnce(fetch, status.latest.id);
    setBusy(false);
    if (next === 'error') {
      setError("That didn't save — check your connection and try again.");
      return;
    }
    if (next === LOCAL_CLEARED) setAskedLocally(true);
    setStage(next);
  }

  /** 'No thanks, continue without saving' (FE PM 19:56 PT): no consent is recorded; the intake is asked in page memory. */
  function decline() {
    setDeclined(true);
    setAskedLocally(true);
    setAnswers({});
    setQIndex(0);
    setYearInput('');
    setStage('question');
  }

  function advance(nextAnswers: Record<string, AnswerValue>) {
    setYearInput('');
    if (qIndex + 1 < questions.length) {
      setAnswers(nextAnswers);
      setQIndex(qIndex + 1);
    } else {
      setAnswers(nextAnswers);
      void submitAnswers(nextAnswers);
    }
  }

  if (stage === 'ready') return <>{children}</>;

  // R-HEALTH-CLIENT: the Mirror, with nothing from the intake kept. One quiet line above it (not an error), and only when
  // it is true: this mount asked something, or the athlete declined. Nothing asked (not due) → no line.
  if (stage === 'ready_unsaved') {
    const line = declined ? DECLINED_LINE : askedLocally ? NOT_KEPT_LINE : null;
    return (
      <>
        {line && <p className="mx-auto max-w-3xl px-4 pt-4 text-[12.5px] leading-snug text-white/50">{line}</p>}
        {children}
      </>
    );
  }

  if (stage === 'loading') {
    return (
      <GateShell>
        <p className="text-[14px] text-white/60">Checking in…</p>
      </GateShell>
    );
  }

  if (stage === 'error') {
    return (
      <GateShell>
        <p className="text-[14px] text-white/60">Couldn&apos;t load the health check. Refresh to try again.</p>
      </GateShell>
    );
  }

  // MIRROR-COACH P5 FIX (2026-09-29, code review): reached only when submitIntake() held the whole submission —
  // nothing about this athlete's answers was written. Links to the same guardian-ask screen the Mirror session
  // itself gates behind (app/consent/guardian); once that clears, this component's OWN next status check
  // (fetchStatus, on remount) still reads `needsIntake: true`, so returning here simply re-asks the same short
  // question set rather than resuming a half-saved one that never existed.
  if (stage === 'guardian_needed') {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white">One more thing first</h2>
        <p className="mt-2 text-[13.5px] leading-snug text-white/70">
          Because you&apos;re under 18 (or haven&apos;t told us your birth year yet), a parent or guardian needs to say
          it&apos;s OK before we can save this. Nothing you just answered was kept.
        </p>
        <Link href="/consent/guardian" className={`${primaryBtn} mt-4 block text-center`}>
          Ask a parent or guardian
        </Link>
      </GateShell>
    );
  }

  if (stage === 'stopped' && status) {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white">Before you continue</h2>
        <p className="mt-2 text-[15px] font-semibold leading-snug text-[#FFB020]">{status.redFlagCopy}</p>
        <p className="mt-2 text-[12px] leading-snug text-white/50">This isn&apos;t a diagnosis — it&apos;s just a pause until you&apos;ve checked with a clinician.</p>
        <button type="button" disabled={busy} onClick={markCleared} className={`${quietBtn} mt-4`}>
          I&apos;ve checked — mark cleared
        </button>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </GateShell>
    );
  }

  // R-HEALTH-CLIENT: the same guidance as the server's stop above, decided in page memory by lib/health/intake.ts's rule,
  // and the Mirror is not mounted. assumption: (FE PM can reverse) "mark cleared" here is the same self-attested tick as
  // the adult flow, kept in page memory only (no request, no row): it moves on to the Mirror, and a reload asks again.
  if (stage === 'stopped_local') {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white">Before you continue</h2>
        <p className="mt-2 text-[15px] font-semibold leading-snug text-[#FFB020]">{RED_FLAG_COPY}</p>
        <p className="mt-2 text-[12px] leading-snug text-white/50">This isn&apos;t a diagnosis — it&apos;s just a pause until you&apos;ve checked with a clinician.</p>
        <p className="mt-2 text-[12px] leading-snug text-white/50">{NOTHING_SAVED_LINE}</p>
        <button type="button" onClick={markCleared} className={`${quietBtn} mt-4`}>
          I&apos;ve checked — mark cleared
        </button>
      </GateShell>
    );
  }

  if (stage === 'consent' && status) {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white">{status.consent.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-snug text-white/75">
          {status.consent.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <button type="button" onClick={() => setStage('question')} className={`${primaryBtn} mt-4`}>
          I agree — continue
        </button>
        {/* consent must be refusable (FE PM 19:56 PT): nothing is recorded or saved from this click on */}
        <button type="button" onClick={decline} className={`${outlineBtn} mt-2.5`}>
          {DECLINE_LABEL}
        </button>
      </GateShell>
    );
  }

  if (stage === 'question' && (browserOnly || status)) {
    const q = questions[qIndex];
    if (!q) return <GateShell><p className="text-[14px] text-white/60">Saving…</p></GateShell>;
    return (
      <GateShell>
        {browserOnly && qIndex === 0 && <p className="mb-3 text-[12.5px] leading-snug text-white/60">{BROWSER_ONLY_LINE}</p>}
        <p className="text-[12px] font-semibold uppercase tracking-wide text-white/40">
          Question {qIndex + 1} of {questions.length}
        </p>
        <h2 className="mt-2 text-[19px] font-black leading-tight text-white">{q.prompt}</h2>
        {q.help && <p className="mt-1 text-[13px] text-white/55">{q.help}</p>}

        {q.type === 'yes_no' && (
          <div className="mt-4 space-y-2.5">
            <button type="button" disabled={busy} onClick={() => advance({ ...answers, [q.id]: true })} className={primaryBtn}>
              Yes
            </button>
            <button type="button" disabled={busy} onClick={() => advance({ ...answers, [q.id]: false })} className={quietBtn}>
              No
            </button>
          </div>
        )}

        {q.type === 'birth_year' && (
          <div className="mt-4 space-y-2.5">
            <input
              type="number"
              inputMode="numeric"
              placeholder="e.g. 1998"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[16px] text-white outline-none"
            />
            <button
              type="button"
              // browser-only: a year lib/health/intake.ts wouldn't accept can't be sent on, so a typo never reads as a stop
              // (assumption: FE PM can reverse; the adult path is unchanged and the server still answers its own 400)
              disabled={busy || !yearInput.trim() || (browserOnly && !isValidBirthYear(Number(yearInput)))}
              onClick={() => advance({ ...answers, [q.id]: Number(yearInput) })}
              className={primaryBtn}
            >
              Continue
            </button>
          </div>
        )}

        <button type="button" disabled={busy} onClick={() => advance(answers)} className={`${quietBtn} mt-2`}>
          Skip
        </button>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </GateShell>
    );
  }

  return null;
}
