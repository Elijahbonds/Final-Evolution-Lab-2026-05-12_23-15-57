// HIGHLIGHTS (PROFILE V2): the moments pinned to your creator card, and a labelled "Coming" block for the auto-cut
// clips (FEL keeps no video on the server today; a replay is saved on the phone from a game's menu).
import Link from 'next/link';
import { Star } from 'lucide-react';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { Section, Card, Coming } from './section';

export function HighlightsSection({ data, viewer = false }: { data: ProfileV2Data; viewer?: boolean }) {
  const pinned = data.highlights.pinned;
  if (viewer && !pinned.length) return null;
  return (
    <Section id="highlights" title="Highlights" purpose="Your best moments, pinned." accent="#00E5FF">
      <div className="grid gap-3 md:grid-cols-2">
        {pinned.length > 0 && (
          <Card>
            <ul className="space-y-2">
              {pinned.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-white/75"><Star className="h-3.5 w-3.5 shrink-0 text-[#FFD700]" aria-hidden /><span className="truncate">{h.label || h.name}</span></span>
                  <span className="fel-heading shrink-0 text-[16px] font-black text-[#FFD700] tabular-nums">{h.score.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {!viewer && (
          <div>
            <Coming title="Auto-cut clips" text="Your best moment from each game, cut for you. Today, save the last 30 seconds from a game’s menu: it stays on your phone." />
            {!pinned.length && <Link href="/profile/edit#card" className="mt-2 inline-block text-[11.5px] font-bold text-white/55 underline-offset-2 hover:text-white hover:underline">Pin a best run to your card</Link>}
          </div>
        )}
      </div>
    </Section>
  );
}
