'use client';
// BrandingPanel — COACH-DELIVERY COA-04 (2026-10-26; server: lib/coach/brandingServer.ts). A certified coach's brand: a name,
// an accent colour (refused when too dark to read on FEL) and a logo (PNG/JPEG/WebP up to 512 KB, uploaded straight to
// FEL's public creator bucket with a signed link; off until the owner sets that bucket). Shown on their public page, their
// athletes' Today, and as the sign-off on their invite emails (plain text: no logo or colour in email).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { BRANDING_ERROR_COPY, type Branding } from '@/lib/coach/branding';
import { BrandMark } from './brand-bar';

export const COACH_BRANDING_API = '/api/coach/branding';

interface Board { available: boolean; branding?: Branding; uploads?: boolean; certified?: boolean }
const input = 'min-h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#0b0d12] px-2 text-sm text-white';

export function BrandingPanel({ api = COACH_BRANDING_API }: { api?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState('#00E5FF');
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    fetch(api).then((r) => (r.ok ? r.json() : { available: false })).then((j: Board) => {
      setBoard(j);
      if (j.branding) { setName(j.branding.name ?? ''); if (j.branding.accent) setAccent(j.branding.accent); }
    }).catch(() => setBoard({ available: false }));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    return { ok: !!r?.ok, j: (r ? await r.json().catch(() => ({})) : {}) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const save = async () => {
    const { ok, j } = await post({ action: 'save', name, accent });
    setMsg(ok ? 'Saved.' : BRANDING_ERROR_COPY[j.error] ?? 'Not saved. Try again.');
    if (ok) load();
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const sign = await post({ action: 'logo_upload', contentType: f.type, bytes: f.size });
    if (!sign.ok) { setMsg(BRANDING_ERROR_COPY[sign.j.error] ?? 'Upload not available.'); return; }
    const put = await fetch(sign.j.put.url, { method: 'PUT', headers: sign.j.put.headers, body: f }).catch(() => null);
    if (!put?.ok) { setMsg(BRANDING_ERROR_COPY.bad_logo); return; }
    const set = await post({ action: 'logo_set', objectName: sign.j.objectName });
    setMsg(set.ok ? 'Logo saved.' : BRANDING_ERROR_COPY[set.j.error] ?? 'Not saved.');
    load();
  };

  if (!board?.available || !board.certified) return null;
  const preview: Branding = { name: name || null, accent, logoUrl: board.branding?.logoUrl ?? null };
  return (
    <details className="fel-card min-w-0 rounded-xl p-4" data-branding-panel>
      <summary className="flex cursor-pointer items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><Palette className="h-3.5 w-3.5" /> Your brand</summary>
      <div className="mt-3 space-y-2">
        <input aria-label="Brand name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Dee Strength" className={input} />
        <div className="flex items-center gap-2">
          <input aria-label="Accent colour" type="color" value={accent} onChange={(e) => setAccent(e.target.value.toUpperCase())} className="h-10 w-14 shrink-0 rounded-lg border border-white/10 bg-transparent" />
          <input aria-label="Accent hex" value={accent} onChange={(e) => setAccent(e.target.value)} className={input} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} className="min-h-10 rounded-lg bg-[#00E5FF]/15 px-3 text-sm text-[#00E5FF]">Save</button>
          {board.uploads ? (
            <>
              <button type="button" onClick={() => file.current?.click()} className="min-h-10 rounded-lg border border-white/15 px-3 text-sm text-white/75">Upload logo</button>
              {board.branding?.logoUrl && <button type="button" onClick={() => void post({ action: 'logo_clear' }).then(load)} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-white/50">Remove logo</button>}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
            </>
          ) : <span className="self-center text-xs text-white/40">Logo uploads are not on yet.</span>}
        </div>
        {msg && <p className="text-xs text-white/60">{msg}</p>}
        <div className="rounded-lg border border-white/8 p-2" style={{ borderTopColor: accent, borderTopWidth: 3 }}><BrandMark b={preview} /></div>
        <p className="text-[11px] text-white/40">Shown on your coach page, your athletes&apos; Today, and under your invite emails.</p>
      </div>
    </details>
  );
}
