'use client';
// FROM THEIR SCREEN — the corrective work a movement screen asks for, as a draft.
//
// lib/coach/mirrorToProgram.ts calls this "the tie the whole platform was missing": the looking is already
// automated and the programming already exists, and nothing joined them. A coach could read a screen result on
// one page and type the corrective work into another, from memory — the manual step the competition charges for.
//
// TWO RULES THE MODULE STATES AND THIS UI KEEPS:
//   1. Only the coach's OWN catalogue. A finding with no match shows the finding and what to search for, never an
//      invented exercise name.
//   2. A DRAFT, NOT A COMMIT. Nothing is added until the coach picks a session and presses add, and what goes in
//      carries the finding it came from as the coach note — so the athlete reads why, and the coach can throw it out.
//
// MIRROR-COACH P3 (2026-09-26) — REAL RESULTS, IN THREE GROUPS. The screen grades now, so this panel shows what the
// camera saw rather than a bare list of exercises:
//   · WHAT THE CAMERA SAW · estimated — every camera check: a flag with the value read, its FIX line and its corrective
//     block (lib/mirror/screenCorrectives.ts, the same mapping the athlete sees); a pass with its value and nothing
//     prescribed; and a check the camera could not read as RETEST, with why — never as clear.
//   · WHAT THEY ANSWERED — the breath questions, in the client's own words ('They said: "Not sure".'), never a grade —
//     and, since the P3 review (owner decision #4), only once the client consents to share them: until phase 5's consent
//     step exists the group names the questions and says the answers stay with the client (ANSWERS_WITHHELD).
//   · YOUTH RULES (P3 review; decisions #6, #20, PLAN item 9): for a client under 18 or with no birth year, the written
//     blocks are off and pin rows are not offered, and the panel says so (draft.youthNote).
//   · YOURS TO CHECK IN PERSON — the full screen's hands-on stations; the camera does not grade them.
//   · THE DRAFT, and ONE TAP to add all of it to the session's Prep section through the builder's own add path.
// Under it all, "This is what the camera saw, not a diagnosis."

import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Search, Check } from 'lucide-react';
import {
  ANSWERS_NOTE, ANSWERS_WITHHELD, REVIEW_GROUPS, addBodyFor, blockAddBodies,
  type CameraRow, type Prescription, type ScreenReview,
} from '@/lib/coach/mirrorToProgram';
import { CAMERA_NOT_DIAGNOSIS } from '@/lib/mirror/screenCorrectives';
import { scoreLine } from '@/lib/mirror/screen';

export type { Prescription };

export interface Draft {
  screenAt: string | null; headline?: string | null; prescriptions: Prescription[]; reason?: string;
  /** Set when a newer run than the screen drafted from was not graded (app/api/coach/prescribe). */
  newerRunAt?: string | null;
  /** Set when a newer run was graded but read too little to be a screen (MIRROR-COACH P3 follow-up review, 2026-09-28). */
  newerPartial?: { at: string; readCount: number; totalCount: number };
  /** MIRROR-COACH P3: the three groups, the variant, and what kind of grading the screen had. */
  review?: ScreenReview;
  screen?: 'modified' | 'full';
  complete?: boolean;
  provisional?: boolean;
  serverGraded?: boolean;
  retests?: number;
  /** Owner decision #31 (MIRROR-COACH P3 follow-up, 2026-09-28): the score over what was read, and what it is over. */
  score?: number | null;
  readCount?: number;
  totalCount?: number;
  legsNotRead?: number;
  /** MIRROR-COACH P3 review: 'unread_screen' — why the camera read nothing, and the one fix. */
  unread?: { why: string; hint: string };
  /** Youth rules for this client, and what they change (lib/coach/mirrorToProgram.ts YOUTH_DRAFT_NOTE). */
  youth?: 'minor' | 'unknownAge';
  youthNote?: string;
}

/**
 * What the panel says when the draft has nothing to add, by the route's reason.
 *
 * MIRROR-COACH P1 (2026-09-25). This used to be one ternary: 'no_screen' asked for a screen, and EVERY other reason
 * said "Their last screen came back clear." But the route also returns 'unreadable_screen' for a row it cannot read —
 * and every screen stored so far was exactly that, because no station has been graded yet and an empty result reads
 * as unreadable. So every athlete who had run a screen was reported to their coach as clear, on zero measurements.
 *
 * Found in review the same day, three more:
 *   · "Clear" came from NO reason at all, and a screen with one stable check out of eight reached this panel with no
 *     reason. "Clear" now needs the route to say 'clear_screen' — a COMPLETE screen with nothing flagged — and a
 *     screen with checks missing is 'partial_screen'. No reason, or one this does not know, is not good news.
 *   · The route drafts from the newest GRADED screen; when a newer run graded nothing, "their last screen" would be
 *     the wrong one, so the line says a newer run was not graded.
 * MIRROR-COACH P3 (2026-09-26): the graders exist, so the promise P1 took out comes back — a screen run today drafts
 * from what the camera flags — and an ungraded run is one where the camera read nothing, which is a re-run, not a wait
 * for a grader. A partial screen names its retests.
 */
export function emptyDraftLine(reason: string | undefined, opts: { newerRunUngraded?: boolean; retests?: number; unread?: { why: string; hint: string } } = {}): string {
  const newer = opts.newerRunUngraded ? ' A newer run was not graded.' : '';
  switch (reason) {
    case 'clear_screen':
      return `Their last graded screen came back clear: every camera check was read and none was flagged.${newer}`;
    case 'partial_screen': {
      const n = opts.retests ?? 0;
      return `Their last screen was only partly graded, so it does not read as clear — nothing flagged in the checks that came back.${n > 0 ? ` ${retestLine(n)}` : ''}${newer}`;
    }
    case 'no_screen':
      return 'No movement screen on file. Ask them to run the Mirror\'s movement screen: the camera grades six checks, and the correctives draft here from what it flags.';
    // P3 review (2026-09-26): split. 'unread_screen' is a run the camera TRIED, worded from its stored reasons (light,
    // jitter, a phone roll — not only framing); 'ungraded_screen' is a run with no grades at all, every row stored before
    // 2026-09-26, where "the camera could not read any of its checks" was never true — no grader existed
    case 'unread_screen':
      return opts.unread
        ? `Their last screen ran, but the camera could not read any of its checks — most of them: ${opts.unread.why}. Ask them to run it again: ${opts.unread.hint}`
        : 'Their last screen ran, but the camera could not read any of its checks, so there is nothing to draft from. Ask them to run it again.';
    case 'ungraded_screen':
      return 'Their last screen ran but was not graded, so there is nothing to draft from. Ask them to run the movement screen again.';
    case 'unreadable_screen':
      return 'Their last screen could not be read, so there is nothing to draft from.';
    default:
      return `Nothing to draft from their last screen.${newer}`;
  }
}

/**
 * A newer run that read too little to count as a screen, named above the screen the draft comes from (MIRROR-COACH P3
 * follow-up review, 2026-09-28: a run ended after one station replaced the last full screen here, and its flags left the
 * draft).
 */
export function newerPartialLine(p: { at: string; readCount: number; totalCount: number }): string {
  return `A newer run on ${new Date(p.at).toLocaleDateString()} read ${p.readCount} of ${p.totalCount} checks — too little to count as a screen; this is the last one that did.`;
}

/** "2 checks the camera could not read need a retest." — said beside flags too, so a flagged screen is not read as whole. */
export function retestLine(n: number): string {
  return `${n} check${n === 1 ? '' : 's'} the camera could not read need${n === 1 ? 's' : ''} a retest.`;
}

export interface ScreenPrescriptionsProps {
  clientId: string;
  /** The sessions in this program the coach can drop a corrective into. */
  sessions: readonly { id: string; label: string }[];
  /** One builder 'add'. Resolve false when it did not save (the item then does not read "added"). */
  onAdd: (sessionId: string, body: Record<string, unknown>) => void | boolean | Promise<void | boolean>;
  /** Where the draft is read from; the dev harness points it at its own fixture route. */
  draftUrl?: string;
}

export function ScreenPrescriptions({ clientId, sessions, onAdd, draftUrl }: ScreenPrescriptionsProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [into, setInto] = useState('');
  const [added, setAdded] = useState<Record<string, AddState>>({});

  useEffect(() => {
    setDraft(null);
    setAdded({});
    const url = draftUrl ?? `/api/coach/prescribe?clientId=${encodeURIComponent(clientId)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDraft(j))
      .catch(() => setDraft(null));
  }, [clientId, draftUrl]);

  useEffect(() => { if (!into && sessions[0]) setInto(sessions[0].id); }, [sessions, into]);

  if (!draft) return null;

  const addOne = async (p: Prescription) => {
    const body = into ? addBodyFor(p, into) : null;
    if (!body) return;
    const key = prescriptionKey(p);
    setAdded((a) => ({ ...a, [key]: 'adding' }));
    const ok = await Promise.resolve(onAdd(into, body)).then((r) => r !== false).catch(() => false);
    setAdded((a) => ({ ...a, [key]: ok ? 'added' : 'failed' }));
  };
  // ONE TAP: every matched corrective not already in, one builder add after another (the builder answers each with
  // the whole tree, so they cannot run side by side without the last answer overwriting the others)
  const addBlock = async () => {
    for (const p of draft.prescriptions) {
      if (!p.exercise || added[prescriptionKey(p)] === 'added') continue;
      await addOne(p);
    }
  };

  return (
    <DraftView
      clientId={clientId} draft={draft} sessions={sessions} into={into} onInto={setInto}
      added={added} onAddOne={(p) => void addOne(p)} onAddBlock={() => void addBlock()}
    />
  );
}

export type AddState = 'adding' | 'added' | 'failed';
/** One prescription's key: a check, and a leg for the single-leg stance. */
export const prescriptionKey = (p: Pick<Prescription, 'findingId' | 'side'>) => `${p.findingId}|${p.side ?? ''}`;

const TONE: Record<CameraRow['status'], string> = { flag: 'text-[#FFC24B]', pass: 'text-[#00FF9D]', retest: 'text-white/55' };
const DOT: Record<CameraRow['status'], string> = { flag: '#FFC24B', pass: '#00FF9D', retest: 'rgba(255,255,255,0.3)' };
const KIND_WORD = { release: 'release', activate: 'activate', pattern: 'pattern' } as const;

export interface DraftViewProps {
  clientId: string;
  draft: Draft;
  sessions: readonly { id: string; label: string }[];
  into: string;
  onInto: (id: string) => void;
  added: Record<string, AddState>;
  onAddOne: (p: Prescription) => void;
  onAddBlock: () => void;
}

/** The panel itself, stateless (so a server render is its test). */
export function DraftView({ clientId, draft, sessions, into, onInto, added, onAddOne, onAddBlock }: DraftViewProps) {
  // no screen to draft from (none, not graded, unreadable): one line, as before
  if (!draft.review) {
    return <p className="text-xs text-white/35">{emptyDraftLine(draft.reason, { newerRunUngraded: !!draft.newerRunAt, unread: draft.unread })}</p>;
  }
  const { review } = draft;
  const matched = draft.prescriptions.filter((p) => p.exercise);
  const pending = matched.filter((p) => added[prescriptionKey(p)] !== 'added');
  const canAdd = !!into && sessions.length > 0;
  const blockBodies = canAdd ? blockAddBodies(pending, into) : [];

  return (
    <section className="rounded-lg border border-white/6 bg-white/[0.02] p-3 text-xs" aria-labelledby={`presc-${clientId}`} data-screen-review>
      <h4 id={`presc-${clientId}`} className="flex flex-wrap items-center gap-1.5 font-semibold text-white/80">
        <ClipboardList className="h-3.5 w-3.5 text-[#00E5FF]" aria-hidden="true" />
        From their screen
        {draft.screenAt && <span className="font-normal text-white/35">· {new Date(draft.screenAt).toLocaleDateString()}{draft.screen ? ` · ${draft.screen}` : ''}</span>}
      </h4>
      {draft.newerRunAt && (
        <p className="mt-1 text-white/35">A newer run on {new Date(draft.newerRunAt).toLocaleDateString()} was not graded; this is the one before it.</p>
      )}
      {draft.newerPartial && <p className="mt-1 text-white/35" data-newer-partial>{newerPartialLine(draft.newerPartial)}</p>}
      {/* owner decision #31: the score over what was read, never without the count (the camera rows below list the rest) */}
      {scoreLine(draft) && <p className="mt-1 font-semibold text-white/75" data-score>{scoreLine(draft)}</p>}
      {draft.headline && <p className="mt-1 text-white/60">{draft.headline}</p>}
      {draft.reason && <p className="mt-1 text-white/45" data-draft-reason={draft.reason}>{emptyDraftLine(draft.reason, { newerRunUngraded: false, retests: draft.retests })}</p>}
      {!draft.reason && !!draft.retests && (
        <p className="mt-1 text-white/45">{retestLine(draft.retests)}</p>
      )}
      {draft.provisional && (
        <p className="mt-1 text-[#FFC24B]/80">Provisional: fewer than three camera checks, or only one station, were read. Ask for a re-run before you program from it alone.</p>
      )}
      {draft.youthNote && <p className="mt-1 text-white/45" data-youth={draft.youth}>{draft.youthNote}</p>}
      {draft.serverGraded === false && (
        <p className="mt-1 text-white/35">Graded on their phone before FEL re-checked grades on the server (before 2026-09-26).</p>
      )}

      {/* 1 — the camera */}
      <h5 className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40" data-group="camera">{REVIEW_GROUPS.camera}</h5>
      <ul className="mt-1.5 space-y-2">
        {review.camera.map((r) => (
          <li key={`${r.checkId}|${r.side ?? ''}`} className="border-l-2 border-white/10 pl-2" data-check={r.checkId} data-status={r.status}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOT[r.status] }} aria-hidden="true" />
              <span className="text-white/85">{r.title}</span>
              <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${TONE[r.status]}`}>{r.statusLabel}</span>
            </p>
            {r.value && <p className="break-words text-white/50">{r.value}</p>}
            {r.fix && <p className="mt-0.5 text-white/70"><span className="font-semibold text-white/80">Fix: </span>{r.fix}</p>}
            {r.block && (
              <p className="mt-0.5 text-white/55">
                <span className="font-semibold text-white/70">Corrective block ({KIND_WORD[r.block.kind]}): </span>
                {r.block.title} — {r.block.movements.join('; ')} · about {r.block.minutes} min
              </p>
            )}
            {r.retest && <p className="mt-0.5 text-white/50">{r.retest}</p>}
          </li>
        ))}
      </ul>

      {/* the draft for the Prep section */}
      {draft.prescriptions.length > 0 && (
        <>
          <h5 className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40" data-group="draft">Draft for their Prep section</h5>
          {sessions.length > 1 && (
            <label className="mt-1.5 flex items-center gap-2 text-white/45">
              Add into
              <select value={into} onChange={(e) => onInto(e.target.value)} className="min-h-[36px] rounded bg-[#0f0f13] px-2 py-1 text-white/80">
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          )}
          <ul className="mt-1.5 space-y-1.5">
            {draft.prescriptions.map((p) => {
              const state = added[prescriptionKey(p)];
              return (
                <li key={prescriptionKey(p)} className="flex items-start justify-between gap-2" data-prescription={p.findingId}>
                  <span className="min-w-0">
                    <span className="text-white/85">{p.exercise ? p.exercise.name : 'No match in your catalogue'}</span>
                    <span className="text-white/45"> — {p.sets}×{p.reps} · Prep</span>
                    <br />
                    <span className="text-white/45">for {p.title}</span>
                    {p.matchedBy === 'name' && <span className="text-white/35"> · matched by its name — tag it to be sure</span>}
                    {!p.exercise && p.wanted.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-white/35">
                        <Search className="h-3 w-3 shrink-0" aria-hidden="true" /> look for: {p.wanted.join('; ')}
                      </span>
                    )}
                    {state === 'failed' && <span className="block text-[#FF3366]/80">That did not save. Try again.</span>}
                  </span>
                  {p.exercise && canAdd && (
                    state === 'added'
                      ? <span className="flex min-h-[44px] shrink-0 items-center gap-1 text-[#00FF9D]"><Check className="h-3.5 w-3.5" aria-hidden="true" /> In Prep</span>
                      : (
                        <button
                          onClick={() => onAddOne(p)}
                          disabled={state === 'adding'}
                          className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg border border-[#00E5FF]/40 text-[#00E5FF] disabled:opacity-50"
                          aria-label={`Add ${p.exercise.name} to Prep`}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )
                  )}
                </li>
              );
            })}
          </ul>
          {blockBodies.length > 0 && (
            <button
              onClick={onAddBlock}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-[#00E5FF]/50 bg-[#00E5FF]/10 px-3 font-semibold text-[#00E5FF]"
              data-add-block
            >
              Add the corrective block to Prep ({blockBodies.length} exercise{blockBodies.length === 1 ? '' : 's'})
            </button>
          )}
        </>
      )}

      {/* 2 — their answers, as they gave them */}
      <h5 className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40" data-group="answers">{REVIEW_GROUPS.answers}</h5>
      {review.answersWithheld ? (
        <p className="mt-1.5 text-white/45" data-answers-withheld>{ANSWERS_WITHHELD}</p>
      ) : (
        <>
          <ul className="mt-1.5 space-y-1.5">
            {review.answers.map((a) => (
              <li key={a.questionId} data-answer={a.questionId}>
                <span className="text-white/60">{a.question}</span> <span className="text-white/85">{a.said}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-white/35">{ANSWERS_NOTE}</p>
        </>
      )}

      {/* 3 — the hands-on checks */}
      <h5 className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40" data-group="coach">{REVIEW_GROUPS.coach}</h5>
      {review.coachChecks.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {review.coachChecks.map((c) => (
            <li key={c.checkId} data-coach-check={c.checkId}><span className="text-white/85">{c.label}</span> <span className="text-white/45">— {c.line}</span></li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-white/45">{review.coachChecksNote}</p>
      )}

      <p className="mt-3 border-t border-white/6 pt-2 text-white/45">{CAMERA_NOT_DIAGNOSIS}</p>
    </section>
  );
}
