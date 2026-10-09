'use client';

// The chapter check — EDU-LINKS (2026-10-07), owner decision 6: "Playbook chapter shards: quiz at 80%."
//
// THE CLIENT NEVER GRADES. It fetches the questions (no answers, no book lines) from /api/education/playbook/check, sends
// the chosen options back, and shows what the server says: the score, right or wrong per question, and what was paid.
// It imports nothing that holds the answer key (lib/education/chapterCheck.test.ts reads this file to make sure).
//
// Shown only when the chapter's check is live. Under the draft flag every screen of it says DRAFT, because the
// questions are the owner's unapproved drafts (docs/PLAYBOOK-QUIZ-DRAFTS.md). Under 18 or an unknown age the server keeps
// nothing (`saves: false`) and pays nothing; the result is kept on this device (lib/education/checkDevice.ts).

import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCheck, Gem, RotateCcw, X } from 'lucide-react';
import { readDeviceChecks, recordDeviceCheck, writeDeviceChecks } from '@/lib/education/checkDevice';

export interface CheckQuestion { id: string; question: string; options: string[]; draft: boolean }
export interface CheckInfo {
  available: boolean; draft?: boolean; passMark?: number; questions?: CheckQuestion[];
  saves?: boolean; passedBefore?: boolean; worth?: number;
}
export interface CheckResult {
  score: number; passed: boolean; correct: number; total: number; passMark: number;
  results: { id: string; correct: boolean }[]; saved?: boolean; awarded: number; bonus: number;
}

/** The check's own words, in one place so the tests read the same strings the player does. */
export const CHECK_COPY = {
  title: 'Chapter check',
  draft: 'DRAFT — these questions are waiting for the author’s approval.',
  rule: (mark: number) => `Answer every question. ${mark}% passes.`,
  worth: (n: number) => `A pass pays ${n} shards.`,
  passedBefore: 'You passed this check. Its shards are paid.',
  device: 'Your result stays on this device. Chapter-check shards go to verified adult accounts.',
  submit: 'Check my answers',
  pass: (score: number) => `Passed — ${score}%.`,
  fail: (score: number, mark: number) => `${score}%. You need ${mark}% to pass, so nothing is paid this time.`,
  failNext: 'Read the chapter again and try the check when you’re ready.',
  retry: 'Try again',
  error: 'Could not reach the server, so nothing was checked. Try again.',
} as const;

export function ChapterCheck({ chapter }: { chapter: number }) {
  const [info, setInfo] = useState<CheckInfo | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/education/playbook/check?chapter=${chapter}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j && typeof j.available === 'boolean') setInfo(j as CheckInfo); })
      .catch(() => {});
    return () => { live = false; };
  }, [chapter]);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/education/playbook/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chapter, answers: picked }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || typeof j.score !== 'number') { setError(true); return; }
      setResult(j as CheckResult);
      if (j.saved !== true) {
        // Nothing was kept on the server for this account: the device keeps the best score.
        let store: Storage | null = null;
        try { store = window.localStorage; } catch { store = null; }
        writeDeviceChecks(store, recordDeviceCheck(readDeviceChecks(store), chapter, j.score, j.passed === true));
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [busy, chapter, picked]);

  const retry = useCallback(() => { setResult(null); setPicked({}); }, []);

  if (!info?.available) return null;
  return (
    <ChapterCheckView
      info={info} picked={picked} result={result} busy={busy} error={error}
      onPick={(id, option) => setPicked((p) => ({ ...p, [id]: option }))}
      onSubmit={submit} onRetry={retry}
    />
  );
}

/** The check, drawn from its state. Exported so it renders in a test without a network. */
export function ChapterCheckView({ info, picked, result, busy, error, onPick, onSubmit, onRetry }: {
  info: CheckInfo; picked: Record<string, string>; result: CheckResult | null; busy: boolean; error: boolean;
  onPick: (id: string, option: string) => void; onSubmit: () => void; onRetry: () => void;
}) {
  const questions = info.questions ?? [];
  const mark = info.passMark ?? 80;
  const all = questions.length > 0 && questions.every((q) => typeof picked[q.id] === 'string');
  const verdict = new Map(result?.results.map((r) => [r.id, r.correct]) ?? []);

  return (
    <section data-chapter-check className="mt-8 rounded-2xl border border-[#A855F7]/30 bg-[#A855F7]/[0.04] p-5">
      <h3 className="fel-heading flex items-center gap-2 text-[16px] font-bold text-white">
        <ClipboardCheck aria-hidden className="h-4 w-4 text-[#A855F7]" /> {CHECK_COPY.title}
      </h3>
      {info.draft && (
        <p data-check-draft className="mt-2 rounded-lg border border-amber-300/30 bg-amber-300/[0.07] px-3 py-2 text-[12.5px] font-bold text-amber-200">
          {CHECK_COPY.draft}
        </p>
      )}
      <p className="mt-2 text-[13px] text-white/60">
        {CHECK_COPY.rule(mark)}{' '}
        {info.saves === false ? CHECK_COPY.device
          : info.passedBefore ? CHECK_COPY.passedBefore
          : info.worth ? CHECK_COPY.worth(info.worth) : null}
      </p>

      <ol className="mt-4 space-y-5">
        {questions.map((q, n) => {
          const v = verdict.get(q.id);
          return (
            <li key={q.id} data-check-question={q.id} data-verdict={v === undefined ? undefined : v ? 'right' : 'wrong'}>
              <fieldset disabled={!!result || busy}>
                <legend className="flex gap-2 text-[14px] font-bold leading-snug text-white/90">
                  <span className="font-mono text-white/40">{n + 1}.</span>
                  <span>{q.question}</span>
                  {v !== undefined && (v
                    ? <Check aria-label="right" className="h-4 w-4 shrink-0 text-[#00FF9D]" strokeWidth={3} />
                    : <X aria-label="wrong" className="h-4 w-4 shrink-0 text-[#FF3366]" strokeWidth={3} />)}
                </legend>
                <div className="mt-2 grid gap-1.5">
                  {q.options.map((o) => (
                    <label
                      key={o}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13.5px] leading-snug text-white/75 ${
                        picked[q.id] === o ? 'border-[#A855F7]/60 bg-[#A855F7]/[0.08]' : 'border-white/8'}`}
                    >
                      <input
                        type="radio" name={q.id} value={o} checked={picked[q.id] === o}
                        onChange={() => onPick(q.id, o)} className="mt-1 accent-[#A855F7]"
                      />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      {error && <p data-check-error role="alert" className="mt-4 text-[13px] font-bold text-[#FF3366]">{CHECK_COPY.error}</p>}

      {result ? (
        <div data-check-result={result.passed ? 'pass' : 'fail'} role="status" className="mt-5">
          {result.passed ? (
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-black text-[#00FF9D]">
              {CHECK_COPY.pass(result.score)}
              {result.awarded > 0 && (
                <span data-check-awarded className="inline-flex items-center gap-1 text-white">
                  <Gem aria-hidden className="h-4 w-4 text-[#A855F7]" /> +{result.awarded} shards
                </span>
              )}
              {result.bonus > 0 && (
                <span data-check-bonus className="inline-flex items-center gap-1 text-white">
                  + {result.bonus} for finishing the Playbook
                </span>
              )}
            </p>
          ) : (
            <>
              <p className="text-[15px] font-black text-white">{CHECK_COPY.fail(result.score, result.passMark)}</p>
              <p className="mt-1 text-[13px] text-white/55">{CHECK_COPY.failNext}</p>
              <button
                type="button" onClick={onRetry} data-check-retry
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-[13px] font-bold text-white/75 hover:border-white/30"
              >
                <RotateCcw aria-hidden className="h-4 w-4" /> {CHECK_COPY.retry}
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button" onClick={onSubmit} disabled={!all || busy} data-check-submit
          className="mt-5 w-full rounded-xl bg-[#A855F7] px-5 py-3 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
        >
          {CHECK_COPY.submit}
        </button>
      )}
    </section>
  );
}
