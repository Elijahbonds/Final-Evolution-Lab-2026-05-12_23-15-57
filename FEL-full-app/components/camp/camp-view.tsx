'use client';
// The Camp Blueprint screens (Phase 8). Four flows on one page, each a thin
// client over /api/v1/camp/*: Certify (the curriculum assessments), Plans
// (the intake: goal → milestones → lock → activate), Session (record a
// facilitated session and read the deltas), Templates (export / import / fork).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GraduationCap, Target, ClipboardList, Copy, Loader2, Check, Lock, Play, Sparkles, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { allLessons } from '@/lib/curriculum/blueprint';
import { ARC, BRIDGE_PROMPTS, CAMP_BLUEPRINT_VERSION, MEASURES, PATHWAY_FIELDS, PROGRAM, REPLICATION, STANDARDS, THESIS, TRACKS, arcMilestones, arcWeek, bridgePromptFor, weekOf } from '@/lib/camp/curriculum';

type Tab = 'certify' | 'plans' | 'session' | 'templates' | 'curriculum';
interface ModuleQ { key: string; prompt: string; options: string[] }
interface ModuleInfo { ref: string; title: string; summary: string; required: boolean; questions: ModuleQ[] }
interface AssessState { status: string; missingModules: string[]; passedModules: string[]; modules: ModuleInfo[]; credentials: { trackKey: string; moduleKey: string; score: number; passed: boolean }[]; curriculumVersion: string }
interface Plan { id: string; goalText: string; status: string; menteeId: string; facilitatorUserId: string; linkedModuleKeys: string[]; tags: string[]; createdAt: string; lockedAt?: string | null; pathwayMap?: Record<string, string> | null; sessions?: CampSessionRow[] }
interface CampSessionRow { id: string; date: string; moduleKeys: string[]; gameSessionIds: string[]; prqDelta: Record<string, number> | null; resiliency: { attempts: number; failures: number; retryRate: number; returnedAfterLoss: boolean | null } | null; notes: string | null }
interface Template { id: string; name: string; description: string | null; version: number; curriculumVersion: string; published: boolean; uses: number; forkedFromId: string | null; structure: { blocks: { label: string; sessions: { label: string }[] }[] } }

async function api<T>(path: string, init?: RequestInit): Promise<T & { error?: string }> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { error: `${r.status}` } as T & { error?: string }; }
}

const STATUS_LABEL: Record<string, string> = { none: 'Not started', in_progress: 'In progress', certified: 'Certified facilitator', revoked: 'Revoked' };

export function CampView() {
  const [tab, setTab] = useState<Tab>('certify');
  const [assess, setAssess] = useState<AssessState | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [me, setMe] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, p, t, s] = await Promise.all([
      api<AssessState>('/api/v1/camp/assess'), api<{ plans: Plan[] }>('/api/v1/camp/plans'),
      api<{ templates: Template[] }>('/api/v1/camp/templates'), api<{ user?: { id?: string } }>('/api/auth/session'),
    ]);
    if (!a.error) setAssess(a);
    if (!p.error) setPlans(p.plans ?? []);
    if (!t.error) setTemplates(t.templates ?? []);
    setMe(s.user?.id ?? null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const certified = assess?.status === 'certified';
  const tabs: { key: Tab; label: string; icon: typeof Target }[] = [
    { key: 'certify', label: 'Certify', icon: GraduationCap }, { key: 'plans', label: 'Plans', icon: Target },
    { key: 'session', label: 'Session', icon: ClipboardList }, { key: 'templates', label: 'Templates', icon: Copy },
    { key: 'curriculum', label: 'Curriculum', icon: BookOpen },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 text-white">
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Camp Blueprint</h1>
        <p className="text-sm text-white/50">Mentorship, on the Neuro-Mechanic&apos;s Blueprint. {assess ? <span className={certified ? 'text-emerald-300' : 'text-white/70'}>{STATUS_LABEL[assess.status] ?? assess.status}</span> : null}</p>
      </div>
      <div className="mb-6 grid grid-cols-5 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${tab === key ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/60 hover:text-white'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === 'certify' && <Certify state={assess} onDone={refresh} />}
      {tab === 'plans' && <Plans plans={plans} me={me} certified={certified} onChange={refresh} />}
      {tab === 'session' && <SessionTab plans={plans.filter((p) => p.status === 'active' && p.facilitatorUserId === me)} onChange={refresh} />}
      {tab === 'templates' && <Templates templates={templates} plans={plans.filter((p) => p.facilitatorUserId === me)} certified={certified} onChange={refresh} />}
      {tab === 'curriculum' && <Curriculum plans={plans} onChange={refresh} />}
    </main>
  );
}

// ── Certify ────────────────────────────────────────────────────────────────
function Certify({ state, onDone }: { state: AssessState | null; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  if (!state) return <Loading />;
  const passed = new Set(state.passedModules);
  const submit = async (m: ModuleInfo) => {
    const [trackKey, moduleKey] = m.ref.split('/');
    const unanswered = m.questions.filter((q) => answers[q.key] == null).length;
    if (unanswered) { toast.error(`${unanswered} question${unanswered > 1 ? 's' : ''} unanswered`); return; }
    setBusy(true);
    const r = await api<{ score: number; passed: boolean; status: string }>('/api/v1/camp/assess', { method: 'POST', body: JSON.stringify({ trackKey, moduleKey, answers }) });
    setBusy(false);
    if (r.error) { toast.error(r.error); return; }
    toast[r.passed ? 'success' : 'error'](`${r.score}% — ${r.passed ? 'passed' : 'below the 80% mark, try again'}`);
    setOpen(null); setAnswers({}); await onDone();
  };
  return (
    <section className="space-y-3">
      <p className="text-xs text-white/50">Curriculum {state.curriculumVersion}. Pass every required module at 80% to certify. Your Creator Card becomes a Facilitator Card when you do.</p>
      {state.modules.map((m) => (
        <div key={m.ref} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{m.title} {m.required && <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/60">required</span>}</h3>
              <p className="mt-1 text-xs text-white/50">{m.summary}</p>
            </div>
            {passed.has(m.ref) ? <span className="flex items-center gap-1 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> passed</span>
              : <button onClick={() => { setOpen(open === m.ref ? null : m.ref); setAnswers({}); }} className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300">{open === m.ref ? 'Close' : 'Take assessment'}</button>}
          </div>
          {open === m.ref && (
            <div className="mt-4 space-y-4">
              {m.questions.map((q, i) => (
                <fieldset key={q.key}>
                  <legend className="mb-1.5 text-sm text-white/80">{i + 1}. {q.prompt}</legend>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {q.options.map((o, oi) => (
                      <label key={oi} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs ${answers[q.key] === oi ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-white/70 hover:border-white/25'}`}>
                        <input type="radio" name={q.key} className="sr-only" checked={answers[q.key] === oi} onChange={() => setAnswers((a) => ({ ...a, [q.key]: oi }))} />{o}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button disabled={busy} onClick={() => submit(m)} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-black text-black disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Submit</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

// ── Plans (intake) ─────────────────────────────────────────────────────────
function Plans({ plans, me, certified, onChange }: { plans: Plan[]; me: string | null; certified: boolean; onChange: () => Promise<void> }) {
  const [email, setEmail] = useState(''); const [mentee, setMentee] = useState<{ id: string; name: string; consentAccepted: boolean } | null>(null);
  const [goal, setGoal] = useState(''); const [followups, setFollowups] = useState<string[]>([]); const [saidBack, setSaidBack] = useState('');
  const [milestones, setMilestones] = useState<{ label: string; sessions: { label: string }[] }[]>([{ label: 'Milestone 1', sessions: [{ label: 'Session 1' }] }]);
  const [guardian, setGuardian] = useState({ name: '', email: '', birthYear: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const lookup = async () => {
    const r = await api<{ mentee: { id: string; name: string; consentAccepted: boolean } }>(`/api/v1/camp/mentees?email=${encodeURIComponent(email)}`);
    if (r.error) { toast.error(r.error === 'not_found' ? 'No player with that email' : r.error); setMentee(null); return; }
    setMentee(r.mentee);
  };
  const askFollowups = async () => {
    if (!goal.trim()) return;
    setBusy('followups');
    const r = await api<{ reply?: string; message?: string; content?: string }>('/api/coach/chat', { method: 'POST', body: JSON.stringify({ persona: 'analyst', messages: [{ role: 'user', content: `A mentee said their goal is: "${goal}". Ask three short follow-up questions a mentor would ask before locking this goal — one line each, numbered, no preamble.` }] }) });
    setBusy(null);
    const text = r.reply ?? r.message ?? r.content ?? '';
    setFollowups(text.split('\n').map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).slice(0, 3));
  };
  const draft = async () => {
    if (!mentee || !goal.trim()) return;
    setBusy('draft');
    const r = await api<{ plan: Plan }>('/api/v1/camp/plans', { method: 'POST', body: JSON.stringify({ menteeId: mentee.id, goalText: goal, linkedModuleKeys: ['blueprint/m1', 'blueprint/m2'], milestones }) });
    setBusy(null);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Plan drafted'); await onChange();
  };
  const act = async (planId: string, action: 'lock' | 'activate') => {
    setBusy(planId + action);
    const r = await api<{ plan: Plan }>('/api/v1/camp/plans', { method: 'POST', body: JSON.stringify({ action, planId }) });
    setBusy(null);
    if (r.error === 'guardian_consent_required') { toast.error('Guardian consent is required before this plan can go active'); return; }
    if (r.error) { toast.error(r.error); return; }
    toast.success(action === 'lock' ? 'Goal locked' : 'Plan is active'); await onChange();
  };
  const requestConsent = async (menteeId: string) => {
    setBusy('consent');
    const r = await api<{ token: string }>('/api/v1/camp/consent', { method: 'POST', body: JSON.stringify({ menteeId, guardianName: guardian.name, guardianEmail: guardian.email, menteeBirthYear: Number(guardian.birthYear) }) });
    setBusy(null);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Consent requested — send the guardian their acceptance link');
    await navigator.clipboard?.writeText(`${location.origin}/api/v1/camp/consent?token=${r.token}`).catch(() => undefined);
  };

  return (
    <section className="space-y-5">
      {certified ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-sm font-semibold">New intake</h3>
          <div className="flex gap-2"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mentee@email" className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm" aria-label="Mentee email" /><button onClick={lookup} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold">Find</button></div>
          {mentee && <p className="text-xs text-emerald-300">Mentee: {mentee.name} {mentee.consentAccepted ? '· guardian consent on file' : ''}</p>}
          <label className="block text-xs text-white/60">What do you want to be when you grow up?
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" placeholder="In the mentee's own words" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={askFollowups} disabled={busy === 'followups' || !goal.trim()} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> Coach follow-ups</button>
            {followups.map((f, i) => <span key={i} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/70">{f}</span>)}
          </div>
          <label className="block text-xs text-white/60">The mentee says the goal back (lock only when they can)
            <input value={saidBack} onChange={(e) => setSaidBack(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" placeholder="Their words" />
          </label>
          <div>
            <p className="mb-1 text-xs text-white/60">Milestones</p>
            {milestones.map((m, i) => (
              <div key={i} className="mb-1.5 flex gap-2"><input value={m.label} onChange={(e) => setMilestones((ms) => ms.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white" aria-label={`Milestone ${i + 1}`} /><span className="self-center text-[11px] text-white/40">{m.sessions.length} session{m.sessions.length > 1 ? 's' : ''}</span></div>
            ))}
            <div className="flex gap-3"><button onClick={() => setMilestones((ms) => [...ms, { label: `Milestone ${ms.length + 1}`, sessions: [{ label: 'Session 1' }] }])} className="text-[11px] text-cyan-300">+ milestone</button><button onClick={() => setMilestones(arcMilestones())} className="text-[11px] text-cyan-300">Use the eight-week arc</button></div>
          </div>
          <button onClick={draft} disabled={!mentee || !goal.trim() || busy === 'draft'} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-black text-black disabled:opacity-40">{busy === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />} Draft plan</button>
        </div>
      ) : <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">Certify on the Certify tab to run intakes. Plans where you are the mentee appear below.</p>}

      {plans.map((p) => {
        const mine = p.facilitatorUserId === me;
        return (
          <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{p.goalText}</p>
                <p className="text-[11px] text-white/50">{mine ? 'You facilitate' : 'Your plan'} · {p.status} · {p.linkedModuleKeys.join(', ') || 'no modules'}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${p.status === 'active' ? 'bg-emerald-400/15 text-emerald-300' : p.status === 'locked' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/10 text-white/60'}`}>{p.status}</span>
            </div>
            {mine && p.status === 'draft' && <button onClick={() => act(p.id, 'lock')} disabled={!!busy} className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300"><Lock className="h-3.5 w-3.5" /> Lock goal</button>}
            {mine && p.status === 'locked' && (
              <div className="mt-3 space-y-2">
                <button onClick={() => act(p.id, 'activate')} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300"><Play className="h-3.5 w-3.5" /> Activate</button>
                <details className="text-xs text-white/60"><summary className="cursor-pointer">Mentee under 18? Request guardian consent</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input placeholder="Guardian name" value={guardian.name} onChange={(e) => setGuardian({ ...guardian, name: e.target.value })} className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white" />
                    <input placeholder="Guardian email" value={guardian.email} onChange={(e) => setGuardian({ ...guardian, email: e.target.value })} className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white" />
                    <input placeholder="Mentee birth year" value={guardian.birthYear} onChange={(e) => setGuardian({ ...guardian, birthYear: e.target.value })} className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white" />
                  </div>
                  <button onClick={() => requestConsent(p.menteeId)} disabled={busy === 'consent'} className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs">Request consent (copies the link)</button>
                </details>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ── Session ────────────────────────────────────────────────────────────────
function SessionTab({ plans, onChange }: { plans: Plan[]; onChange: () => Promise<void> }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const lessons = useMemo(() => allLessons(), []);
  const [modules, setModules] = useState('blueprint/m1/strength'); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false);
  const lesson = useMemo(() => lessons.find((l) => l.ref === modules.split(',')[0]?.trim()) ?? null, [lessons, modules]);
  const [rows, setRows] = useState<CampSessionRow[]>([]);
  const load = useCallback(async (id: string) => { if (!id) return; const r = await api<{ sessions: CampSessionRow[] }>(`/api/v1/camp/sessions?goalPlanId=${id}`); if (!r.error) setRows(r.sessions ?? []); }, []);
  useEffect(() => { if (!planId && plans[0]) setPlanId(plans[0].id); }, [plans, planId]);
  useEffect(() => { void load(planId); }, [planId, load]);
  const record = async () => {
    setBusy(true);
    const r = await api<{ session: CampSessionRow; gamesAttached: number }>('/api/v1/camp/sessions', { method: 'POST', body: JSON.stringify({ goalPlanId: planId, moduleKeys: modules.split(',').map((s) => s.trim()).filter(Boolean), notes }) });
    setBusy(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success(`Session recorded · ${r.gamesAttached} game${r.gamesAttached === 1 ? '' : 's'} attached`); setNotes(''); await load(planId); await onChange();
  };
  if (!plans.length) return <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">No active plan you facilitate. Activate one on the Plans tab.</p>;
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const week = weekOf(plan.lockedAt ?? plan.createdAt);
  const arc = arcWeek(week);
  const bridge = bridgePromptFor(week);
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" aria-label="Plan">{plans.map((p) => <option key={p.id} value={p.id}>{p.goalText}</option>)}</select>
        <div className={`rounded-lg border p-3 text-xs ${arc.plateau ? 'border-amber-400/40 bg-amber-400/10' : 'border-white/10 bg-white/[0.03]'}`} data-testid="camp-week">
          <p className="font-semibold text-white/90">Week {week} of {ARC.length} — {arc.name}{arc.plateau ? ' · scheduled, not accidental' : ''}</p>
          {arc.output && <p className="mt-1 text-white/60"><span className="text-cyan-300">Output:</span> {arc.output}</p>}
          {arc.script.length > 0 && <ul className="mt-1.5 list-disc pl-4 text-white/70">{arc.script.map((l, i) => <li key={i}>“{l}”</li>)}</ul>}
          <p className="mt-2 text-white/80"><span className="text-cyan-300">The Bridge, this week:</span> “{bridge}”</p>
          <button type="button" onClick={() => setNotes((n) => n.startsWith('Bridge') ? n : `Bridge, week ${week}: ${n}`)} className="mt-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[11px]">Note the mentee&apos;s answer</button>
        </div>
        <select value={modules} onChange={(e) => setModules(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white" aria-label="Lesson covered">
          {lessons.map((l) => <option key={l.ref} value={l.ref}>{l.ref} — {l.title}</option>)}
        </select>
        {lesson && (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs">
            <p className="font-semibold text-white/90">{lesson.title}</p>
            <ul className="mt-1 list-disc pl-4 text-white/60">{lesson.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
            <p className="mt-2 text-white/70"><span className="text-cyan-300">Drill:</span> {lesson.drill.text}</p>
            <Link href={`/play/${lesson.drill.modeKey}`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 font-bold text-cyan-300"><Play className="h-3.5 w-3.5" /> Play the drill · {lesson.drill.modeKey}</Link>
            <p className="mt-1 text-[11px] text-white/40">The game attaches itself to this plan when you record the session.</p>
          </div>
        )}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" placeholder="One honest note: the one thing that changed or did not" />
        <button onClick={record} disabled={busy} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-black text-black disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />} Record session</button>
        <p className="text-[11px] text-white/40">The mentee&apos;s games since the last record attach automatically; PRQ and movement deltas and the resiliency log are computed on the server.</p>
      </div>
      {rows.map((s) => (
        <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs">
          <p className="text-white/80">{new Date(s.date).toLocaleString()} · {s.moduleKeys.join(', ') || 'no modules'} · {s.gameSessionIds.length} game{s.gameSessionIds.length === 1 ? '' : 's'}</p>
          {s.resiliency && <p className="mt-1 text-white/50">Resiliency: {s.resiliency.attempts} attempts, {s.resiliency.failures} failures, retry rate {Math.round(s.resiliency.retryRate * 100)}%{s.resiliency.returnedAfterLoss != null ? `, ${s.resiliency.returnedAfterLoss ? 'came back after the last loss' : 'has not returned since the last loss'}` : ''}</p>}
          {s.prqDelta && Object.keys(s.prqDelta).length > 0 && <p className="mt-1 text-white/50">PRQ Δ: {Object.entries(s.prqDelta).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · ')}</p>}
          {s.notes && <p className="mt-1 italic text-white/60">“{s.notes}”</p>}
        </div>
      ))}
    </section>
  );
}

// ── Templates ──────────────────────────────────────────────────────────────
function Templates({ templates, plans, certified, onChange }: { templates: Template[]; plans: Plan[]; certified: boolean; onChange: () => Promise<void> }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? ''); const [name, setName] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<{ templateId: string; email: string; goal: string } | null>(null);
  useEffect(() => { if (!planId && plans[0]) setPlanId(plans[0].id); }, [plans, planId]);
  const post = async (data: Record<string, unknown>, ok: string): Promise<void> => {
    const r = await api<{ error?: string; templateVersion?: string; currentVersion?: string }>('/api/v1/camp/templates', { method: 'POST', body: JSON.stringify(data) });
    if (r.error === 'curriculum_version_mismatch') {
      if (confirm(`This template was built on curriculum ${r.templateVersion}; the current one is ${r.currentVersion}. Import anyway after reviewing the differences?`)) return post({ ...data, reconcile: true }, ok);
      return;
    }
    if (r.error) { toast.error(r.error); return; }
    toast.success(ok); await onChange();
  };
  const doImport = async () => {
    if (!importFor) return;
    setBusy('import');
    const m = await api<{ mentee: { id: string } }>(`/api/v1/camp/mentees?email=${encodeURIComponent(importFor.email)}`);
    if (m.error) { setBusy(null); toast.error('No player with that email'); return; }
    await post({ action: 'import', templateId: importFor.templateId, menteeId: m.mentee.id, goalText: importFor.goal }, 'Imported as a new draft plan');
    setBusy(null); setImportFor(null);
  };
  return (
    <section className="space-y-4">
      {certified && plans.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <h3 className="text-sm font-semibold">Export a plan as a template</h3>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" aria-label="Plan to export">{plans.map((p) => <option key={p.id} value={p.id}>{p.goalText}</option>)}</select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
          <button disabled={!name.trim() || busy === 'export'} onClick={async () => { setBusy('export'); await post({ action: 'export', goalPlanId: planId, name, publish: true }, 'Template published'); setBusy(null); }} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-black text-black disabled:opacity-40"><Copy className="h-3.5 w-3.5" /> Export & publish</button>
        </div>
      )}
      {templates.map((t) => (
        <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-semibold text-white">{t.name} <span className="text-white/40">v{t.version}</span></p><p className="text-white/50">{t.structure?.blocks?.length ?? 0} milestone{(t.structure?.blocks?.length ?? 0) === 1 ? '' : 's'} · curriculum {t.curriculumVersion} · used {t.uses}×{t.forkedFromId ? ' · fork' : ''}</p></div>
            {certified && <div className="flex gap-2"><button onClick={() => post({ action: 'fork', templateId: t.id }, 'Forked')} className="rounded-lg border border-white/15 px-2.5 py-1">Fork</button><button onClick={() => setImportFor({ templateId: t.id, email: '', goal: t.name })} className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 text-cyan-300">Import</button></div>}
          </div>
          {importFor?.templateId === t.id && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input placeholder="mentee@email" value={importFor.email} onChange={(e) => setImportFor({ ...importFor, email: e.target.value })} className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-white" />
              <input placeholder="Goal for this mentee" value={importFor.goal} onChange={(e) => setImportFor({ ...importFor, goal: e.target.value })} className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-white" />
              <button onClick={doImport} disabled={busy === 'import' || !importFor.email} className="rounded-lg bg-cyan-400 px-3 py-1.5 font-black text-black disabled:opacity-40">Go</button>
            </div>
          )}
        </div>
      ))}
      {!templates.length && <p className="text-xs text-white/50">No templates yet.</p>}
    </section>
  );
}

// ── Curriculum ─────────────────────────────────────────────────────────────
// The owner's Camp Blueprint (docs/CAMP-BLUEPRINT.md), rendered from lib/camp/curriculum.
function Curriculum({ plans, onChange }: { plans: Plan[]; onChange: () => Promise<void> }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const plan = plans.find((p) => p.id === planId) ?? plans[0] ?? null;
  const [worksheet, setWorksheet] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!planId && plans[0]) setPlanId(plans[0].id); }, [plans, planId]);
  useEffect(() => { setWorksheet(Object.fromEntries(PATHWAY_FIELDS.map((f) => [f.key, plan?.pathwayMap?.[f.key] ?? '']))); }, [plan?.id, plan?.pathwayMap]);
  const saveWorksheet = async () => {
    if (!plan) return;
    setBusy(true);
    const r = await api<{ plan: Plan }>('/api/v1/camp/plans', { method: 'POST', body: JSON.stringify({ action: 'pathway', planId: plan.id, fields: worksheet }) });
    setBusy(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Pathway map saved to the plan'); await onChange();
  };
  const copyWorksheet = async () => {
    const text = PATHWAY_FIELDS.map((f, i) => `${i + 1}. ${f.label}\n${worksheet[f.key]?.trim() || '—'}`).join('\n\n');
    await navigator.clipboard?.writeText(`Pathway map\n\n${text}`).catch(() => undefined);
    toast.success('Worksheet copied');
  };
  return (
    <section className="space-y-5 text-sm">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-wider text-white/40">{PROGRAM.type}</p>
        <h3 className="mt-1 text-base font-semibold">The thesis — say it out loud in week 1</h3>
        {THESIS.map((t, i) => <p key={i} className="mt-2 text-white/75">{t}</p>)}
        <p className="mt-3 text-xs text-white/50">Deliverable: {PROGRAM.deliverable}. Designed for replication: {PROGRAM.replication}.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {TRACKS.map((t) => (
          <div key={t.key} className={`rounded-xl border p-4 ${t.key === 'bridge' ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-white/[0.02]'}`}>
            <p className="text-[11px] uppercase tracking-wider text-white/40">{t.loop} · {t.cadence}</p>
            <h4 className="mt-1 font-semibold">{t.name}</h4>
            <p className="mt-1 text-xs text-white/65">{t.body}</p>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold">Eight-week arc</h3>
        <div className="space-y-2">
          {ARC.map((w) => (
            <details key={w.week} className={`rounded-xl border p-4 ${w.plateau ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10 bg-white/[0.02]'}`}>
              <summary className="cursor-pointer font-semibold">Week {w.week} — {w.name}{w.plateau ? <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">the most important session</span> : null}</summary>
              {w.output && <p className="mt-2 text-xs text-white/70"><span className="text-cyan-300">Output:</span> {w.output}</p>}
              {w.body.map((b, i) => <p key={i} className="mt-2 text-xs text-white/65">{b}</p>)}
              {w.script.length > 0 && <div className="mt-2 text-xs"><p className="text-white/50">Facilitator script</p><ul className="mt-1 list-disc pl-4 text-white/75">{w.script.map((l, i) => <li key={i}>“{l}”</li>)}</ul></div>}
              {w.trap && <p className="mt-2 text-xs text-amber-200/90"><span className="font-semibold">Trap to avoid:</span> {w.trap}</p>}
            </details>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-base font-semibold">Pathway Map Protocol</h3>
        <p className="mt-1 text-xs text-white/60">A facilitator cannot improvise the path to every career. Run this with the mentee — them learning to map a path is better content than you already knowing it. Your job is to make sure all six get filled, not to fill them.</p>
        <div className="mt-3 space-y-3">
          {PATHWAY_FIELDS.map((f, i) => (
            <label key={f.key} className="block text-xs text-white/70">{i + 1}. <span className="font-semibold text-white/90">{f.label}</span> — {f.prompt}
              <textarea value={worksheet[f.key] ?? ''} onChange={(e) => setWorksheet((w) => ({ ...w, [f.key]: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white" aria-label={f.label} />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {plans.length > 0 ? (
            <>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white" aria-label="Plan for this worksheet">{plans.map((p) => <option key={p.id} value={p.id}>{p.goalText}</option>)}</select>
              <button type="button" onClick={saveWorksheet} disabled={busy} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-black text-black disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save to the plan</button>
            </>
          ) : <span className="text-[11px] text-white/40">No plan yet — draft one on the Plans tab to save the worksheet with it.</span>}
          <button type="button" onClick={copyWorksheet} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs"><Copy className="h-3.5 w-3.5" /> Copy</button>
        </div>
        {plan?.pathwayMap?.updatedAt && <p className="mt-2 text-[11px] text-white/40">Saved {new Date(plan.pathwayMap.updatedAt).toLocaleString()}</p>}
      </div>
      <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4">
        <h3 className="text-base font-semibold">The Bridge — weekly transfer prompts</h3>
        <p className="mt-1 text-xs text-white/60">Rotate these. The mentee answers, not the facilitator. The Session tab shows the week&apos;s prompt.</p>
        <ul className="mt-2 list-disc pl-4 text-xs text-white/75">{BRIDGE_PROMPTS.map((p, i) => <li key={i} className="mt-1">“{p}”</li>)}</ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><h4 className="font-semibold">Honest and reportable</h4><ul className="mt-2 list-disc pl-4 text-xs text-white/70">{MEASURES.report.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4"><h4 className="font-semibold">Do not claim</h4><ul className="mt-2 list-disc pl-4 text-xs text-white/70">{MEASURES.neverClaim.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><h4 className="font-semibold">Facilitator standards</h4><ul className="mt-2 list-disc pl-4 text-xs text-white/70">{STANDARDS.map((m, i) => <li key={i} className="mt-1">{m}</li>)}</ul></div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><h4 className="font-semibold">Replication package</h4><ol className="mt-2 list-decimal pl-4 text-xs text-white/70">{REPLICATION.map((m, i) => <li key={i} className="mt-1">{m}</li>)}</ol><p className="mt-2 text-xs text-white/50">The lookup table of pre-built pathway maps is a growing asset, not a prerequisite. Every cycle run adds maps to it.</p></div>
      <p className="text-[11px] text-white/40">Camp Blueprint {CAMP_BLUEPRINT_VERSION} · source: docs/CAMP-BLUEPRINT.md</p>
    </section>
  );
}

function Loading() { return <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>; }
