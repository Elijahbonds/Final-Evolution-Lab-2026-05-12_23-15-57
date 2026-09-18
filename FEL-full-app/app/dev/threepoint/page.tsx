import { notFound } from 'next/navigation';
import { DevThreePointLoader } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only 3PT runner. Hard 404 outside `next dev`. */
export default function DevThreePointPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevThreePointLoader />;
}
