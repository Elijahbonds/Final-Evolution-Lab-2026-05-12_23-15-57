/**
 * /dev/coach-catalogue — the /coach Exercises tab as a coach sees it, without a session or a database
 * (MIRROR-COACH P2, 2026-09-25). The knowledge base with FEL's tags and "Add to my catalogue", and My catalogue
 * (create, edit, tag, delete), rendered by the real components. Their fetches to /api/coach/programs/exercises* and
 * /api/coach/catalogue are pointed at ./api, which runs the real catalogue service over an in-memory store
 * (app/dev/coach-catalogue/api/route.ts). ?reset=1 starts from the seeded KB and an empty catalogue.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogueHarness } from './harness';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Coach Catalogue Harness',
  robots: { index: false, follow: false },
};

export default function DevCoachCataloguePage({ searchParams }: { searchParams: { reset?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[900px] px-4 py-4">
        <CatalogueHarness reset={searchParams.reset === '1'} />
      </main>
    </div>
  );
}
