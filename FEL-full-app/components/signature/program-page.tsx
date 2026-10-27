'use client';
// SIGNATURE-PROGRAMS (2026-10-25): one signature program — today's session, the week view and the overview.
// PLAT-P01 (2026-10-27): today's session PLAYS. Owner, 2026-10-27: "autoplay, no extra taps, never confusing". The page's
// one primary button, Start today's session, opens the full-screen session player (components/session-player) with
// fromSignature(today): the demo plays by itself, the dose is one big number, Set done starts the rest, the rest counts
// itself down and the next set or exercise opens by itself. The finish posts the existing `done` action (or, under youth
// rules, marks the session on this phone: deviceProgress) — no new API. Starting an approved program the athlete has not
// started yet enrolls on the same tap. An admin previewing a DRAFT runs the same player end to end and saves nothing.
// Above Start: the day's notes (readiness, pain ease, impact) and Re-test first, one compact line each, words unchanged.
// Below: today's exercises as one line each (collapsed), the weeks, and the overview.
//
// The view is lib/signature/view.ts ProgramView, built on the server (lib/signature/server.ts programPage) and fetched
// again from GET /api/signature-programs/:id after every action, so the page always draws what the server decided (today's gates,
// the checkpoint decisions, the Premium lock). Under youth rules (`keep: 'device'`) the done marks live on this phone
// (lib/signature/deviceProgress.ts) and nothing is sent.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { CalendarDays, ChevronDown, Dumbbell, Lock, Play, PlayCircle, Target } from 'lucide-react';
import type { ProgramView, WeekView } from '@/lib/signature/view';
import type { ServedSession } from '@/lib/signature/serve';
import { DAILY_DRILL_LINE, DRAFT_BADGE, PROGRAM_DONE_LINE, RETEST, SESSION_DONE_LINE } from '@/lib/signature/copy';
import { deviceStorage, markDeviceDone, readDeviceProgram, startDeviceProgram, type DeviceProgram } from '@/lib/signature/deviceProgress';
import { DAILY_DRILL_PATH } from '@/lib/daily-drill/copy';
import { fromSignature, playMode, type PlayMode } from '@/lib/session-player/fromSignature';
import { doseLine } from '@/lib/session-player/dose';
import type { Session } from '@/lib/session-player/model';
import type { FinishResult } from '@/components/session-player/session-player';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Chip } from '@/components/ui/fel/chip';
import { SIG_LOOK } from './look';

// the player (and its 3D demo) loads only when Start is tapped: a phone reading the page pays nothing for it
const SessionPlayer = dynamic(() => import('@/components/session-player/session-player').then((m) => m.SessionPlayer), { ssr: false });

/** PLAT-P01 draft copy (Owner Inbox): the page's own new words. */
export const START_LABEL = "Start today's session";
export const RETEST_FIRST = 'Re-test first';
export const TODAY_LIST = "Today's exercises";
export const THE_WEEKS = 'The weeks';
export const ABOUT = 'About this program';

/** One collapsed row below Start (Today's exercises, The weeks, About this program): the page above the fold is the day. */
function Fold({ label, count, testid, children }: { label: string; count?: number; testid: string; children: ReactNode }) {
  return (
    <details data-testid={testid} className={SIG_LOOK.fold}>
      <summary className={SIG_LOOK.foldSummary}>
        <span>{label}{count !== undefined && <span className="font-normal text-fel-soft"> · {count}</span>}</span>
        <ChevronDown aria-hidden className="h-4 w-4 text-fel-soft motion-safe:transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

/** Today's exercises: one line each (name and dose). The cue moved into the player. Collapsed by default. */
function TodayList({ s }: { s: ServedSession }) {
  return (
    <Fold label={TODAY_LIST} count={s.items.length} testid="today-list">
      {!s.blocked && (
        <a href={DAILY_DRILL_PATH} data-daily-drill-link className={`flex min-h-[44px] items-center gap-2 ${SIG_LOOK.body} hover:text-white`}>
          <PlayCircle aria-hidden className="h-4 w-4 shrink-0 text-fel-cyan" /> {DAILY_DRILL_LINE}
        </a>
      )}
      <ul>
        {s.items.map((it) => (
          <li key={it.key} data-item={it.key} data-ex={it.ex} data-section={it.section} data-impact={it.impact ? '1' : '0'}
            data-swapped={it.swappedFrom ? '1' : undefined} data-eased={it.eased ? '1' : undefined} className={SIG_LOOK.row}>
            <span className="min-w-0 text-white">{it.name}</span>
            <span className="shrink-0 text-fel-soft" data-dose>{doseLine({ sets: it.sets, reps: it.reps, workSeconds: it.workSeconds })}</span>
          </li>
        ))}
      </ul>
      {s.held.length > 0 && (
        <ul data-held className="grid gap-1 border-t border-white/[0.06] py-2.5">{s.held.map((h) => <li key={h.key} className="text-[14px] text-fel-soft">{h.line}</li>)}</ul>
      )}
    </Fold>
  );
}

function Weeks({ weeks, current, premiumLine }: { weeks: WeekView[]; current: number | null; premiumLine: string | null }) {
  const [open, setOpen] = useState(false);
  const shown = open ? weeks : weeks.filter((w) => current === null || Math.abs(w.n - current) <= 1);
  return (
    <Fold label={THE_WEEKS} count={weeks.length} testid="week-view">
      {premiumLine && <p className={`mb-2 flex items-center gap-2 ${SIG_LOOK.body}`} data-premium-line><CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-fel-cyan" />{premiumLine}</p>}
      <ol className="grid gap-2">
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
    </Fold>
  );
}

export function ProgramPage({ initial, clips = {} }: { initial: ProgramView; clips?: Readonly<Record<string, string | null>> }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<DeviceProgram | null>(null);
  const [playing, setPlaying] = useState<{ session: Session; sessionId: string; mode: PlayMode } | null>(null);
  const enrolling = useRef<Promise<boolean> | null>(null);
  useEffect(() => { if (view.keep === 'device') setDevice(readDeviceProgram(deviceStorage(), view.id)); }, [view.keep, view.id]);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/signature-programs/${view.id}`, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setView(await r.json());
  }, [view.id]);

  const send = useCallback(async (body: Record<string, unknown>): Promise<{ ok: boolean; j: Record<string, unknown> }> => {
    const r = await fetch(`/api/signature-programs/${view.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) ?? {};
    return { ok: !!r?.ok, j };
  }, [view.id]);

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
  const play = useMemo(() => playMode(view, today), [view, today]);

  /** Start: ONE tap from this page to the first set running (the player counts in by itself). */
  const start = () => {
    if (!today || !play) return;
    if (play.mode === 'device' && !device) setDevice(startDeviceProgram(deviceStorage(), view.id));
    if (play.mode === 'save' && play.enroll) enrolling.current = send({ action: 'start' }).then((r) => r.ok);
    setPlaying({ session: fromSignature(today, { title: `${view.title} · ${today.label}`, clips }), sessionId: today.id, mode: play.mode });
  };

  /** The finish: the existing `done` action (enrolling first if Start's enroll did not land), or the phone's mark. */
  const finish = useCallback(async (): Promise<FinishResult> => {
    const p = playing;
    if (!p || p.mode === 'preview') return { ok: true, line: null };
    if (p.mode === 'device') {
      const d = markDeviceDone(deviceStorage(), view.id, p.sessionId);
      if (d) setDevice(d);
      return { ok: !!d, line: null };
    }
    setBusy(true);
    try {
      if (enrolling.current && !(await enrolling.current)) {
        const again = await send({ action: 'start' });
        enrolling.current = again.ok ? Promise.resolve(true) : null;
        if (!again.ok) return { ok: false, line: null };
      }
      const { ok, j } = await send({ action: 'done', sessionId: p.sessionId });
      if (!ok) return { ok: false, line: j.error === 'pro_required' ? view.premium.line : null };
      enrolling.current = null;
      const decision = (j.decision as { line?: string } | null | undefined)?.line;
      const reward = j.reward as { streakCounted?: boolean; streakDays?: number } | undefined;
      void reload();
      return { ok: true, line: decision ?? (reward?.streakCounted ? `${SESSION_DONE_LINE} Streak: ${reward.streakDays} days.` : SESSION_DONE_LINE) };
    } finally { setBusy(false); }
  }, [playing, view.id, view.premium.line, send, reload]);

  const progressLine = !started ? null : deviceMode
    ? `Week 1 · ${Object.keys(device?.done ?? {}).length} of ${sessions.length} sessions done on this phone.`
    : `Week ${view.current?.week ?? '–'} of ${view.weeks.length} · ${view.sessionsDone} of ${view.sessionsTotal} sessions done.`;

  return (
    <div data-testid="signature-program" data-program={view.id} data-keep={view.keep} data-status={view.status} className="mx-auto max-w-[720px]">
      {view.draft && <p className="mb-3" data-draft title={DRAFT_BADGE} aria-label={`${view.status === 'rejected' ? 'Rejected. ' : ''}${DRAFT_BADGE}`}><Chip tone="warning">{view.status === 'rejected' ? 'Rejected' : 'Draft'}</Chip></p>}
      {view.prehabNote && <p data-prehab-note className={`mb-3 ${SIG_LOOK.note} font-semibold text-amber-100`}>{view.prehabNote}</p>}

      <section data-testid="today-session" data-session={today?.id} data-blocked={today?.blocked ? '1' : '0'} className={SIG_LOOK.today}>
        {view.premium.locked ? (
          <p data-locked className={`${SIG_LOOK.note} text-fel-soft`}><Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{view.premium.line}</p>
        ) : today ? (
          <>
            <p className={SIG_LOOK.meta}>{today.day} · {today.label}</p>
            {progressLine && <p className={`mt-1 ${SIG_LOOK.body}`} data-progress-line>{progressLine}</p>}
            {today.notes.length > 0 && (
              <ul className="mt-3 grid gap-1.5">
                {today.notes.map((n) => (
                  <li key={n.id + n.text} data-note={n.id} className={`${SIG_LOOK.note} ${n.id === 'readiness' || n.id === 'impact' ? 'text-[#7FEFFF]' : 'text-amber-100'}`}>
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    <span>{n.text}{n.href && <> <a href={n.href} className={SIG_LOOK.link}>Do the landing check →</a></>}</span>
                  </li>
                ))}
              </ul>
            )}
            {!today.blocked && today.retest.length > 0 && (
              <p data-retests className={`mt-2 ${SIG_LOOK.note} text-fel-soft`}>
                <Target aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fel-cyan" />
                <span>{RETEST_FIRST}: {today.retest.map((r, i) => <span key={r}>{i ? ' · ' : ''}<a href={RETEST[r].href} className={SIG_LOOK.link}>{RETEST[r].label}</a></span>)}</span>
              </p>
            )}
            {play && (
              <div className={SIG_LOOK.start} data-start data-play-mode={play.mode} data-busy={busy ? '1' : '0'}>
                <PrimaryCta onClick={busy ? undefined : start} icon={<Play aria-hidden className="h-5 w-5 fill-current" />}>{START_LABEL}</PrimaryCta>
              </div>
            )}
          </>
        ) : finished ? (
          <p data-finished className={SIG_LOOK.body}>{deviceMode ? `Week 1 is done on this phone. ${view.premium.line}` : PROGRAM_DONE_LINE}</p>
        ) : (
          <p className={SIG_LOOK.body} data-preview>Programs open once the owner approves them.</p>
        )}
        {view.premium.locked && view.premium.checkout && (
          <a href={view.premium.checkout.monthly} data-checkout className="mt-2 inline-flex min-h-[44px] items-center text-[13px] font-bold text-[#00E5FF]">Get FEL Pro →</a>
        )}
      </section>

      {today && !today.blocked && !view.premium.locked && <TodayList s={today} />}

      <Weeks weeks={weeks} current={deviceMode ? 1 : view.current?.week ?? null} premiumLine={view.premium.locked ? null : view.premium.line} />

      <Fold label={ABOUT} testid="overview">
        <p className={`mb-2 ${SIG_LOOK.body} text-white`}>{view.tagline}</p>
        <p className={SIG_LOOK.meta}>
          {view.range.planned} weeks{view.range.min !== view.range.max ? ` (adapts ${view.range.min}–${view.range.max})` : ''} · {view.daysPerWeek} days a week
        </p>
        <p className={`mt-2 ${SIG_LOOK.body}`}>{view.summary}</p>
        <p className={`mt-2 flex gap-2 ${SIG_LOOK.body}`}><Dumbbell aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0" />{view.equipmentLine}</p>
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
      </Fold>

      {playing && (
        <SessionPlayer session={playing.session} mode={playing.mode} onFinish={finish} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
