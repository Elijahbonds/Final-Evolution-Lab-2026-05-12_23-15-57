import { notFound } from 'next/navigation';
import { PlayShelf } from '@/components/shell/play-shelf';
import { SHELF_LEDE } from '@/lib/nav/families';
import { TabPage } from '@/components/shell/tab-page';

export const dynamic = 'force-dynamic';

/**
 * A dev view of the Play shelf with no session, so the design can be looked at at both widths without an account —
 * the same reason /dev/mode exists for the game modes. It renders the real components, not a mock, so what is
 * reviewed here is what ships.
 *
 * Hard 404 outside `next dev`, like every other app/dev page (bug sweep 2026-10-14: this one and /dev/shelf/cards had no
 * gate and were being served on the live site).
 */
export default function DevShelfPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <TabPage
      eyebrow="Play"
      title="Pick your lane"
      lede={SHELF_LEDE}
      accent="#00E5FF"
    >
      <PlayShelf />
    </TabPage>
  );
}
