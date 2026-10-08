import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { DUNK_WEEKS } from '@/lib/coach-store/dunkProgram';
import { drillsForTeen } from '@/lib/coach-store/teen';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { programAccessOpen } from '@/lib/coach-store/access';
import { programsForAccess } from '@/lib/coach-store/programsForAccess';
import { getProgramLibrarySeed, type ProgramLibraryVideoEntry } from '@/lib/coach-store/programLibrarySeed';
import { storePriceByKey } from '@/lib/coach-store/storePrices';
import { siteOrigin } from '@/lib/stripe/site-origin';

export const dynamic = 'force-dynamic';

function videosForProduct(productKey: string): ProgramLibraryVideoEntry[] {
  const ids = storePriceByKey(productKey)?.videoIds ?? [];
  const seed = getProgramLibrarySeed();
  return seed.filter((entry) => ids.includes(entry.videoId));
}

function ProductVideos({ title, videos }: { title: string; videos: ProgramLibraryVideoEntry[] }) {
  return (
    <section className="mt-4">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-2 text-sm">
        {videos.map((v) => (
          <li key={v.videoId} className="mt-1">
            <a className="underline" href={`https://youtu.be/${v.videoId}`} target="_blank" rel="noreferrer">{v.videoTitle}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ProgramPlayerPage({ params }: { params: { accessId: string } }) {
  if (!isCoachStoreEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) notFound();
  try {
    const access = await prisma.programAccess.findUnique({ where: { id: params.accessId } });
    if (!access || access.userId !== userId) notFound();
    // STORE-READY B4 (F20): an unpaid, refunded, expired, paused or cancelled row — or one past accessUntil —
    // shows nothing. The owner check above stays; this is the paywall on the content itself.
    if (!programAccessOpen(access, new Date())) {
      return (
        <main className="mx-auto max-w-xl px-4 py-8 text-white">
          <h1 className="text-2xl font-black">Your program</h1>
          <p className="mt-2 text-sm text-white/70">This program isn&apos;t active.</p>
        </main>
      );
    }
    const isTeen = access.beneficiary === 'teen';
    // P3 (membership delivers): an open row renders exactly what programsForAccess (lib/coach-store/programsForAccess)
    // returns. A membership row is scope 'all' (adult) or 'teen_all' (parent-bought teen).
    const keys = programsForAccess({ scope: access.scope, lane: access.lane });
    const showDunkWeeks = keys.includes('dunking-plyometrics-8wk');
    const showCourse = keys.includes('signature-dunk-course');
    const showSeries = keys.includes('blueprint-series');
    // M3: a parent opening a teen membership sees a parent view, never drill names.
    if (access.scope === 'teen_all') {
      const origin = siteOrigin();
      const unlockUrl = origin ? `${origin}/program/unlock` : '/program/unlock';
      return (
        <main className="mx-auto max-w-xl px-4 py-8 text-white">
          <h1 className="text-2xl font-black">Your program</h1>
          <p className="mt-2 text-sm text-white/70">Re-screens sit on days 14, 28, 42 and 56.</p>
          {keys.length === 0 ? <p className="mt-4 text-sm">Nothing to show yet.</p> : (
            <>
              {keys.map((key) => (
                <section key={key} className="mt-4">
                  <h2 className="font-bold">{storePriceByKey(key)?.title ?? key}</h2>
                  {key === 'dunking-plyometrics-8wk' ? (
                    <ul className="mt-2 text-sm">
                      {DUNK_WEEKS.map((week) => <li key={week.week}>Week {week.week}: {week.title}</li>)}
                    </ul>
                  ) : null}
                </section>
              ))}
              <p className="mt-6 text-sm">On your teen&apos;s phone, open {unlockUrl} and type the unlock code from checkout. Lost it? Re-issue a code from Account, then Coaching.</p>
              <p className="mt-2 text-sm text-white/70">Your teen&apos;s progress stays on their phone. They can share a one-page summary with you from there.</p>
            </>
          )}
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-xl px-4 py-8 text-white">
        <h1 className="text-2xl font-black">Your program</h1>
        <p className="mt-2 text-sm text-white/70">{isTeen ? 'Your progress stays on this phone.' : 'Re-screens sit on days 14, 28, 42 and 56.'}</p>
        {access.scope === 'all' ? <p className="mt-2 text-sm text-white/70">Re-screen trend board and plans that adjust: coming soon.</p> : null}
        {keys.length === 0 ? <p className="mt-4 text-sm">Nothing to show yet.</p> : null}
        {showDunkWeeks ? DUNK_WEEKS.map((week) => (
          <section key={week.week} className="mt-4">
            <h2 className="font-bold">Week {week.week}: {week.title}</h2>
            {week.days.map((day) => {
              const drills = isTeen ? drillsForTeen(day.drills) : day.drills;
              return (
                <div key={day.day} className="mt-2 text-sm">
                  <p>{day.title}</p>
                  <ul>{drills.map((drill) => <li key={drill.id}>{drill.name}: {drill.cue}</li>)}</ul>
                </div>
              );
            })}
          </section>
        )) : null}
        {showCourse ? <ProductVideos title="Signature Dunk Course" videos={videosForProduct('signature-dunk-course')} /> : null}
        {showSeries ? <ProductVideos title="Blueprint series" videos={videosForProduct('blueprint-series')} /> : null}
      </main>
    );
  } catch (err) {
    if (isMissingTable(err)) {
      logStoreUnavailable();
      return <main className="px-4 py-8 text-white">Coach store is not set up yet.</main>;
    }
    throw err;
  }
}

