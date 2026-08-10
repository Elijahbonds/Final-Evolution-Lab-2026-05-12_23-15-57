'use client';

import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';

/** Admin-only trigger for the re-engagement email sweep (Phase 5). */
export function ReengageButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/marketing/reengage', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error ?? 'Sweep failed'); return; }
      toast.success(`Re-engagement sent to ${d.sent} of ${d.candidates} dormant leads.`);
    } catch {
      toast.error('Sweep failed. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/30 bg-[#00FF9D]/10 px-4 py-2 text-sm font-semibold text-[#00FF9D] transition-transform hover:scale-[1.03] disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
      Run re-engagement sweep
    </button>
  );
}
