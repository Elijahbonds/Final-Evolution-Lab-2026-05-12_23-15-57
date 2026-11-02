'use client';

// Compliance alerts on the attention board (coach-loop P1, 2026-10-20). The panel already names who stalled and who is
// slowing; this adds who MISSED planned sessions this week (lib/coach/alerts.ts), and one button that emails the whole
// alert list to the coach's own address when email is on.

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarX2, Loader2, Mail } from 'lucide-react';
import type { CoachAlert } from '@/lib/coach/alerts';

/** The rows this strip adds: missed sessions, for athletes the panel has not already named above it. */
export function missedRows(alerts: readonly CoachAlert[] | undefined, shownIds: ReadonlySet<string>): CoachAlert[] {
  return (alerts ?? []).filter((a) => a.kind === 'missed' && !shownIds.has(a.clientId));
}

export function AlertsStrip({ alerts, shownIds }: { alerts: readonly CoachAlert[] | undefined; shownIds: ReadonlySet<string> }) {
  const [busy, setBusy] = useState(false);
  const missed = missedRows(alerts, shownIds);
  const total = alerts?.length ?? 0;

  const email = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/coach/attention/digest', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (j.status === 'sent') toast.success('Sent to your email.');
      else if (j.status === 'email_off') toast('Email is not switched on yet. The list stays here.');
      else if (r.status === 429) toast.error('That is enough emails for today.');
      else toast.error('Could not send it just now.');
    } catch { toast.error('No connection.'); } finally { setBusy(false); }
  };

  if (!total) return null;
  return (
    <div className="mt-3" data-alerts-strip>
      {missed.length > 0 && (
        <ul className="space-y-1.5">
          {missed.map((a) => (
            <li key={a.clientId} className="flex items-start gap-2 rounded-lg bg-white/4 px-3 py-2 text-sm" data-alert={a.kind}>
              <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0 text-fel-gold" aria-hidden="true" />
              <span className="min-w-0 break-words"><span className="font-medium text-white/90">{a.name}</span>{' '}<span className="text-white/55">{a.line}</span></span>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => void email()} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/70 disabled:opacity-50" data-alerts-email>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Email me these {total} alert{total === 1 ? '' : 's'}
      </button>
    </div>
  );
}
