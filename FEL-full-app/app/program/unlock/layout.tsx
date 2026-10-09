import { isCoachStoreEnabled } from '@/lib/flags';
import { notFound } from 'next/navigation';

// UNLOCK-FLAG-GATE. page.tsx here is a client component, so it cannot read the server-side flag itself and served
// 200 with COACH_STORE_ENABLED unset. This server layout gates it the same way app/coach/thanks/page.tsx does,
// without touching the page or the shared app/program/layout.tsx. force-dynamic makes the flag read on each request;
// without it Next would prerender this segment at build time and bake in whatever the flag was then.
export const dynamic = 'force-dynamic';

export default function UnlockLayout({ children }: { children: React.ReactNode }) {
  if (!isCoachStoreEnabled()) notFound();
  return children;
}
