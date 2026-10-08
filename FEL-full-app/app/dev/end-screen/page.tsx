import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EndScreenFixture } from './fixture';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — End screen fixture',
  robots: { index: false, follow: false },
};

/**
 * /dev/end-screen?case=win|loss|record|levelup|refused|noplay|unpaid|pending|carnival|story — the end-of-game card with
 * sample data, no game and no server. Dev-only: a hard 404 outside `next dev`, like every app/dev page.
 */
export default function DevEndScreenPage({ searchParams }: { searchParams: { case?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <EndScreenFixture name={searchParams?.case ?? 'win'} />;
}
