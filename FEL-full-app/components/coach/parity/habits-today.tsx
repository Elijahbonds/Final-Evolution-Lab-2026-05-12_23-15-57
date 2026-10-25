'use client';
// HabitsToday — the athlete's coach habits on Today (COACH-PARITY, 2026-10-26; server: lib/coach/habits/server.ts).
// One row per habit: tick it, or type the number (steps, litres, minutes); the day's streak beside it. Today (the PT day)
// only. A habit's streak is the friend streak's rule for one person, never paid and never the play streak. A health habit
// (adults only, with the owner's switch) carries its draft line and, without the health_data grant, the app's existing
// consent step. Nothing shows before the pending SQL is applied, or when no coach set a habit.
import { useCallback, useEffect, useState } from 'react';
import { Check, Flame, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { HealthConsentLockedNotice } from '@/components/coach/pain-checkin';

export const MY_HABITS_API = '/api/coach/me/habits';

interface HabitView {
  id: string; label: string; line: string; kind: 'check' | 'count'; target: number | null; unit: string | null; topic: 'training' | 'health'; coachName: string;
  today: { ticked: boolean; value: number | null; done: boolean }; streak: number; streakUnit: 'day' | 'week'; week: { done: number; need: number };
  healthLine: string | null; locked: string | null;
}

function Row({ h, api, onChange }: { h: HabitView; api: string; onChange: () => void }) {
  const [value, setValue] = useState(h.today.value != null ? String(h.today.value) : '');
  const [busy, setBusy] = useState(false);
  const send = async (done: boolean, v?: number) => {
    setBusy(true);
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ habitId: h.id, done, ...(v !== undefined ? { value: v } : {}) }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { const j = r ? await r.json().catch(() => ({})) as { message?: string } : {}; toast.error(j.message ?? 'Not saved. Try again.'); return; }
    onChange();
  };
  return (
    <li className="space-y-1.5 rounded-lg bg-white/[0.03] p-3" data-habit-today={h.id} data-done={h.today.done}>
      <div className="flex items-center gap-3">
        {h.kind === 'check' ? (
          <button type="button" disabled={busy || !!h.locked} aria-pressed={h.today.done} aria-label={`${h.label}: ${h.today.done ? 'done' : 'not done'}`} onClick={() => void send(!h.today.done)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${h.today.done ? 'border-[#00FF9D] bg-[#00FF9D]/20 text-[#00FF9D]' : 'border-white/20 text-transparent'}`} data-habit-tick>
            <Check className="h-5 w-5" />
          </button>
        ) : (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${h.today.done ? 'border-[#00FF9D] bg-[#00FF9D]/20 text-[#00FF9D]' : 'border-white/20 text-white/30'}`}><Check className="h-5 w-5" /></span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{h.label}</div>
          <div className="text-[11px] text-white/45">{h.line} · {h.week.done}/{h.week.need} this week</div>
        </div>
        {h.streak > 0 && <span className="flex shrink-0 items-center gap-0.5 text-xs text-[#FFB020]" data-habit-streak={h.streak}><Flame className="h-3.5 w-3.5" />{h.streak}{h.streakUnit === 'week' ? 'w' : 'd'}</span>}
      </div>
      {h.kind === 'count' && !h.locked && (
        <div className="flex items-center gap-2 pl-[3.25rem]">
          <input inputMode="decimal" aria-label={`${h.label} today`} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} placeholder={h.target != null ? String(h.target) : '0'} className="min-h-10 w-28 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white" data-habit-value />
          {h.unit && <span className="text-xs text-white/50">{h.unit}</span>}
          <button type="button" disabled={busy || value === ''} onClick={() => void send(true, Number(value))} className="ml-auto min-h-10 rounded-lg border border-[#00E5FF]/40 px-3 text-sm text-[#00E5FF] disabled:opacity-40" data-habit-save>Save</button>
        </div>
      )}
      {h.healthLine && <p className="text-[11px] text-white/40">{h.healthLine}</p>}
      {h.locked && <><p className="text-xs text-white/60">{h.locked}</p><HealthConsentLockedNotice onGranted={onChange} /></>}
    </li>
  );
}

export function HabitsToday({ api = MY_HABITS_API }: { api?: string }) {
  const [habits, setHabits] = useState<HabitView[] | null>(null);
  const [seen, setSeen] = useState('');
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => { setHabits(j?.available ? j.habits ?? [] : []); setSeen(j?.seenLine ?? ''); }).catch(() => setHabits([]));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!habits?.length) return null;
  const done = habits.filter((h) => h.today.done).length;
  return (
    <section className="fel-card space-y-2 rounded-xl p-4" data-habits-today>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/40"><span className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5" /> Habits</span><span>{done}/{habits.length} today</span></div>
      <ul className="space-y-2">{habits.map((h) => <Row key={`${h.id}:${h.today.value}:${h.today.ticked}`} h={h} api={api} onChange={load} />)}</ul>
      {seen && <p className="text-[11px] text-white/35">{seen}</p>}
    </section>
  );
}
