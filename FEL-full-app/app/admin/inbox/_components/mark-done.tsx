'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function MarkDone({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await fetch('/api/report/problem', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: done ? 'new' : 'done' }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white/70 disabled:opacity-50">
      {done ? 'Reopen' : 'Mark handled'}
    </button>
  );
}
