import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { DUNK_WEEKS } from '@/lib/coach-store/dunkProgram';
import { drillsForTeen } from '@/lib/coach-store/teen';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { getProgramLibrarySeed, type ProgramLibraryVideoEntry } from '@/lib/coach-store/programLibrarySeed';
import { storePriceByKey } from '@/lib/coach-store/storePrices';

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
    const isTeen = access.beneficiary === 'teen';
    const showDunkWeeks = access.scope === 'lane' && access.lane === 'dunking';
    const showCourse = access.scope === 'product' && access.lane === 'signature-dunk-course';
    const showSeries = access.scope === 'product' && access.lane === 'blueprint-series';
    const showBundle = access.scope === 'bundle';
    return (
      <main className="mx-auto max-w-xl px-4 py-8 text-white">
        <h1 className="text-2xl font-black">Your program</h1>
        <p className="mt-2 text-sm text-white/70">{isTeen ? 'Your progress stays on this phone.' : 'Re-screens sit on days 14, 28, 42 and 56.'}</p>
        {showDunkWeeks || showBundle ? DUNK_WEEKS.map((week) => (
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
        {showCourse || showBundle ? <ProductVideos title="Signature Dunk Course" videos={videosForProduct('signature-dunk-course')} /> : null}
        {showSeries || showBundle ? <ProductVideos title="Blueprint series" videos={videosForProduct('blueprint-series')} /> : null}
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

