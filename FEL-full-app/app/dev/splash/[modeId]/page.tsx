import { notFound } from 'next/navigation';
import { DevSplash } from './client';

export const dynamic = 'force-dynamic';

/**
 * Dev-only harness for the START-UP SCREEN. Hard 404 outside `next dev`, exactly like /dev/mode.
 *
 * BootSplash carries every pre-game pick in the app — court, ball, board venue, deck, and now the racing map
 * and vehicle — and the only routes that render it are behind a login. So the pickers could be typechecked
 * and tested and still be unrenderable, which is a thing that has happened here before with UI that nobody
 * could reach without credentials. This is how they get LOOKED at.
 */
export default function DevSplashPage({ params }: { params: { modeId: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevSplash modeId={params.modeId} />;
}
