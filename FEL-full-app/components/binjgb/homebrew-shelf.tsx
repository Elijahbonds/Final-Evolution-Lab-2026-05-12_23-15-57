// components/binjgb/homebrew-shelf.tsx — BINJGB-SHELF-1: the Homebrew Shelf page body. The SERVER decides every branch
// (lib/binjgb/gate.ts): an age prompt for an unknown age; otherwise the shelf, with the load-your-own picker only when
// `picker` is true (both flags on AND a verified adult). With picker false the picker is not in the HTML at all.
//
// v1 has zero titles (OQ-10), so the shelf says "No games on the shelf." — real copy, not "coming soon".
// Credits are text only and one tap away (G5). No console names anywhere (OQ-11).
import Link from 'next/link';
import type { ShelfTitle } from '@/lib/binjgb/manifest';
import { AGE_PROMPT_COPY, SHELF_COPY } from '@/lib/binjgb/copy';
import { DeleteSaves } from './delete-saves';
import { LocalPlayerLazy } from './local-player-lazy';

export interface HomebrewShelfProps {
  titles: readonly ShelfTitle[];
  agePrompt: boolean;
  picker: boolean;
}

export function HomebrewShelf({ titles, agePrompt, picker }: HomebrewShelfProps) {
  return (
    <main className="mx-auto max-w-[700px] px-4 py-8" data-gb-shelf>
      <h1 className="fel-heading text-3xl font-bold text-white">{SHELF_COPY.title}</h1>
      {agePrompt ? (
        <div className="mt-4 fel-card rounded-xl p-5 text-sm text-white/75" data-gb-age-prompt>
          <p>{AGE_PROMPT_COPY.message}</p>
          <Link href={AGE_PROMPT_COPY.href} className="mt-3 inline-block font-bold text-[#00E5FF] hover:underline">{AGE_PROMPT_COPY.action}</Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-white/60">{SHELF_COPY.subtitle}</p>
          {titles.length === 0 ? (
            <p className="mt-6 text-sm text-white/70" data-gb-empty>{SHELF_COPY.empty}</p>
          ) : (
            <ul className="mt-6 space-y-2">
              {titles.map((t) => (
                <li key={t.slug}>
                  <Link href={`/play/gb-shelf/${t.slug}`} className="block rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.04]">{t.title}</Link>
                </li>
              ))}
            </ul>
          )}
          {picker ? <LocalPlayerLazy /> : null}
          <div className="mt-6"><DeleteSaves /></div>
        </>
      )}
      <nav className="mt-8 flex gap-4 text-sm">
        <Link href="/credits" className="text-[#00E5FF] hover:underline">{SHELF_COPY.credits}</Link>
        <Link href="/play" className="text-white/60 hover:text-white">{SHELF_COPY.back}</Link>
      </nav>
    </main>
  );
}
