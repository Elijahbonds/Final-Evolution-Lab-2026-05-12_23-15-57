'use client';

// ReadinessPanel — the coach's side of the daily jump check, on the attention board (components/coach/attention-panel.tsx,
// one mount line). COACH-READINESS, 2026-10-25.
//
//   · Alerts: one per athlete per day, when a check read Low under the coach's rule — only for athletes who share
//     readiness with this coach (coach_view) and save their numbers; the API never sends anyone else. Dismissable.
//   · Latest: each sharing athlete's newest band this week.
//   · Rules: the default (new, owner call), and a rule per team the coach runs and per athlete — "a drop of X % or more"
//     or "under their normal twice in a row", and "ease off today and tell me" or "tell me only".
// Before the pending SQL is applied the API answers { available: false } and the panel shows nothing.
import { useCallback, useEffect, useState } from 'react';
import { BatteryLow, ChevronDown, X } from 'lucide-react';
import { BAND_LABEL, ruleLine } from '@/lib/coach/readiness/copy';
import { DROP_PCT } from '@/lib/coach/readiness/thresholds';
import type { ReadinessBand, RuleAction, RuleKind } from '@/lib/coach/readiness/types';
import { BAND_STYLE } from '@/components/readiness/band';

export const COACH_READINESS_API = '/api/coach/readiness';

interface Rule { kind: RuleKind; dropPct: number; action: RuleAction }
interface Board {
  available: boolean;
  alerts?: { id: string; athleteId: string; name: string; day: string; line: string; seenAt: string | null }[];
  latest?: { athleteId: string; name: string; day: string; band: ReadinessBand; dropPct: number | null }[];
  athletes?: { id: string; name: string; adult: boolean; shares: boolean; rule: Rule | null }[];
  teams?: { id: string; name: string; rule: Rule | null }[];
  defaultRule?: Rule & { line: string };
}

function RuleEditor({ scope, scopeId, name, rule, fallback, api, onSaved, note }: { scope: 'athlete' | 'team'; scopeId: string; name: string; rule: Rule | null; fallback: Rule; api: string; onSaved: () => void; note?: string }) {
  const [r, setR] = useState<Rule>(rule ?? fallback);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const put = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const res = await fetch(api, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope, scopeId, ...body }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setMsg('Saved.'); onSaved(); } else setMsg('Not saved. Try again.');
  };
  return (
    <li className="space-y-2 rounded-lg bg-white/4 p-3" data-readiness-rule={`${scope}:${scopeId}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-white">{name}</span>
        <span className="text-[11px] text-fel-dim">{rule ? (scope === 'team' ? 'team rule' : 'own rule') : 'default'}</span>
      </div>
      {note && <p className="text-xs text-fel-dim">{note}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label={`When, for ${name}`} value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as RuleKind })} className="min-h-10 rounded-lg border border-white/15 bg-[#0b0d12] px-2 text-white">
          <option value="drop_pct">a drop of</option>
          <option value="low_twice">under normal twice in a row</option>
        </select>
        {r.kind === 'drop_pct' && (
          <label className="flex items-center gap-1 text-white/70">
            <input type="number" inputMode="decimal" min={DROP_PCT.min} max={DROP_PCT.max} step={0.5} value={r.dropPct} aria-label={`Drop in percent, for ${name}`}
              onChange={(e) => setR({ ...r, dropPct: Number(e.target.value) })} className="min-h-10 w-16 rounded-lg border border-white/15 bg-[#0b0d12] px-2 text-white" />% or more
          </label>
        )}
        <select aria-label={`Then, for ${name}`} value={r.action} onChange={(e) => setR({ ...r, action: e.target.value as RuleAction })} className="min-h-10 rounded-lg border border-white/15 bg-[#0b0d12] px-2 text-white">
          <option value="ease">ease off today and tell me</option>
          <option value="tell">tell me only</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void put(r as unknown as Record<string, unknown>)} className="min-h-10 rounded-lg border border-fel-cyan/50 bg-fel-cyan/10 px-3 text-sm font-semibold text-fel-cyan disabled:opacity-50">Save</button>
        {rule && <button type="button" disabled={busy} onClick={() => void put({ clear: true })} className="min-h-10 rounded-lg border border-white/15 px-3 text-sm text-white/70">Use the default</button>}
        {msg && <span className="text-xs text-white/55">{msg}</span>}
      </div>
    </li>
  );
}

export function ReadinessPanel({ api = COACH_READINESS_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : { available: false })).then(setBoard).catch(() => setBoard({ available: false }));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!board?.available) return null;
  const alerts = (board.alerts ?? []).filter((a) => !a.seenAt);
  const d = board.defaultRule;
  const fallback: Rule = d ? { kind: d.kind, dropPct: d.dropPct, action: d.action } : { kind: 'drop_pct', dropPct: DROP_PCT.default, action: 'ease' };
  const see = async (id: string) => {
    setBoard((b) => b && { ...b, alerts: b.alerts?.map((a) => (a.id === id ? { ...a, seenAt: new Date().toISOString() } : a)) });
    await fetch(api, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
  };
  return (
    <div className="mt-3 space-y-2" data-readiness-panel>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-fel-dim"><BatteryLow className="h-3.5 w-3.5" /> Daily jump check</div>
      {alerts.length > 0 && (
        <ul className="space-y-1.5" data-readiness-alerts>
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start gap-2 rounded-lg border border-[#FFB020]/30 bg-[#FFB020]/5 px-3 py-2 text-sm" data-readiness-alert={a.athleteId}>
              <span className="min-w-0 flex-1 text-white/85">{a.line}</span>
              <button type="button" onClick={() => void see(a.id)} aria-label={`Dismiss the alert about ${a.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/50"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {(board.latest ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-readiness-latest>
          {board.latest!.map((l) => (
            <li key={l.athleteId} className={`rounded-lg border px-2 py-1 text-xs ${BAND_STYLE[l.band]}`} title={l.day}>{l.name}: {BAND_LABEL[l.band]}</li>
          ))}
        </ul>
      )}
      {alerts.length === 0 && (board.latest ?? []).length === 0 && <p className="text-xs text-fel-dim">No check has read Low today. Athletes appear here once they share readiness with you and save their jump numbers.</p>}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1 text-xs font-semibold text-fel-cyan" data-readiness-rules-toggle>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> Your readiness rules
      </button>
      {open && (
        <div className="space-y-2" data-readiness-rules-editor>
          <p className="text-xs text-white/55">Default for everyone: {ruleLine({ ...fallback, source: 'default' })} A day inside the camera&apos;s own noise never counts, whatever the number.</p>
          <ul className="space-y-2">
            {(board.teams ?? []).map((t) => <RuleEditor key={`t-${t.id}`} scope="team" scopeId={t.id} name={t.name} rule={t.rule} fallback={fallback} api={api} onSaved={load} />)}
            {(board.athletes ?? []).map((a) => (
              <RuleEditor key={`a-${a.id}`} scope="athlete" scopeId={a.id} name={a.name} rule={a.rule} fallback={fallback} api={api} onSaved={load}
                note={!a.adult ? 'Under 18: the jump check is for adults only for now.' : !a.shares ? 'Not sharing readiness with you: you will not be told about their checks.' : undefined} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
