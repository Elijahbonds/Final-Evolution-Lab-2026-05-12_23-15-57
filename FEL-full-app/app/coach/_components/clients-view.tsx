'use client';
// Clients — the coach's side of the loop (lane 1 C1/C3): programs I coach with the builder (prescribe exercises per
// session), the inbox of completed sessions with logs and videos to comment, and the thread per program.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Video, MessageSquare, IdCard } from 'lucide-react';
import { InvitePanel } from '@/components/coach/invite-panel';
import { AttentionPanel } from '@/components/coach/attention-panel';
import { ScreenPrescriptions } from '@/components/coach/screen-prescriptions';
import { ProgramBuilder, type BuilderCatalogueItem } from '@/components/coach/program-builder';
import { CoverageLegend, CoverageStrip } from '@/components/coach/coverage-strip';
import type { CoverageStrip as CoverageStripData } from '@/lib/coach/coverage';
import type { ProgramTree } from '@/lib/coach/loop';

interface Program { tree: ProgramTree; role: 'coach' | 'client' | null; clientName: string; clientId?: string; completedSessionIds: string[]; plan: { status: string; goalText: string } | null }
type Catalogue = BuilderCatalogueItem;
interface InboxLog { id: string; exercise: string; prescribed: string; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null; setLines?: string[]; clientNote: string | null; videoUrl: string | null; coachComment: string | null }
interface InboxItem { id: string; completedAt: string; program: { id: string; name: string }; session: string; clientName: string; logs: InboxLog[] }
interface Msg { id: string; body: string; mine: boolean; fromCoach: boolean }
interface RosterRow { clientId: string; name: string; programs: { id: string; name: string; isActive: boolean }[]; card: { slug: string; published: boolean; rarity: string; prq: number; topScore: number; wins: number } | null; prq: Record<string, number> | null; prqDelta: Record<string, number> | null; sessions: number; wins: number; resiliency: { attempts: number; retryRate: number }; games?: number; gamesAtCap?: boolean; coachedSessions?: number; coverage?: CoverageStripData | null }

export function ClientsView() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue[]>([]);
  const [inbox, setInbox] = useState<{ items: InboxItem[]; needsReview: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
      {/* NEEDS YOU TODAY, above the roster: fifty rows is not an answer to "who needs me", and the reading the
          coach would otherwise do by eye is already written in lib/coach/{triage,compliance}.ts. It sits BELOW
          the invite panel for that panel's own reason — a coach with nobody on the roster has nothing to triage. */}
      <AttentionPanel />
      {/* roster — lane 5 S3: every client with their card, PRQ and deltas since the program began */}
      <div className="fel-card rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><IdCard className="h-3.5 w-3.5" /> Roster</div>
        {roster.length === 0 && <div className="text-sm text-white/50">No clients yet — send an invite above.</div>}
        {roster.some((r) => r.coverage) && <CoverageLegend />}
        {roster.map((r) => (
          <div key={r.clientId} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/6 px-3 py-2 text-xs" data-roster-row={r.clientId}>
            <div className="min-w-0">
              {/* TWO NUMBERS (MIRROR-COACH P2, 2026-09-25; F8): coached sessions done for this coach, then games. P1
                  relabelled the one count "games" because it was GameSession (lib/camp/profile.ts history.sessions)
                  and a client with six coached sessions read "0 sessions"; the coached number is now beside it. */}
              {/* the counts wrap as one unit under the name on a phone instead of being cut to "2 coached · 2 gam…" */}
              <div className="text-white text-sm">{r.name} <span className="text-white/40 whitespace-nowrap">{r.coachedSessions != null && <>· {r.coachedSessions} coached </>}· {r.gamesAtCap ? `${r.games ?? r.sessions}+` : (r.games ?? r.sessions)} games · {r.wins}W</span></div>
              <div className="text-white/50 truncate">{r.prq ? Object.entries(r.prq).slice(0, 4).map(([k, v]) => `${k.slice(0, 3)} ${Math.round(v)}${r.prqDelta?.[k] ? ` (${r.prqDelta[k] > 0 ? '+' : ''}${Math.round(r.prqDelta[k])})` : ''}`).join(' · ') : 'no PRQ yet'}</div>
              {/* the six-pattern strip, last 7 days; absent when this coach has no active program for them */}
              {r.coverage && <CoverageStrip strip={r.coverage} />}
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
                {/* MIRROR-COACH P2 review (2026-09-26): a per-set log's summary "RPE" is the TOP set's effort, so it says
                    so, and the sets themselves — reps in reserve and effort per set, captured since P2 and returned by
                    the route as setLines — are listed under it instead of being dropped on the floor */}
                <div><span className="text-white">{l.exercise}</span> <span className="text-white/40">({l.prescribed})</span> → {l.actualSets ?? '–'}×{l.actualReps ?? '–'} @ {l.actualLoad ?? '–'} · {l.setLines?.length ? 'top effort' : 'RPE'} {l.rpe ?? '–'}{l.clientNote ? ` · “${l.clientNote}”` : ''}{l.videoUrl && <a href={l.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#00E5FF] ml-2"><Video className="h-3 w-3" /> video</a>}</div>
                {!!l.setLines?.length && (
                  <ul className="pl-3 text-[11px] text-white/55 space-y-0.5" data-set-lines>
                    {l.setLines.map((line, k) => <li key={k}>{line}</li>)}
                  </ul>
                )}
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
        {/* The screen's correctives, offered before the blank builder below them: the coach came here to write
            work for this athlete, and the athlete's own screen already says what the work should be. */}
        {prog?.clientId && (
          <ScreenPrescriptions
            clientId={prog.clientId}
            sessions={prog.tree.blocks.flatMap((b) => b.sessions.map((s) => ({ id: s.id, label: `${b.label} · ${s.label}` })))}
            onAdd={(_sessionId, body) => builder(prog.tree.id, body)}
          />
        )}
        {/* The builder (MIRROR-COACH P2, 2026-09-25): sections, key set, supersets, timers, effort bands and set-up
            cues per exercise, every field editable after it is added. It was one add-row per session: sets, reps
            and load in, nothing editable afterwards, and the session a flat list. */}
        {prog && (
          <ProgramBuilder
            tree={prog.tree}
            completedSessionIds={prog.completedSessionIds}
            catalogue={catalogue}
            // the client's own notes on logged exercises in this program: the builder reads them only to tilt its
            // pull-over-push suggestion when one mentions the shoulder (MIRROR-COACH P2)
            notes={inbox.items.filter((it) => it.program.id === prog.tree.id).flatMap((it) => it.logs.map((l) => l.clientNote))}
            onTree={(tree) => setPrograms((ps) => ps?.map((p) => p.tree.id === tree.id ? { ...p, tree } : p) ?? null)}
          />
        )}
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
