'use client';

// MIRROR-COACH P5 (2026-09-29): the pre-participation intake, mounted in front of the Mirror (app/play/mirror/page.tsx).
//
// Consent screen FIRST (owner decision #4/#18), one question per screen after it, every question skippable. The
// question text and the red-flag rule both live server-side (lib/health/intake.ts, lib/health/painRule.ts) — this
// component asks GET /api/health/intake what to show and POSTs the answers back; it never decides a red flag or
// writes a line of pain/consent copy itself (PHASE-5 CONTRACT: one reviewable module for that).
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
type Stage = 'loading' | 'error' | 'stopped' | 'consent' | 'question' | 'guardian_needed' | 'ready';

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

export function HealthIntakeGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [yearInput, setYearInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/health/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        // MIRROR-COACH P5 FIX (2026-09-29, code review): this one code means nothing was written at all — see
        // GUARDIAN_NEEDED's own comment — so it gets its own stage rather than the generic "didn't save" error the
        // catch block below shows for every other failure.
        if (data?.error === GUARDIAN_NEEDED) { setStage('guardian_needed'); return; }
        throw new Error(typeof data?.error === 'string' ? data.error : 'submit_failed');
      }
      setStage(data.hardStopped ? 'stopped' : 'ready');
      setStatus((s) => (s ? { ...s, hardStopped: data.hardStopped, redFlagCopy: data.redFlagCopy, latest: data.intake } : s));
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function markCleared() {
    if (!status?.latest?.id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/health/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', intakeId: status.latest.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'clear_failed');
      setStage('ready');
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function advance(nextAnswers: Record<string, AnswerValue>) {
    const questions = status?.questions ?? [];
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
      </GateShell>
    );
  }

  if (stage === 'question' && status) {
    const q = status.questions[qIndex];
    if (!q) return <GateShell><p className="text-[14px] text-white/60">Saving…</p></GateShell>;
    return (
      <GateShell>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-white/40">
          Question {qIndex + 1} of {status.questions.length}
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
              disabled={busy || !yearInput.trim()}
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
