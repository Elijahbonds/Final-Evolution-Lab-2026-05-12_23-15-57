import { notFound } from 'next/navigation';
import AthleteCreator from '@/app/creator/athlete/_components/athlete-creator';

export const dynamic = 'force-dynamic';

/**
 * Dev-only creator, no auth. Hard 404 outside `next dev`.
 *
 * The same reasoning that made `/dev/mode/<key>` exist: a screen you cannot open without a session is a
 * screen nobody can verify, and this pass already lost a probe run to a login that silently failed. The
 * shipping route at /creator/athlete keeps its auth guard; this one exists so the thing can be looked at.
 *
 * `axes` is null here on purpose — a guest has no PRQ and therefore no ceilings, which is exactly the case
 * most worth being able to eyeball.
 */
export default function DevCreatorPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <AthleteCreator axes={null} profileId="dev" />
    </div>
  );
}
