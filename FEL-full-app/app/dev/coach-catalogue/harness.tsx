'use client';
// The dev harness's one trick: point the Exercises tab's catalogue fetches at ./api (the real service over an
// in-memory store) before the tab mounts. Everything else on the page is the production component.
import { useEffect, useState } from 'react';
import { ExerciseCatalogue } from '@/app/coach/_components/exercise-catalogue';

const API = '/dev/coach-catalogue/api';

function rewrite(url: string, method: string): string | null {
  const u = new URL(url, window.location.origin);
  if (u.origin !== window.location.origin) return null;
  if (u.pathname === '/api/coach/catalogue' && method === 'GET') return `${API}?op=kb`;
  if (u.pathname === '/api/coach/programs/exercises') return method === 'POST' ? `${API}?op=create` : `${API}?op=list`;
  if (u.pathname === '/api/coach/programs/exercises/from-kb') return `${API}?op=from-kb`;
  const m = /^\/api\/coach\/programs\/exercises\/([^/]+)$/.exec(u.pathname);
  if (m) return `${API}?id=${encodeURIComponent(m[1])}`;
  return null;
}

export function CatalogueHarness({ reset }: { reset: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const to = rewrite(url, (init?.method ?? 'GET').toUpperCase());
      return real(to ?? input, init);
    };
    (reset ? real(`${API}?op=reset`, { method: 'POST' }) : Promise.resolve()).finally(() => setReady(true));
    return () => { window.fetch = real; };
  }, [reset]);
  if (!ready) return null;
  return (
    <div>
      <div className="mb-3 rounded-lg border border-[#FFD700]/30 bg-[#FFD700]/5 px-3 py-2 text-[11px] text-[#FFD700]/80">
        Dev harness: the real Exercises tab and catalogue service over an in-memory store (database offline). Signed in as a coach.
      </div>
      <ExerciseCatalogue coach />
    </div>
  );
}
