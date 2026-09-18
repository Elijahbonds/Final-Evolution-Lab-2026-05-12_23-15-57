import { notFound } from 'next/navigation';
import { HarnessLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only Controller Link host harness. Hard 404 outside `next dev`. */
export default function ControllerLinkDevPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <HarnessLoader />;
}
