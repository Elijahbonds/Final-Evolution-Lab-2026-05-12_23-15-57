'use client';
// ImportProgram — "Paste a program" (COACH-PARITY, 2026-10-26). The coach pastes a week (typed, a spreadsheet copy) or
// uploads a CSV; POST /api/coach/import reads it (lib/coach/import/parse.ts) and matches each line to their catalogue or
// the library (match.ts). The review grid shows every line with its match; a doubtful or unmatched one is flagged
// "Check". NOTHING SAVES until "Add to …": that is the builder's 'import_program' action (lib/coach/import/apply.ts),
// which writes only into a blank program, all or nothing.
import { useState } from 'react';
import { AlertTriangle, ClipboardPaste, Loader2, Sparkles, Upload } from 'lucide-react';
import type { ConfirmWeek, ItemMatch, LineWarning, ParsedProgram, Pick, Suggestion } from '@/lib/coach/import/types';
import type { ProgramTree } from '@/lib/coach/loop';

export const IMPORT_API = '/api/coach/import';

interface Preview { parsed: ParsedProgram; matches: ItemMatch[][][]; shape: { weeks: number; days: number; items: number }; flagged: number; aiOffered: boolean; aiUsed: boolean; aiInvented: number; youth: boolean }
interface Row { name: string; raw: string; warnings: LineWarning[]; match: ItemMatch; pick: string; sets: string; reps: string; load: string; rest: number | null; work: number | null; tempo: string | null; superset: string | null; section: string | null; note: string | null }
interface DayRows { label: string; rows: Row[] }
interface WeekRows { label: string; days: DayRows[] }

const WARN: Record<LineWarning, string> = {
  no_dose: 'no sets × reps found', sets_capped: 'more than 10 sets: kept 10', work_capped: 'over 30 min: kept 30',
  tempo_kept_in_note: 'tempo kept in the note', reps_trimmed: 'reps text shortened', load_trimmed: 'load text shortened', circuit: 'rounds read as sets',
};
const pickValue = (m: ItemMatch, name: string) => (m.kind === 'none' ? `new:${name}` : `${m.kind}:${m.id}`);
const sugValue = (s: Suggestion) => `${s.kind}:${s.id}`;
const toPick = (v: string): Pick => (v === 'skip' ? { kind: 'skip' } : v.startsWith('new:') ? { kind: 'new', name: v.slice(4) } : { kind: v.split(':')[0] as 'catalogue' | 'library', id: v.slice(v.indexOf(':') + 1) });
const cell = 'min-h-9 w-full min-w-0 rounded-md border border-white/10 bg-white/5 px-1.5 text-xs text-white';

function rowsOf(p: Preview): WeekRows[] {
  return p.parsed.weeks.map((w, wi) => ({ label: w.label, days: w.days.map((d, di) => ({ label: d.label, rows: d.items.map((it, ii) => {
    const m = p.matches[wi][di][ii];
    return {
      name: it.name, raw: it.raw, warnings: it.warnings, match: m, pick: pickValue(m, it.name), sets: it.sets != null ? String(it.sets) : '', reps: it.reps ?? (it.workSeconds ? `${it.workSeconds} s` : ''),
      load: it.load ?? '', rest: it.restSeconds, work: it.workSeconds, tempo: it.tempo, superset: it.superset, section: it.section, note: it.note,
    };
  }) })) }));
}

export function ImportProgram({ program, blank, onTree, api = IMPORT_API }: { program: { id: string; name: string; clientName: string }; blank: boolean; onTree: (t: ProgramTree) => void; api?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [csv, setCsv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [aiOffered, setAiOffered] = useState(false);
  const [weeks, setWeeks] = useState<WeekRows[]>([]);
  const [repeat, setRepeat] = useState(1);

  const read = async (ai = false) => {
    setBusy(true); setMsg(null);
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, csv, programId: program.id, ai }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) {
      setPreview(null); setAiOffered(!!(j as { aiOffered?: boolean }).aiOffered);
      const e = (j as { error?: string }).error;
      setMsg(e === 'nothing_read' ? 'Nothing here reads as a program yet. One exercise per line works best: "Back squat 5x5 @ 75%".' : e === 'too_long' ? 'That is too long to read at once. Paste a few weeks at a time.' : e === 'empty' ? 'Paste a program first.' : 'Could not read it. Try again.');
      return;
    }
    const p = j as Preview;
    setPreview(p); setAiOffered(p.aiOffered); setWeeks(rowsOf(p));
    setRepeat(p.shape.weeks === 1 ? 4 : 1);
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text()); setCsv(/\.csv$/i.test(f.name) || f.type === 'text/csv');
  };
  const put = (wi: number, di: number, ri: number, patch: Partial<Row>) => setWeeks((all) => all.map((w, a) => (a !== wi ? w : { ...w, days: w.days.map((d, b) => (b !== di ? d : { ...d, rows: d.rows.map((r, c) => (c === ri ? { ...r, ...patch } : r)) })) })));
  const confirm = async () => {
    const body: { action: string; weeks: ConfirmWeek[]; repeat: number } = {
      action: 'import_program', repeat,
      weeks: weeks.map((w) => ({ label: w.label, days: w.days.map((d) => ({ label: d.label, items: d.rows.map((r, i) => ({
        pick: toPick(r.pick), sets: r.sets === '' ? null : Number(r.sets), reps: r.work && r.reps === `${r.work} s` ? null : r.reps || null, load: r.load || null,
        restSeconds: r.rest, workSeconds: r.work, tempo: r.tempo, superset: r.superset, section: (r.section ?? (i === 0 ? 'key' : 'assist')) as never, isKeySet: i === 0 && !r.section, note: r.note,
      })) })) })),
    };
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/coach/programs/${program.id}/exercises`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) as { tree?: ProgramTree; error?: string } : {};
    setBusy(false);
    if (!res?.ok || !j.tree) { setMsg(j.error === 'program_not_empty' ? 'This program already has work in it. Import into a blank one.' : `Not added (${j.error ?? 'try again'}). Nothing was changed.`); return; }
    onTree(j.tree); setPreview(null); setText(''); setOpen(false); setMsg(null);
  };

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#00E5FF]/40 text-sm text-[#00E5FF]" data-import-open>
      <ClipboardPaste className="h-4 w-4" /> Paste a program
    </button>
  );
  const flagged = weeks.flatMap((w) => w.days.flatMap((d) => d.rows)).filter((r) => r.pick !== 'skip' && (r.match.confidence === 'low' || r.match.confidence === 'none') && r.pick === pickValue(r.match, r.name)).length;
  return (
    <section className="space-y-3 rounded-lg border border-white/10 p-3" data-import-panel>
      <div className="text-[11px] uppercase tracking-wider text-white/40">Paste a program into {program.name} · {program.clientName}</div>
      {!preview && (
        <>
          <textarea aria-label="Program text" value={text} onChange={(e) => { setText(e.target.value); setCsv(false); }} rows={8} placeholder={'Week 1\nMon: Back squat 5x5 @ 75%\nRDL 3x8 @ RPE 7\nWed - Upper\nBench press 4x6, rest 2 min\n…or paste straight from a spreadsheet'} className="w-full rounded-lg border border-white/10 bg-white/5 p-2 font-mono text-xs text-white" data-import-text />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !text.trim()} onClick={() => void read()} className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-[#00E5FF]/15 px-3 text-sm font-semibold text-[#00E5FF] disabled:opacity-40" data-import-read>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Read it</button>
            <label className="flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white/70"><Upload className="h-4 w-4" /> CSV<input type="file" accept=".csv,.tsv,text/csv,text/plain" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} data-import-file /></label>
            {aiOffered && <button type="button" disabled={busy} onClick={() => void read(true)} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#A855F7]/50 px-3 text-sm text-[#C084FC]" data-import-ai><Sparkles className="h-4 w-4" /> Try the AI reader</button>}
            <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-lg px-2 text-sm text-white/45">Close</button>
          </div>
          {csv && <p className="text-xs text-white/50">Read as a CSV file.</p>}
        </>
      )}
      {msg && <p className="text-xs text-[#FFB020]" data-import-msg>{msg}</p>}
      {preview && (
        <div className="space-y-3" data-import-review>
          <p className="text-xs text-white/60" data-import-summary>
            {preview.shape.weeks} week{preview.shape.weeks === 1 ? '' : 's'} · {preview.shape.days} days · {preview.shape.items} exercises.{' '}
            {flagged ? <span className="text-[#FFB020]">{flagged} to check.</span> : 'Every line matched.'}{preview.aiUsed ? ' Read with the AI reader: check every line.' : ''}
            {preview.parsed.skipped.filter((s) => s.why === 'unreadable').length > 0 && ` ${preview.parsed.skipped.filter((s) => s.why === 'unreadable').length} line(s) not read.`}
            {preview.youth && ' Adults-only exercises are left out for this athlete.'}
          </p>
          {weeks.map((w, wi) => (
            <div key={wi} className="space-y-2">
              <div className="text-xs font-semibold text-white/80">{w.label}</div>
              {w.days.map((d, di) => (
                <div key={di} className="space-y-1.5 rounded-lg bg-white/[0.03] p-2" data-import-day={`${wi}.${di}`}>
                  <div className="text-[11px] uppercase tracking-wider text-white/45">{d.label}</div>
                  {d.rows.map((r, ri) => {
                    const doubt = (r.match.confidence === 'low' || r.match.confidence === 'none') && r.pick === pickValue(r.match, r.name);
                    return (
                      <div key={ri} className={`space-y-1 rounded-md border p-1.5 ${doubt ? 'border-[#FFB020]/50' : 'border-white/5'} ${r.pick === 'skip' ? 'opacity-40' : ''}`} data-import-row={r.match.confidence}>
                        <div className="flex items-center gap-1 text-[11px] text-white/45">
                          {r.superset && <span className="text-[#00E5FF]">{r.superset}</span>}
                          <span className="truncate">“{r.name}”</span>
                          {doubt && <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[#FFB020]" data-import-flag><AlertTriangle className="h-3 w-3" /> Check</span>}
                        </div>
                        <select aria-label={`Exercise for ${r.name}`} value={r.pick} onChange={(e) => put(wi, di, ri, { pick: e.target.value })} className={cell}>
                          {r.match.kind !== 'none' && !r.match.suggestions.some((s) => sugValue(s) === pickValue(r.match, r.name)) && <option value={pickValue(r.match, r.name)}>{r.match.name}</option>}
                          {r.match.suggestions.map((s) => <option key={sugValue(s)} value={sugValue(s)}>{s.name}{s.kind === 'catalogue' ? ' (yours)' : s.status === 'draft' ? ' (draft)' : ''}</option>)}
                          <option value={`new:${r.name}`}>New exercise: {r.name}</option>
                          <option value="skip">Skip this line</option>
                        </select>
                        <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-1">
                          <input aria-label="Sets" inputMode="numeric" value={r.sets} onChange={(e) => put(wi, di, ri, { sets: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="sets" className={cell} />
                          <input aria-label="Reps" value={r.reps} onChange={(e) => put(wi, di, ri, { reps: e.target.value.slice(0, 24), work: null })} placeholder="reps" className={cell} />
                          <input aria-label="Load" value={r.load} onChange={(e) => put(wi, di, ri, { load: e.target.value.slice(0, 24) })} placeholder="load" className={cell} />
                        </div>
                        {(r.warnings.length > 0 || r.note) && <div className="text-[10px] text-white/40">{[...r.warnings.map((x) => WARN[x]), r.note].filter(Boolean).join(' · ')}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-white/70">Repeat
            <select aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))} className="min-h-10 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white" data-import-repeat>
              {Array.from({ length: Math.max(1, Math.floor(12 / Math.max(1, weeks.length))) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'once' : `× ${n}`}</option>)}
            </select>
            <span className="text-xs text-white/45">= {weeks.length * repeat} weeks</span>
          </label>
          {!blank && <p className="text-xs text-[#FFB020]" data-import-not-blank>This program already has work in it. Import into a blank program.</p>}
          <p className="text-[11px] text-white/40">The first exercise of each day is marked as the key set. Change anything after in the builder.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !blank} onClick={() => void confirm()} className="min-h-10 flex-1 rounded-lg bg-[#00E5FF]/15 text-sm font-semibold text-[#00E5FF] disabled:opacity-40" data-import-confirm>Add to {program.name}</button>
            <button type="button" onClick={() => { setPreview(null); setMsg(null); }} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-white/60">Back</button>
          </div>
        </div>
      )}
    </section>
  );
}
