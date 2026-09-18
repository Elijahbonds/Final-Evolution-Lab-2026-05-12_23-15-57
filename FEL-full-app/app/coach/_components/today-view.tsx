'use client';
// Today — the client's side of the coaching loop (lane 1 C2/C3): the next session of your active program, tap-through
// logging (sets / reps / load / RPE / note / a form-video link), Done, the coach's recent comments, and the thread.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, MessageSquare, Video } from 'lucide-react';

interface Ex { id: string; name: string; sets: number; reps: string; load: string; tempo: string; restSeconds: number; coachNote: string | null }
interface Today { program: { id: string; name: string; coachName: string } | null; today: { block: { label: string }; session: { id: string; label: string; exercises: Ex[] }; index: number; total: number } | null; open: { id: string; logs: any[] } | null; recentComments: { exercise: string; comment: string; at: string }[] }
interface Draft { actualSets: string; actualReps: string; actualLoad: string; rpe: string; clientNote: string; videoUrl: string }
interface Msg { id: string; body: string; mine: boolean; fromCoach: boolean; createdAt: string }

export function TodayView() {
  const [data, setData] = useState<Today | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Msg[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/coach/me/today'); const j: Today = await r.json(); setData(j);
    if (j.today) {
      const d: Record<string, Draft> = {};
      for (const e of j.today.session.exercises) {
        const prev = j.open?.logs.find((l) => l.sessionExerciseId === e.id);
        d[e.id] = { actualSets: prev?.actualSets?.toString() ?? String(e.sets), actualReps: prev?.actualReps ?? e.reps, actualLoad: prev?.actualLoad ?? e.load, rpe: prev?.rpe?.toString() ?? '', clientNote: prev?.clientNote ?? '', videoUrl: prev?.videoUrl ?? '' };
      }
      setDrafts(d);
    }
    if (j.program) { const t = await fetch(`/api/coach/messages?programId=${j.program.id}`); setThread((await t.json()).messages ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (complete: boolean) => {
    if (!data?.today || !data.program) return;
    setBusy(true);
    const logs = data.today.session.exercises.map((e) => ({ sessionExerciseId: e.id, ...drafts[e.id] }));
    const r = await fetch('/api/coach/me/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: data.program.id, sessionId: data.today.session.id, logs, complete }) });
    setBusy(false);
    if (!r.ok) { toast.error(`Could not save (${(await r.json()).error ?? r.status})`); return; }
    toast.success(complete ? 'Session done — your coach will see it' : 'Saved');
    void load();
  };
  const send = async () => {
    if (!data?.program || !msg.trim()) return;
    const r = await fetch('/api/coach/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: data.program.id, body: msg }) });
    if (r.ok) { setMsg(''); const t = await fetch(`/api/coach/messages?programId=${data.program.id}`); setThread((await t.json()).messages ?? []); }
  };

  if (!data) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data.program || !data.today) return (
    <div className="fel-card rounded-xl p-6 text-center">
      <p className="text-white/70 text-sm">{data.program ? 'Program complete — nothing left on the plan. Talk to your coach about the next block.' : 'No active program yet. A certified coach assigns one from a Plan in Camp.'}</p>
    </div>
  );
  const { program, today } = data;
  return (
    <div className="space-y-4">
      <div className="fel-card rounded-xl p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/40">{program.name} · coach {program.coachName}</div>
        <div className="fel-heading text-lg text-white mt-1">{today.block.label} · {today.session.label}</div>
        <div className="text-xs text-white/40 mt-0.5">Session {today.index + 1} of {today.total}</div>
      </div>
      {today.session.exercises.map((e) => {
        const d = drafts[e.id]; if (!d) return null;
        const set = (k: keyof Draft, v: string) => setDrafts((s) => ({ ...s, [e.id]: { ...s[e.id], [k]: v } }));
        return (
          <div key={e.id} className="fel-card rounded-xl p-4 space-y-2">
            <div className="flex items-baseline justify-between"><div className="text-white font-medium">{e.name}</div><div className="text-xs text-white/50">{e.sets}×{e.reps} @ {e.load} · tempo {e.tempo} · rest {e.restSeconds}s</div></div>
            {e.coachNote && <div className="text-xs text-[#00E5FF]/80">Coach: {e.coachNote}</div>}
            <div className="grid grid-cols-4 gap-2 text-sm">
              {(['actualSets', 'actualReps', 'actualLoad', 'rpe'] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-white/40">{k === 'actualSets' ? 'sets' : k === 'actualReps' ? 'reps' : k === 'actualLoad' ? 'load' : 'RPE'}
                  <input value={d[k]} onChange={(ev) => set(k, ev.target.value)} inputMode={k === 'actualLoad' || k === 'actualReps' ? 'text' : 'numeric'} className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" />
                </label>
              ))}
            </div>
            <input value={d.clientNote} onChange={(ev) => set('clientNote', ev.target.value)} placeholder="How did it feel?" className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" />
            <div className="flex items-center gap-2"><Video className="h-4 w-4 text-white/40" /><input value={d.videoUrl} onChange={(ev) => set('videoUrl', ev.target.value)} placeholder="Form video link (https://…)" className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" /></div>
          </div>
        );
      })}
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
      <div className="fel-card rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><MessageSquare className="h-3.5 w-3.5" /> Thread with {program.coachName}</div>
        <div className="space-y-1 max-h-48 overflow-y-auto">{thread.map((m) => <div key={m.id} className={`text-sm rounded-lg px-3 py-1.5 ${m.mine ? 'bg-[#00E5FF]/10 text-white ml-8' : 'bg-white/5 text-white/80 mr-8'}`}>{m.body}</div>)}</div>
        <div className="flex gap-2"><input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="Message your coach" className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" /><button onClick={send} className="rounded-lg border border-white/10 px-3 text-sm text-white/80">Send</button></div>
      </div>
    </div>
  );
}
