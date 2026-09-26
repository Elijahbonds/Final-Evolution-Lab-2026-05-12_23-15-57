import { notFound } from 'next/navigation';
import { DevBrainBrawlLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only Brain Brawl runner. Hard 404 outside `next dev`. */
export default function DevBrainBrawlPage({ searchParams }: { searchParams: { shell?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevBrainBrawlLoader shell={searchParams?.shell === '1'} />;   // ?shell=1: the real GameShell (POLISH-2)
}
