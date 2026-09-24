import { notFound } from 'next/navigation';
import { DevBrainBrawlLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only Brain Brawl runner. Hard 404 outside `next dev`. */
export default function DevBrainBrawlPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevBrainBrawlLoader />;
}
