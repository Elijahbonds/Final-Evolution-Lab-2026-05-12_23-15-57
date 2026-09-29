'use client';
// The per-exercise pain check-in + next-morning follow-up (MIRROR-COACH P5, 2026-09-29).
//
// Two pieces, both thin clients of app/api/health/pain: the rule, its copy and every threshold live in
// lib/health/painRule.ts and lib/health/pain.ts — this file only collects a score + where, posts it, and shows back
// exactly what the server said. It never computes a decision itself.
//
//   · <PainCheckInChip> — one small "Pain?" row under an exercise card (today-view.tsx). Collapsed by default,
//     optional, never required: a client who never opens it never sees a question. Opened, it asks 0–10 and where
//     (lib/health/painRule.ts BODY_AREAS), with the acute-event checkboxes (a pop, sudden swelling, giving way, a
//     fall/impact) always visible next to the score — those matter at any score, not just a high one.
//   · <NextMorningFollowUps> — mounted once at the top of Today. On load it asks the server what from yesterday (or
//     earlier) is still open (GET /api/health/pain), and asks about each one in turn: "did it settle?" A client can
//     skip one for this visit (it stays open — the server has nothing to mark it answered with) rather than being
//     forced through it, matching the chip's own "never required".
//
// HONESTY. The decision and its copy are shown VERBATIM from the server (PAIN_DECISION_COPY) — this file adds no
// line of its own reassurance or alarm, so there is exactly one place (painRule.ts) that ever has to be right.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Lock } from 'lucide-react';
import { ACUTE_EVENTS, BODY_AREAS, type AcuteEventId, type BodyAreaId, type PainDecision } from '@/lib/health/painRule';
import { HEALTH_DATA_CONSENT_COPY } from '@/lib/health/intake';

/** The one error code app/api/health/pain's POST returns for a minor with no accepted guardian consent (owner
 *  decision #6; lib/consent/guardianGate.ts). Every other error stays a generic "could not save". */
const GUARDIAN_LOCKED = 'guardian_consent_required';

/** MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "PainCheckIn health data is written with zero consent
 *  enforcement": app/api/health/pain's POST now checks for an active health_data HealthConsent grant BEFORE the
 *  guardian check (lib/health/consent.ts activeHealthDataConsent) and returns this code when there is none. This
 *  chip is the ONE surface that never had any consent screen in front of it at all (the Mirror's own
 *  HealthIntakeGate is what normally grants this scope, on submit) — so this file is where a first-time opt-in has
 *  to happen inline, not just a link out. */
const HEALTH_DATA_LOCKED = 'health_data_consent_required';

/** Shown in place of the form once the server says a guardian's OK is needed — /consent/guardian is the same
 *  screen the Mirror gates behind (app/play/mirror/_components/guardian-consent-gate.tsx), reached here as a link
 *  because a pain check-in has no session-level front door of its own to mount that gate inline in front of. */
function GuardianLockedNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
      <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        A parent or guardian needs to say it&apos;s OK before this saves.{' '}
        <Link href="/consent/guardian" className="font-medium text-[#00E5FF] underline underline-offset-2">
          Ask now
        </Link>
      </span>
    </div>
  );
}

/**
 * Shown in place of the form once the server says health-data collection has never been opted into (no active
 * 'health_data' HealthConsent grant). The SAME copy the Mirror's intake consent screen shows
 * (lib/health/intake.ts HEALTH_DATA_CONSENT_COPY) — one place this text is written, never a second, looser version
 * for this surface. `onGranted` re-runs whatever submission was waiting on this consent, so saying yes here does not
 * throw away the score the athlete already picked.
 */
function HealthConsentLockedNotice({ onGranted }: { onGranted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const grant = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/health/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'grant', scope: 'health_data' }),
      });
      if (!res.ok) { setError(true); return; }
      onGranted();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/70">
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-white/50" aria-hidden="true" />
        <span className="font-medium text-white/85">{HEALTH_DATA_CONSENT_COPY.title}</span>
      </div>
      <ul className="list-disc space-y-1 pl-6 text-white/60">
        {HEALTH_DATA_CONSENT_COPY.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={grant}
        className="w-full rounded-lg bg-white/8 border border-white/10 py-1.5 text-xs font-medium text-white/85 disabled:opacity-40 flex items-center justify-center gap-1.5"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} I agree — turn this on
      </button>
      {error && <p className="text-[11px] text-[#FF3366]">That didn&apos;t save — try again.</p>}
    </div>
  );
}

interface SubmitResult {
  decision: PainDecision;
  copy: string;
  stop: boolean;
  hardStop: boolean;
  easierVariationName: string | null;
}

async function submitPainCheckIn(body: Record<string, unknown>): Promise<{ ok: true; result: SubmitResult } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/health/pain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: typeof json?.error === 'string' ? json.error : `http_${res.status}` };
    return { ok: true, result: json as SubmitResult };
  } catch {
    return { ok: false, error: 'network' };
  }
}

const chipBase = 'rounded-full px-2.5 py-1 text-[11px] border';
const scoreBtn = (active: boolean) =>
  `h-7 w-7 shrink-0 rounded-md text-xs font-medium border ${active ? 'bg-[#00E5FF]/20 border-[#00E5FF]/50 text-[#00E5FF]' : 'border-white/10 text-white/60'}`;

/** The result banner: the server's own words, colored only by how urgent it is. Never re-explains the decision. */
function ResultBanner({ r }: { r: SubmitResult }) {
  const tone = r.hardStop ? 'border-[#FF3366]/40 bg-[#FF3366]/10 text-[#FF3366]' : r.stop ? 'border-[#FFD700]/40 bg-[#FFD700]/10 text-[#FFD700]' : 'border-[#00FF9D]/30 bg-[#00FF9D]/8 text-[#00FF9D]';
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${tone}`} role="status" data-pain-decision={r.decision}>
      {r.hardStop && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="leading-snug">
        {r.copy}
        {r.easierVariationName && <span className="block mt-0.5 text-white/70">Easier version queued: {r.easierVariationName}.</span>}
      </span>
    </div>
  );
}

/**
 * The score (+ body-area, unless the caller already knows it) + acute-event form shared by the chip and the
 * next-morning prompt. `fixedBodyArea` is set for a follow-up, which is already about one specific exercise + area
 * — asking "where" again there would read as though a NEW, unrelated report was starting.
 */
function PainForm({ busy, fixedBodyArea, onSubmit }: { busy: boolean; fixedBodyArea?: BodyAreaId; onSubmit: (v: { score: number; bodyArea: BodyAreaId; acute: AcuteEventId[] }) => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [bodyArea, setBodyArea] = useState<BodyAreaId | ''>(fixedBodyArea ?? '');
  const [acute, setAcute] = useState<AcuteEventId[]>([]);
  const toggle = (id: AcuteEventId) => setAcute((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const canSubmit = score !== null && bodyArea !== '';
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[11px] text-white/45 mb-1">Pain, 0–10</div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, n) => n).map((n) => (
            <button key={n} type="button" aria-pressed={score === n} onClick={() => setScore(n)} className={scoreBtn(score === n)}>{n}</button>
          ))}
        </div>
      </div>
      {!fixedBodyArea && (
        <div>
          <div className="text-[11px] text-white/45 mb-1">Where</div>
          <div className="flex flex-wrap gap-1">
            {BODY_AREAS.map((a) => (
              <button key={a.id} type="button" aria-pressed={bodyArea === a.id} onClick={() => setBodyArea(a.id)} className={`${chipBase} ${bodyArea === a.id ? 'bg-[#00E5FF]/15 border-[#00E5FF]/40 text-[#00E5FF]' : 'border-white/10 text-white/55'}`}>{a.label}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="text-[11px] text-white/45 mb-1">Did any of these happen?</div>
        <div className="flex flex-wrap gap-1">
          {ACUTE_EVENTS.map((e) => (
            <button key={e.id} type="button" aria-pressed={acute.includes(e.id)} onClick={() => toggle(e.id)} className={`${chipBase} ${acute.includes(e.id) ? 'bg-[#FF3366]/15 border-[#FF3366]/40 text-[#FF3366]' : 'border-white/10 text-white/55'}`}>{e.label}</button>
          ))}
        </div>
      </div>
      <button type="button" disabled={!canSubmit || busy} onClick={() => canSubmit && onSubmit({ score, bodyArea: bodyArea as BodyAreaId, acute })} className="w-full rounded-lg bg-white/8 border border-white/10 py-1.5 text-xs font-medium text-white/85 disabled:opacity-40 flex items-center justify-center gap-1.5">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Submit
      </button>
    </div>
  );
}

/**
 * One "Pain?" row under an exercise card. Collapsed → a quiet toggle; opened → the form; submitted → the server's
 * decision, shown until the card is closed. `kind` is 'during' (mid-set) or 'after' (right after) — the only two a
 * live exercise card can mean; the next-morning follow-up is a separate flow (<NextMorningFollowUps> below).
 */
export function PainCheckInChip({ exerciseName, programExerciseId, kind = 'after' }: { exerciseName: string; programExerciseId?: string | null; kind?: 'during' | 'after' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [needsHealthConsent, setNeedsHealthConsent] = useState(false);
  // MIRROR-COACH P5 FIX (2026-09-29, code review): the score the athlete already picked, held here so saying yes to
  // HealthConsentLockedNotice resubmits it rather than throwing it away and making them re-pick everything.
  const [pending, setPending] = useState<{ score: number; bodyArea: BodyAreaId; acute: AcuteEventId[] } | null>(null);

  const submit = async (v: { score: number; bodyArea: BodyAreaId; acute: AcuteEventId[] }) => {
    setBusy(true); setError(null);
    const r = await submitPainCheckIn({ programExerciseId: programExerciseId ?? undefined, exerciseName, bodyArea: v.bodyArea, score: v.score, kind, acute: v.acute });
    setBusy(false);
    if (!r.ok) {
      if (r.error === GUARDIAN_LOCKED) { setLocked(true); return; }
      if (r.error === HEALTH_DATA_LOCKED) { setPending(v); setNeedsHealthConsent(true); return; }
      setError('Could not save — try again.');
      return;
    }
    setPending(null);
    setResult(r.result);
  };

  return (
    <div data-pain-checkin={exerciseName}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60">
        Pain? (optional) {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && needsHealthConsent && (
        <div className="mt-1.5">
          <HealthConsentLockedNotice onGranted={() => { setNeedsHealthConsent(false); if (pending) void submit(pending); }} />
        </div>
      )}
      {open && locked && !needsHealthConsent && <div className="mt-1.5"><GuardianLockedNotice /></div>}
      {open && !result && !locked && !needsHealthConsent && <div className="mt-1.5"><PainForm busy={busy} onSubmit={submit} /></div>}
      {error && <div className="mt-1 text-[11px] text-[#FF3366]">{error}</div>}
      {result && <div className="mt-1.5"><ResultBanner r={result} /></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Next-morning follow-up
// ---------------------------------------------------------------------------------------------------------------

interface PendingFollowUp { exerciseName: string; bodyArea: string; programExerciseId: string | null; score: number; decision: string; createdAt: string }

/**
 * Mounted once at the top of Today. Asks the server what from yesterday (or earlier) still needs a follow-up
 * (GET /api/health/pain) and, one at a time, asks how it feels this morning — a `kind: 'next_morning'` check-in for
 * the SAME exercise + body area, which is what lets lib/health/painRule.ts's decide() read a settled/trending read
 * instead of a fresh one. Skipping one just hides it for this visit; nothing here can mark it answered without a
 * real submission, so it stays open until the athlete does answer it.
 */
export function NextMorningFollowUps() {
  const [pending, setPending] = useState<PendingFollowUp[] | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [answered, setAnswered] = useState<Record<number, SubmitResult>>({});
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [needsHealthConsent, setNeedsHealthConsent] = useState<Set<number>>(new Set());
  // The score already picked for each index, held so granting consent inline resubmits it (same reason as
  // PainCheckInChip's own `pending` state above).
  const [pendingSubmit, setPendingSubmit] = useState<Record<number, { score: number; bodyArea: BodyAreaId; acute: AcuteEventId[] }>>({});
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health/pain')
      .then((r) => (r.ok ? r.json() : { pendingFollowUps: [] }))
      .then((j) => { if (!cancelled) setPending(j.pendingFollowUps ?? []); })
      .catch(() => { if (!cancelled) setPending([]); });
    return () => { cancelled = true; };
  }, []);

  if (!pending) return null;
  const visible = pending.map((p, i) => ({ p, i })).filter(({ i }) => !skipped.has(i));
  if (!visible.length) return null;

  const submit = async (i: number, v: { score: number; bodyArea: BodyAreaId; acute: AcuteEventId[] }) => {
    const p = pending[i];
    setBusy(i);
    const r = await submitPainCheckIn({ programExerciseId: p.programExerciseId ?? undefined, exerciseName: p.exerciseName, bodyArea: p.bodyArea, score: v.score, kind: 'next_morning', acute: v.acute });
    setBusy(null);
    if (r.ok) { setAnswered((a) => ({ ...a, [i]: r.result })); return; }
    if (r.error === GUARDIAN_LOCKED) setLocked((s) => new Set(s).add(i));
    if (r.error === HEALTH_DATA_LOCKED) {
      setPendingSubmit((s) => ({ ...s, [i]: v }));
      setNeedsHealthConsent((s) => new Set(s).add(i));
    }
  };

  return (
    <div className="space-y-2 mb-4" data-testid="next-morning-followups">
      {visible.map(({ p, i }) => (
        <div key={`${p.exerciseName}:${p.bodyArea}`} className="fel-card rounded-xl p-3 space-y-2" data-follow-up={p.exerciseName}>
          <div className="text-xs text-white/70">
            <span className="font-medium text-white/90">{p.exerciseName}</span> — yesterday you logged {p.score}/10. How does it feel this morning?
          </div>
          {answered[i] ? (
            <ResultBanner r={answered[i]} />
          ) : needsHealthConsent.has(i) ? (
            <HealthConsentLockedNotice
              onGranted={() => {
                setNeedsHealthConsent((s) => { const next = new Set(s); next.delete(i); return next; });
                const v = pendingSubmit[i];
                if (v) void submit(i, v);
              }}
            />
          ) : locked.has(i) ? (
            <GuardianLockedNotice />
          ) : (
            <>
              <PainForm
                busy={busy === i}
                fixedBodyArea={p.bodyArea as BodyAreaId}
                onSubmit={(v) => submit(i, v)}
              />
              <button type="button" onClick={() => setSkipped((s) => new Set(s).add(i))} className="text-[11px] text-white/35 underline">Not now</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
