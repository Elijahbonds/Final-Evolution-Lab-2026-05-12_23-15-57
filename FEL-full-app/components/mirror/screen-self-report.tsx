'use client';

// ScreenSelfReport — the breath station's answers, and the coach's stations named as the coach's.
//
// MIRROR-COACH P3 (2026-09-25). The breath station (lib/mirror/screen.ts, ribAngle, source 'selfReport') had no input:
// the Mirror said "take one easy breath in and out", held eight seconds and moved on, and nothing ever asked what the
// athlete felt. The full screen's pelvis and rotation stations (source 'coach') showed nothing either, so an athlete
// alone in a room could not tell that those two were somebody else's to check.
//
// This card appears under "What the screen found" once the screen is over — the athlete is across the room during the
// screen and cannot tap anything, so the station cue tells them the questions come at the end. Each question is
// answered by one tap (Yes / No / Not sure); every tap is saved to the screen that just ran (PATCH
// /api/mirror/screen), and nothing here is graded: no answer changes the score, the movement flags or the shards
// (lib/mirror/selfReport.ts says why). The coach's stations say "Your coach checks this" and are never scored.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenId } from '@/lib/mirror/screen';
import {
  ANSWER_LABEL, COACH_CHECK_LINE, SELF_REPORT_ANSWERS, SELF_REPORT_NOTE, coachChecksFor, selfReportChecksFor, selfReportQuestionsFor,
  type SelfReportAnswer,
} from '@/lib/mirror/selfReport';

export type AnswerSaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'noScreen';

/** What the card says about saving, in each state. Exported for the test; the card shows one at a time. */
export const SAVE_LINE: Record<AnswerSaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved with this screen.',
  failed: 'Could not save your answers. Tap one again to retry.',
  noScreen: 'This screen was not saved, so your answers cannot be kept with it.',
};

export interface ScreenSelfReportProps {
  /** The variant that ran (the runner's, not the picker's). */
  screen: ScreenId;
  /**
   * The id the screen was SAVED under, once the POST came back ok; null while it is in flight, and 'unsaved' when it
   * failed — answers cannot be kept with a screen the server does not have.
   */
  screenId: string | null | 'unsaved';
  /** Stand-in for the network in tests; the default PATCHes /api/mirror/screen. */
  save?: (screenId: string, answers: { questionId: string; answer: SelfReportAnswer }[]) => Promise<boolean>;
}

async function patchAnswers(screenId: string, answers: { questionId: string; answer: SelfReportAnswer }[]): Promise<boolean> {
  try {
    const res = await fetch('/api/mirror/screen', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ screenId, answers }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * What to do with the answers so far, given where the screen's own save is (pure; the card runs it on every tap and
 * when the save comes back). Every answer so far is sent each time — the route replaces per question — so a retry
 * after a failed save carries everything.
 */
export function planSave(
  screenId: string | null | 'unsaved', answers: Record<string, SelfReportAnswer>,
): { send: { screenId: string; answers: { questionId: string; answer: SelfReportAnswer }[] } | null; state: AnswerSaveState | null } {
  if (screenId === 'unsaved') return { send: null, state: 'noScreen' };
  const list = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
  // the screen's own save is still in flight (sent when it lands), or nothing is answered yet
  if (!screenId || !list.length) return { send: null, state: null };
  return { send: { screenId, answers: list }, state: 'saving' };
}

export function ScreenSelfReport({ screen, screenId, save = patchAnswers }: ScreenSelfReportProps) {
  const questions = selfReportQuestionsFor(screen);
  const selfChecks = selfReportChecksFor(screen);
  const coachChecks = coachChecksFor(screen);
  const [answers, setAnswers] = useState<Record<string, SelfReportAnswer>>({});
  const [saveState, setSaveState] = useState<AnswerSaveState>(screenId === 'unsaved' ? 'noScreen' : 'idle');
  const latest = useRef(0);

  const push = useCallback(async (next: Record<string, SelfReportAnswer>) => {
    const plan = planSave(screenId, next);
    if (plan.state) setSaveState(plan.state);
    if (!plan.send) return;
    const mine = ++latest.current;
    const ok = await save(plan.send.screenId, plan.send.answers);
    if (mine === latest.current) setSaveState(ok ? 'saved' : 'failed');
  }, [screenId, save]);

  // Answers given before the screen's own save came back are sent once it has.
  useEffect(() => { void push(answers); }, [screenId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (questionId: string, answer: SelfReportAnswer) => {
    const next = { ...answers, [questionId]: answer };
    setAnswers(next);
    void push(next);
  };

  if (!questions.length && !coachChecks.length) return null;

  return (
    <section aria-labelledby="screen-self-report-heading" className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      {questions.length > 0 && (
        <>
          <h2 id="screen-self-report-heading" className="fel-heading text-[15px] font-bold text-white/80">
            {selfChecks.map((c) => c.label).join(' · ')}: your answers
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">{SELF_REPORT_NOTE}</p>
          <ol className="mt-4 grid gap-4">
            {questions.map((q) => (
              <li key={q.id}>
                <p className="text-[13.5px] leading-relaxed text-white/80">{q.text}</p>
                <div role="group" aria-label={q.text} className="mt-2 flex flex-wrap gap-2">
                  {SELF_REPORT_ANSWERS.map((a) => {
                    const on = answers[q.id] === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={on}
                        onClick={() => choose(q.id, a)}
                        className="min-h-[44px] min-w-[88px] rounded-xl border px-4 py-2 text-[13.5px] font-bold transition-colors"
                        style={{
                          borderColor: on ? 'rgba(0,229,255,0.55)' : 'rgba(255,255,255,0.12)',
                          background: on ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.02)',
                          color: on ? '#00E5FF' : 'rgba(255,255,255,0.75)',
                        }}
                      >
                        {ANSWER_LABEL[a]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
          <p aria-live="polite" className="mt-3 min-h-[1.25em] text-[12px] text-white/45">{SAVE_LINE[saveState]}</p>
        </>
      )}

      {coachChecks.length > 0 && (
        <div className={questions.length ? 'mt-5 border-t border-white/8 pt-4' : ''}>
          {!questions.length && <h2 id="screen-self-report-heading" className="sr-only">Checked by your coach</h2>}
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40">Checked by your coach</p>
          <ul className="mt-2 grid gap-2">
            {coachChecks.map((c) => (
              <li key={c.id} className="rounded-xl border border-white/8 px-4 py-2.5">
                <span className="block text-[13px] font-semibold text-white/80">{c.label}</span>
                <span className="mt-0.5 block text-[12px] text-white/45">{COACH_CHECK_LINE}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
