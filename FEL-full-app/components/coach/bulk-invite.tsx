'use client';

// Add athletes in bulk, or email one (coach-loop P1, 2026-10-20). Both post to /api/coach/invite/bulk: every athlete
// gets their own one-shot invite with a typed code, and the coach gets a sheet back — names, codes, and whether each
// email went. With email off, that sheet IS the delivery: print it or copy it into the team chat.
//
// No package for the CSV: the file is read as text in the browser and parsed on the server (lib/coach/bulkImport.ts).

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, FileUp, Loader2, Mail, Printer, Users } from 'lucide-react';
import { IMPORT_PROBLEM_COPY, type ImportProblem } from '@/lib/coach/bulkImport';
import { JOIN_BY_CODE_PATH } from '@/lib/coach/inviteCode';

interface SheetRow { line: number; name: string | null; email: string | null; code: string; path: string; emailed: 'sent' | 'off' | 'failed' | 'none' }
interface Result { sheet: SheetRow[]; problems: { line: number; problem: ImportProblem }[]; duplicates: number; email: { requested: boolean; on: boolean } }

const EMAILED_COPY: Record<SheetRow['emailed'], string> = { sent: 'emailed', off: 'not emailed', failed: 'email failed', none: '—' };

export function BulkInvite({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState<'one' | 'team' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const post = async (which: 'one' | 'team', body: { text: string; send: boolean }) => {
    setBusy(which);
    try {
      const r = await fetch('/api/coach/invite/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) { toast.error(`You have room for ${j.room ?? 0} more open invites. Revoke old ones, or import fewer.`); return null; }
      if (r.status === 403) { toast.error('Bulk invites are for certified coaches.'); return null; }
      if (!r.ok) {
        const first = Array.isArray(j.problems) && j.problems[0];
        toast.error(first ? `Line ${first.line}: ${IMPORT_PROBLEM_COPY[first.problem as ImportProblem] ?? 'could not read it'}` : 'Nothing to invite in that list.');
        return null;
      }
      setResult(j); onDone?.();
      return j as Result;
    } catch { toast.error('No connection. Try again in a moment.'); return null; } finally { setBusy(null); }
  };

  const one = async () => {
    if (!email.trim()) return;
    const j = await post('one', { text: name.trim() ? `${name.trim().replace(/,/g, ' ')}, ${email.trim()}` : email.trim(), send: true });
    if (!j) return;
    const row = j.sheet[0];
    toast.success(row?.emailed === 'sent' ? 'Invite emailed.' : `Email is off — give them code ${row?.code ?? ''}.`);
    setEmail(''); setName('');
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) { toast.error('That file is too big for one team.'); return; }
    setText(await f.text());
  };

  const sheetText = (r: Result) => r.sheet.map((s) => [s.name ?? '', s.email ?? '', s.code, `${window.location.origin}${s.path}`].join('\t')).join('\n');
  const copySheet = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(sheetText(result)); toast.success('Sheet copied.'); } catch { toast.error('Clipboard blocked.'); }
  };

  return (
    <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><Mail className="h-3.5 w-3.5" /> Email an invite</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void one(); }} placeholder="athlete@email.com" type="email" inputMode="email" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" data-email-invite />
          <button onClick={() => void one()} disabled={!!busy || !email.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#00E5FF] px-3 py-1.5 text-xs font-bold text-[#050505] disabled:opacity-50">
            {busy === 'one' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><Users className="h-3.5 w-3.5" /> Add a team</div>
        <p className="mt-1 text-xs text-white/45">Paste one athlete per line (name, email — or just a name), or upload a CSV. Everyone gets their own code.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={'Sam Lee, sam@email.com\nRia Khan\nName,Email (a CSV header works too)'}
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-white" data-bulk-text />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
          <button onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80"><FileUp className="h-3.5 w-3.5" /> CSV file</button>
          <label className="inline-flex items-center gap-1.5 text-xs text-white/60"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Email the ones with an address</label>
          <button onClick={() => void post('team', { text, send })} disabled={!!busy || !text.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#00E5FF] px-3 py-1.5 text-xs font-bold text-[#050505] disabled:opacity-50" data-bulk-submit>
            {busy === 'team' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} Make invites
          </button>
        </div>
      </div>

      {result && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3" data-invite-sheet>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/70">{result.sheet.length} invite{result.sheet.length === 1 ? '' : 's'} made{result.duplicates ? ` · ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped` : ''}{result.email.requested && !result.email.on ? ' · email is off: hand out the codes' : ''}</span>
            <span className="ml-auto flex gap-1">
              <button onClick={() => void copySheet()} title="Copy the sheet" className="rounded-md border border-white/15 p-1.5 text-white/70"><Copy className="h-3.5 w-3.5" /></button>
              <button onClick={() => window.print()} title="Print the sheet" className="rounded-md border border-white/15 p-1.5 text-white/70"><Printer className="h-3.5 w-3.5" /></button>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-white/40">Athletes type their code at {JOIN_BY_CODE_PATH}, or open their own link.</p>
          <ul className="mt-2 space-y-1">
            {result.sheet.map((s) => (
              <li key={s.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                <span className="min-w-0 break-words text-white">{s.name ?? s.email ?? `Line ${s.line}`}</span>
                <span className="font-mono tracking-wider text-[#00E5FF]">{s.code}</span>
                <span className="text-white/40">{EMAILED_COPY[s.emailed]}</span>
              </li>
            ))}
          </ul>
          {!!result.problems.length && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-[#FFD700]/85">
              {result.problems.map((p) => <li key={`${p.line}-${p.problem}`}>Line {p.line}: {IMPORT_PROBLEM_COPY[p.problem]}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
