import { notFound } from 'next/navigation';
import { DevRaceLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only: a racing mode through its SHIPPING host (the real HUD and the result the host hands the shell).
 *  Hard 404 outside `next dev` — the /play routes are auth-gated. */
export default function DevRacePage({ params }: { params: { key: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevRaceLoader modeKey={params.key} />;
}
