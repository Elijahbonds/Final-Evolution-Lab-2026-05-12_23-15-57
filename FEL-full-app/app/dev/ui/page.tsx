import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The living style page (lane/premium-ui). Hard 404 outside `next dev`, like every other app/dev page. */
export default function DevUiPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <main className="min-h-screen bg-fel-bg p-6 text-white">Style page</main>;
}
