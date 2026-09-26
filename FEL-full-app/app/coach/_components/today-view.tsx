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
//   · The "How did it feel?" note stays: until the pain check-in lands (phase 5) it is the client's only free-text line
//     to the coach about how a set went.
// `api` points the view at other endpoints (the dev harness app/dev/coach-today runs the same server code in memory).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, MessageSquare, PlayCircle, Video } from 'lucide-react';
import { SetLogger, UnitSwitch, readWeightUnit, writeWeightUnit } from '@/components/coach/set-logger';
import { SetTimer } from '@/components/coach/set-timer';
import { SET_LOG_ERROR_COPY, convertDrafts, draftsFor, draftsToInput, logLines, type SetDraft, type SetLogError, type WeightUnit } from '@/lib/coach/setLog';
import { KEY_SET_LINE, NOTE_PROMPT, easierLine, repsPlaceholder, simpleLogging, supersetHint, todayLayout, type TodayExercise } from '@/lib/coach/today';
import { nextTimedRow } from '@/lib/coach/setTimer';
import type { OpenLog, TodayPayload } from '@/lib/coach/todayServer';

export interface TodayApi { today: string; log: string; messages: string | null }
export const TODAY_API: TodayApi = { today: '/api/coach/me/today', log: '/api/coach/me/log', messages: '/api/coach/messages' };

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
  const [msg, setMsg] = useState('');

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
    const logs = data.today.session.exercises.map((e) => ({ sessionExerciseId: e.id, sets: draftsToInput(drafts[e.id].sets, unit), clientNote: drafts[e.id].clientNote, videoUrl: drafts[e.id].videoUrl }));
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
    void load();
  };
  const send = async () => {
    if (!data?.program || !msg.trim() || !api.messages) return;
    const r = await fetch(api.messages, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: data.program.id, body: msg }) });
    if (r.ok) { setMsg(''); const t = await fetch(`${api.messages}?programId=${data.program.id}`); setThread((await t.json()).messages ?? []); }
  };

  const layout = useMemo(() => todayLayout(data?.today?.session.exercises ?? []), [data]);

  if (!data) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data.program || !data.today) return (
    <div className="fel-card rounded-xl p-6 text-center">
      <p className="text-white/70 text-sm">{data.program ? 'Program complete — nothing left on the plan. Talk to your coach about the next block.' : 'No active program yet. A certified coach assigns one from a Plan in Camp.'}</p>
    </div>
  );
  const { program, today } = data;
  const card = (e: TodayExercise, label: string | null) => {
    const d = drafts[e.id]; if (!d) return null;
    const put = (patch: Partial<ExerciseDraft>) => setDrafts((s) => ({ ...s, [e.id]: { ...s[e.id], ...patch } }));
    return (
      <ExerciseCard key={e.id} e={e} label={label} draft={d} unit={unit} error={errors[e.id] ?? null}
        prev={data.open?.logs.find((l) => l.sessionExerciseId === e.id) ?? null}
        onSets={(sets) => put({ sets })} onNote={(clientNote) => put({ clientNote })} onVideo={(videoUrl) => put({ videoUrl })} />
    );
  };
  return (
    <div className="space-y-4" data-testid="today">
      <div className="fel-card rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/40">{program.name} · coach {program.coachName}</div>
            <div className="fel-heading text-lg text-white mt-1">{today.block.label} · {today.session.label}</div>
            <div className="text-xs text-white/40 mt-0.5">Session {today.index + 1} of {today.total}</div>
          </div>
          <UnitSwitch unit={unit} onChange={switchUnit} />
        </div>
      </div>
      {today.session.exercises.length === 0 && <div className="fel-card rounded-xl p-4 text-sm text-white/60">Your coach has made this session but not put anything in it yet.</div>}
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

/** One prescribed exercise: what to do, how to do it, and its sets. */
function ExerciseCard({ e, label, draft, unit, error, prev, onSets, onNote, onVideo }: {
  e: TodayExercise; label: string | null; draft: ExerciseDraft; unit: WeightUnit; error: string | null; prev: OpenLog | null;
  onSets: (s: SetDraft[]) => void; onNote: (v: string) => void; onVideo: (v: string) => void;
}) {
  const [demo, setDemo] = useState(false);
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
    <div className={`fel-card rounded-xl p-4 space-y-3 ${e.isKeySet ? 'border border-[#FFD700]/30' : ''}`} data-exercise={e.id} data-key-set={e.isKeySet ? 'true' : undefined}>
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

      <SetTimer timers={e.timers} onWorkLogged={timed ? onWork : undefined} testId={`timer-${e.id}`} />
      {earlier?.kind === 'legacy' && (
        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5 text-xs text-white/55" data-legacy-log>
          Saved earlier: {earlier.lines[0]}
        </div>
      )}
      <SetLogger name={e.name} rows={draft.sets} unit={unit} timed={timed} simple={simpleLogging(e)} youth={!!e.youthRules} repsHint={repsPlaceholder(e.reps)} workHint={String(e.workSeconds ?? '')} onChange={onSets} />
      {error && <div className="text-xs text-[#FF3366]" role="alert" data-set-error>{error}</div>}
      {/* the client's free-text line to the coach — until the pain check-in (phase 5), the only one about how it felt */}
      <textarea value={draft.clientNote} onChange={(ev) => onNote(ev.target.value)} placeholder={NOTE_PROMPT} aria-label={`${e.name}: note to your coach`} rows={2} maxLength={500} className="w-full resize-y rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" />
      <div className="flex items-center gap-2"><Video className="h-4 w-4 shrink-0 text-white/40" /><input value={draft.videoUrl} onChange={(ev) => onVideo(ev.target.value)} placeholder="Form video link (https://…)" aria-label={`${e.name}: form video link`} className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" /></div>
    </div>
  );
}
