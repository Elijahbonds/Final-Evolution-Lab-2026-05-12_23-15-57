// E2E entry: /coach/<slug>/book/<listingId> for a live 1-on-1 listing. app/coach/[slug]/book/[listingId]/page.tsx is a
// server component (it reads the listing row); this renders what it renders for that row — the title, the price label
// and the real BookForm — with the row handed over as window.__RIG and the labels from the real lib/coach-store helpers.
import { createRoot } from 'react-dom/client';
import { BookForm } from '@/components/coach-store/book-form';
import { parseManifest } from '@/lib/coach-store/manifest';
import { continueLabel, listingPriceLabel } from '@/lib/coach-store/priceLabel';

const rig = (window as unknown as { __RIG: { slug: string; listing: { id: string; title: string; priceUsd: number; manifest: string } } }).__RIG;
const manifest = parseManifest(rig.listing.manifest);
if (!manifest || manifest.kind !== 'live_1on1') throw new Error('coach-book entry: the fixture listing is not a live 1-on-1');

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-xl px-4 py-8">
    <h1 className="mb-4 text-2xl font-black text-white">{rig.listing.title}</h1>
    <p className="mb-4 text-sm font-bold text-white">{listingPriceLabel(rig.listing.priceUsd, manifest)}</p>
    <BookForm slug={rig.slug} listingId={rig.listing.id} kind="live_1on1" durationMin={manifest.durationMin} audience="adult" continueLabel={continueLabel(rig.listing.priceUsd, manifest)} />
  </main>,
);
