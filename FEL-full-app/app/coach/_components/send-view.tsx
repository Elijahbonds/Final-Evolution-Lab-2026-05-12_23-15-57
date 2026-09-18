'use client';
// SEND — the trainer's compose screen for texting programming to a client (2026-09-13).
//
// The owner's ask: "make it easier to text and share guidance and give programming." Four things go out —
// a drill, a picked list, a written recommendation, a full block — all free between a trainer and their own
// clients (lib/share/).
//
// TWO DECISIONS THAT SHAPE THIS SCREEN:
//
//   1. THE MESSAGE IS THE PREVIEW. Not a card, not a summary of what will be sent — the literal string that
//      lands on the clipboard, rendered live from the same `toPlainText` the server uses. A trainer about to
//      paste something into a client's thread should be looking at the thing they are pasting. It also means
//      there is no second renderer to drift out of sync.
//
//   2. SCREENING HAPPENS AS THEY TYPE, NOT AT SUBMIT. `screenText` is pure and cheap, so it runs on every
//      keystroke and the flagged phrase is underlined in place with the reason. Finding out at submit that a
//      sentence cannot be published — after composing the whole thing — is the loop that makes people give
//      up on a feature. The send button says WHY it is disabled rather than just being grey.
//
// Everything imported from lib/share here is pure and client-safe; `newShareToken` deliberately lives in
// service.ts so this file never pulls node:crypto into the bundle.

import { useMemo, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Send, Copy, Check, Link2, Trash2, Loader2, Plus, X, AlertTriangle, Dumbbell,
  ListChecks, FileText, CalendarDays, Eye,
} from 'lucide-react';
import { PLATFORM_PROTOCOLS } from '@/lib/profile/protocol';
import { screenText, screenSummary, MAX_NOTE_CHARS, MAX_RECOMMENDATION_CHARS, type TextFlag } from '@/lib/share/screen';
import {
  shareDrill, shareSelection, shareRecommendation, shareProgram,
  MAX_SELECTION_ITEMS, type Share, type SharedBy,
} from '@/lib/share/shareable';
import { toPlainText } from '@/lib/share/plaintext';
import type { CoachProgram, ProgramWeek } from '@/lib/profile/assignment';

const KINDS = [
  { key: 'drill', label: 'Drill', icon: Dumbbell, blurb: 'One thing, with a note. The most common text.' },
  { key: 'selection', label: 'List', icon: ListChecks, blurb: 'A few things to work on this week.' },
  { key: 'program', label: 'Program', icon: CalendarDays, blurb: 'A multi-week block with a stated outcome.' },
  { key: 'recommendation', label: 'Recommendation', icon: FileText, blurb: 'A written reference they can forward.' },
] as const;
type Kind = typeof KINDS[number]['key'];

/** The placeholder standing in for the URL that does not exist until the link is created. */
const PENDING_URL = '[link appears when you send]';

interface SentRow {
  token: string; kind: string; title: string; forName: string | null;
  views: number; createdAt: string; revokedAt: string | null; expiresAt: string | null;
}

// ── shared bits ──────────────────────────────────────────────────────────────────────────────────────────

/** A text field that shows what the screen caught, where, and why — while they are still typing. */
function ScreenedField({
  label, value, onChange, max, rows = 3, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; max: number; rows?: number; placeholder?: string;
}) {
  const flags = useMemo(() => screenText(value), [value]);
  const over = value.length > max;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] uppercase tracking-wider text-white/40">{label}</label>
        <span className={`text-[11px] ${over ? 'text-red-400' : 'text-white/25'}`}>{value.length}/{max}</span>
      </div>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full resize-y rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 ${
          flags.length ? 'border border-amber-500/50 focus:border-amber-400' : 'border border-white/8 focus:border-[#00E5FF]/50'
        }`}
      />
      <Flags flags={flags} />
    </div>
  );
}

function Flags({ flags }: { flags: TextFlag[] }) {
  if (!flags.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs leading-relaxed text-amber-200/90">{screenSummary(flags)}</p>
          <ul className="space-y-1">
            {flags.map((f, i) => (
              <li key={`${f.at}-${i}`} className="text-[11px] text-white/55">
                <span className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-amber-200">{f.found}</span>
                {' — '}{f.fix}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, max }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">{label}</label>
      <input
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#00E5FF]/50"
      />
    </div>
  );
}

function ProtocolPicker({ selected, onToggle, max }: {
  selected: string[]; onToggle: (key: string) => void; max?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLATFORM_PROTOCOLS.map((p) => {
        const on = selected.includes(p.key);
        const full = !!max && selected.length >= max && !on;
        return (
          <button
            key={p.key}
            type="button"
            disabled={full}
            onClick={() => onToggle(p.key)}
            title={full ? `${max} at most` : p.summary}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              on ? 'border-[#00E5FF]/50 bg-[#00E5FF]/12 text-[#00E5FF]'
                : full ? 'border-white/5 text-white/20'
                : 'border-white/8 text-white/60 hover:border-white/20 hover:text-white/85'
            }`}
          >
            {p.title}
            {p.unlock ? <span className="ml-1 text-[10px] opacity-50">gated</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ── the screen ───────────────────────────────────────────────────────────────────────────────────────────

export function SendView({ me }: { me: SharedBy }) {
  const [kind, setKind] = useState<Kind>('drill');
  const [forName, setForName] = useState('');

  // drill
  const [drillKey, setDrillKey] = useState<string>(PLATFORM_PROTOCOLS[0]?.key ?? '');
  const [prescription, setPrescription] = useState('');
  const [note, setNote] = useState('');

  // selection
  const [picked, setPicked] = useState<string[]>([]);
  const [listTitle, setListTitle] = useState('');

  // recommendation
  const [recTitle, setRecTitle] = useState('');
  const [recBody, setRecBody] = useState('');

  // program
  const [progTitle, setProgTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [weeks, setWeeks] = useState<ProgramWeek[]>([{ week: 1, focus: '', items: [] }]);
  const [retest, setRetest] = useState(1);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<SentRow[] | null>(null);

  const loadSent = useCallback(async () => {
    try {
      const r = await fetch('/api/share');
      if (r.ok) setSent((await r.json()).shares ?? []);
    } catch { /* the list is not worth an error toast */ }
  }, []);
  useEffect(() => { void loadSent(); }, [loadSent]);

  /**
   * Build the share locally, with the same builders the server uses.
   *
   * This is what makes the preview true rather than approximate: if the builders refuse it, the trainer sees
   * the refusal here, before they press anything.
   */
  const built = useMemo((): { share: Share | null; problems: { where: string; problem: string; flags?: TextFlag[] }[] } => {
    const opts = { forName: forName || undefined };
    switch (kind) {
      case 'drill':
        return shareDrill(drillKey, PLATFORM_PROTOCOLS, me, { ...opts, note: note || undefined, prescription: prescription || undefined });
      case 'selection':
        return shareSelection(picked, PLATFORM_PROTOCOLS, me, { ...opts, title: listTitle || undefined, note: note || undefined });
      case 'recommendation':
        return shareRecommendation(recBody, me, { ...opts, title: recTitle || undefined });
      case 'program': {
        const program: CoachProgram = {
          key: 'draft', title: progTitle || 'Untitled block', coachId: me.coachId,
          outcome, visibility: 'private', retestAfterWeeks: retest,
          weeks: weeks.filter((w) => w.items.length),
        };
        return shareProgram(program, PLATFORM_PROTOCOLS, me, opts);
      }
    }
  }, [kind, me, forName, drillKey, note, prescription, picked, listTitle, recBody, recTitle, progTitle, outcome, weeks, retest]);

  const preview = built.share ? toPlainText(built.share, PENDING_URL) : null;

  // why the button is off, said out loud rather than a grey rectangle
  const blocked = useMemo(() => {
    if (built.share) return null;
    const clinical = built.problems.find((p) => p.flags?.length);
    if (clinical) return 'Take the flagged language out first.';
    return built.problems[0]?.problem ?? 'Nothing to send yet.';
  }, [built]);

  const send = async () => {
    if (!built.share) return;
    setBusy(true); setCopied(false);
    try {
      const body: Record<string, unknown> = { kind, forName: forName || undefined };
      if (kind === 'drill') Object.assign(body, { protocolKey: drillKey, note, prescription });
      if (kind === 'selection') Object.assign(body, { protocolKeys: picked, title: listTitle, note });
      if (kind === 'recommendation') Object.assign(body, { body: recBody, title: recTitle });
      if (kind === 'program') {
        Object.assign(body, {
          program: {
            key: 'draft', title: progTitle || 'Untitled block', coachId: me.coachId,
            outcome, visibility: 'private', retestAfterWeeks: retest,
            weeks: weeks.filter((w) => w.items.length),
          },
        });
      }
      const r = await fetch('/api/share', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.problems?.[0]?.problem ?? j.error ?? 'Could not create the link');
        return;
      }
      setResult({ url: j.url, text: j.text });
      void loadSent();
    } catch {
      toast.error('Could not create the link');
    } finally { setBusy(false); }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      toast.success('Copied — paste it into your thread');
    } catch {
      // clipboard is blocked in some embedded contexts; the text is on screen either way
      toast.error('Could not copy. Select the text above.');
    }
  };

  const revoke = async (token: string) => {
    const r = await fetch(`/api/share/${token}`, { method: 'DELETE' });
    if (r.ok) { toast.success('Link revoked — the content is gone'); void loadSent(); }
    else toast.error('Could not revoke');
  };

  const reset = () => { setResult(null); setNote(''); setPrescription(''); setRecBody(''); setPicked([]); };

  return (
    <div className="space-y-4">
      {/* what am I sending */}
      <div className="fel-card rounded-xl p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-white/40">Send to a client</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const on = kind === k.key;
            return (
              <button
                key={k.key}
                onClick={() => { setKind(k.key); setResult(null); }}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  on ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10' : 'border-white/8 hover:border-white/20'
                }`}
              >
                <Icon className={`mb-1.5 h-4 w-4 ${on ? 'text-[#00E5FF]' : 'text-white/50'}`} />
                <div className={`text-sm font-medium ${on ? 'text-[#00E5FF]' : 'text-white/80'}`}>{k.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-white/35">{k.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* compose */}
      <div className="fel-card space-y-3 rounded-xl p-4">
        <Field label="For (first name, optional)" value={forName} onChange={setForName} placeholder="Ama" max={24} />

        {kind === 'drill' && (
          <>
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-white/40">Which drill</label>
              <ProtocolPicker selected={drillKey ? [drillKey] : []} onToggle={(k) => setDrillKey(k)} />
            </div>
            <Field label="Dose" value={prescription} onChange={setPrescription} placeholder="3 x 5, quiet landings" max={MAX_NOTE_CHARS} />
            <ScreenedField label="Note" value={note} onChange={setNote} max={MAX_NOTE_CHARS}
              placeholder="Focus on the landing, not the drop. If you hear it, it's too high." />
          </>
        )}

        {kind === 'selection' && (
          <>
            <Field label="Title" value={listTitle} onChange={setListTitle} placeholder="Your work this week" max={80} />
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-white/40">
                Pick up to {MAX_SELECTION_ITEMS} <span className="text-white/25">· {picked.length} chosen</span>
              </label>
              <ProtocolPicker
                selected={picked}
                max={MAX_SELECTION_ITEMS}
                onToggle={(k) => setPicked((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k])}
              />
            </div>
            <ScreenedField label="Note" value={note} onChange={setNote} max={MAX_NOTE_CHARS} placeholder="Twice a week, whenever suits." />
          </>
        )}

        {kind === 'recommendation' && (
          <>
            <Field label="Title" value={recTitle} onChange={setRecTitle} placeholder="Recommendation for Ama" max={80} />
            <ScreenedField label="Recommendation" value={recBody} onChange={setRecBody} max={MAX_RECOMMENDATION_CHARS} rows={7}
              placeholder="Ama has trained with me for eight months. She is ready to work unsupervised on lower-body power…" />
          </>
        )}

        {kind === 'program' && (
          <ProgramBuilder
            title={progTitle} setTitle={setProgTitle}
            outcome={outcome} setOutcome={setOutcome}
            weeks={weeks} setWeeks={setWeeks}
            retest={retest} setRetest={setRetest}
          />
        )}

        {/* authoring problems that are not the clinical screen (the screen shows itself, inline) */}
        {built.problems.filter((p) => !p.flags?.length).length > 0 && (
          <ul className="space-y-1 text-xs text-white/45">
            {built.problems.filter((p) => !p.flags?.length).map((p, i) => (
              <li key={i}>· {p.problem}</li>
            ))}
          </ul>
        )}
      </div>

      {/* THE MESSAGE ITSELF — what actually goes on the clipboard */}
      {preview && !result && (
        <div className="fel-card rounded-xl p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
            <Eye className="h-3.5 w-3.5" /> What they'll get
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-sans text-[13px] leading-relaxed text-white/80">
            {preview}
          </pre>
        </div>
      )}

      {/* send */}
      {!result && (
        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={!built.share || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2.5 text-sm font-semibold text-black transition-opacity disabled:opacity-30"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Create the link
          </button>
          {/* never a silently grey button */}
          {blocked ? <span className="text-xs text-white/40">{blocked}</span> : null}
        </div>
      )}

      {/* the result: the link, and the text to paste */}
      {result && (
        <div className="fel-card space-y-3 rounded-xl border-[#00E5FF]/25 p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#00E5FF]">
            <Link2 className="h-3.5 w-3.5" /> Ready to send
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-sans text-[13px] leading-relaxed text-white/85">
            {result.text}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => copy(result.text)}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy for text'}
            </button>
            <a
              href={result.url} target="_blank" rel="noreferrer"
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 hover:text-white"
            >
              Open the link
            </a>
            <button onClick={reset} className="text-sm text-white/40 hover:text-white/70">Send another</button>
          </div>
        </div>
      )}

      {/* what I've sent */}
      <div className="fel-card rounded-xl p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-white/40">Links you've sent</div>
        {sent === null && <div className="py-4 text-center text-white/30"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>}
        {sent?.length === 0 && <div className="text-sm text-white/40">Nothing sent yet.</div>}
        <div className="space-y-1.5">
          {sent?.map((s) => {
            const dead = !!s.revokedAt || (!!s.expiresAt && new Date(s.expiresAt) <= new Date());
            return (
              <div key={s.token} className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
                <div className="min-w-0">
                  <div className={`truncate text-sm ${dead ? 'text-white/30 line-through' : 'text-white/85'}`}>
                    {s.title}
                    {s.forName ? <span className="text-white/40"> · for {s.forName}</span> : null}
                  </div>
                  <div className="text-[11px] text-white/35">
                    {s.kind} · {new Date(s.createdAt).toLocaleDateString()} · {s.views} view{s.views === 1 ? '' : 's'}
                    {s.revokedAt ? ' · revoked' : ''}
                  </div>
                </div>
                {!dead && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      title="Copy the link"
                      onClick={() => copy(`${window.location.origin}/p/${s.token}`)}
                      className="rounded-md p-1.5 text-white/40 hover:text-white/80"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Revoke — the content is deleted"
                      onClick={() => revoke(s.token)}
                      className="rounded-md p-1.5 text-white/40 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── the block builder ────────────────────────────────────────────────────────────────────────────────────

function ProgramBuilder({
  title, setTitle, outcome, setOutcome, weeks, setWeeks, retest, setRetest,
}: {
  title: string; setTitle: (v: string) => void;
  outcome: string; setOutcome: (v: string) => void;
  weeks: ProgramWeek[]; setWeeks: (w: ProgramWeek[]) => void;
  retest: number; setRetest: (n: number) => void;
}) {
  const patch = (i: number, next: Partial<ProgramWeek>) =>
    setWeeks(weeks.map((w, n) => (n === i ? { ...w, ...next } : w)));

  return (
    <>
      <Field label="Block title" value={title} onChange={setTitle} placeholder="8-week knee resilience" max={80} />
      {/* required by validateProgram: a block with no stated end is a subscription, not a block */}
      <Field label="Outcome — what finishing this changes" value={outcome} onChange={setOutcome}
        placeholder="Land from height without a recovery step." max={200} />

      <div className="space-y-2">
        {weeks.map((w, i) => (
          <div key={i} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-white/40">Week {w.week}</span>
              <input
                value={w.focus}
                placeholder="What this week is for"
                onChange={(e) => patch(i, { focus: e.target.value })}
                className="min-w-0 flex-1 rounded border border-white/8 bg-white/[0.03] px-2 py-1 text-xs text-white/85 outline-none focus:border-[#00E5FF]/50"
              />
              {weeks.length > 1 && (
                <button
                  onClick={() => setWeeks(weeks.filter((_, n) => n !== i).map((x, n) => ({ ...x, week: n + 1 })))}
                  className="text-white/30 hover:text-red-400"
                ><X className="h-3.5 w-3.5" /></button>
              )}
            </div>
            <ProtocolPicker
              selected={w.items.map((it) => it.protocolKey)}
              onToggle={(key) => patch(i, {
                items: w.items.some((it) => it.protocolKey === key)
                  ? w.items.filter((it) => it.protocolKey !== key)
                  : [...w.items, { protocolKey: key, frequency: 3 }],
              })}
            />
            {w.items.map((it, n) => (
              <div key={it.protocolKey} className="mt-2 flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-white/60">
                  {PLATFORM_PROTOCOLS.find((p) => p.key === it.protocolKey)?.title}
                </span>
                <select
                  value={it.frequency}
                  onChange={(e) => patch(i, {
                    items: w.items.map((x, m) => (m === n ? { ...x, frequency: Number(e.target.value) } : x)),
                  })}
                  className="rounded border border-white/8 bg-[#0f0f13] px-1.5 py-1 text-white/80 outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((f) => <option key={f} value={f}>{f}x/wk</option>)}
                </select>
                <input
                  value={it.prescription ?? ''}
                  placeholder="dose / cue (optional)"
                  onChange={(e) => patch(i, {
                    items: w.items.map((x, m) => (m === n ? { ...x, prescription: e.target.value } : x)),
                  })}
                  className="min-w-0 flex-1 rounded border border-white/8 bg-white/[0.03] px-2 py-1 text-white/85 outline-none focus:border-[#00E5FF]/50"
                />
              </div>
            ))}
            {/* An empty week is dropped from the message (there is nothing to say about it), so say so here.
                Otherwise a trainer adds a week, forgets to fill it, and sends a shorter block than they
                think they sent — silently, because the preview simply does not mention it. */}
            {!w.items.length && (
              <p className="mt-2 text-[11px] text-white/35">Nothing in this week yet — it won&apos;t be sent.</p>
            )}
            {/* prescriptions are screened like any other trainer text */}
            <Flags flags={w.items.flatMap((it) => screenText(it.prescription ?? ''))} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setWeeks([...weeks, { week: weeks.length + 1, focus: '', items: [] }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-xs text-white/70 hover:text-white"
        ><Plus className="h-3.5 w-3.5" /> Add week</button>
        <label className="flex items-center gap-2 text-xs text-white/50">
          Retest after week
          <select
            value={retest}
            onChange={(e) => setRetest(Number(e.target.value))}
            className="rounded border border-white/8 bg-[#0f0f13] px-2 py-1 text-white/80 outline-none"
          >
            {weeks.map((w) => <option key={w.week} value={w.week}>{w.week}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
