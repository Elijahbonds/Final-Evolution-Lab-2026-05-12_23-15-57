'use client';
// CoachBrandBar — COACH-DELIVERY COA-04 (2026-10-26): the coach's brand at the top of an athlete's Today (their logo, their
// brand name, their accent as a thin rule). Nothing at all when the coach has no brand or the pending SQL is not applied.
import { useEffect, useState } from 'react';
import type { Branding } from '@/lib/coach/branding';

export const MY_BRANDING_API = '/api/coach/me/branding';

export function BrandMark({ b, size = 32 }: { b: Branding; size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-brand-mark>
      {/* eslint-disable-next-line @next/next/no-img-element -- a coach's small logo from FEL's own public bucket */}
      {b.logoUrl && <img src={b.logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-md object-contain" style={{ width: size, height: size }} />}
      {b.name && <span className="min-w-0 truncate text-sm font-semibold" style={b.accent ? { color: b.accent } : undefined}>{b.name}</span>}
    </div>
  );
}

export function CoachBrandBar({ api = MY_BRANDING_API }: { api?: string }) {
  const [b, setB] = useState<Branding | null>(null);
  useEffect(() => { fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => setB(j?.branding ?? null)).catch(() => setB(null)); }, [api]);
  if (!b || (!b.name && !b.logoUrl)) return null;
  return (
    <div className="rounded-xl border border-white/8 px-3 py-2" style={b.accent ? { borderTopColor: b.accent, borderTopWidth: 3 } : undefined} data-coach-brand-bar>
      <BrandMark b={b} />
    </div>
  );
}
