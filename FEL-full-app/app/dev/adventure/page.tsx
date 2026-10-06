import { notFound } from 'next/navigation';
import { DevAdventureLoader } from './loader';

export const dynamic = 'force-dynamic';

/** ADVENTURE A4 (2026-10-06): the Adventure's integration sandbox. Dev only — a hard 404 outside `next dev`, like every
 *  app/dev page. Query: ?partner=character (a built character instead of the creature), ?fuse=ready (the fusion meter
 *  starts full), ?at=camp (start beside the monster camp), ?demo=1 (the integration script plays every verb), ?seed=N. */
export default function DevAdventurePage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevAdventureLoader />;
}
