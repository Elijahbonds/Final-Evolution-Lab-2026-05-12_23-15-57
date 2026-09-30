'use client';
// Today — the client's side of the coaching loop (lane 1 C2/C3): the next session of your active program, logging,
// Done, the coach's recent comments, and the thread.
//
// MIRROR-COACH P2 (2026-09-25). What the card was, and what it is now:
//   · It showed a name, "3×8-10 @ RPE7 · tempo · rest" and the coach note. The coach's catalogue — three cues, the
//     common faults and their fixes, a demo video, an easier version — never reached it (P1 baseline, BASELINE 3). Each
//     card now shows all of it (lib/coach/today.ts), plus the coach's set-up picks and the effort band in words.
//   · The session was one flat list. It now reads by section in running order (Prep → Prime → Key → Assist → Finish →
//     Cool-down), the key set is marked, supersets sit together as A1/A2, and a timed item has a timer
//     (components/coach/set-timer.tsx) whose work time is logged into the next set.
//   · Logging was one row per exercise with a free-text load box PRE-FILLED with the prescription, so an untouched card
//     "logged" RPE7 as a load. It is now a row per set (components/coach/set-logger.tsx): reps, weight in kg or lb,
//     reps in reserve 0–5 with plain anchors, effort 1–10. A log saved before this still shows, as it was.
//   · The "How did it feel?" note stays, for anything a fixed pain scale can't say.
//
// MIRROR-COACH P5 (2026-09-29): the pain check-in loop landed (lib/health/painRule.ts, lib/health/pain.ts,
// components/coach/pain-checkin.tsx). Each exercise card now carries an optional, never-required "Pain?" chip
// (0–10 + where + the acute-event checks), and the view opens with <NextMorningFollowUps> — a follow-up on
// yesterday's flagged readings before today's session even starts. Neither computes a decision itself; both show
// back exactly what app/api/health/pain returned.
//
// MIRROR-COACH P6 (2026-09-29): <ReadinessCheckInCard> (components/coach/readiness-checkin.tsx) sits right after the
// follow-ups, before the session: four optional tap scales (sleep, soreness, energy, mood) + Skip. It never blocks
// the session below, is never scored, and its read (lib/health/readiness.ts) reaches the warm-up through `onRead`.
//
// MIRROR-COACH P6 (2026-09-29): <WarmupPrep> (components/coach/warmup-prep.tsx) is the Prep section when the coach
// wrote none: the owner's Pre-Game Wake-Up in its own order, a rock-and-hold stretch for the weakest Movement Screen
// area, and a primer for the key set's pattern (lib/coach/warmup.ts). A coach's own Prep items always win — then it
// renders nothing and the coach's Prep shows as before. It takes today's readiness level from the card above (in
// memory, never a URL) and its server context from `api.warmup`; with no `warmup` endpoint (the dev harness) it falls
// back to the careful context (youth rules: no jumps).
//
// MIRROR-COACH P6 (2026-09-29), cool-down + off day:
//   · <CooldownCard> (components/coach/cooldown-card.tsx) after the last section when the coach wrote no Cool-down: the
//     owner's recovery breath, then a rock-and-hold stretch per pattern trained, 3–5 minutes, and a "done" tap
//     (POST /api/coach/me/cooldown). A coach's own Cool-down always wins (lib/coach/cooldown.ts needsAutoCooldown).
//     Pressing Done on the session before cooling down keeps the card on screen for the session just finished (the
//     `finished` state) instead of jumping straight to the next session, so the order people really do it in works too.
//     P6 FIX (2026-09-29, code review): while that card is up, the NEXT session's cool-down card is not rendered, and
//     the view scrolls to the finished one. Done reloads Today onto the next session Y, and Y's own card sat at the
//     bottom, right above Save/Done where the thumb already was — so "I did the cool-down" went to Y: the server opened
//     a row for Y stamped as cooled down (lib/coach/cooldownServer.ts), X's cool-down was never recorded, and Y read
//     "done" before any work. Y's card comes back once the finished card is closed.
//   · An OFF DAY (a session of kind 'recovery', lib/coach/offDay.ts) reads as one: its line under the title, no
//     generated warm-up (the Wake-Up's launch and a primer have no place on an easy day), no automatic cool-down (its
//     own Cool-down section is both), and simple logging (minutes or reps, no weight or reps-left for a walk).
//   · THIS WEEK: the week's sessions in order, done / today / next, off days named as off days — a coached client's week
//     view. Before this Today showed one session and "Session N of M", so a week's off days were not there at all.
//
// MIRROR-COACH P7 (2026-09-29): <RampBreath> (components/coach/ramp-breath.tsx) on the flagged KEY SET's card only — the
// adults-only Dial-Up Breath, before the first set (owner decision #11). The card asks app/api/breath/ramp and shows the
// option ONLY when the server says eligible (age, consent, intake, today's pain and check-in, FEL's weekly limit, the set
// not started — lib/breath/rampGate.ts); otherwise nothing at all. Never on an off day; never once a set row of the key
// set has anything typed in it (`started`); and when the breath ends the card scrolls to its sets: "after it, the set
// starts". With no `ramp` endpoint (the dev harnesses) it is never offered.
//
// MIRROR-COACH P7 FIX (2026-09-29, review), the key set's card:
//   · `started` is typed rows OR any of the card's timers started (keySetUnderWay). The offer used to stay live after an
//     untyped set 1 while the rest timer ran — the server's set_started gate sees only SAVED sets — and on a timed key
//     set it could be started while the Work or Hold timer ran, mid-set. SetTimer now reports every run it starts
//     (`onRunChange`) and the card latches it for the visit; RampBreath closes everything before the breath and cuts a
//     breath that is running (components/coach/ramp-breath.tsx rampShown).
//   · ONE BREATH AT A TIME: while the Dial-Up runs (or its Start is in flight) the Settle chip stays in place, disabled
//     (`settleBlocked`); the other way round needs nothing extra, since a settle starts a rest and that closes the offer.
//   · A timed breath item (the off day's 4-6 Recovery Breath) passes its pacer to its timer (`breath`), so its Work run
//     draws the one pacer's ring instead of a bare countdown (lib/breath/presets.ts workBreathFor).
//
// MIRROR-COACH P8 (2026-09-29): THE PROTOCOL GATE's lines (lib/coach/protocolGate.ts; decided server-side in
// lib/coach/todayServer.ts). A plyometric or depth drop the athlete's gate is closed for arrives as its ladder's easier
// step, and its card says so in one line with why (<GateSwapLine>, components/coach/protocol-gate-line.tsx); one with no
// ungated easier step arrives in `session.held` and is listed, one line each, above the first section (<GateHeldList>).
// Neither is a rule of this file: it draws what the server sent.
// `api` points the view at other endpoints (the dev harness app/dev/coach-today runs the same server code in memory).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, MessageSquare, PlayCircle, Video } from 'lucide-react';
import { GateHeldList, GateSwapLine } from '@/components/coach/protocol-gate-line';
import { SetLogger, UnitSwitch, readWeightUnit, writeWeightUnit } from '@/components/coach/set-logger';
import { SetTimer } from '@/components/coach/set-timer';
import { NextMorningFollowUps, PainCheckInChip } from '@/components/coach/pain-checkin';
import { ReadinessCheckInCard } from '@/components/coach/readiness-checkin';
import { WarmupPrep } from '@/components/coach/warmup-prep';
import { CooldownCard } from '@/components/coach/cooldown-card';
import { RAMP_API, RampBreath } from '@/components/coach/ramp-breath';
import { needsAutoCooldown, showsGeneratedWarmup, todayWarmupKind } from '@/lib/coach/cooldown';
import { OFF_DAY_LINE, type WeekEntry } from '@/lib/coach/offDay';
import type { WarmupReadiness } from '@/lib/coach/warmup';
import { SET_LOG_ERROR_COPY, convertDrafts, draftIsEmpty, draftsFor, draftsToInput, logLines, type SetDraft, type SetLogError, type WeightUnit } from '@/lib/coach/setLog';
import { KEY_SET_LINE, NOTE_PROMPT, easierLine, repsPlaceholder, servedClaim, simpleLogging, supersetHint, todayLayout, type TodayExercise } from '@/lib/coach/today';
import { nextTimedRow } from '@/lib/coach/setTimer';
import type { OpenLog, TodayPayload } from '@/lib/coach/todayServer';

export interface TodayApi { today: string; log: string; messages: string | null; warmup?: string | null; cooldown?: string | null; ramp?: string | null }
export const TODAY_API: TodayApi = { today: '/api/coach/me/today', log: '/api/coach/me/log', messages: '/api/coach/messages', warmup: '/api/coach/me/warmup', cooldown: '/api/coach/me/cooldown', ramp: RAMP_API };

/**
 * Whether the key set is under way on this device (MIRROR-COACH P7 FIX): a set row has something typed in it, or one of
 * the card's timers (work, hold or rest) has been started this visit. A rest counts: on a card whose first set has not
 * been started, a rest timer means a set went before it. assumption: a settle tapped before set 1 (it starts the rest)
 * closes the Dial-Up offer too — the two breaths pull opposite ways, and an optional breath lost is the careful side.
 */
export const keySetUnderWay = (rows: readonly SetDraft[], timerUsed: boolean): boolean => timerUsed || rows.some((r) => !draftIsEmpty(r));

/** The Dial-Up Breath's endpoint for one card (MIRROR-COACH P7): only the flagged key set, never on an off day, and
 *  only when the view has one (the dev harnesses do not). The server decides the rest. */
export const rampEndpointFor = (e: { isKeySet?: boolean | null }, kind: string | null | undefined, api: Pick<TodayApi, 'ramp'>): string | null =>
  (e.isKeySet && kind !== 'recovery' ? api.ramp ?? null : null);

/** The session just marked Done, kept on screen for its cool-down (MIRROR-COACH P6). */
interface FinishedSession { programId: string; sessionId: string; label: string; exercises: TodayExercise[] }

interface ExerciseDraft { sets: SetDraft[]; clientNote: string; videoUrl: string }
interface Msg { id: string; body: string; mine: boolean; fromCoach: boolean; createdAt: string }

export function TodayView({ api = TODAY_API }: { api?: TodayApi }) {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<WeightUnit>('kg');
  // the unit the drafts are written in RIGHT NOW. A load that resolves after a kg/lb switch (React runs the mount effect
  // twice in development; a save reloads) must build its rows in the new unit — built in the unit it started with, it
  // put "135" under a kg label (found by the live probe, 2026-09-25)
  const unitRef = useRef<WeightUnit>('kg');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Msg[]>([]);
  const [readiness, setReadiness] = useState<WarmupReadiness | null>(null);
  const [msg, setMsg] = useState('');
  // MIRROR-COACH P6: sessions whose automatic cool-down was tapped done on this visit, and the one just marked Done
  const [cooldownDoneIds, setCooldownDoneIds] = useState<string[]>([]);
  const [finished, setFinished] = useState<FinishedSession | null>(null);
  const finishedRef = useRef<HTMLDivElement | null>(null);
  // after Done, bring the finished session's cool-down into view (it renders at the top; the thumb is at the bottom)
  useEffect(() => { if (finished) finishedRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [finished]);

  const load = useCallback(async () => {
    const r = await fetch(api.today); const j: TodayPayload = await r.json(); setData(j);
    if (j.today) {
      const u = unitRef.current;
      const d: Record<string, ExerciseDraft> = {};
      for (const e of j.today.session.exercises) {
        const prev = j.open?.logs.find((l) => l.sessionExerciseId === e.id);
        d[e.id] = { sets: draftsFor(e.sets, prev?.setLogs, u), clientNote: prev?.clientNote ?? '', videoUrl: prev?.videoUrl ?? '' };
      }
      setDrafts(d);
    }
    if (j.program && api.messages) { const t = await fetch(`${api.messages}?programId=${j.program.id}`); setThread((await t.json()).messages ?? []); }
  }, [api]);
  useEffect(() => { const u = readWeightUnit(); unitRef.current = u; setUnit(u); void load(); }, [load]);

  const switchUnit = (to: WeightUnit) => {
    const from = unitRef.current;
    if (to === from) return;
    unitRef.current = to;
    setDrafts((all) => Object.fromEntries(Object.entries(all).map(([k, d]) => [k, { ...d, sets: convertDrafts(d.sets, from, to) }])));
    setUnit(to); writeWeightUnit(to);
  };

  const submit = async (complete: boolean) => {
    if (!data?.today || !data.program) return;
    setBusy(true); setErrors({});
    // MIRROR-COACH P8 FIX (2026-09-30): what this card served on each slot — the gate's easier step, or null for "as
    // written" — so the coach's inbox never reads a logged easier step as the jump (the server checks the claim)
    const logs = data.today.session.exercises.map((e) => ({ sessionExerciseId: e.id, sets: draftsToInput(drafts[e.id].sets, unit), clientNote: drafts[e.id].clientNote, videoUrl: drafts[e.id].videoUrl, servedExerciseId: servedClaim(e) }));
    const r = await fetch(api.log, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: data.program.id, sessionId: data.today.session.id, logs, complete }) });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({})) as { error?: string; sessionExerciseId?: string; set?: number };
      const copy = j.error && j.error in SET_LOG_ERROR_COPY ? SET_LOG_ERROR_COPY[j.error as SetLogError] : null;
      if (copy && j.sessionExerciseId) setErrors({ [j.sessionExerciseId]: `${j.set ? `Set ${j.set}: ` : ''}${copy}` });
      toast.error(copy ? `Not saved. ${j.set ? `Set ${j.set}: ` : ''}${copy}` : `Could not save (${j.error ?? r.status})`);
      return;
    }
    toast.success(complete ? 'Session done — your coach will see it' : 'Saved');
    // MIRROR-COACH P6: Done before the cool-down — keep this session's cool-down on screen (the reload moves Today on)
    const s = data.today.session;
    if (complete && needsAutoCooldown(s.exercises, s.kind) && !data.open?.cooldownDone && !cooldownDoneIds.includes(s.id)) {
      setFinished({ programId: data.program.id, sessionId: s.id, label: s.label, exercises: s.exercises });
    }
    void load();
  };
  const send = async () => {
    if (!data?.program || !msg.trim() || !api.messages) return;
    const r = await fetch(api.messages, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: data.program.id, body: msg }) });
    if (r.ok) { setMsg(''); const t = await fetch(`${api.messages}?programId=${data.program.id}`); setThread((await t.json()).messages ?? []); }
  };

  const layout = useMemo(() => todayLayout(data?.today?.session.exercises ?? []), [data]);
  const markCooldown = (sessionId: string) => setCooldownDoneIds((ids) => (ids.includes(sessionId) ? ids : [...ids, sessionId]));

  if (!data) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  // MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "General training … is not gated by the intake's
  // red-flag hard stop": checked ahead of the "no program" / "program complete" branches below, and ahead of every
  // exercise card and its logging form — a standing red flag pauses Today outright rather than one card at a time.
  // The server (saveClientLog, lib/coach/todayServer.ts) refuses the write either way; this is what an athlete sees
  // instead of a session they can no longer actually save.
  if (data.hardStopped) return (
    <div className="fel-card rounded-xl p-6 text-center space-y-3" data-testid="today-hard-stopped">
      <p className="text-[15px] font-semibold leading-snug text-[#FFB020]">{data.redFlagCopy}</p>
      <p className="text-xs text-white/50">Training is paused here until you&apos;ve checked with a clinician and cleared it from the Mirror. This isn&apos;t a diagnosis — it&apos;s just a pause.</p>
      <Link href="/play/mirror" className="inline-block rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white/85">
        Go to the Mirror
      </Link>
    </div>
  );
  // MIRROR-COACH P6: the session just marked Done, with its cool-down, above whatever Today shows next (even "Program
  // complete" — the last session of a program deserves its cool-down too)
  const finishedCard = finished ? (
    <div ref={finishedRef} className="space-y-1" data-finished-session={finished.sessionId}>
      <CooldownCard key={`finished-${finished.sessionId}`} exercises={finished.exercises} programId={finished.programId} sessionId={finished.sessionId}
        endpoint={api.cooldown ?? null} lead={`${finished.label} done. Cool down now, while you're still warm.`} onDone={() => markCooldown(finished.sessionId)} />
      <button type="button" onClick={() => setFinished(null)} className="px-1 text-xs text-white/45" data-finished-close>Close</button>
    </div>
  ) : null;
  if (!data.program || !data.today) return (
    <div className="space-y-4">
      {finishedCard}
      <div className="fel-card rounded-xl p-6 text-center">
        <p className="text-white/70 text-sm">{data.program ? 'Program complete — nothing left on the plan. Talk to your coach about the next block.' : 'No active program yet. A certified coach assigns one from a Plan in Camp.'}</p>
      </div>
    </div>
  );
  const { program, today } = data;
  const recovery = today.session.kind === 'recovery';
  const card = (e: TodayExercise, label: string | null) => {
    const d = drafts[e.id]; if (!d) return null;
    const put = (patch: Partial<ExerciseDraft>) => setDrafts((s) => ({ ...s, [e.id]: { ...s[e.id], ...patch } }));
    return (
      <ExerciseCard key={e.id} e={e} label={label} draft={d} unit={unit} error={errors[e.id] ?? null} simpleLog={recovery}
        rampEndpoint={rampEndpointFor(e, today.session.kind, api)}
        prev={data.open?.logs.find((l) => l.sessionExerciseId === e.id) ?? null}
        onSets={(sets) => put({ sets })} onNote={(clientNote) => put({ clientNote })} onVideo={(videoUrl) => put({ videoUrl })} />
    );
  };
  return (
    <div className="space-y-4" data-testid="today">
      {finishedCard}
      <NextMorningFollowUps />
      <ReadinessCheckInCard onRead={(r) => setReadiness(r.level)} warmup={todayWarmupKind(today.session.exercises, today.session.kind)} />
      <div className="fel-card rounded-xl p-4" data-session-kind={today.session.kind}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/40">{program.name} · coach {program.coachName}</div>
            <div className="fel-heading text-lg text-white mt-1">{today.block.label} · {today.session.label}</div>
            <div className="text-xs text-white/40 mt-0.5">Session {today.index + 1} of {today.total}</div>
            {recovery && <div className="text-xs text-[#7BD389]/90 mt-1" data-off-day-line>{OFF_DAY_LINE}</div>}
          </div>
          {!recovery && <UnitSwitch unit={unit} onChange={switchUnit} />}
        </div>
        {today.week && today.week.entries.length > 1 && <WeekStrip label={today.week.label} entries={today.week.entries} />}
      </div>
      {today.session.exercises.length === 0 && !today.session.held?.length && <div className="fel-card rounded-xl p-4 text-sm text-white/60">Your coach has made this session but not put anything in it yet.</div>}
      {/* MIRROR-COACH P8: items the protocol gate holds back today (no ungated easier step on their ladder) */}
      {today.session.held && <GateHeldList items={today.session.held} />}
      {today.session.exercises.length > 0 && showsGeneratedWarmup(today.session.kind) && <WarmupPrep exercises={today.session.exercises} contextUrl={api.warmup ?? null} readiness={readiness} />}
      {layout.map((sec) => (
        <section key={sec.section} className="space-y-2" data-section={sec.section} aria-label={sec.label}>
          <div className="px-1">
            <div className="text-[11px] uppercase tracking-wider text-white/50">{sec.label}</div>
            <div className="text-[11px] text-white/35">{sec.meaning}</div>
          </div>
          {sec.blocks.map((b) => b.kind === 'single' ? card(b.item, b.label) : (
            <div key={`ss-${b.group}-${b.items[0].item.id}`} className="rounded-xl border border-[#00E5FF]/20 p-2 space-y-2" data-superset={b.group}>
              <div className="px-1">
                <div className="text-xs font-medium text-[#00E5FF]">Superset {b.group}</div>
                <div className="text-[11px] text-white/45">{supersetHint(b.items.map((x) => x.label))}</div>
              </div>
              {b.items.map((x) => card(x.item, x.label))}
            </div>
          ))}
        </section>
      ))}
      {/* not while the session just finished has its cool-down up: this card is the NEXT session's (see the P6 fix) */}
      {!showsNextCooldown(finished) ? null : (
        <CooldownCard key={`cooldown-${today.session.id}`} exercises={today.session.exercises} kind={today.session.kind} programId={program.id} sessionId={today.session.id}
          endpoint={api.cooldown ?? null} done={!!data.open?.cooldownDone || cooldownDoneIds.includes(today.session.id)} onDone={() => markCooldown(today.session.id)} />
      )}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => submit(false)} className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-white/80">Save</button>
        <button disabled={busy} onClick={() => submit(true)} className="flex-1 rounded-xl bg-[#00E5FF]/15 border border-[#00E5FF]/40 py-3 text-sm font-medium text-[#00E5FF] flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" /> Done</button>
      </div>
      {data.recentComments.length > 0 && (
        <div className="fel-card rounded-xl p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-white/40">Coach comments</div>
          {data.recentComments.map((c, i) => <div key={i} className="text-sm text-white/80"><span className="text-white/50">{c.exercise}:</span> {c.comment}</div>)}
        </div>
      )}
      {api.messages && (
        <div className="fel-card rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><MessageSquare className="h-3.5 w-3.5" /> Thread with {program.coachName}</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">{thread.map((m) => <div key={m.id} className={`text-sm rounded-lg px-3 py-1.5 ${m.mine ? 'bg-[#00E5FF]/10 text-white ml-8' : 'bg-white/5 text-white/80 mr-8'}`}>{m.body}</div>)}</div>
          <div className="flex gap-2"><input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="Message your coach" className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" /><button onClick={send} className="rounded-lg border border-white/10 px-3 text-sm text-white/80">Send</button></div>
        </div>
      )}
    </div>
  );
}

/** Today's own cool-down card shows only when no just-finished session's card is up (MIRROR-COACH P6 FIX, 2026-09-29):
 *  both at once put the next session's done tap by the Done button, where the finished session's tap belonged. */
export const showsNextCooldown = (finished: { sessionId: string } | null): boolean => finished === null;

/**
 * This week on Today (MIRROR-COACH P6, 2026-09-29): the block's sessions in order, done / today / next, an off day named
 * as an off day. lib/coach/offDay.ts weekView builds the entries; this only draws them.
 */
export function WeekStrip({ label, entries }: { label: string; entries: readonly WeekEntry[] }) {
  const look = (e: WeekEntry) => e.state === 'today' ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10 text-[#00E5FF]'
    : e.state === 'done' ? 'border-[#7BD389]/40 bg-[#7BD389]/10 text-[#7BD389]'
      : e.kind === 'recovery' ? 'border-dashed border-[#7BD389]/40 text-[#7BD389]/80' : 'border-white/15 text-white/60';
  return (
    <div className="mt-3 space-y-1" data-testid="week-strip">
      <div className="text-[10px] uppercase tracking-wider text-white/35">This week · {label}</div>
      <ol className="flex flex-wrap gap-1" aria-label={`This week, ${label}`}>
        {entries.map((e) => (
          <li key={e.id} data-week-entry={e.id} data-kind={e.kind} data-state={e.state}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-tight ${look(e)}`}>
            {e.state === 'done' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            <span>{e.label}</span>
            {e.state === 'today' && <span className="sr-only">(today)</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One prescribed exercise: what to do, how to do it, and its sets. */
function ExerciseCard({ e, label, draft, unit, error, prev, simpleLog = false, rampEndpoint = null, onSets, onNote, onVideo }: {
  e: TodayExercise; label: string | null; draft: ExerciseDraft; unit: WeightUnit; error: string | null; prev: OpenLog | null;
  /** An off day logs minutes or reps only (MIRROR-COACH P6): no weight, reps left or effort to ask about a walk. */
  simpleLog?: boolean;
  /** MIRROR-COACH P7: GET/POST /api/breath/ramp for the flagged key set (rampEndpointFor), else null — no Dial-Up offer. */
  rampEndpoint?: string | null;
  onSets: (s: SetDraft[]) => void; onNote: (v: string) => void; onVideo: (v: string) => void;
}) {
  const [demo, setDemo] = useState(false);
  // MIRROR-COACH P7 FIX: a timer on this card was started this visit (the set is under way), and the Dial-Up is running
  const [timerUsed, setTimerUsed] = useState(false);
  const [rampBusy, setRampBusy] = useState(false);
  const onRunChange = useCallback((kind: string | null) => { if (kind) setTimerUsed(true); }, []);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // MIRROR-COACH P7: after the Dial-Up Breath, the set starts — bring its set-up line (or its first set row) into view
  const toTheSet = useCallback(() => {
    cardRef.current?.querySelector('[data-setup], [data-set-row]')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, []);
  const c = e.coaching;
  const timed = !!e.workSeconds;
  const earlier = prev ? logLines(prev, unit) : null;
  const tags = [c.pattern?.label, c.brace?.label, ...c.equipment].filter(Boolean).join(' · ');
  // a finished (or stopped) work run fills the first set row with no seconds yet
  const onWork = useCallback((seconds: number) => {
    const i = nextTimedRow(draft.sets);
    if (i < 0) return;
    onSets(draft.sets.map((r, k) => (k === i ? { ...r, workSeconds: String(seconds) } : r)));
  }, [draft.sets, onSets]);
  return (
    <div ref={cardRef} className={`fel-card rounded-xl p-4 space-y-3 ${e.isKeySet ? 'border border-[#FFD700]/30' : ''}`} data-exercise={e.id} data-key-set={e.isKeySet ? 'true' : undefined}>
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {label && <span className="rounded bg-[#00E5FF]/15 px-1 text-[10px] font-semibold text-[#00E5FF]" data-label>{label}</span>}
          {e.isKeySet && <span className="inline-flex items-center gap-0.5 rounded bg-[#FFD700]/15 px-1 text-[10px] font-semibold text-[#FFD700]" data-key-badge><KeyRound className="h-2.5 w-2.5" aria-hidden="true" />KEY SET</span>}
          <span className="text-white font-medium" data-name>{e.name}</span>
        </div>
        <div className="text-xs text-white/60" data-dose>{e.dose} · tempo {e.tempo} · rest {e.restSeconds}s</div>
        {tags && <div className="text-[11px] text-white/35">{tags}</div>}
        {e.isKeySet && <div className="text-[11px] text-[#FFD700]/80">{KEY_SET_LINE}</div>}
      </div>
      {/* MIRROR-COACH P8: the protocol gate served this easier step in place of what was prescribed, and says why */}
      {e.protocolGate && <GateSwapLine note={e.protocolGate} />}
      {/* MIRROR-COACH P7: the Dial-Up Breath, before set-up and the first set — rendered only when the server says so */}
      {rampEndpoint && <RampBreath sessionExerciseId={e.id} endpoint={rampEndpoint} started={keySetUnderWay(draft.sets, timerUsed)} onDone={toTheSet} onRunningChange={setRampBusy} />}

      {c.band && <div className="text-xs text-white/70" data-band={c.band.id}><span className="font-medium text-white">{c.band.label}</span> <span className="text-white/40">({c.band.rir})</span>: {c.band.meaning}</div>}
      {c.setup.length > 0 && (
        <div className="space-y-0.5" data-setup>
          <div className="text-[11px] uppercase tracking-wider text-white/40">Before the first rep</div>
          {c.setup.map((s) => <div key={s.id} className="text-sm text-white/85">· {s.text}</div>)}
        </div>
      )}
      {e.coachNote && <div className="text-xs text-[#00E5FF]/80">Coach: {e.coachNote}</div>}
      {c.cues.length > 0 && (
        <div className="space-y-0.5" data-cues>
          <div className="text-[11px] uppercase tracking-wider text-white/40">Cues</div>
          {c.cues.map((q) => <div key={q} className="text-sm text-white/85">· {q}</div>)}
        </div>
      )}
      {c.faults.length > 0 && (
        <div className="space-y-0.5" data-faults>
          <div className="text-[11px] uppercase tracking-wider text-white/40">Common faults</div>
          {c.faults.map((f) => <div key={f.fault} className="text-sm text-white/75"><span className="text-white/90">{f.fault}</span>{f.fix && <span className="text-white/55"> → {f.fix}</span>}</div>)}
        </div>
      )}
      {c.easier && <div className="text-xs text-white/60" data-easier>{easierLine(c.easier.name)}</div>}
      {c.demo && (
        <div data-demo={c.demo.kind}>
          {c.demo.kind === 'link' ? (
            <a href={c.demo.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-[#00E5FF]"><ExternalLink className="h-3.5 w-3.5" /> Watch the demo</a>
          ) : !demo ? (
            <button type="button" onClick={() => setDemo(true)} className="inline-flex items-center gap-1 text-xs text-[#00E5FF]"><PlayCircle className="h-3.5 w-3.5" /> Watch the demo</button>
          ) : c.demo.kind === 'youtube' ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
              <iframe src={c.demo.src} title={`${e.name} demo`} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          ) : (
            <video src={c.demo.src} controls playsInline preload="metadata" className="w-full rounded-lg border border-white/10 bg-black" />
          )}
        </div>
      )}

      <SetTimer timers={e.timers} onWorkLogged={timed ? onWork : undefined} testId={`timer-${e.id}`}
        onRunChange={onRunChange} settleBlocked={rampBusy} breath={e.breath ?? null} />
      {earlier?.kind === 'legacy' && (
        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5 text-xs text-white/55" data-legacy-log>
          Saved earlier: {earlier.lines[0]}
        </div>
      )}
      <SetLogger name={e.name} rows={draft.sets} unit={unit} timed={timed} simple={simpleLog || simpleLogging(e)} youth={!!e.youthRules} repsHint={repsPlaceholder(e.reps)} workHint={String(e.workSeconds ?? '')} onChange={onSets} />
      {error && <div className="text-xs text-[#FF3366]" role="alert" data-set-error>{error}</div>}
      {/* the client's free-text line to the coach — kept alongside the pain check-in (phase 5), not replaced by it: a
         note can say "felt off" about form or effort with no pain in it at all. */}
      <textarea value={draft.clientNote} onChange={(ev) => onNote(ev.target.value)} placeholder={NOTE_PROMPT} aria-label={`${e.name}: note to your coach`} rows={2} maxLength={500} className="w-full resize-y rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" />
      <PainCheckInChip exerciseName={e.name} programExerciseId={e.exerciseId} />
      <div className="flex items-center gap-2"><Video className="h-4 w-4 shrink-0 text-white/40" /><input value={draft.videoUrl} onChange={(ev) => onVideo(ev.target.value)} placeholder="Form video link (https://…)" aria-label={`${e.name}: form video link`} className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" /></div>
    </div>
  );
}
