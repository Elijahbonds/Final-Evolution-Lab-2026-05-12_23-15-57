'use client';

// The join link on /sessions (owner decision 2026-09-24). A booked player sees when their session starts in their own
// time and the link to join it; the slot's coach or an admin pastes that link. The rules live in
// lib/sessions/joinLink.ts and every check that matters is repeated on the server.

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Link2, Loader2 } from 'lucide-react';
import { JOIN_LINK_ERROR_COPY, JOIN_URL_MAX, normaliseJoinUrl, sessionEnded } from '@/lib/sessions/joinLink';

export type BookingWithLink = { id: string; kind: string; sessionKey: string; startsAt: string; shardsPaid: number; joinUrl: string | null; joinHost: string | null };
export type HostingSlot = { sessionKey: string; kind: string; startsAtIso: string; booked: number; url: string | null; host: string | null };

export const NOT_POSTED = 'Link not posted yet — it appears here before the start';

/** A private slot holds one player; two bookings that raced can both land. The host is told, and who gets the link. */
export const doubleBookedNote = (booked: number) => `${booked} players booked this private slot. Only the first to book sees the link.`;

const kindLabel = (kind: string) => (kind === 'private_1on1' ? 'Private 1-on-1' : 'Group Workout');

/** The start in the viewer's own time zone, with the zone named so nobody has to convert. */
export function localStart(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

/** A link the page may render: the server only stores https, and this refuses anything else anyway. */
const safeHref = (url: string | null): string | null => (url && url.startsWith('https://') ? url : null);
/** The host shown beside a link: the server's, or read off the link itself, never left blank. */
const hostOf = (href: string, host: string | null): string => {
  if (host) return host;
  try { return new URL(href).host; } catch { return href; }
};

function JoinAnchor({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-300 underline-offset-2 hover:underline">
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/** One of the player's confirmed bookings: when, and how to get in. */
export function BookingRow({ b, nowMs }: { b: BookingWithLink; nowMs: number }) {
  const href = safeHref(b.joinUrl);
  const ended = sessionEnded(b.kind, b.startsAt, nowMs);
  return (
    <div className="rounded-xl border border-green-400/20 bg-green-400/[0.05] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2 text-sm text-white"><Check className="h-4 w-4 text-green-400" /> {kindLabel(b.kind)}</div>
        <div className="text-xs text-white/50">{localStart(b.startsAt)}</div>
      </div>
      <div className="mt-1.5 text-xs">
        {ended ? (
          <span className="text-white/40">This session has ended.</span>
        ) : href ? (
          <span className="flex flex-wrap items-center gap-x-2"><JoinAnchor url={href} label="Join session" /><span className="text-white/40">opens {hostOf(href, b.joinHost)}</span></span>
        ) : (
          <span className="text-white/40">{NOT_POSTED}</span>
        )}
      </div>
    </div>
  );
}

function HostRow({ row, onChanged }: { row: HostingSlot; onChanged: () => void }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const href = safeHref(row.url);

  const send = async (method: 'POST' | 'DELETE') => {
    if (method === 'POST') {
      const v = normaliseJoinUrl(draft);
      if (!v.ok) { toast.error(JOIN_LINK_ERROR_COPY[v.error]); return; }
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/sessions/join-link', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'POST' ? { sessionKey: row.sessionKey, url: draft } : { sessionKey: row.sessionKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(JOIN_LINK_ERROR_COPY[j?.error] ?? 'Could not save the link. Try again.'); return; }
      toast.success(method === 'POST' ? 'Link posted. Booked players can see it now.' : 'Link taken down.');
      setDraft('');
      onChanged();
    } catch { toast.error('Could not save the link. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-white">
        <span>{kindLabel(row.kind)} · {localStart(row.startsAtIso)}</span>
        <span className="text-xs text-white/40">{row.booked} booked</span>
      </div>
      {row.kind === 'private_1on1' && row.booked > 1 && <div className="mt-1 text-xs text-amber-300">{doubleBookedNote(row.booked)}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {href ? (
          <>
            <JoinAnchor url={href} label="Posted link" /><span className="text-white/40">opens {hostOf(href, row.host)}</span>
            <button type="button" onClick={() => send('DELETE')} disabled={busy} className="text-red-300/80 hover:text-red-300 disabled:opacity-50">Take down</button>
          </>
        ) : <span className="text-white/40">No link posted yet.</span>}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send('POST'); }}>
        <input
          type="url" inputMode="url" autoComplete="off" maxLength={JOIN_URL_MAX} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={href ? 'Paste a new link to replace it' : 'Paste the https link (Zoom, Meet, …)'}
          aria-label={`Join link for ${kindLabel(row.kind)}, ${localStart(row.startsAtIso)}`}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/60 focus:outline-none"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="flex items-center gap-1 rounded-lg bg-cyan-400 px-3 py-1.5 text-sm font-bold text-[#050505] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </button>
      </form>
    </div>
  );
}

/** For the slot's coach and admins: paste the link each slot's booked players join by. */
export function HostingPanel({ rows, onChanged }: { rows: HostingSlot[]; onChanged: () => void }) {
  if (!rows.length) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-cyan-300"><Link2 className="h-4 w-4" /> Join links you post</h2>
      <p className="mb-3 text-xs text-white/40">Players booked on a slot see its link under Your upcoming sessions. Only https links.</p>
      <div className="space-y-2">
        {rows.map((r) => <HostRow key={r.sessionKey} row={r} onChanged={onChanged} />)}
      </div>
    </section>
  );
}
