import { notFound } from 'next/navigation';
import { DevBodyLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only: body play on a game through its SHIPPING host — the READY card's "Play with your body", the space check,
 *  the corner self-view — and the header's Body button beside it. Hard 404 outside `next dev` (the /play routes are
 *  auth-gated). scripts/probes/_space-check-live.mts drives it. */
export default function DevBodyPage({ params }: { params: { key: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevBodyLoader modeKey={params.key} />;
}
