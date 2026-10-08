import type { Metadata } from 'next';
import { ThanksPoll } from '@/components/coach-store/thanks-poll';
import { isCoachStoreEnabled } from '@/lib/flags';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Thanks' };

export default function ThanksPage({ searchParams }: { searchParams: { row?: string; session_id?: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  if (!searchParams.row) notFound();
  return <main className="mx-auto max-w-xl px-4 py-8"><ThanksPoll rowId={searchParams.row} sessionId={searchParams.session_id ?? null} /></main>;
}
