/**
 * /dev/coach-warmup — Today's generated Prep (MIRROR-COACH P6, 2026-09-29) without a session or a database: the real
 * WarmupPrep card over fixed contexts (?ctx=adult|youth|pain|fallback), sessions (?day=squat|untagged|prime) and a
 * readiness level (?ready=ok|low|skip). Everything the card shows comes from lib/coach/warmup.ts; nothing is fetched.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WarmupHarness } from './harness';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Warm-up Harness',
  robots: { index: false, follow: false },
};

export default function DevCoachWarmupPage({ searchParams }: { searchParams: { ctx?: string; day?: string; ready?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[900px] px-4 py-4">
        <WarmupHarness ctx={searchParams.ctx ?? 'adult'} day={searchParams.day ?? 'squat'} ready={searchParams.ready ?? 'skip'} />
      </main>
    </div>
  );
}
