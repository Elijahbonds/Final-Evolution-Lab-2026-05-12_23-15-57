import { notFound } from 'next/navigation';
import { RenderCheckLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

/**
 * Development-only rendering reference. Hard 404 outside `next dev` — this page
 * is deliberately NOT auth-gated so the renderer can be inspected without a
 * database, and that trade is only acceptable while it cannot exist in a
 * production build.
 */
export default function RenderCheckPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <RenderCheckLoader />;
}
