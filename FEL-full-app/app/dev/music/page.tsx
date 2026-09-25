import { notFound } from 'next/navigation';
import { DevMusicLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only Groove Academy runner (MUSIC-SUITE P1, 2026-09-25). Hard 404 outside `next dev`. */
export default function DevMusicPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevMusicLoader />;
}
