/**
 * /dev/program-builder — the Clients tab's program builder as a coach sees it, without a session or a database
 * (MIRROR-COACH P2, 2026-09-25). The real ProgramBuilder component; its saves go to ./api, which runs the real builder
 * service (lib/coach/builderServer.ts) over an in-memory store. ?reset=1 starts from an empty two-session week.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BuilderHarness } from './harness';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Program Builder Harness',
  robots: { index: false, follow: false },
};

export default function DevProgramBuilderPage({ searchParams }: { searchParams: { reset?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[900px] px-4 py-4">
        <BuilderHarness reset={searchParams.reset === '1'} />
      </main>
    </div>
  );
}
