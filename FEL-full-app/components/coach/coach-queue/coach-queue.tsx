'use client';
// components/coach/coach-queue/coach-queue.tsx — PLATFORM PHASE 5: "Needs you today". One card per item (the athlete,
// one line, at most two buttons); Approve, Reply, Nudge and "Looks good" act in place through the routes that already
// exist, and the card slides out when done. Nothing here decides who needs the coach: lib/coach/queue.ts orders what the
// sources said, and /api/coach/queue gates every card.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronRight, Loader2, Send } from 'lucide-react';
import type { QueueAction, QueueCard, QueuePreset, QueueSourceKey } from '@/lib/coach/queue';
import { SOURCE_LABEL } from '@/lib/coach/queue';
import { LOOK } from './look';
import { markDone, readDone } from './done';

const LABEL: Record<QueueAction, string> = { approve: 'Approve', reply: 'Reply', cue: 'Reply', looks_good: 'Looks good', nudge: 'Nudge', open: 'Open', done: 'Done' };

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return !!r?.ok;
};

/** Post to the athlete's program thread; a message card's thread is read once the coach has answered it. */
async function toThread(card: QueueCard, text: string): Promise<boolean> {
  if (!card.programId) return false;
  const ok = await post('/api/coach/messages', { programId: card.programId, body: text });
  if (ok && card.kind === 'message') await post('/api/coach/messages/read', { programId: card.programId });
  return ok;
}

export function CoachQueue({ items, dark, onOpen }: {
  items: QueueCard[] | null;
  dark: QueueSourceKey[];
  /** The athlete sheet (or, for a draft that needs a closer look, the drafts screen). */
  onOpen: (card: QueueCard) => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<QueueCard | null>(null);
  useEffect(() => { setDone(readDone()); }, []);

  const leave = (card: QueueCard) => {
    markDone(card.key);
    setLeaving((s) => new Set(s).add(card.key));
    setTimeout(() => setDone((s) => new Set(s).add(card.key)), 220);
  };
  const run = async (card: QueueCard, action: QueueAction, preset?: QueuePreset, text?: string) => {
    if (action === 'open') { onOpen(card); return; }
    if (action === 'done') { leave(card); return; }
    if (action === 'reply' || action === 'cue') {
      if (!preset && !text) { setSheet(card); return; }
    }
    setBusy(card.key);
    let ok = false;
    if (action === 'approve') ok = await post('/api/coach/drafts/approve-safe', { draftId: card.ref });
    else if (action === 'looks_good') ok = await post(`/api/coach/form-reviews/${card.ref}/reply`, { markOnly: true });
    else if (action === 'cue') ok = await post(`/api/coach/form-reviews/${card.ref}/reply`, preset ? { cueId: preset.id } : { note: text });
    else if (action === 'nudge') ok = await toThread(card, card.presets[0]?.text ?? '');
    else if (action === 'reply') ok = await toThread(card, preset?.text ?? text ?? '');
    setBusy(null);
    setSheet(null);
    if (ok) { toast.success(action === 'approve' ? 'Approved' : action === 'looks_good' ? 'Marked reviewed' : 'Sent'); leave(card); }
    else toast.error('Not sent. Try again.');
  };

  const shown = (items ?? []).filter((c) => !done.has(c.key));
  return (
    <section className={LOOK.section} data-coach-block="queue" aria-label="Needs you today">
      <h2 className={LOOK.sectionHead}><span>Needs you</span>{items && <span data-queue-count>{shown.length}</span>}</h2>
      {!items && <div className="flex justify-center py-8 text-fel-dim"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>}
      {items && !shown.length && (
        <div className={`${LOOK.card} flex-row items-center`} data-queue-clear>
          <Check className="h-5 w-5 text-fel-emerald" aria-hidden />
          <span className={LOOK.name}>All clear</span>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {shown.map((c, i) => (
          <li key={c.key} data-queue-card={c.kind} data-queue-key={c.key}
            className={`${LOOK.card} max-h-60 ${leaving.has(c.key) ? LOOK.cardLeaving : ''}`} style={{ ['--fel-enter-delay' as string]: `${Math.min(i, 6) * 40}ms` }}>
            <button type="button" className="flex min-w-0 items-center justify-between gap-2 text-left" onClick={() => onOpen(c)} aria-label={`Open ${c.name}`}>
              <span className="min-w-0">
                <span className={`${LOOK.name} block truncate`}>{c.name}</span>
                <span className={`${LOOK.line} block truncate`}>{c.line}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-fel-dim" aria-hidden />
            </button>
            <div className={LOOK.actions}>
              {c.actions.slice(1).map((a) => (
                <button key={a} type="button" className={LOOK.outline} disabled={busy === c.key} onClick={() => void run(c, a)} data-queue-action={a}>{LABEL[a]}</button>
              ))}
              <button type="button" className={LOOK.solid} disabled={busy === c.key} onClick={() => void run(c, c.actions[0])} data-queue-action={c.actions[0]}>
                {busy === c.key ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{LABEL[c.actions[0]]}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!!dark.length && (
        <p className={`${LOOK.quiet} mt-3`} data-queue-dark>
          {dark.map((d) => SOURCE_LABEL[d]).join(', ').replace(/^./, (x) => x.toUpperCase())}: turns on when the owner finishes setup.
        </p>
      )}
      {sheet && <ReplySheet card={sheet} busy={busy === sheet.key} onClose={() => setSheet(null)}
        onPick={(p) => void run(sheet, sheet.kind === 'review' ? 'cue' : 'reply', p)}
        onText={(t) => void run(sheet, sheet.kind === 'review' ? 'cue' : 'reply', undefined, t)} />}
    </section>
  );
}

/** The reply sheet: the presets as one-tap rows; a short text box only for an adult (never free text about a minor). */
function ReplySheet({ card, busy, onClose, onPick, onText }: {
  card: QueueCard; busy: boolean; onClose: () => void; onPick: (p: QueuePreset) => void; onText: (t: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <>
      <div className={LOOK.scrim} onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={`Reply to ${card.name}`} className={LOOK.replySheet} data-reply-sheet>
        <div className={`${LOOK.sectionHead} mb-2`}><span>Reply to {card.name.split(/\s+/)[0]}</span>
          <button type="button" className={LOOK.outline} onClick={onClose}>Cancel</button></div>
        <div className="flex flex-col">
          {card.presets.map((p) => (
            <button key={p.id} type="button" className={LOOK.row} disabled={busy} onClick={() => onPick(p)} data-reply-preset={p.id}>
              <span className="min-w-0">{p.text}</span><Send className="h-4 w-4 shrink-0 text-fel-cyan" aria-hidden />
            </button>
          ))}
        </div>
        {card.freeText && (
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onText(text.trim()); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Or write a short reply" className={LOOK.input} aria-label="Your reply" />
            <button type="submit" className={LOOK.solid} disabled={busy || !text.trim()}>Send</button>
          </form>
        )}
      </div>
    </>
  );
}
