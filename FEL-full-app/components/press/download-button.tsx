'use client';

import { useState } from 'react';

export function DownloadButton({
  bookSlug,
  fileId,
  label,
  grant,
}: {
  bookSlug: string;
  fileId: string;
  label: string;
  grant?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/books/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookSlug, fileId, grant: grant || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.url !== 'string') {
        setError(typeof body?.error === 'string' ? body.error : 'Download is not available yet.');
        setBusy(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError('Download is not available yet.');
      setBusy(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/40 disabled:opacity-60"
      >
        {busy ? 'Preparing…' : label}
      </button>
      {error ? <p className="mt-1 text-[11px] text-[#ff8b8b]">{error}</p> : null}
    </div>
  );
}
