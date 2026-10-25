'use client';

// TEAMS-SQUADS: a team's week for its coach — drill days and games per athlete (counts only: what each athlete's
// visibility allows a coach), the daily drill assigned to everyone, and a program assigned to the whole team through
// the coach loop's own assign-to-many (POST /api/coach/programs/duplicate, roster athletes only, a copy each).

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CopyPlus, Minus } from 'lucide-react';
import type { Rollup } from '@/lib/groups/activity';

const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5';

export function TeamRollup({ groupId, rollup, onChanged }: { groupId: string; rollup: Rollup; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [programs, setPrograms] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState('');
  const ids = rollup.rows.map((r) => r.userId);

  const setDrill = async (on: boolean) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dailyDrill: on }) });
      if (!r.ok) toast.error('Could not save.'); else onChanged();
    } finally { setBusy(false); }
  };
  const openAssign = async () => {
    const j = await fetch('/api/coach/programs').then((r) => r.json()).catch(() => null);
    const mine = ((j?.programs ?? []) as { role: string; tree: { id: string; name: string } }[]).filter((p) => p.role === 'coach');
    const byName = new Map<string, { id: string; name: string }>();
    for (const p of mine) if (!byName.has(p.tree.name)) byName.set(p.tree.name, { id: p.tree.id, name: p.tree.name });
    const list = [...byName.values()];
    setPrograms(list); setPick(list[0]?.id ?? '');
  };
  const assign = async () => {
    if (!pick || !ids.length) return;
    setBusy(true);
    try {
      const r = await fetch('/api/coach/programs/duplicate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: pick, clientIds: ids, startDate: new Date().toISOString() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(r.status === 403 ? 'Assigning is for certified coaches.' : `Could not assign (${j.error ?? r.status}).`); return; }
      const made = (j.created ?? []).length, skipped = (j.skipped ?? []).length;
      toast.success(`${made} cop${made === 1 ? 'y' : 'ies'} made${skipped ? ` · ${skipped} skipped (already have it)` : ''}.`);
      setPrograms(null);
    } catch { toast.error('No connection.'); } finally { setBusy(false); }
  };

  const t = rollup.totals;
  return (
    <section className={card} data-team-rollup>
      <h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">This week, by athlete</h2>
      <p className="mt-1 text-[12.5px] text-white/55">{t.active} of {t.athletes} active · {t.drillDays} drills · {t.runs} games. Counts only: no scores or camera numbers.</p>
      <ul className="mt-3 divide-y divide-white/5">
        {rollup.rows.map((r) => (
          <li key={r.userId} className="flex min-h-[44px] items-center gap-3 py-1 text-[13.5px]" data-rollup-row={r.userId}>
            <span className="min-w-0 flex-1 truncate text-white">{r.name}</span>
            <span className="font-mono text-[12px] text-white/70">{r.drillDays}/7 drills</span>
            <span className="font-mono text-[12px] text-white/50">{r.runsThisWeek} games</span>
            <span aria-label={r.trend ?? 'no activity'} className="w-4">
              {r.trend === 'up' ? <ArrowUp className="h-4 w-4 text-[#00FF9D]" /> : r.trend === 'down' ? <ArrowDown className="h-4 w-4 text-[#FF7A2F]" /> : r.trend === 'same' ? <Minus className="h-4 w-4 text-white/40" /> : null}
            </span>
          </li>
        ))}
        {rollup.rows.length === 0 && <li className="py-2 text-[13px] text-white/45">No athletes yet. Share the team code below.</li>}
      </ul>
      <label className="mt-3 flex min-h-[44px] items-center gap-3 text-[13px] text-white/80">
        <input type="checkbox" className="h-5 w-5 accent-[#00FF9D]" checked={rollup.drillAssigned} disabled={busy} onChange={(e) => setDrill(e.target.checked)} />
        Assign the daily drill to the whole team
      </label>
      {ids.length > 0 && (programs === null
        ? (
          <button onClick={openAssign} className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-[#00E5FF]">
            <CopyPlus className="h-4 w-4" /> Assign a program to the team
          </button>
        ) : programs.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-white/50">Write a program on the Programs tab first; then it can go to the whole team.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2" data-team-assign>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Program" className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 text-[13px] text-white">
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={assign} disabled={busy} className="min-h-[44px] rounded-lg bg-[#00E5FF] px-4 text-[13px] font-bold text-[#050505] disabled:opacity-50">Assign to {ids.length}</button>
          </div>
        ))}
    </section>
  );
}
