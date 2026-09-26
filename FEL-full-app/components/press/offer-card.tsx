import Link from 'next/link';
import { AMAZON_AUTHOR_URL, formatLabel, formatUsd, kindleUrl, type BookOffer, type BookTitle } from '@/lib/books/bookCatalog';
import { BuyButton } from './buy-button';

export function OfferCard({ book, offer, prominent = false }: { book: BookTitle; offer: BookOffer; prominent?: boolean }) {
  const amazon = kindleUrl(book);
  const border = offer.format === 'bundle' ? 'border-[#F5C518]' : 'border-white/10';
  return (
    <div className={`flex flex-col rounded-xl border ${border} bg-[#141414] p-3 ${prominent ? 'min-h-[148px]' : ''}`}>
      <p className="text-[11px] uppercase tracking-wider text-white/45">{formatLabel(offer.format)}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-white">{formatUsd(offer.priceCents)}</span>
        {offer.priceIsExample ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#ff6b6b]">Example</span>
        ) : null}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-white/40">
        {offer.format === 'ebook' && 'Download, or send to Kindle.'}
        {offer.format === 'audiobook' && 'Stream in FEL, or download.'}
        {offer.format === 'bundle' && 'Save vs buying separately.'}
      </p>
      <div className="mt-auto pt-3">
        {offer.directSale ? (
          <BuyButton offerId={offer.id} label={offer.format === 'bundle' ? 'Buy bundle' : `Buy ${offer.format === 'ebook' ? 'ebook' : 'audiobook'}`} prominent={offer.format === 'bundle'} />
        ) : amazon ? (
          <a
            href={amazon}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-semibold text-[#F5C518] hover:underline"
          >
            Read on Kindle Unlimited
          </a>
        ) : (
          <p className="text-xs text-white/40">Not for direct sale</p>
        )}
        {offer.directSaleNote ? <p className="mt-2 text-[10px] leading-snug text-white/35">{offer.directSaleNote}</p> : null}
      </div>
    </div>
  );
}

export function KindleLink({ book, className = '' }: { book: BookTitle; className?: string }) {
  const amazon = kindleUrl(book);
  if (!amazon) return null;
  return (
    <a href={amazon} target="_blank" rel="noopener noreferrer" className={`text-xs text-white/60 hover:text-white ${className}`}>
      Kindle on Amazon
    </a>
  );
}

export function CatalogCard({ book }: { book: BookTitle }) {
  const audio = book.offers.find((o) => o.format === 'audiobook');
  const ebook = book.offers.find((o) => o.format === 'ebook');
  const primary = audio?.directSale ? audio : ebook?.directSale ? ebook : null;
  return (
    <article className="flex flex-col rounded-2xl border border-white/10 bg-[#121212] p-3">
      <Link href={`/press/${book.slug}`} className="block">
        <div className="aspect-[3/4] overflow-hidden rounded-xl">
          <div className="flex h-full flex-col justify-between bg-[#161616] p-3" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, #161616, #161616 8px, #1c1c1c 8px, #1c1c1c 9px)' }}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#F5C518]">Press</p>
            <p className="fel-heading text-lg leading-tight text-white">{book.title}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/30">{book.track ?? 'Elijah Bonds'}</p>
          </div>
        </div>
        <h3 className="mt-3 text-sm font-semibold text-white">{book.title}</h3>
      </Link>
      <p className="mt-1 text-[11px] text-white/40">{book.description}</p>
      {primary ? (
        <p className="mt-2 text-sm text-white">
          {formatUsd(primary.priceCents)}{' '}
          {primary.priceIsExample ? <span className="text-[10px] font-bold uppercase text-[#ff6b6b]">Example</span> : null}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {primary ? <BuyButton offerId={primary.id} label={primary.format === 'audiobook' ? 'Buy audiobook' : 'Buy ebook'} /> : null}
        {ebook && !ebook.directSale ? (
          <a href={kindleUrl(book) ?? AMAZON_AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#F5C518] hover:underline">
            Read on Kindle Unlimited
          </a>
        ) : null}
      </div>
    </article>
  );
}
