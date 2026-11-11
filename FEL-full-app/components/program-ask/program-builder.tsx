'use client';
// ProgramBuilder — PROGRAM-ASK (2026-11-02). Owner: "The AI should be able to give me an entire workout program if I tell
// it, all I have is a band." One screen, top to bottom:
//   1. the ask (typed, or dictated with the phone keyboard's microphone);
//   2. the read-back as chips — a number chip has − and + (one tap: "3 days" → "4"), a choice chip opens its options;
//      what FEL filled in is dimmer, and listed under "FEL assumed";
//   3. the program: the title, ≤ 50 words, ONE primary button (Start today), then the week view (week tabs, one card per
//      day, each exercise one line; tap a day for the set-up, the band setup and the "too easy / too hard" lines), the
//      checkpoint, and the plain-words notes;
//   4. Start today plays the next session in the session player (lib/session-player/fromProgram.ts), and its finish marks
//      the session done ON THIS PHONE (lib/program-ask/device.ts). Nothing about it is sent to an account.
// The server builds (POST /api/program-ask): the library is server-only. The page draws what it answers.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, Lock, Minus, Play, Plus, Sparkles } from 'lucide-react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { warmAvatarDemo } from '@/components/library/avatar-demo';
import type { FinishResult } from '@/components/session-player/session-player';
import { Layer } from '@/components/session-player/layer';
import { TYPE, lineSize } from '@/lib/design/type';
import { checkpointDecision, plannedWeeks, positionIn, type Decision } from '@/lib/program-ask/checkpoint';
import {
  ASK_BUTTON, ASK_PLACEHOLDER, CHECKPOINT_LINES, CHECKPOINT_TITLE, EDIT_HINT, LIGHTER_TAG, READ_BACK, SAVED_ACCOUNT_LINE, SAVED_LINE, START_TODAY, WEEK_LINE, WEEK_VIEW,
} from '@/lib/program-ask/copy';
import { accountBody, addDecision, markDone, mergeAccount, readSaved, saveProgram, type SavedProgram } from '@/lib/program-ask/device';
import type { RequestEdits } from '@/lib/program-ask/request';
import { doseText } from '@/lib/program-ask/table';
import type { BuiltProgram, ProgramAskRead, ProgramChip, ProgramDay, RequestField } from '@/lib/program-ask/types';
import { FREE_WEEK_LINE } from '@/lib/signature/copy';
import { deviceStorage } from '@/lib/signature/deviceProgress';
import { fromProgram } from '@/lib/session-player/fromProgram';
import type { Session } from '@/lib/session-player/model';

const SessionPlayer = dynamic(() => import('@/components/session-player/session-player').then((m) => m.SessionPlayer), { ssr: false });

interface Answer {
  read: ProgramAskRead;
  safety: string[] | null;
  program: BuiltProgram | null;
  access: ('free' | 'pro' | 'locked')[];
  clips: Record<string, string | null>;
  ai: { used: boolean };
}

const CHIP = 'inline-flex min-h-11 items-center gap-1 rounded-full border px-3';

// EVERY-SCREEN P3: the − and + are 44 px wide (they were 36: under the tap-target floor)
function ChipControl({ c, onEdit, busy }: { c: ProgramChip; onEdit: (f: RequestField, v: string | number) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = c.assumed ? 'border-white/15 bg-white/[0.04] text-fel-soft' : 'border-fel-cyan/40 bg-fel-cyan/[0.12] text-fel-cyan';
  if (c.step) {
    const s = c.step;
    return (
      <span data-chip={c.field} className={`${CHIP} ${TYPE.label} ${tone} gap-0 px-1`}>
        <button type="button" aria-label={`Fewer: ${c.label}`} disabled={busy || s.value <= s.min} onClick={() => onEdit(c.field, s.value - s.by)} className="grid h-11 w-11 place-items-center disabled:opacity-30"><Minus className="h-4 w-4" /></button>
        <span className="px-1">{c.label}</span>
        <button type="button" aria-label={`More: ${c.label}`} disabled={busy || s.value >= s.max} onClick={() => onEdit(c.field, s.value + s.by)} className="grid h-11 w-11 place-items-center disabled:opacity-30"><Plus className="h-4 w-4" /></button>
      </span>
    );
  }
  if (c.locked) return <span data-chip={c.field} className={`${CHIP} ${TYPE.label} ${tone}`}><Lock className="h-3.5 w-3.5" aria-hidden />{c.label}</span>;
  return (
    <span className="relative" data-chip={c.field}>
      <button type="button" aria-expanded={open} disabled={busy} onClick={() => setOpen((o) => !o)} className={`${CHIP} ${TYPE.label} ${tone}`}>
        {c.label}<ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span role="listbox" className="absolute left-0 top-12 z-20 flex min-w-[180px] flex-col rounded-xl border border-white/10 bg-[#0c0c11] p-1 shadow-xl">
          {(c.options ?? []).map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === c.value} onClick={() => { setOpen(false); if (o.value !== c.value) onEdit(c.field, o.value); }}
              className={`min-h-11 rounded-lg px-3 text-left ${TYPE.small} ${o.value === c.value ? 'text-fel-cyan' : 'text-white'} hover:bg-white/[0.06]`}>{o.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}

function DayCard({ d, locked, next }: { d: ProgramDay; locked: boolean; next: boolean }) {
  return (
    <details data-day={d.id} className={`group rounded-2xl border ${next ? 'border-fel-cyan/50' : 'border-white/8'} bg-[#0c0c11] ${locked ? 'opacity-50' : ''}`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className={`${TYPE.label} text-fel-soft`}>{d.day} · about {d.minutes} min{next ? ' · next' : ''}</span>
          <span className={`block ${TYPE.heading} text-white`}>{d.title}</span>
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 text-fel-soft group-open:rotate-180" />
      </summary>
      <ol className="space-y-2 px-4 pb-4">
        <li className={`${TYPE.small} text-fel-soft`}>Warm-up · {Math.round(d.warmup.reduce((a, s) => a + s.seconds, 0) / 60)} min</li>
        {d.blocks.map((b) => b.items.map((i) => (
          <li key={i.key} data-ex={i.exId} className="border-t border-white/6 pt-2">
            <p className={`${TYPE.body} text-white`}><span className="mr-2 text-fel-cyan">{i.label}</span>{i.name}</p>
            <p className={`${lineSize(`${doseText(i)} · ${i.effortWords}`)} text-fel-soft`}>{doseText(i)} · {i.effortWords}</p>
            {/* EVERY-SCREEN P3: a line of more than 12 words is body size (READABLE.md); a short one keeps 14 px */}
            {(i.note || i.bandSetup || i.harder || i.easier) && (
              <div className="mt-1 space-y-0.5 text-white/75">
                {[i.note, i.bandSetup, i.harder, i.easier].filter((x): x is string => !!x).map((x) => <p key={x} className={lineSize(x)}>{x}</p>)}
              </div>
            )}
          </li>
        )))}
        <li className={`border-t border-white/6 pt-2 ${TYPE.small} text-fel-soft`}>Cool-down · {Math.round(d.cooldown.reduce((a, s) => a + s.seconds, 0) / 60)} min</li>
      </ol>
    </details>
  );
}

export function ProgramBuilder({ initialQuestion = '' }: { initialQuestion?: string }) {
  const [q, setQ] = useState(initialQuestion);
  const [edits, setEdits] = useState<RequestEdits>({});
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedProgram | null>(null);
  const [week, setWeek] = useState(1);
  const [playing, setPlaying] = useState<{ session: Session; id: string } | null>(null);
  // EVERY-SCREEN P4: once a program is on screen the ask folds to one line (its words were over the first screen's 40-word
  // budget, and the docked Start covered the chips under it); "Change the ask" opens it again
  const [askOpen, setAskOpen] = useState(true);
  // PROGRAM-ASK-2: the account copy (adults, once the pending table exists); 'device' = the phone only (youth, or not ready)
  const keep = useRef<'account' | 'device' | null>(null);
  const [onAccount, setOnAccount] = useState(false);
  const account = useRef<{ programId: string; done: Record<string, string>; decisions: Decision[] } | null>(null);
  const push = useCallback((v: SavedProgram | null) => {
    if (!v || keep.current !== 'account') return;
    void fetch('/api/program-ask/saved', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(accountBody(v)) })
      .then((r) => { if (r.ok) setOnAccount(true); if (r.status === 503 || r.status === 403) keep.current = 'device'; }).catch(() => undefined);
  }, []);

  const ask = useCallback(async (question: string, e: RequestEdits) => {
    if (!question.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/program-ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: question, edits: e }) });
      if (!r.ok) { setError(r.status === 429 ? 'Too many asks in a minute. Try again shortly.' : 'That did not build. Try again.'); return; }
      const a = (await r.json()) as Answer;
      setAnswer(a);
      if (a.program) {
        saveProgram(deviceStorage(), question, e, a.program);
        const merged = mergeAccount(deviceStorage(), account.current);
        setSaved(merged);
        push(merged);
        setWeek(1);
      }
    } catch { setError('That did not build. Try again.'); } finally { setBusy(false); }
  }, [push]);

  // a saved program opens as it was (or, with an ask from the library's door, that ask is built)
  useEffect(() => {
    let live = true;
    (async () => {
      // the account's copy first (a new phone picks the plan up); any failure leaves the phone's copy in charge
      const r = await fetch('/api/program-ask/saved', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as
        { keep?: 'account' | 'device'; saved?: { question: string; edits: RequestEdits; programId: string; done: Record<string, string>; decisions: Decision[] } | null } | null;
      if (!live) return;
      keep.current = r?.keep === 'account' ? 'account' : 'device';
      account.current = r?.saved ?? null;
      const s = readSaved(deviceStorage());
      if (initialQuestion) { void ask(initialQuestion, {}); return; }
      const from = s ?? (r?.saved ? { question: r.saved.question, edits: r.saved.edits } : null);
      if (from) { if (s) setSaved(s); setQ(from.question); setEdits(from.edits); void ask(from.question, from.edits); }
    })();
    return () => { live = false; };
  }, [initialQuestion, ask]);

  const edit = (f: RequestField, v: string | number) => { const e = { ...edits, [f]: v }; setEdits(e); void ask(q, e); };

  const p = answer?.program ?? null;
  const programId = p?.id ?? null;
  useEffect(() => { if (programId) setAskOpen(false); }, [programId]);
  const decisions: Decision[] = useMemo(() => (saved && p && saved.programId === p.id ? saved.decisions : []), [saved, p]);
  const done = useMemo(() => (saved && p && saved.programId === p.id ? saved.done : {}), [saved, p]);
  const weeks = useMemo(() => (p ? plannedWeeks(p, decisions) : []), [p, decisions]);
  const pos = useMemo(() => positionIn(weeks, done, decisions), [weeks, done, decisions]);
  const accessOf = (n: number) => answer?.access[Math.min(n, answer.access.length) - 1] ?? 'free';
  const nextDay = pos.week ? pos.week.days[pos.dayIndex] : null;
  const nextLocked = pos.week ? accessOf(pos.week.n) === 'locked' : false;
  const canStart = !!nextDay && !nextLocked && !pos.pendingCheckpoint;
  const hasDemo = canStart && !!nextDay?.blocks.some((b) => b.items.some((i) => answer?.clips[i.exId]));
  useEffect(() => { if (hasDemo) warmAvatarDemo(); }, [hasDemo]);
  const currentWeek = pos.week?.n ?? null;
  useEffect(() => { if (currentWeek) setWeek(currentWeek); }, [currentWeek]);

  // EVERY-SCREEN P2: from Train's "Your program" card (/train/build?start=today) the next session starts by itself, once,
  // as soon as the saved plan is back on screen; the address is put back so closing the player does not start it again
  const autoStart = useRef<boolean | null>(null);
  useEffect(() => {
    if (autoStart.current === null) autoStart.current = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('start') === 'today';
    if (!autoStart.current || !canStart) return;
    autoStart.current = false;
    window.history.replaceState(null, '', window.location.pathname);
    start();
  });   // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (!p || !nextDay || !canStart) return;
    setPlaying({ session: fromProgram(nextDay, { title: `${p.title} · ${nextDay.title}`, clips: answer?.clips }), id: nextDay.id });
  };
  const finish = useCallback(async (): Promise<FinishResult> => {
    if (!playing) return { ok: true, line: null };
    const s = markDone(deviceStorage(), playing.id);
    if (s) { setSaved(s); push(s); }
    return { ok: !!s, line: s ? SAVED_LINE : null };
  }, [playing, push]);

  const answerCheckpoint = (hit: boolean | null, pain: boolean) => {
    if (!pos.pendingCheckpoint) return;
    const repeats = decisions.filter((d) => d.kind === 'repeat').length;
    const d = checkpointDecision({ hitTargets: hit, pain, repeats });
    const s = addDecision(deviceStorage(), { afterWeek: pos.pendingCheckpoint.n, kind: d.kind });
    if (s) { setSaved(s); push(s); }
  };

  const shown = weeks.find((w) => w.n === week) ?? weeks[0];

  return (
    <div data-testid="program-builder" className="mx-auto max-w-[720px] space-y-5">
      {p && !askOpen && (
        <div data-testid="program-ask-folded" className="flex items-start justify-between gap-3">
          <p className={`min-w-0 ${TYPE.small} text-fel-soft`}><span className="text-white">Your ask:</span> <span className="line-clamp-2">{q}</span></p>
          <button type="button" onClick={() => setAskOpen(true)} data-testid="program-ask-open" className={`min-h-11 shrink-0 rounded-full border border-fel-cyan/50 px-4 ${TYPE.label} text-fel-cyan`}>Change the ask</button>
        </div>
      )}
      <form hidden={!!p && !askOpen} onSubmit={(e) => { e.preventDefault(); setEdits({}); void ask(q, {}); }} className="space-y-3">
        <label htmlFor="program-ask" className={`${TYPE.label} text-fel-soft`}>What do you have, and what do you want?</label>
        <textarea id="program-ask" data-testid="program-ask-input" value={q} onChange={(e) => setQ(e.target.value)} rows={3} maxLength={400} placeholder={ASK_PLACEHOLDER}
          className={`w-full rounded-2xl border border-white/10 bg-[#0c0c11] p-4 ${TYPE.body} text-white placeholder:text-white/50 focus:border-fel-cyan/60 focus:outline-none`} />
        <button type="submit" disabled={busy || !q.trim()} data-testid="program-ask-build" className={`min-h-11 rounded-full border border-fel-cyan/50 px-6 ${TYPE.label} text-fel-cyan disabled:opacity-40`}>{busy ? 'Building…' : ASK_BUTTON}</button>
        {error && <p role="alert" className={`${TYPE.small} text-[#ff6b8b]`}>{error}</p>}
      </form>

      {answer && (
        <section data-testid="program-chips" className="space-y-2">
          <p className={`${TYPE.label} text-fel-soft`}>{READ_BACK} · {EDIT_HINT}</p>
          <div className="flex flex-wrap gap-2">{answer.read.chips.map((c) => <ChipControl key={c.field} c={c} onEdit={edit} busy={busy} />)}</div>
          {answer.read.assumptions.length > 0 && (
            <details className="text-fel-soft">
              <summary className={`min-h-11 cursor-pointer py-2 ${TYPE.small}`}>FEL assumed {answer.read.assumptions.length} thing{answer.read.assumptions.length === 1 ? '' : 's'}</summary>
              <ul className="list-disc space-y-1 pl-5">{answer.read.assumptions.map((a) => { const t = a.replace(/^assumption: /, ''); return <li key={a} className={lineSize(t)}>{t}</li>; })}</ul>
            </details>
          )}
        </section>
      )}

      {answer?.safety && (
        <div role="note" data-testid="program-safety" className={`space-y-1 rounded-2xl border border-fel-gold/30 bg-fel-gold/[0.06] p-4 ${TYPE.small} text-white/85`}>
          {answer.safety.map((s) => <p key={s} className={lineSize(s)}>{s}</p>)}
        </div>
      )}

      {p && shown && (
        <section data-testid="program-view" data-program={p.id} className="space-y-4">
          <div className="space-y-2">
            <h2 className={`${TYPE.title} text-white`}>{p.title}</h2>
            <p data-testid="program-summary" className={`${TYPE.body} text-white/85`}>{p.summary}</p>
            <p className={`${TYPE.small} text-fel-soft`}>{saved?.programId === p.id ? (onAccount ? SAVED_ACCOUNT_LINE : SAVED_LINE) : ''}{pos.total ? ` ${pos.done} of ${pos.total} sessions done.` : ''}</p>
          </div>
          {canStart && <PrimaryCta docked onClick={start} icon={<Play className="h-5 w-5" />} testId="program-start">{START_TODAY}</PrimaryCta>}
          {nextLocked && <p className={`${lineSize(FREE_WEEK_LINE)} text-fel-gold`}>{FREE_WEEK_LINE}</p>}

          {pos.pendingCheckpoint && (
            <div data-testid="program-checkpoint" className="space-y-3 rounded-2xl border border-fel-cyan/40 bg-fel-cyan/[0.06] p-4">
              <p className={`${TYPE.heading} text-white`}>{CHECKPOINT_TITLE}</p>
              <p className={`${TYPE.body} text-white/85`}>{CHECKPOINT_LINES.question}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => answerCheckpoint(true, false)} className={`${CHIP} ${TYPE.label} border-fel-cyan/50 text-fel-cyan`}>{CHECKPOINT_LINES.yes}</button>
                <button type="button" onClick={() => answerCheckpoint(false, false)} className={`${CHIP} ${TYPE.label} border-white/15 text-white`}>{CHECKPOINT_LINES.no}</button>
                <button type="button" onClick={() => answerCheckpoint(null, true)} className={`${CHIP} ${TYPE.label} border-white/15 text-white`}>Something hurt</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className={`${TYPE.label} text-fel-soft`}>{WEEK_VIEW}</p>
            <div role="tablist" aria-label="Weeks" className="flex gap-1 overflow-x-auto pb-1">
              {weeks.map((w) => (
                <button key={w.n} role="tab" aria-selected={w.n === shown.n} onClick={() => setWeek(w.n)} data-week={w.n}
                  className={`inline-flex min-h-11 min-w-11 shrink-0 items-center rounded-full border px-3 ${TYPE.label} ${w.n === shown.n ? 'border-fel-cyan/60 bg-fel-cyan/[0.12] text-fel-cyan' : 'border-white/10 text-fel-soft'}`}>
                  W{w.n}{w.lighter ? ' · L' : ''}{accessOf(w.n) === 'locked' && <Lock aria-label="FEL Pro" className="ml-1 inline h-3 w-3" />}
                </button>
              ))}
            </div>
            <p className={`${TYPE.small} text-white/80`}>Week {shown.n} · {shown.label}{shown.lighter ? ` · ${LIGHTER_TAG}` : ''}{shown.checkpoint ? ` · ${CHECKPOINT_TITLE.toLowerCase()} after` : ''}</p>
            <div className="space-y-2">
              {shown.days.map((d) => <DayCard key={d.id} d={d} locked={accessOf(shown.n) === 'locked'} next={d.id === nextDay?.id} />)}
            </div>
            <p className={`${lineSize(WEEK_LINE)} text-fel-soft`}>{WEEK_LINE}</p>
          </div>

          <details className="rounded-2xl border border-white/8 bg-[#0c0c11] px-4">
            <summary className={`min-h-12 cursor-pointer py-3 ${TYPE.label} text-white`}>Why this plan</summary>
            <p className={`pb-3 ${lineSize(p.why)} text-white/85`}>{answer?.ai.used && p.whyBy === 'ai' && <Sparkles aria-hidden className="mr-1 inline h-3.5 w-3.5 text-fel-violet" />}{p.why}</p>
            {p.jumps.line && <p className={`pb-3 ${lineSize(p.jumps.line)} text-white/75`}>{p.jumps.line}</p>}
            <ul className="list-disc space-y-1 pb-4 pl-5 text-white/75">{p.notes.map((n) => <li key={n} className={lineSize(n)}>{n}</li>)}</ul>
          </details>
        </section>
      )}

      {/* EVERY-SCREEN P1 (2026-11-10): in a Layer (the end of <body>), as on Today and the signature page. Mounted here in
          the page, the player sat inside the page's own stacking context, UNDER the tab bar and the status rail: its one
          button (Start now / Set done) and its close and pause could not be tapped (measured on the rig: the tab bar's
          icon was the element on top of the button). */}
      {/* EVERY-SCREEN P4: room under the last line for the docked Start (fixed on a phone), so nothing ends under it */}
      {canStart && <div aria-hidden data-dock-spacer className="h-24 md:hidden" />}
      {playing && <Layer><SessionPlayer session={playing.session} mode="device" onFinish={finish} onClose={() => setPlaying(null)} /></Layer>}
    </div>
  );
}
