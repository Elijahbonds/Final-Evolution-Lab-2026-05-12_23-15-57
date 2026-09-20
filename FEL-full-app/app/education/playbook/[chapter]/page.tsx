import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { TabPage } from '@/components/shell/tab-page';
import { ChapterReader } from '@/components/education/chapter-reader';
import { CHAPTERS, chapterByNumber } from '@/lib/education/course';
import films from '@/lib/education/films.json';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ chapter: String(c.number) }));
}

export default async function ChapterPage({ params }: { params: { chapter: string } }) {
  const session = await getServerSession(authOptions);
  const n = Number(params?.chapter);
  const chapter = Number.isFinite(n) ? chapterByNumber(n) : null;
  if (!chapter) notFound();
  if (!session) redirect(`/login?next=%2Feducation%2Fplaybook%2F${chapter.number}`);

  // A drill shows its film when one has been ingested; otherwise the steps carry it on their own.
  const filmFor = Object.fromEntries(
    Object.entries((films as { films?: Record<string, { url?: string }> }).films ?? {})
      .filter(([, v]) => typeof v?.url === 'string' && v.url.length > 0)
      .map(([k, v]) => [k, v.url as string]),
  );

  return (
    <TabPage
      eyebrow={`Chapter ${chapter.number}`}
      title={chapter.title}
      lede={chapter.subtitle}
      accent="#00FF9D"
      aside={
        <Link
          href="/education/playbook"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-[12.5px]
                     font-bold text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> All chapters
        </Link>
      }
    >
      <ChapterReader chapter={chapter} filmFor={filmFor} />
    </TabPage>
  );
}
