'use client';
// HabitsPanel — the coach's habits (COACH-PARITY, 2026-10-26; server: lib/coach/habits/server.ts).
//   · Add: a preset (10,000 steps, water, mobility, skill practice; sleep / protein / weigh-in only while the owner's health
//     switch is on) or a custom one, its target, daily or N days a week, for one athlete or a team.
//   · Read: each athlete's last 7 days and streak. A health habit's ticks show only for an adult who shares their health
//     with this coach (the server leaves the rest out). A health habit is never offered for a minor.
// Before the pending SQL is applied the API answers { available: false } and this says "coming soon".
import { useCallback, useEffect, useState } from 'react';
import { Flame, ListChecks, Plus } from 'lucide-react';
import { COMING_SOON_LINE, HABIT_ERROR_COPY } from '@/lib/coach/habits/copy';
import type { HabitPreset } from '@/lib/coach/habits/rules';

export const COACH_HABITS_API = '/api/coach/habits';

interface AthleteRow { id: string; name: string; shared: boolean; compliance?: { done: number; expected: number; pct: number }; streak?: number; streakUnit?: 'day' | 'week'; today?: boolean }
interface HabitView { id: string; label: string; line: string; topic: 'training' | 'health'; scope: 'athlete' | 'team'; assignedTo: string; athletes: AthleteRow[] }
interface Board { available: boolean; habits?: HabitView[]; roster?: { id: string; name: string; adult: boolean }[]; teams?: { id: string; name: string; members: number }[]; presets?: HabitPreset[]; healthEnabled?: boolean; lines?: { health: string } }
const input = 'min-h-10 w-full rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white';

export function HabitsPanel({ api = COACH_HABITS_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState('steps');
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [kind, setKind] = useState<'check' | 'count'>('count');
  const [freq, setFreq] = useState('daily');
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : { available: false })).then(setBoard).catch(() => setBoard({ available: false }));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const choose = (key: string) => {
    setPreset(key);
    const p = board?.presets?.find((x) => x.key === key);
    setLabel(p?.label ?? ''); setTarget(p?.target != null ? String(p.target) : ''); setUnit(p?.unit ?? ''); setKind(p?.kind ?? 'check');
  };
  useEffect(() => { if (board?.presets?.length && !label) choose(board.presets[0].key); }, [board]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setMsg(null);
    if (!to) { setMsg('Pick who it is for.'); return; }
    const [scope, scopeId] = to.split(':');
    const body: Record<string, unknown> = { action: 'create', preset, label, kind, scope, scopeId };
    if (kind === 'count') { body.target = target === '' ? null : Number(target); body.unit = unit; }
    if (freq === 'daily') body.frequency = 'daily'; else { body.frequency = 'weekly'; body.perWeek = Number(freq); }
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) as { error?: string } : {};
    if (!r?.ok) { setMsg(HABIT_ERROR_COPY[j.error as keyof typeof HABIT_ERROR_COPY] ?? 'Not saved. Try again.'); return; }
    setAdding(false); setMsg('Habit added.'); load();
  };

  if (!board) return null;
  if (!board.available) return <div className="fel-card rounded-xl p-4 text-sm text-white/50" data-habits-soon><ListChecks className="mr-2 inline h-4 w-4" />{COMING_SOON_LINE}</div>;
  const isHealth = board.presets?.find((p) => p.key === preset)?.topic === 'health';
  return (
    <section className="fel-card space-y-3 rounded-xl p-4" data-habits-panel>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-fel-dim"><ListChecks className="h-3.5 w-3.5" /> Habits</div>
        {!adding && <button type="button" onClick={() => setAdding(true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-fel-cyan/50 px-3 text-sm text-fel-cyan" data-habit-new><Plus className="h-4 w-4" /> New</button>}
      </div>
      {msg && <p className="text-xs text-white/60" data-habit-msg>{msg}</p>}
      {adding && (
        <div className="space-y-2 rounded-lg bg-white/[0.03] p-3" data-habit-form>
          <select aria-label="Habit" value={preset} onChange={(e) => choose(e.target.value)} className={input}>
            {(board.presets ?? []).map((p) => <option key={p.key} value={p.key}>{p.label}{p.topic === 'health' ? ' (adults)' : ''}</option>)}
            <option value="custom">Custom…</option>
          </select>
          <input aria-label="Name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What to do" className={input} maxLength={60} />
          {preset === 'custom' && (
            <div className="flex gap-2">
              {(['check', 'count'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`min-h-10 flex-1 rounded-lg border text-sm ${kind === k ? 'border-fel-cyan/50 text-fel-cyan' : 'border-white/10 text-white/60'}`}>{k === 'check' ? 'Tick off' : 'A number'}</button>)}
            </div>
          )}
          {kind === 'count' && (
            <div className="flex gap-2">
              <input aria-label="Target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" className={input} />
              <input aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className={input} maxLength={12} />
            </div>
          )}
          <select aria-label="How often" value={freq} onChange={(e) => setFreq(e.target.value)} className={input}>
            <option value="daily">Every day</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={String(n)}>{n} day{n === 1 ? '' : 's'} a week</option>)}
          </select>
          <select aria-label="For" value={to} onChange={(e) => setTo(e.target.value)} className={input} data-habit-to>
            <option value="">For…</option>
            {(board.teams ?? []).map((t) => <option key={t.id} value={`team:${t.id}`}>Team: {t.name} ({t.members})</option>)}
            {(board.roster ?? []).filter((r) => !isHealth || r.adult).map((r) => <option key={r.id} value={`athlete:${r.id}`}>{r.name}</option>)}
          </select>
          {isHealth && <p className="text-xs text-fel-dim">{board.lines?.health}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="min-h-10 flex-1 rounded-lg bg-fel-cyan/15 text-sm font-semibold text-fel-cyan" data-habit-save>Add habit</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-white/60">Cancel</button>
          </div>
        </div>
      )}
      {!board.habits?.length && !adding && <p className="text-sm text-white/50">No habits yet. Sleep, steps and water are the usual first three.</p>}
      <ul className="space-y-2">
        {(board.habits ?? []).map((h) => (
          <li key={h.id} className="space-y-1 rounded-lg bg-white/[0.03] p-3" data-habit={h.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{h.label}</div><div className="text-xs text-fel-dim">{h.line} · {h.scope === 'team' ? `Team: ${h.assignedTo}` : h.assignedTo}</div></div>
              <button type="button" onClick={() => void fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'archive', id: h.id }) }).then(() => load())} className="shrink-0 text-[11px] text-fel-quiet">Archive</button>
            </div>
            <ul className="space-y-1">
              {h.athletes.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs" data-habit-athlete={a.id}>
                  <span className="truncate text-white/80">{a.name}</span>
                  {a.shared && a.compliance ? (
                    <span className="flex shrink-0 items-center gap-2 text-white/60">
                      <span className="inline-block h-1.5 w-16 overflow-hidden rounded bg-white/10"><span className="block h-full bg-fel-cyan" style={{ width: `${a.compliance.pct}%` }} /></span>
                      {a.compliance.done}/{a.compliance.expected}
                      {!!a.streak && <span className="flex items-center gap-0.5 text-[#FFB020]"><Flame className="h-3 w-3" />{a.streak}{a.streakUnit === 'week' ? 'w' : 'd'}</span>}
                    </span>
                  ) : <span className="shrink-0 text-fel-quiet">not shared</span>}
                </li>
              ))}
              {!h.athletes.length && <li className="text-xs text-fel-dim">Nobody on it yet.</li>}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
