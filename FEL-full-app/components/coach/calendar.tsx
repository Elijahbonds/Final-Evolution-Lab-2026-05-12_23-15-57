'use client';
// CoachCalendar — COACH-DELIVERY COA-05 (2026-10-26; server: lib/coach/schedule/server.ts). The coach's roster sessions for
// the next four weeks, day by day, with a quick add (title, day and time on the coach's own clock, length, a venue name,
// who it is for) and an .ics link to subscribe from any calendar app. Paid bookings stay the coach store's; a session that
// overlaps one of them, or another session, is refused. Before the pending SQL: "coming soon".
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Copy, Plus } from 'lucide-react';
import { SCHEDULE_ERROR_COPY } from '@/lib/coach/schedule/rules';

export const COACH_SCHEDULE_API = '/api/coach/schedule';

interface Session { id: string; title: string; startsAt: string; endsAt: string; minutes: number; place: string | null; reaches: string; cancelled: boolean }
interface Board { available: boolean; sessions?: Session[]; feed?: { on: boolean; path: string | null }; roster?: { id: string; name: string }[]; teams?: { id: string; name: string }[] }

const input = 'min-h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white';
const dayKey = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The calendar, grouped by the viewer's own day. Shared with the athlete's view (components/coach/my-schedule.tsx). */
export function groupByDay<T extends { startsAt: string }>(rows: readonly T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) (m.get(dayKey(r.startsAt)) ?? m.set(dayKey(r.startsAt), []).get(dayKey(r.startsAt))!).push(r);
  return [...m];
}

export function CoachCalendar({ api = COACH_SCHEDULE_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('Team practice');
  const [when, setWhen] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [place, setPlace] = useState('');
  const [to, setTo] = useState('roster');
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : { available: false })).then(setBoard).catch(() => setBoard({ available: false }));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    return { ok: !!r?.ok, j: (r ? await r.json().catch(() => ({})) : {}) as Record<string, unknown> };
  };
  const save = async () => {
    setMsg(null);
    if (!when) { setMsg(SCHEDULE_ERROR_COPY.starts_at); return; }
    const [scope, scopeId] = to.includes(':') ? to.split(':') : ['roster', undefined];
    const { ok, j } = await post({ action: 'create', title, startsAt: new Date(when).toISOString(), minutes, place, scope, scopeId });
    if (!ok) { setMsg(SCHEDULE_ERROR_COPY[String(j.error) as keyof typeof SCHEDULE_ERROR_COPY] ?? 'Not saved. Try again.'); return; }
    setAdding(false); setMsg('Added.'); load();
  };
  const feed = async (action: 'feed_on' | 'feed_reset') => {
    const { ok, j } = await post({ action });
    if (ok) { setBoard((b) => b && { ...b, feed: j.feed as Board['feed'] }); setMsg(action === 'feed_reset' ? 'New link made; the old one stopped working.' : 'Calendar link ready.'); }
    else if (j?.error === 'feed_adults_only') setMsg('Calendar links are for adult accounts.');
  };
  const copyFeed = async () => {
    if (!board?.feed?.path) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${board.feed.path}`); setMsg('Link copied. Add it to your calendar app as a subscription.'); } catch { setMsg(`${window.location.origin}${board.feed.path}`); }
  };

  if (!board) return null;
  if (!board.available) return <div className="fel-card rounded-xl p-4 text-sm text-white/50" data-calendar-soon><CalendarDays className="mr-2 inline h-4 w-4" />The roster calendar is coming soon.</div>;
  const live = (board.sessions ?? []).filter((s) => !s.cancelled);
  return (
    <section className="fel-card min-w-0 space-y-3 rounded-xl p-4" data-coach-calendar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><CalendarDays className="h-3.5 w-3.5" /> Calendar · next 4 weeks</div>
        {!adding && <button type="button" onClick={() => setAdding(true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#00E5FF]/50 px-3 text-sm text-[#00E5FF]" data-calendar-new><Plus className="h-4 w-4" /> Session</button>}
      </div>
      {msg && <p className="break-words text-xs text-white/60" data-calendar-msg>{msg}</p>}
      {adding && (
        <div className="space-y-2 rounded-lg bg-white/[0.03] p-3" data-calendar-form>
          <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={input} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input aria-label="Starts" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={input} />
            <select aria-label="Length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={input}>
              {[30, 45, 60, 75, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <input aria-label="Place" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} placeholder="Venue (e.g. North gym) — never a home address" className={input} />
          <select aria-label="Who it is for" value={to} onChange={(e) => setTo(e.target.value)} className={input}>
            <option value="roster">Whole roster</option>
            {(board.teams ?? []).map((t) => <option key={t.id} value={`team:${t.id}`}>Team: {t.name}</option>)}
            {(board.roster ?? []).map((r) => <option key={r.id} value={`athlete:${r.id}`}>{r.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="min-h-10 flex-1 rounded-lg bg-[#00E5FF]/15 text-sm font-medium text-[#00E5FF]">Add to calendar</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-white/60">Cancel</button>
          </div>
        </div>
      )}
      {!live.length && !adding && <p className="text-sm text-white/50">Nothing scheduled. Add a practice and your roster sees it on Today.</p>}
      {groupByDay(live).map(([day, rows]) => (
        <div key={day} className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-white/40">{day}</div>
          {rows.map((s) => (
            <div key={s.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5 text-xs" data-calendar-session>
              <span className="min-w-0 break-words text-white">{time(s.startsAt)}–{time(s.endsAt)} · {s.title}<span className="text-white/45"> · {s.reaches}{s.place ? ` · ${s.place}` : ''}</span></span>
              <button type="button" onClick={() => void post({ action: 'cancel', id: s.id }).then(load)} className="min-h-9 shrink-0 rounded-md border border-white/15 px-2 text-white/55">Cancel</button>
            </div>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-2 text-xs">
        {board.feed?.on ? (
          <>
            <button type="button" onClick={() => void copyFeed()} className="flex min-h-9 items-center gap-1 rounded-md border border-white/15 px-2 text-white/70"><Copy className="h-3.5 w-3.5" /> Copy calendar link (.ics)</button>
            <button type="button" onClick={() => void feed('feed_reset')} className="min-h-9 rounded-md border border-white/10 px-2 text-white/50">Reset link</button>
          </>
        ) : <button type="button" onClick={() => void feed('feed_on')} className="min-h-9 rounded-md border border-white/15 px-2 text-white/70" data-calendar-feed-on>Get a calendar link (.ics)</button>}
      </div>
    </section>
  );
}
