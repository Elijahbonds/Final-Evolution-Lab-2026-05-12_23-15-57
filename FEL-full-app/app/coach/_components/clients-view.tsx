'use client';
// Clients — the coach's side of the loop (lane 1 C1/C3).
//
// PLATFORM PHASE 5 (2026-10-27): "Coach Today: one queue, then done". The tab that stacked 29 components at the same
// weight (invite, attention, drafts, form review, check-ins, habits, teams, combine, coverage, availability, guardian
// report, prescriptions, assign, import, builder, thread…) is now the coach's home:
//   1. NEEDS YOU: one ordered list (lib/coach/queue.ts via /api/coach/queue), each card acting in place;
//   2. THIS WEEK: the roster strip; an avatar opens the athlete sheet.
// Everything else is one tap away and never on the first screen: the ATHLETE SHEET (this week, numbers, thread, program —
// the same panels as before, for one athlete), SETUP (components/coach/setup), the BUILDER full screen, and the coach's
// tools (Send, Exercises, Form Check, their own Today, the AI coach) as plain rows under the strip.
// A coach with nobody on the roster sees the first-client checklist and the invite panel instead: that is the work.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Settings, Video } from 'lucide-react';
import { InvitePanel } from '@/components/coach/invite-panel';
import { DraftsInbox } from '@/components/coach/drafts-inbox';
import { AttentionPanel } from '@/components/coach/attention-panel';
// COACH-VIDEO-REVIEW (2026-10-24): filmed sets, the camera's flagged rep first (components/coach/form-review)
import { FormReviewQueue } from '@/components/coach/form-review/review-queue';
import { ScreenPrescriptions } from '@/components/coach/screen-prescriptions';
import { ProgramBuilder, type BuilderCatalogueItem } from '@/components/coach/program-builder';
import { CoverageLegend, CoverageStrip } from '@/components/coach/coverage-strip';
import type { CoverageStrip as CoverageStripData } from '@/lib/coach/coverage';
import type { ProgramTree } from '@/lib/coach/loop';
// COACH-AI Phase 8 (2026-10-07): read markers (unread per program, "N new", "Seen") — nothing shows until the pending
// SQL is applied (lib/coach/messageReads.ts) — and each athlete's availability (Full / Limited / Out).
import { ThreadMessages, UnreadPill } from '@/components/coach/thread-messages';
import { LiveSessionLink } from '@/components/coach/live/live-session-link';   // COACH-LIVE (2026-10-25): wiring only
import { clearProgram, markReadIfNeeded, unreadBadge, unreadInThread, type ThreadMsg, type UnreadView } from '@/lib/coach/messageReadsView';
import { AVAILABILITY_API, AvailabilityPicker } from '@/components/coach/availability-picker';
import { availabilityLine, type AvailabilityView } from '@/lib/coach/availability';
// COACH-LOOP P1 (2026-10-20): assign the selected program to a group (the duplicate route's first button)
import { AssignProgram } from '@/components/coach/assign-program';
// COACH-LOOP P1: the guardian's training report, for teens with an accepted consent only (the server decides who)
import { GUARDIAN_REPORT_API, GuardianReportButton } from '@/components/coach/guardian-report-button';
// COACH-PARITY (2026-10-26): "paste a program" (coming soon until the pending SQL)
import { ImportProgram } from '@/components/coach/parity/import-panel';
// COACH-DELIVERY (2026-10-26): the first-client checklist and the first-block draft
import { FirstClientChecklist } from '@/components/coach/first-client';
import { FirstBlockDraft } from '@/components/coach/first-block';
// PLATFORM PHASE 5: the queue, the strip, the sheet and Setup
import { CoachQueue } from '@/components/coach/coach-queue/coach-queue';
import { RosterStrip } from '@/components/coach/coach-queue/roster-strip';
import { LOOK } from '@/components/coach/coach-queue/look';
import { AthleteSheet, FullScreen, type SheetTab } from '@/components/coach/athlete-sheet/athlete-sheet';
import { SetupScreen } from '@/components/coach/setup/setup-screen';
import type { QueueCard, QueueSourceKey } from '@/lib/coach/queue';
import type { RosterStripRow } from '@/lib/coach/queueServer';
import type { SharedBy } from '@/lib/share/shareable';
import { TAP } from './look';
import { TodayView } from './today-view';
import { SendView } from './send-view';
import { ExerciseCatalogue } from './exercise-catalogue';
import { FormFeedback } from './form-feedback';
import { CoachChat } from './coach-chat';

interface Program { tree: ProgramTree; role: 'coach' | 'client' | null; clientName: string; clientId?: string; completedSessionIds: string[]; plan: { status: string; goalText: string } | null }
type Catalogue = BuilderCatalogueItem;
interface InboxLog { id: string; exercise: string; prescribed: string; /** MIRROR-COACH P8 FIX: the easier step the gate served on this slot, said. */ servedLine?: string | null; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null; setLines?: string[]; clientNote: string | null; videoUrl: string | null; coachComment: string | null }
interface InboxItem { id: string; completedAt: string; program: { id: string; name: string }; session: string; clientName: string; logs: InboxLog[] }
type Msg = ThreadMsg;
interface RosterRow { clientId: string; name: string; programs: { id: string; name: string; isActive: boolean }[]; card: { slug: string; published: boolean; rarity: string; prq: number; topScore: number; wins: number } | null; prq: Record<string, number> | null; prqDelta: Record<string, number> | null; sessions: number; wins: number; resiliency: { attempts: number; retryRate: number }; games?: number; gamesAtCap?: boolean; coachedSessions?: number; coverage?: CoverageStripData | null }
interface QueueBody { items: QueueCard[]; dark: QueueSourceKey[]; roster: RosterStripRow[] }

type Screen = 'setup' | 'drafts' | 'reviews' | 'attention' | 'builder' | 'send' | 'exercises' | 'form' | 'today' | 'chat';
const SCREEN_TITLE: Record<Screen, string> = { setup: 'Setup', drafts: 'Drafts', reviews: 'Filmed sets', attention: 'Roster check', builder: 'Builder', send: 'Send', exercises: 'Exercises', form: 'Form Check', today: 'My training', chat: 'AI coach' };
const EMPTY: QueueBody = { items: [], dark: [], roster: [] };

export function ClientsView({ me = null, chatOn = false }: { me?: SharedBy | null; chatOn?: boolean } = {}) {
  const [queue, setQueue] = useState<QueueBody | null>(null);
  const [sheet, setSheet] = useState<{ id: string; tab: SheetTab } | null>(null);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [openInvites, setOpenInvites] = useState(0);
  useEffect(() => { fetch('/api/coach/queue').then((r) => (r.ok ? r.json() : null)).then((j) => setQueue(j && Array.isArray(j.items) ? j : EMPTY)).catch(() => setQueue(EMPTY)); }, []);
  useEffect(() => { fetch('/api/coach/invite').then((r) => (r.ok ? r.json() : null)).then((j) => setOpenInvites(Array.isArray(j?.invites) ? j.invites.length : 0)).catch(() => {}); }, []);

  // ── the athlete workspace: read the first time a sheet opens, then kept ─────────────────────────────────────────
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue[]>([]);
  const [inbox, setInbox] = useState<{ items: InboxItem[]; needsReview: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [thread, setThread] = useState<Msg[]>([]);
  const [msg, setMsg] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [unread, setUnread] = useState<UnreadView | null>(null);
  // null until the server says the feature is on (the pending SQL applied); then every athlete gets the picker
  const [availability, setAvailability] = useState<Record<string, AvailabilityView> | null>(null);
  const [linked, setLinked] = useState<string[]>([]);
  const [guardian, setGuardian] = useState<{ eligible: string[]; email: boolean }>({ eligible: [], email: false });
  const wanted = !!sheet || screen === 'builder';

  const load = useCallback(async () => {
    const [p, c, i, ro] = await Promise.all([fetch('/api/coach/programs').then((r) => r.json()), fetch('/api/coach/programs/exercises').then((r) => r.json()), fetch('/api/coach/inbox').then((r) => r.json()), fetch('/api/coach/roster').then((r) => r.json())]);
    setRoster(ro.roster ?? []);
    setPrograms((p.programs ?? []).filter((x: Program) => x.role === 'coach')); setCatalogue(Array.isArray(c) ? c : []); setInbox(i?.items ? i : { items: [], needsReview: 0 });
  }, []);
  useEffect(() => {
    if (!wanted || programs) return;
    load().catch(() => { setPrograms([]); setInbox({ items: [], needsReview: 0 }); });
    fetch('/api/coach/messages/unread').then((r) => (r.ok ? r.json() : null)).then((j) => setUnread(j)).catch(() => {});
    fetch(GUARDIAN_REPORT_API).then((r) => (r.ok ? r.json() : null)).then((j) => { if (Array.isArray(j?.eligible)) setGuardian({ eligible: j.eligible, email: !!j.email }); }).catch(() => {});
    fetch(AVAILABILITY_API).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.available) { setAvailability(j.byClient ?? {}); setLinked(Array.isArray(j.linked) ? j.linked : []); } }).catch(() => {});
  }, [wanted, programs, load]);
  // the athlete's programs with this coach; the first is the sheet's until the coach picks another
  const theirs = (programs ?? []).filter((p) => p.clientId === sheet?.id);
  const theirIds = theirs.map((p) => p.tree.id).join(',');
  useEffect(() => { if (theirIds && !theirIds.split(',').includes(selected ?? '')) setSelected(theirIds.split(',')[0]); }, [theirIds, selected]);
  const sheetTab = sheet?.tab ?? null;
  useEffect(() => {
    if (!selected || !sheetTab) return;
    fetch(`/api/coach/messages?programId=${selected}`).then((r) => r.json()).then((j) => {
      const t: Msg[] = j.messages ?? [];
      setThread(t);
      // the thread is on screen: the client's messages in it are read now (the "N new" stays for this visit)
      void markReadIfNeeded('/api/coach/messages/read', selected, t).then((did) => { if (did) setUnread((u) => clearProgram(u, selected)); });
    }).catch(() => setThread([]));
  }, [selected, sheetTab]);

  // true when the builder saved it (MIRROR-COACH P3: the screen panel marks a corrective "In Prep" only then)
  const builder = async (programId: string, body: Record<string, unknown>): Promise<boolean> => {
    const r = await fetch(`/api/coach/programs/${programId}/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { toast.error(`Builder: ${(await r.json().catch(() => ({}))).error ?? r.status}`); return false; }
    const j = await r.json(); setPrograms((ps) => ps?.map((p) => p.tree.id === programId ? { ...p, tree: j.tree } : p) ?? null);
    return true;
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
  const reloadCatalogue = () => { void fetch('/api/coach/programs/exercises').then((r) => r.json()).then((c) => setCatalogue(Array.isArray(c) ? c : [])).catch(() => {}); };
  const setTree = (tree: ProgramTree) => setPrograms((ps) => ps?.map((p) => p.tree.id === tree.id ? { ...p, tree } : p) ?? null);

  const openCard = (c: QueueCard) => {
    if (c.kind === 'draft') { setScreen('drafts'); return; }
    if (c.kind === 'review') { setScreen('reviews'); return; }
    setSheet({ id: c.athleteId, tab: c.kind === 'message' || c.kind === 'checkin' ? 'thread' : c.kind === 'join' || c.kind === 'missed' ? 'program' : 'week' });
  };

  const emptyRoster = !!queue && !queue.roster.length && !queue.items.length;
  const prog = theirs.find((p) => p.tree.id === selected) ?? null;
  const sheetName = queue?.roster.find((r) => r.id === sheet?.id)?.name ?? roster.find((r) => r.clientId === sheet?.id)?.name ?? theirs[0]?.clientName ?? 'Athlete';
  const sheetDays = queue?.roster.find((r) => r.id === sheet?.id)?.days ?? [];
  const sessionsOf = (inbox?.items ?? []).filter((it) => theirs.some((p) => p.tree.id === it.program.id));

  return (
    // COACH-DELIVERY COA-06: the 44 px tap floor for everything here (./look.ts)
    <div className={TAP} data-coach-clients>
      {/* the home stays mounted under a sheet (the queue keeps its state) but is not on screen, for a reader or a finger */}
      <div hidden={!!sheet || !!screen}>
      <header className={LOOK.header}>
        <h1 className={LOOK.title}>Coach</h1>
        <button type="button" className={LOOK.outline} onClick={() => setScreen('setup')} data-coach-setup-open><Settings className="h-4 w-4" aria-hidden />Setup</button>
      </header>

      {emptyRoster ? (
        // ADD AN ATHLETE: a coach with nobody on the roster has nothing else to do here (COACH-DELIVERY's checklist)
        <div className="space-y-4">
          <FirstClientChecklist state={{ invited: openInvites > 0 }} />
          <div id="coach-invite"><InvitePanel /></div>
        </div>
      ) : (
        <>
          <CoachQueue items={queue?.items ?? null} dark={queue?.dark ?? []} onOpen={openCard} />
          <RosterStrip roster={queue?.roster ?? []} onOpen={(id) => setSheet({ id, tab: 'week' })} />
        </>
      )}

      {/* the coach's tools: plain rows, under the work — only once the queue has answered, so nothing jumps down the page */}
      {queue && <nav aria-label="Coach tools" className="mt-2" data-coach-tools>
        <Link href="/coach/session" className={LOOK.row}><span>Court session</span><ChevronRight className="h-5 w-5 text-fel-dim" aria-hidden /></Link>
        {(['attention', 'reviews', 'drafts', 'send', 'exercises', 'form', 'today', ...(chatOn ? ['chat' as const] : [])] as Screen[]).map((s) => (
          <button key={s} type="button" className={LOOK.row} onClick={() => setScreen(s)} data-coach-tool={s}><span>{SCREEN_TITLE[s]}</span><ChevronRight className="h-5 w-5 text-fel-dim" aria-hidden /></button>
        ))}
        <Link href="/coach/business" className={LOOK.row}><span>Your coaching business</span><ChevronRight className="h-5 w-5 text-fel-dim" aria-hidden /></Link>
      </nav>}
      </div>

      {sheet && (
        <AthleteSheet name={sheetName} initial={sheet.tab} onClose={() => setSheet(null)} className={TAP}>
          {(tab) => !programs || !inbox ? <div className="flex justify-center py-16 text-fel-dim"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
            <>
              {theirs.length > 1 && (tab === 'thread' || tab === 'program') && (
                <div className="flex flex-wrap gap-2">{theirs.map((p) => <button key={p.tree.id} type="button" onClick={() => setSelected(p.tree.id)} className={selected === p.tree.id ? LOOK.solid : LOOK.outline}>{p.tree.name}<UnreadPill n={unreadBadge(unread, p.tree.id)} /></button>)}</div>
              )}
              {tab === 'week' && (
                <div className="space-y-3" data-sheet-week>
                  <div className={LOOK.dots} aria-label={`${sheetDays.filter(Boolean).length} sessions in the last 7 days`}>
                    {(sheetDays.length ? sheetDays : Array(7).fill(0)).map((d, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${d ? 'bg-fel-emerald' : 'bg-white/15'}`} />)}
                  </div>
                  {sessionsOf.slice(0, 8).map((it) => (
                    <div key={it.id} className="fel-surface space-y-2 p-3">
                      <div className={LOOK.line}><span className="font-semibold text-white">{it.session}</span> · {new Date(it.completedAt).toLocaleDateString()}</div>
                      {it.logs.map((l) => (
                        <div key={l.id} className="space-y-1 text-xs text-white/80">
                          {/* MIRROR-COACH P2 review (2026-09-26): a per-set log's summary "RPE" is the TOP set's effort, so it says
                              so, and the sets themselves — reps in reserve and effort per set, captured since P2 and returned by
                              the route as setLines — are listed under it instead of being dropped on the floor */}
                          <div><span className="text-white">{l.exercise}</span> <span className="text-fel-dim">({l.prescribed})</span> → {l.actualSets ?? '–'}×{l.actualReps ?? '–'} @ {l.actualLoad ?? '–'} · {l.setLines?.length ? 'top effort' : 'RPE'} {l.rpe ?? '–'}{l.clientNote ? ` · “${l.clientNote}”` : ''}{l.videoUrl && <a href={l.videoUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-fel-cyan"><Video className="h-3 w-3" /> video</a>}</div>
                          {/* MIRROR-COACH P8 FIX (2026-09-30): a slot the protocol gate swapped says what was done instead */}
                          {l.servedLine && <div className="pl-3 text-[11px] text-fel-gold/85" data-served-line>{l.servedLine}</div>}
                          {!!l.setLines?.length && (
                            <ul className="space-y-0.5 pl-3 text-[11px] text-white/55" data-set-lines>
                              {l.setLines.map((line, k) => <li key={k}>{line}</li>)}
                            </ul>
                          )}
                          {l.coachComment ? <div className="text-fel-cyan/80">You: {l.coachComment}</div> : (
                            <div className="flex gap-2"><input value={comments[l.id] ?? ''} onChange={(e) => setComments((c) => ({ ...c, [l.id]: e.target.value }))} placeholder="Comment on this rep" className={LOOK.input} /><button type="button" onClick={() => review(l.id)} className={LOOK.outline}>Send</button></div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  {!sessionsOf.length && <p className={LOOK.quiet}>No sessions logged yet.</p>}
                </div>
              )}
              {tab === 'numbers' && roster.filter((r) => r.clientId === sheet.id).map((r) => (
                <div key={r.clientId} className="fel-surface space-y-2 p-4 text-xs" data-sheet-numbers={r.clientId}>
                  {/* TWO NUMBERS (MIRROR-COACH P2, 2026-09-25; F8): coached sessions done for this coach, then games. P1
                      relabelled the one count "games" because it was GameSession (lib/camp/profile.ts history.sessions)
                      and a client with six coached sessions read "0 sessions"; the coached number is now beside it. */}
                  <div className="text-sm text-white">{r.name} <span className="whitespace-nowrap text-fel-dim">{r.coachedSessions != null && <>· {r.coachedSessions} coached </>}· {r.gamesAtCap ? `${r.games ?? r.sessions}+` : (r.games ?? r.sessions)} games · {r.wins}W</span></div>
                  <div className="text-white/50">{r.prq ? Object.entries(r.prq).slice(0, 5).map(([k, v]) => `${k.slice(0, 3)} ${Math.round(v)}${r.prqDelta?.[k] ? ` (${r.prqDelta[k] > 0 ? '+' : ''}${Math.round(r.prqDelta[k])})` : ''}`).join(' · ') : 'no PRQ yet'}</div>
                  {/* the six-pattern strip, last 7 days; absent when this coach has no active program for them */}
                  {r.coverage && <><CoverageLegend /><CoverageStrip strip={r.coverage} /></>}
                  {guardian.eligible.includes(r.clientId) && <GuardianReportButton clientId={r.clientId} name={r.name} emailOn={guardian.email} />}
                  {availability && linked.includes(r.clientId) && (
                    <AvailabilityPicker clientId={r.clientId} value={availability[r.clientId] ?? { status: 'full', returnBy: null }}
                      onSaved={(v) => { setAvailability((a) => ({ ...(a ?? {}), [r.clientId]: v })); toast.success(`${r.name}: ${availabilityLine(v, 'coach')}`); }} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {/* PROFILE V2 (2026-10-24): a coach sees their athlete's profile, teen or adult, public or not (/u/[slug]) */}
                    {r.card?.slug && <a href={`/u/${r.card.slug}`} className={LOOK.outline}>Profile</a>}
                    {r.card?.published && <a href={`/card/${r.card.slug}`} target="_blank" rel="noreferrer" className={LOOK.outline}>Card · {r.card.rarity}</a>}
                  </div>
                </div>
              ))}
              {tab === 'thread' && (prog ? (
                <div className="space-y-3" data-sheet-thread>
                  <div className="flex items-center gap-2"><UnreadPill n={unreadInThread(thread)} /><LiveSessionLink programId={prog.tree.id} role="coach" /></div>
                  <ThreadMessages thread={thread} />
                  <div className="flex gap-2"><input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="Message your client" className={LOOK.input} /><button type="button" onClick={send} className={LOOK.solid}>Send</button></div>
                </div>
              ) : <p className={LOOK.quiet}>A thread starts with their first program.</p>)}
              {tab === 'program' && (
                <div className="space-y-4" data-sheet-program>
                  {!prog && <p className={LOOK.quiet}>No program yet. Assign one from another athlete, or draft one in Camp.</p>}
                  {prog && <button type="button" className={`${LOOK.solid} w-full`} onClick={() => setScreen('builder')} data-open-builder>Open the builder</button>}
                  {prog?.clientId && <AssignProgram program={{ id: prog.tree.id, name: prog.tree.name, clientId: prog.clientId }} roster={roster} onDone={() => void load()} />}
                  {/* COACH-DELIVERY COA-02: draft the first block from their goal, the coach's answers and their Mirror screen */}
                  {prog?.clientId && !prog.completedSessionIds.length && (
                    <FirstBlockDraft key={prog.tree.id} program={{ id: prog.tree.id, name: prog.tree.name }}
                      blank={prog.tree.blocks.every((b) => b.sessions.every((x) => x.exercises.length === 0))}
                      onTree={(tree) => { setTree(tree); reloadCatalogue(); }} />
                  )}
                  {prog && (
                    <ImportProgram program={{ id: prog.tree.id, name: prog.tree.name, clientName: prog.clientName }}
                      blank={!prog.completedSessionIds.length && prog.tree.blocks.every((b) => b.sessions.every((x) => x.exercises.length === 0))}
                      onTree={(tree) => { setTree(tree); reloadCatalogue(); }} />
                  )}
                  {/* The screen's correctives: the athlete's own screen already says what the work should be */}
                  {prog?.clientId && (
                    <ScreenPrescriptions clientId={prog.clientId}
                      sessions={prog.tree.blocks.flatMap((b) => b.sessions.map((s) => ({ id: s.id, label: `${b.label} · ${s.label}` })))}
                      onAdd={(_sessionId, body) => builder(prog.tree.id, body)} />
                  )}
                </div>
              )}
            </>
          )}
        </AthleteSheet>
      )}

      {screen && (
        <FullScreen title={screen === 'builder' && prog ? prog.tree.name : SCREEN_TITLE[screen]} onClose={() => setScreen(null)} testId={screen} className={TAP}>
          {screen === 'setup' && <SetupScreen />}
          {screen === 'drafts' && <DraftsInbox />}
          {screen === 'reviews' && <FormReviewQueue />}
          {/* NEEDS YOU TODAY's full board: triage, drift, pain and readiness behind their own consent rules (lib/coach/attention.ts) */}
          {screen === 'attention' && <AttentionPanel />}
          {/* The builder (MIRROR-COACH P2, 2026-09-25): sections, key set, supersets, timers, effort bands and set-up cues per
              exercise, every field editable after it is added — full screen from the athlete sheet */}
          {screen === 'builder' && prog && inbox && (
            <ProgramBuilder
              tree={prog.tree}
              completedSessionIds={prog.completedSessionIds}
              catalogue={catalogue}
              // the client's own notes on logged exercises in this program: the builder reads them only to tilt its
              // pull-over-push suggestion when one mentions the shoulder (MIRROR-COACH P2)
              notes={inbox.items.filter((it) => it.program.id === prog.tree.id).flatMap((it) => it.logs.map((l) => l.clientNote))}
              onTree={setTree}
              // MIRROR-COACH P8 (2026-09-29): a FEL template clone seeds the catalogue — reload it
              onCatalogueChange={reloadCatalogue}
            />
          )}
          {screen === 'send' && (me ? <SendView me={me} /> : <div className="py-16 text-center text-sm text-fel-dim">Loading your details…</div>)}
          {screen === 'exercises' && <ExerciseCatalogue coach />}
          {screen === 'form' && <FormFeedback />}
          {screen === 'today' && <TodayView />}
          {screen === 'chat' && chatOn && <CoachChat />}
        </FullScreen>
      )}
    </div>
  );
}
