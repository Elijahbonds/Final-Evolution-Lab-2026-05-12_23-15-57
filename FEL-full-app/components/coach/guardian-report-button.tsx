'use client';

// "Send guardian report" on a roster row (coach-loop P1, 2026-10-20). Shown only for an athlete the server says is a
// teen with an accepted guardian consent (GET /api/coach/guardian-report). The coach never sees who the guardian is
// or the link: the report goes straight to the guardian's address on the consent, behind EMAIL_ENABLED.

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

export const GUARDIAN_REPORT_API = '/api/coach/guardian-report';

export function GuardianReportButton({ clientId, name, emailOn }: { clientId: string; name: string; emailOn: boolean }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch(GUARDIAN_REPORT_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId }) });
      const j = await r.json().catch(() => ({}));
      if (j.status === 'sent') toast.success(`${name}'s guardian has this week's training report.`);
      else if (j.status === 'email_off') toast('Email is not switched on yet, so the report was not sent.');
      else if (j.status === 'rate_limited') toast.error('Already sent today.');
      else toast.error('Could not send the report.');
    } catch { toast.error('No connection.'); } finally { setBusy(false); }
  };
  return (
    <button onClick={() => void send()} disabled={busy || !emailOn} title={emailOn ? 'Email the guardian a training-only report' : 'Email is off'}
      className="mt-1 inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 disabled:opacity-40" data-guardian-report-button>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Guardian report
    </button>
  );
}
