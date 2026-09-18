/**
 * /dev/splash — the boot splash on its own, with no auth and no engine.
 *
 * The venue/deck/map pickers all live on this one screen, and every capture in the visual passes went
 * through `/dev/mode/<key>`, which boots straight into the scene and skips it. So the pickers were built,
 * shipping and invisible to review. This mounts the real component (no copy, no mock) at
 * `?mode=skateboard|snowboard_slalom|surf|velocitykart|aeroaces|dunk`.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SplashHarness } from './harness';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'FEL — Boot Splash Harness', robots: { index: false, follow: false } };

export default function DevSplashPage({ searchParams }: { searchParams: { mode?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SplashHarness modeId={searchParams?.mode ?? 'skateboard'} />;
}
