'use client';
// MySchedule — COACH-DELIVERY COA-05 (2026-10-26): the athlete's upcoming sessions from their coaches, on Today, with their
// own .ics link (server: /api/coach/me/schedule). Renders nothing when there is nothing to show (no sessions, the tables not
// there yet, or the teen gate closed).
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { groupByDay } from './calendar';

export const MY_SCHEDULE_API = '/api/coach/me/schedule';

interface Session { id: string; title: string; startsAt: string; endsAt: string; place: string | null; coachName: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function MySchedule({ api = MY_SCHEDULE_API }: { api?: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [feed, setFeed] = useState<{ on: boolean; path: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => { setSessions(j?.available ? j.sessions ?? [] : []); setFeed(j?.feed ?? null); }).catch(() => setSessions([]));
  }, [api]);
  const link = async () => {
    let path = feed?.path ?? null;
    if (!path) {
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'feed_on' }) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      path = j?.feed?.path ?? null;
      setFeed(j?.feed ?? null);
    }
    if (!path) { setMsg('The calendar link is not available yet.'); return; }
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setMsg('Link copied. Add it to your calendar app as a subscription.'); } catch { setMsg(`${window.location.origin}${path}`); }
  };
  if (!sessions?.length) return null;
  return (
    <section className="fel-card min-w-0 space-y-2 rounded-xl p-4" data-my-schedule>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><CalendarDays className="h-3.5 w-3.5" /> Coming up</div>
        <button type="button" onClick={() => void link()} className="min-h-9 rounded-md border border-white/15 px-2 text-xs text-white/70">Add to my calendar</button>
      </div>
      {msg && <p className="break-words text-xs text-white/55">{msg}</p>}
      {groupByDay(sessions.slice(0, 8)).map(([day, rows]) => (
        <div key={day} className="space-y-0.5">
          <div className="text-[11px] text-white/40">{day}</div>
          {rows.map((s) => <div key={s.id} className="break-words text-sm text-white/85">{time(s.startsAt)} · {s.title}<span className="text-white/45"> · {s.coachName}{s.place ? ` · ${s.place}` : ''}</span></div>)}
        </div>
      ))}
    </section>
  );
}
