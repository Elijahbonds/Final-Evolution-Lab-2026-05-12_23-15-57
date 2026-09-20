'use client';
// Clients — the coach's side of the loop (lane 1 C1/C3): programs I coach with the builder (prescribe exercises per
// session), the inbox of completed sessions with logs and videos to comment, and the thread per program.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Video, MessageSquare, IdCard } from 'lucide-react';
import { InvitePanel } from '@/components/coach/invite-panel';

interface Ex { id: string; name: string; sets: number; reps: string; load: string; tempo: string; restSeconds: number; coachNote: string | null }
interface Tree { id: string; name: string; blocks: { id: string; label: string; sessions: { id: string; label: string; exercises: Ex[] }[] }[] }
interface Program { tree: Tree; role: 'coach' | 'client' | null; clientName: string; completedSessionIds: string[]; plan: { status: string; goalText: string } | null }
interface Catalogue { id: string; name: string; category: string }
interface InboxLog { id: string; exercise: string; prescribed: string; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null; clientNote: string | null; videoUrl: string | null; coachComment: string | null }
interface InboxItem { id: string; completedAt: string; program: { id: string; name: string }; session: string; clientName: string; logs: InboxLog[] }
interface Msg { id: string; body: string; mine: boolean; fromCoach: boolean }
interface RosterRow { clientId: string; name: string; programs: { id: string; name: string; isActive: boolean }[]; card: { slug: string; published: boolean; rarity: string; prq: number; topScore: number; wins: number } | null; prq: Record<string, number> | null; prqDelta: Record<string, number> | null; sessions: number; wins: number; resiliency: { attempts: number; retryRate: number } }

export function ClientsView() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue[]>([]);
  const [inbox, setInbox] = useState<{ items: InboxItem[]; needsReview: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { exerciseId: string; sets: string; reps: string; load: string }>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [thread, setThread] = useState<Msg[]>([]);
  const [msg, setMsg] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const load = useCallback(async () => {
    const [p, c, i, ro] = await Promise.all([fetch('/api/coach/programs').then((r) => r.json()), fetch('/api/coach/programs/exercises').then((r) => r.json()), fetch('/api/coach/inbox').then((r) => r.json()), fetch('/api/coach/roster').then((r) => r.json())]);
    setRoster(ro.roster ?? []);
    const mine = (p.programs ?? []).filter((x: Program) => x.role === 'coach');
    setPrograms(mine); setCatalogue(Array.isArray(c) ? c : []); setInbox(i);
    if (!selected && mine[0]) setSelected(mine[0].tree.id);
  }, [selected]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!selected) return; fetch(`/api/coach/messages?programId=${selected}`).then((r) => r.json()).then((j) => setThread(j.messages ?? [])); }, [selected]);

  const builder = async (programId: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/coach/programs/${programId}/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { toast.error(`Builder: ${(await r.json()).error ?? r.status}`); return; }
    const j = await r.json(); setPrograms((ps) => ps?.map((p) => p.tree.id === programId ? { ...p, tree: j.tree } : p) ?? null);
  };
  const review = async (logId: string) => {
    const comment = comments[logId]?.trim(); if (!comment) return;
    const r = await fetch('/api/coach/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exerciseLogId: logId, comment }) });
    if (r.ok) { toast.success('Comment sent'); setComments((c) => ({ ...c, [logId]: '' })); void load(); } else toast.error('Could not comment');
  };
  const send = async () => {
    if (!selected || !msg.trim()) return;
    const r = await fetch('/api/coach/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: selected, body: msg }) });
    if (r.ok) { setMsg(''); const t = await fetch(`/api/coach/messages?programId=${selected}`); setThread((await t.json()).messages ?? []); }
  };

  if (!programs || !inbox) return <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const prog = programs.find((p) => p.tree.id === selected) ?? null;
  return (
    <div className="space-y-4">
      {/* ADD AN ATHLETE comes first, because until 2026-09-19 there was no way to do it at all and a coach with an
          empty roster has nothing else on this screen to do. */}
      <InvitePanel />
      {/* roster — lane 5 S3: every client with their card, PRQ and deltas since the program began */}
      <div className="fel-card rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><IdCard className="h-3.5 w-3.5" /> Roster</div>
        {roster.length === 0 && <div className="text-sm text-white/50">No clients yet — send an invite above.</div>}
        {roster.map((r) => (
          <div key={r.clientId} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/6 px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="text-white text-sm truncate">{r.name} <span className="text-white/40">· {r.sessions} sessions · {r.wins}W</span></div>
              <div className="text-white/50 truncate">{r.prq ? Object.entries(r.prq).slice(0, 4).map(([k, v]) => `${k.slice(0, 3)} ${Math.round(v)}${r.prqDelta?.[k] ? ` (${r.prqDelta[k] > 0 ? '+' : ''}${Math.round(r.prqDelta[k])})` : ''}`).join(' · ') : 'no PRQ yet'}</div>
            </div>
            {r.card?.published ? <a href={`/card/${r.card.slug}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-[#00E5FF]/40 px-2 py-1 text-[#00E5FF]">card · {r.card.rarity}</a> : <span className="shrink-0 text-white/30">no public card</span>}
          </div>
        ))}
      </div>
      {/* inbox */}
      <div className="fel-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between"><div className="text-[11px] uppercase tracking-wider text-white/40">Inbox</div><div className="text-xs text-[#FFD700]">{inbox.needsReview} to review</div></div>
        {inbox.items.length === 0 && <div className="text-sm text-white/50">No completed sessions yet.</div>}
        {inbox.items.slice(0, 8).map((it) => (
          <div key={it.id} className="rounded-lg bg-white/[0.03] border border-white/6 p-3 space-y-2">
            <div className="text-sm text-white"><span className="font-medium">{it.clientName}</span> <span className="text-white/50">· {it.program.name} · {it.session} · {new Date(it.completedAt).toLocaleDateString()}</span></div>
            {it.logs.map((l) => (
              <div key={l.id} className="text-xs text-white/80 space-y-1">
                <div><span className="text-white">{l.exercise}</span> <span className="text-white/40">({l.prescribed})</span> → {l.actualSets ?? '–'}×{l.actualReps ?? '–'} @ {l.actualLoad ?? '–'} · RPE {l.rpe ?? '–'}{l.clientNote ? ` · “${l.clientNote}”` : ''}{l.videoUrl && <a href={l.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#00E5FF] ml-2"><Video className="h-3 w-3" /> video</a>}</div>
                {l.coachComment ? <div className="text-[#00E5FF]/80">You: {l.coachComment}</div> : (
                  <div className="flex gap-2"><input value={comments[l.id] ?? ''} onChange={(e) => setComments((c) => ({ ...c, [l.id]: e.target.value }))} placeholder="Comment on this rep" className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white" /><button onClick={() => review(l.id)} className="rounded-lg border border-white/10 px-2 text-white/80">Send</button></div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* programs + builder */}
      <div className="fel-card rounded-xl p-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-white/40">Programs I coach</div>
        {programs.length === 0 && <div className="text-sm text-white/50">Draft a Plan for a mentee in Camp — its milestones become the program you build here.</div>}
        <div className="flex gap-2 flex-wrap">{programs.map((p) => <button key={p.tree.id} onClick={() => setSelected(p.tree.id)} className={`rounded-lg px-3 py-1.5 text-xs border ${selected === p.tree.id ? 'border-[#00E5FF]/50 text-[#00E5FF] bg-[#00E5FF]/10' : 'border-white/10 text-white/70'}`}>{p.clientName} · {p.tree.name}</button>)}</div>
        {prog && prog.tree.blocks.map((b) => (
          <div key={b.id} className="space-y-2">
            <div className="text-sm text-white/70 font-medium">{b.label}</div>
            {b.sessions.map((s) => {
              const d = draft[s.id] ?? { exerciseId: catalogue[0]?.id ?? '', sets: '3', reps: '8-10', load: 'RPE7' };
              const done = prog.completedSessionIds.includes(s.id);
              return (
                <div key={s.id} className="rounded-lg bg-white/[0.03] border border-white/6 p-3 space-y-1.5">
                  <div className="text-xs text-white">{s.label} {done && <span className="text-[#7BD389]">· done</span>}</div>
                  {s.exercises.map((e) => <div key={e.id} className="flex items-center justify-between text-xs text-white/80"><span>{e.name} — {e.sets}×{e.reps} @ {e.load}{e.coachNote ? ` · ${e.coachNote}` : ''}</span><button onClick={() => builder(prog.tree.id, { action: 'remove', sessionExerciseId: e.id })} className="text-white/30 hover:text-[#FF3366]"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
                  <div className="flex gap-1.5 items-center text-xs">
                    <select value={d.exerciseId} onChange={(e) => setDraft((x) => ({ ...x, [s.id]: { ...d, exerciseId: e.target.value } }))} className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white">{catalogue.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                    <input value={d.sets} onChange={(e) => setDraft((x) => ({ ...x, [s.id]: { ...d, sets: e.target.value } }))} className="w-10 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white" />
                    <input value={d.reps} onChange={(e) => setDraft((x) => ({ ...x, [s.id]: { ...d, reps: e.target.value } }))} className="w-14 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white" />
                    <input value={d.load} onChange={(e) => setDraft((x) => ({ ...x, [s.id]: { ...d, load: e.target.value } }))} className="w-16 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-white" />
                    <button onClick={() => builder(prog.tree.id, { action: 'add', sessionId: s.id, ...d })} className="rounded-lg border border-[#00E5FF]/40 text-[#00E5FF] px-2 py-1"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {prog && (
        <div className="fel-card rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><MessageSquare className="h-3.5 w-3.5" /> Thread with {prog.clientName}</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">{thread.map((m) => <div key={m.id} className={`text-sm rounded-lg px-3 py-1.5 ${m.mine ? 'bg-[#00E5FF]/10 text-white ml-8' : 'bg-white/5 text-white/80 mr-8'}`}>{m.body}</div>)}</div>
          <div className="flex gap-2"><input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="Message your client" className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-sm" /><button onClick={send} className="rounded-lg border border-white/10 px-3 text-sm text-white/80">Send</button></div>
        </div>
      )}
    </div>
  );
}
