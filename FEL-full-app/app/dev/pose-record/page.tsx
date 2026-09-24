import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PoseRecordLoader } from './loader';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — pose recorder (dev)',
  robots: { index: false, follow: false },
};

/**
 * Dev-only: the owner's local pose recorder for the movement-play detectors (landmark numbers only, no video,
 * nothing uploaded). Not linked from anywhere. Hard 404 outside `next dev`.
 */
export default function DevPoseRecordPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PoseRecordLoader />;
}
