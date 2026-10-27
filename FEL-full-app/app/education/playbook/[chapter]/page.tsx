import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { ChapterReader } from '@/components/education/chapter-reader';
import { CHAPTERS, chapterByNumber } from '@/lib/education/course';
import films from '@/lib/education/films.json';
import { Chip } from '@/components/ui/fel/chip';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ chapter: String(c.number) }));
}

export default async function ChapterPage({ params, searchParams }: { params: { chapter: string }; searchParams?: { lesson?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const n = Number(params?.chapter);
  const chapter = Number.isFinite(n) ? chapterByNumber(n) : null;
  if (!chapter) notFound();
  // PLAT-P04: Learn's Continue opens the lesson you were in (?lesson=<key>); a key the chapter does not teach is ignored.
  const want = typeof searchParams?.lesson === 'string' ? searchParams.lesson : '';
  const lesson = chapter.lessons.some((l) => l.key === want) ? want : undefined;
  if (!session) redirect(loginPath(`/education/playbook/${chapter.number}${lesson ? `?lesson=${encodeURIComponent(lesson)}` : ''}`));

  // A drill shows its film when one has been ingested; otherwise the steps carry it on their own.
  const filmFor = Object.fromEntries(
    Object.entries((films as { films?: Record<string, { url?: string }> }).films ?? {})
      .filter(([, v]) => typeof v?.url === 'string' && v.url.length > 0)
      .map(([k, v]) => [k, v.url as string]),
  );

  // PLAT-P04: the lesson shows before it tells, so the header is the chapter's name and nothing more — the subtitle
  // was 8–12 words above the demo on a phone (it stays on the course index and on Learn).
  return (
    <TabPage
      eyebrow={`Chapter ${chapter.number}`}
      title={chapter.title}
      aside={<Chip href="/education/playbook" icon={<ArrowLeft aria-hidden className="h-4 w-4" />}>All chapters</Chip>}
    >
      <ChapterReader chapter={chapter} filmFor={filmFor} startAt={lesson} />
    </TabPage>
  );
}
