'use client';

// Assign one program to a group (coach-loop P1, 2026-10-20).
//
// POST /api/coach/programs/duplicate has copied a program onto one athlete or a squad since the audit's second finding
// (lib/coach/duplicate.ts), and nothing on /coach called it: the leverage existed only for someone with curl. This is
// its button. Pick the athletes — one, a few, everyone, or the group already on another program — pick a start day,
// and each gets their own copy (logs, completions and the thread stay with the original athlete; dates are rebased).
//
// GROUPS, WITHOUT A SCHEMA CHANGE. A coach's group here is read off what is already true: "everyone on <program>" is
// the roster athletes holding a program of that name. A NAMED group a coach keeps (a team, a class) needs a table; that
// is an owner question in the lane report, not something this panel invents.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CopyPlus, Loader2 } from 'lucide-react';

export interface AssignRosterRow { clientId: string; name: string; programs: { id: string; name: string; isActive: boolean }[] }

/** The groups a roster already implies: for each program name, who holds one. Only groups of two or more. */
export function impliedGroups(roster: readonly AssignRosterRow[]): { name: string; clientIds: string[] }[] {
  const by = new Map<string, Set<string>>();
  for (const r of roster) for (const p of r.programs) (by.get(p.name) ?? by.set(p.name, new Set()).get(p.name)!).add(r.clientId);
  return [...by.entries()].filter(([, ids]) => ids.size > 1).map(([name, ids]) => ({ name, clientIds: [...ids] })).sort((a, b) => a.name.localeCompare(b.name));
}

const today = () => new Date().toISOString().slice(0, 10);

export function AssignProgram({ program, roster, onDone }: { program: { id: string; name: string; clientId: string }; roster: readonly AssignRosterRow[]; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [start, setStart] = useState(today());
  const [busy, setBusy] = useState(false);
  const others = useMemo(() => roster.filter((r) => r.clientId !== program.clientId), [roster, program.clientId]);
  const groups = useMemo(() => impliedGroups(others), [others]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickGroup = (ids: readonly string[]) => setPicked(new Set(ids.filter((id) => others.some((o) => o.clientId === id))));

  const assign = async () => {
    if (!picked.size) return;
    setBusy(true);
    try {
      const r = await fetch('/api/coach/programs/duplicate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ programId: program.id, clientIds: [...picked], startDate: new Date(`${start}T12:00:00`).toISOString() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(r.status === 403 ? 'Assigning is for certified coaches.' : `Could not assign (${j.error ?? r.status}).`); return; }
      const made = (j.created ?? []).length, skipped = (j.skipped ?? []).length;
      toast.success(`${made} cop${made === 1 ? 'y' : 'ies'} of ${program.name}${skipped ? ` · ${skipped} skipped (already have it, or not on your roster)` : ''}.`);
      setPicked(new Set()); setOpen(false); onDone?.();
    } catch { toast.error('No connection. Try again in a moment.'); } finally { setBusy(false); }
  };

  if (!others.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-assign-program>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00E5FF]">
        <CopyPlus className="h-3.5 w-3.5" /> Assign {program.name} to others
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => pickGroup(others.map((o) => o.clientId))} className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/80">Everyone</button>
            {groups.map((g) => (
              <button key={g.name} onClick={() => pickGroup(g.clientIds)} className="max-w-full truncate rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/80" title={`Everyone on ${g.name}`}>
                On {g.name} ({g.clientIds.length})
              </button>
            ))}
            <button onClick={() => setPicked(new Set())} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50">None</button>
          </div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {others.map((o) => (
              <li key={o.clientId}>
                <label className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-xs text-white/80">
                  <input type="checkbox" checked={picked.has(o.clientId)} onChange={() => toggle(o.clientId)} />
                  <span className="truncate">{o.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-white/60">Starts <input type="date" value={start} onChange={(e) => setStart(e.target.value || today())} className="ml-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-xs text-white" /></label>
            <button onClick={() => void assign()} disabled={busy || !picked.size} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#00E5FF] px-3 py-1.5 text-xs font-bold text-[#050505] disabled:opacity-50" data-assign-submit>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />} Assign to {picked.size || '…'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
