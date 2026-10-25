'use client';
// SIGNATURE-PROGRAMS (2026-10-25): one signature program — the overview, today's session and the week view.
//
// The view is lib/signature/view.ts ProgramView, built on the server (lib/signature/server.ts programPage) and fetched
// again from GET /api/signature-programs/:id after every action, so the page always draws what the server decided (today's gates,
// the checkpoint decisions, the Premium lock). Under youth rules (`keep: 'device'`) the done marks live on this phone
// (lib/signature/deviceProgress.ts) and nothing is sent.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ChevronDown, Dumbbell, Lock, PlayCircle, Target } from 'lucide-react';
import type { ProgramView, WeekView } from '@/lib/signature/view';
import type { ServedItem, ServedSession } from '@/lib/signature/serve';
import { DAILY_DRILL_LINE, DRAFT_BADGE, PROGRAM_DONE_LINE, RETEST, SESSION_DONE_LINE } from '@/lib/signature/copy';
import { deviceStorage, markDeviceDone, readDeviceProgram, startDeviceProgram, type DeviceProgram } from '@/lib/signature/deviceProgress';
import { sectionLabel } from '@/lib/coach/taxonomy';
import { DAILY_DRILL_PATH } from '@/lib/daily-drill/copy';

const ACCENT = '#00FF9D';

function doseLine(it: ServedItem): string {
  const band = it.bandLabel && it.effortBand !== 'idle' ? ` · ${it.bandLabel}` : '';
  return `${it.sets} × ${it.reps}${it.restSeconds ? ` · rest ${it.restSeconds} s` : ''}${band}`;
}

function Item({ it }: { it: ServedItem }) {
  return (
    <li data-item={it.key} data-ex={it.ex} data-section={it.section} data-impact={it.impact ? '1' : '0'} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[14px] font-bold leading-snug text-white">
          {it.name}{it.isKeySet && <span className="ml-2 rounded bg-[#00FF9D]/15 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#00FF9D]">Key</span>}
        </p>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">{sectionLabel(it.section)}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-white/70" data-dose>{doseLine(it)}</p>
      {it.swappedFrom && <p className="mt-1 text-[12px] text-amber-200/85" data-swapped>In place of {it.swappedFrom} today.</p>}
      {it.eased && <p className="mt-1 text-[12px] text-[#00E5FF]" data-eased>Eased today: {it.eased}.</p>}
      {it.cue && <p className="mt-1 text-[12.5px] italic text-white/55">“{it.cue}”</p>}
    </li>
  );
}

function SessionCard({ s, keep, done, onDone, busy, locked }: { s: ServedSession; keep: ProgramView['keep']; done: boolean; onDone: (() => void) | null; busy: boolean; locked: boolean }) {
  const groups = useMemo(() => {
    const out: { section: string; items: ServedItem[] }[] = [];
    for (const it of s.items) { const g = out[out.length - 1]; if (g && g.section === it.section) g.items.push(it); else out.push({ section: it.section, items: [it] }); }
    return out;
  }, [s.items]);
  return (
    <section data-testid="today-session" data-session={s.id} data-blocked={s.blocked ? '1' : '0'} className="rounded-2xl border border-[#00FF9D]/30 bg-[#00FF9D]/[0.05] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{s.day} · Session {s.key}{s.contacts ? ` · ${s.contacts} foot contacts` : ''}</p>
      <h3 className="fel-heading mt-1 text-[18px] font-black leading-tight text-white">{s.label}</h3>
      {s.notes.map((n) => (
        <p key={n.id + n.text} data-note={n.id} className={`mt-2 rounded-xl border p-2.5 text-[12.5px] leading-relaxed ${n.id === 'readiness' || n.id === 'impact' ? 'border-[#00E5FF]/25 bg-[#00E5FF]/[0.05] text-white/75' : 'border-amber-300/30 bg-amber-300/[0.06] text-amber-100/90'}`}>
          {n.text}{n.href && <> <a href={n.href} className="font-bold text-[#00E5FF] underline-offset-2 hover:underline">Do the landing check →</a></>}
        </p>
      ))}
      {!s.blocked && s.retest.length > 0 && (
        <div data-retests className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[12px] font-bold text-white/80">Re-test first</p>
          <ul className="mt-1.5 grid gap-1.5">
            {s.retest.map((r) => (
              <li key={r} className="flex items-center justify-between gap-2 text-[12.5px] text-white/65">
                <span className="min-w-0"><Target aria-hidden className="mr-1.5 inline h-3.5 w-3.5 text-[#00FF9D]" />{RETEST[r].label}: {RETEST[r].line}</span>
                <a href={RETEST[r].href} className="shrink-0 font-bold text-[#00E5FF] underline-offset-2 hover:underline">{RETEST[r].cta}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!s.blocked && (
        <a href={DAILY_DRILL_PATH} data-daily-drill-link className="mt-3 flex min-h-[44px] items-center gap-2 text-[12.5px] text-white/65 hover:text-white">
          <PlayCircle aria-hidden className="h-4 w-4 shrink-0 text-[#00FF9D]" /> {DAILY_DRILL_LINE}
        </a>
      )}
      {groups.map((g) => (
        <div key={g.section + g.items[0].key} className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#00FF9D]/80">{sectionLabel(g.section)}</p>
          <ul className="grid gap-2">{g.items.map((it) => <Item key={it.key} it={it} />)}</ul>
        </div>
      ))}
      {s.held.length > 0 && (
        <div data-held className="mt-3">
          <p className="mb-1 text-[12px] font-bold text-white/70">Waiting today</p>
          <ul className="grid gap-1">{s.held.map((h) => <li key={h.key} className="text-[12.5px] text-white/55">{h.line}</li>)}</ul>
        </div>
      )}
      {!s.blocked && !locked && (
        done
          ? <p data-session-done className="mt-4 flex items-center gap-2 text-[13px] font-bold text-[#00FF9D]"><CheckCircle2 className="h-4 w-4" />{SESSION_DONE_LINE}</p>
          : onDone && (
            <button type="button" data-mark-done disabled={busy} onClick={onDone}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#00FF9D] px-4 text-sm font-black text-black transition-opacity hover:opacity-90 disabled:opacity-50">
              <Check className="h-4 w-4" /> Mark this session done{keep === 'device' ? ' (kept on this phone)' : ''}
            </button>
          )
      )}
    </section>
  );
}

function Weeks({ weeks, current }: { weeks: WeekView[]; current: number | null }) {
  const [open, setOpen] = useState(false);
  const shown = open ? weeks : weeks.filter((w) => current === null || Math.abs(w.n - current) <= 1);
  return (
    <section data-testid="week-view" className="mt-6">
      <h2 className="fel-heading flex items-center gap-2 text-[17px] font-black text-white"><CalendarDays className="h-4 w-4 text-[#00E5FF]" /> The weeks</h2>
      <ol className="mt-3 grid gap-2">
        {shown.map((w) => (
          <li key={w.n} data-week={w.n} data-access={w.access} data-current={w.n === current ? '1' : '0'}
            className={`rounded-xl border p-3 ${w.n === current ? 'border-[#00E5FF]/40 bg-[#00E5FF]/[0.05]' : 'border-white/8 bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-[13.5px] font-bold text-white">Week {w.n} · {w.label}{w.repeat ? ' (again)' : ''}</p>
              {w.access === 'locked' ? <Lock aria-label="FEL Pro" className="h-3.5 w-3.5 shrink-0 text-white/40" />
                : w.access === 'free' ? <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#00FF9D]">Free</span> : null}
            </div>
            <p className="text-[11.5px] text-white/45">{w.phaseLabel}{w.easier ? ' · easier week' : ''}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {w.sessions.map((s) => (
                <li key={s.id} data-session-stub={s.id} data-state={s.state}
                  className={`rounded-lg px-2 py-1 text-[11.5px] ${s.state === 'done' ? 'bg-[#00FF9D]/15 text-[#00FF9D]' : s.state === 'next' ? 'bg-[#00E5FF]/15 text-[#00E5FF]' : 'bg-white/[0.04] text-white/55'}`}>
                  {s.state === 'done' ? '✓ ' : ''}{s.day} · {s.label}{s.retest.length ? ' · re-test' : ''}
                </li>
              ))}
            </ul>
            {w.decision && <p data-decision={w.decision.kind} className="mt-1.5 text-[12px] text-amber-100/85"><span className="font-bold">{w.decision.label}.</span> {w.decision.line}</p>}
          </li>
        ))}
      </ol>
      {weeks.length > shown.length || open ? (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 flex min-h-[44px] items-center gap-1 text-[12.5px] font-bold text-[#00E5FF]">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /> {open ? 'Show fewer weeks' : `Show all ${weeks.length} weeks`}
        </button>
      ) : null}
    </section>
  );
}

export function ProgramPage({ initial }: { initial: ProgramView }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceProgram | null>(null);
  useEffect(() => { if (view.keep === 'device') setDevice(readDeviceProgram(deviceStorage(), view.id)); }, [view.keep, view.id]);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/signature-programs/${view.id}`, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setView(await r.json());
  }, [view.id]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/signature-programs/${view.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error === 'pro_required' ? view.premium.line : j.error === 'signature_not_ready' ? 'Programs are not open yet.' : 'That did not save. Try again.');
      else if (j.decision?.line) setMsg(j.decision.line);
      else if (j.reward?.streakCounted) setMsg(`${SESSION_DONE_LINE} Streak: ${j.reward.streakDays} days.`);
      await reload();
    } finally { setBusy(false); }
  }, [view.id, view.premium.line, reload]);

  const deviceMode = view.keep === 'device';
  const started = deviceMode ? !!device : view.enrolled;
  const sessions = view.current?.sessions ?? [];
  const today = deviceMode
    ? sessions.find((s) => !device?.done[s.id]) ?? null
    : started ? sessions.find((s) => s.id === view.nextSessionId) ?? null : sessions[0] ?? null;
  const weeks: WeekView[] = deviceMode
    ? view.weeks.map((w) => {
      const nextId = today?.id ?? null;
      return { ...w, sessions: w.sessions.map((s) => ({ ...s, state: device?.done[s.id] ? 'done' : s.state === 'locked' ? 'locked' : s.id === nextId && started ? 'next' : 'todo' })) };
    })
    : view.weeks;
  const finished = deviceMode ? !!device && !today : view.finished;

  const start = () => {
    if (deviceMode) { setDevice(startDeviceProgram(deviceStorage(), view.id)); return; }
    void post({ action: 'start' });
  };
  const markDone = today && started
    ? () => {
      if (deviceMode) { setDevice(markDeviceDone(deviceStorage(), view.id, today.id)); setMsg(SESSION_DONE_LINE); return; }
      void post({ action: 'done', sessionId: today.id });
    }
    : null;

  return (
    <div data-testid="signature-program" data-program={view.id} data-keep={view.keep} data-status={view.status} className="mx-auto max-w-[720px]">
      {view.draft && <p data-draft className="mb-3 rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/[0.06] p-3 text-[12.5px] font-bold text-[#FFD700]/90">{view.status === 'rejected' ? 'Rejected. ' : ''}{DRAFT_BADGE}</p>}
      {view.prehabNote && <p data-prehab-note className="mb-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3 text-[13px] font-bold text-amber-100">{view.prehabNote}</p>}

      <section data-testid="overview">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
          {view.range.planned} weeks{view.range.min !== view.range.max ? ` (adapts ${view.range.min}–${view.range.max})` : ''} · {view.daysPerWeek} days a week
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-white/70">{view.summary}</p>
        <p className="mt-2 flex gap-2 text-[12.5px] text-white/55"><Dumbbell aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{view.equipmentLine}</p>
        <ol data-phases className="mt-3 grid gap-1.5">
          {view.phases.map((ph, i) => (
            <li key={ph.id} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
              <p className="text-[13px] font-bold text-white">{i + 1}. {ph.label} <span className="font-normal text-white/45">· {ph.weeks} {ph.weeks === 1 ? 'week' : 'weeks'}</span></p>
              <p className="text-[12px] text-white/55">{ph.goal}</p>
              {ph.retests.length > 0 && <p className="mt-0.5 text-[11.5px] text-[#00E5FF]/85">Re-tests: {ph.retests.map((r) => RETEST[r].label).join(', ')}</p>}
            </li>
          ))}
        </ol>
        <details className="mt-2 text-[12px] text-white/50">
          <summary className="min-h-[44px] cursor-pointer py-3 font-bold text-white/65">Where it comes from</summary>
          <ul className="grid gap-1 pb-2">{view.sources.map((s) => <li key={s}>{s}</li>)}</ul>
        </details>
        {view.gaps && (
          <details data-gaps className="text-[12px] text-[#FFD700]/80">
            <summary className="min-h-[44px] cursor-pointer py-3 font-bold">Draft gaps for the owner ({view.gaps.length})</summary>
            <ul className="grid list-disc gap-1 pb-2 pl-4">{view.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          </details>
        )}
      </section>

      <section data-testid="progress" className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        {started ? (
          <p className="text-[13.5px] text-white/80" data-progress-line>
            {finished ? (deviceMode ? `Week 1 is done on this phone. ${view.premium.line}` : PROGRAM_DONE_LINE) : deviceMode
              ? `Week 1 · ${Object.keys(device?.done ?? {}).length} of ${sessions.length} sessions done on this phone.`
              : `Week ${view.current?.week ?? '–'} of ${view.weeks.length} · ${view.sessionsDone} of ${view.sessionsTotal} sessions done.`}
          </p>
        ) : view.canStart || (deviceMode && view.status === 'approved') ? (
          <button type="button" data-start disabled={busy} onClick={start}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#00E5FF] px-4 text-sm font-black text-black hover:opacity-90 disabled:opacity-50">
            Start the program
          </button>
        ) : (
          <p className="text-[13px] text-white/60" data-preview>{view.draft ? 'Preview of week 1, as an athlete would see it today.' : 'Programs open once the owner approves them.'}</p>
        )}
        <p className="mt-2 text-[12.5px] text-white/55" data-premium-line>{view.premium.line}</p>
        {view.premium.locked && view.premium.checkout && (
          <a href={view.premium.checkout.monthly} data-checkout className="mt-2 inline-flex min-h-[44px] items-center text-[13px] font-bold text-[#00E5FF]">Get FEL Pro →</a>
        )}
        {msg && <p role="status" data-msg className="mt-2 text-[12.5px] text-[#00FF9D]">{msg}</p>}
      </section>

      <div className="mt-4">
        <h2 className="fel-heading mb-2 text-[17px] font-black text-white" style={{ color: ACCENT }}>{started ? "Today's session" : 'Your first session'}</h2>
        {view.premium.locked ? (
          <p data-locked className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-white/65"><Lock className="mt-0.5 h-4 w-4 shrink-0" />{view.premium.line}</p>
        ) : today ? (
          <SessionCard s={today} keep={view.keep} done={false} onDone={markDone} busy={busy} locked={false} />
        ) : finished ? (
          <p data-finished className="rounded-2xl border border-[#00FF9D]/30 bg-[#00FF9D]/[0.05] p-4 text-[13px] text-white/75">{deviceMode ? `Week 1 is done on this phone. ${view.premium.line}` : PROGRAM_DONE_LINE}</p>
        ) : null}
      </div>

      <Weeks weeks={weeks} current={deviceMode ? 1 : view.current?.week ?? null} />
    </div>
  );
}
