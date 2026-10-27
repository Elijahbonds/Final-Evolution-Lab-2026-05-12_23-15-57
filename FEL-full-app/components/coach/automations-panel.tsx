'use client';
// AutomationsPanel — COACH-DELIVERY COA-01 (2026-10-26; server: lib/coach/automations/server.ts). A coach's messages that
// post themselves into an athlete's program thread: when someone joins, after N missed sessions in a week, or weekly at
// the coach's hour (Pacific). A preset (draft wording) or the coach's own words, {first} for the first name. Never an
// email; a teen without a guardian's coach-training consent is skipped. Before the pending SQL: "coming soon".
import { useCallback, useEffect, useState } from 'react';
import { Plus, Play, Zap } from 'lucide-react';
import { WEEKDAY_LABELS, type Trigger } from '@/lib/coach/automations/rules';

export const COACH_AUTOMATIONS_API = '/api/coach/automations';

interface AutoView { id: string; trigger: Trigger; enabled: boolean; when: string; reaches: string; preview: string }
interface Board {
  available: boolean;
  automations?: AutoView[];
  presets?: Record<Trigger, { id: string; label: string; text: string }[]>;
  roster?: { id: string; name: string }[]; teams?: { id: string; name: string }[];
  runs?: { id: string; name: string; day: string; line: string }[];
}

const ERRORS: Record<string, string> = {
  message_required: 'Pick a message or write your own.', text_too_long: 'Keep it under 500 characters.', weekday: 'Pick a day.',
  not_your_athlete: 'That athlete is not on your roster.', not_your_team: 'That is not a team you run.', too_many_automations: 'You have the most automations one coach can keep (20).',
};
const input = 'min-h-10 w-full rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white';
const TRIGGER_LABEL: Record<Trigger, string> = { join: 'When someone joins', missed: 'After missed sessions', weekly: 'Every week' };

export function AutomationsPanel({ api = COACH_AUTOMATIONS_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [adding, setAdding] = useState(false);
  const [trigger, setTrigger] = useState<Trigger>('join');
  const [preset, setPreset] = useState('welcome');
  const [own, setOwn] = useState('');
  const [missedN, setMissedN] = useState(2);
  const [weekday, setWeekday] = useState(1);
  const [hour, setHour] = useState(9);
  const [to, setTo] = useState('roster');
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : { available: false })).then(setBoard).catch(() => setBoard({ available: false }));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) as Record<string, unknown> : {};
    return { ok: !!r?.ok, j };
  };
  const pick = (t: Trigger) => { setTrigger(t); setPreset(board?.presets?.[t]?.[0]?.id ?? ''); };
  const save = async () => {
    setMsg(null);
    const [scope, scopeId] = to.includes(':') ? to.split(':') : ['roster', undefined];
    const { ok, j } = await post({ action: 'create', trigger, scope, scopeId, missedN, weekday, hour, ...(own.trim() ? { text: own } : { preset }) });
    if (!ok) { setMsg(ERRORS[String(j.error)] ?? 'Not saved. Try again.'); return; }
    setAdding(false); setOwn(''); setMsg('Automation on.'); load();
  };
  const runNow = async () => {
    const { ok, j } = await post({ action: 'run' });
    setMsg(ok ? `${j.posted ?? 0} message${j.posted === 1 ? '' : 's'} posted${j.skippedTeen ? `, ${j.skippedTeen} skipped (guardian consent needed)` : ''}.` : 'Could not run them. Try again.');
    load();
  };

  if (!board) return null;
  if (!board.available) return <div className="fel-card rounded-xl p-4 text-sm text-white/50" data-automations-soon><Zap className="mr-2 inline h-4 w-4" />Automations are coming soon.</div>;
  const presets = board.presets?.[trigger] ?? [];
  return (
    <section className="fel-card min-w-0 space-y-3 rounded-xl p-4" data-automations-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><Zap className="h-3.5 w-3.5" /> Automations</div>
        <div className="flex gap-2">
          {!!board.automations?.length && <button type="button" onClick={() => void runNow()} className="flex min-h-10 items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white/75" data-automation-run><Play className="h-4 w-4" /> Run now</button>}
          {!adding && <button type="button" onClick={() => { setAdding(true); pick('join'); }} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#00E5FF]/50 px-3 text-sm text-[#00E5FF]" data-automation-new><Plus className="h-4 w-4" /> New</button>}
        </div>
      </div>
      <p className="text-xs text-white/45">Posts into each athlete&apos;s program thread as you. Never an email. Teens need a guardian&apos;s coach-training consent first.</p>
      {msg && <p className="text-xs text-white/60" data-automation-msg>{msg}</p>}
      {adding && (
        <div className="space-y-2 rounded-lg bg-white/[0.03] p-3" data-automation-form>
          <div className="grid grid-cols-3 gap-1">
            {(['join', 'missed', 'weekly'] as const).map((t) => (
              <button key={t} type="button" onClick={() => pick(t)} className={`min-h-10 rounded-lg border px-1 text-xs ${trigger === t ? 'border-[#00E5FF]/50 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>{TRIGGER_LABEL[t]}</button>
            ))}
          </div>
          {trigger === 'missed' && (
            <label className="block text-xs text-white/60">Missed sessions in 7 days
              <select aria-label="Missed sessions" value={missedN} onChange={(e) => setMissedN(Number(e.target.value))} className={input}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} or more</option>)}
              </select>
            </label>
          )}
          {trigger === 'weekly' && (
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Day" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={input}>
                {WEEKDAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <select aria-label="Hour (Pacific)" value={hour} onChange={(e) => setHour(Number(e.target.value))} className={input}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00 PT</option>)}
              </select>
            </div>
          )}
          <select aria-label="Message" value={preset} onChange={(e) => setPreset(e.target.value)} className={input} disabled={!!own.trim()}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {!own.trim() && <p className="text-xs text-white/50" data-automation-preview>{presets.find((p) => p.id === preset)?.text.replace(/\{first\}/g, 'Sam')}</p>}
          <textarea aria-label="Or your own words" value={own} onChange={(e) => setOwn(e.target.value)} rows={2} maxLength={500} placeholder="Or write your own — {first} becomes their first name" className="w-full rounded-lg border border-white/10 bg-[#0b0d12] p-2 text-sm text-white" />
          <select aria-label="Who it is for" value={to} onChange={(e) => setTo(e.target.value)} className={input}>
            <option value="roster">Everyone on my roster</option>
            {(board.teams ?? []).map((t) => <option key={t.id} value={`team:${t.id}`}>Team: {t.name}</option>)}
            {(board.roster ?? []).map((r) => <option key={r.id} value={`athlete:${r.id}`}>{r.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="min-h-10 flex-1 rounded-lg bg-[#00E5FF]/15 text-sm font-medium text-[#00E5FF]">Turn on</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-white/60">Cancel</button>
          </div>
        </div>
      )}
      {!board.automations?.length && !adding && <p className="text-sm text-white/50">None yet. A welcome on join is a good first one.</p>}
      <ul className="space-y-2">
        {(board.automations ?? []).map((a) => (
          <li key={a.id} className="min-w-0 rounded-lg border border-white/8 bg-white/[0.02] p-2 text-xs" data-automation={a.trigger}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words text-white">{a.when} · <span className="text-white/50">{a.reaches}</span></span>
              <span className="flex gap-1">
                <button type="button" onClick={() => void post({ action: a.enabled ? 'disable' : 'enable', id: a.id }).then(load)} className="min-h-9 rounded-md border border-white/15 px-2 text-white/70">{a.enabled ? 'Pause' : 'Resume'}</button>
                <button type="button" onClick={() => void post({ action: 'archive', id: a.id }).then(load)} className="min-h-9 rounded-md border border-white/15 px-2 text-white/50">Remove</button>
              </span>
            </div>
            <p className="mt-1 break-words text-white/55">“{a.preview}”</p>
          </li>
        ))}
      </ul>
      {!!board.runs?.length && (
        <details className="text-xs text-white/50">
          <summary className="cursor-pointer">Last two weeks ({board.runs.length})</summary>
          <ul className="mt-1 space-y-0.5">{board.runs.map((r) => <li key={r.id}>{r.day} · {r.name}: {r.line}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
