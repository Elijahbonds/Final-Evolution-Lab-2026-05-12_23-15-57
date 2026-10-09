import Link from 'next/link';
import type { Metadata } from 'next';
import { CopyCode } from './copy-code';
import {
  AFFILIATE_DISCLOSURE,
  HUB_SECTION_TITLES,
  LINKS_DESCRIPTION,
  LINKS_SHARE_IMAGE,
  LINKS_TITLE,
  hubLinkRel,
  hubLinkTarget,
  visibleHubItems,
  type HubItem,
} from '@/lib/links/hub';

/**
 * /links — the public bio page. No session, no database, no 3D, no tracking.
 * /books redirects here at #books. lib/links/hub.test.tsx pins the list.
 */
export const metadata: Metadata = {
  title: LINKS_TITLE,
  description: LINKS_DESCRIPTION,
  openGraph: {
    type: 'website',
    title: LINKS_TITLE,
    description: LINKS_DESCRIPTION,
    images: [{ url: LINKS_SHARE_IMAGE, width: 1200, height: 630, alt: 'Final Evolution' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: LINKS_TITLE,
    description: LINKS_DESCRIPTION,
    images: [LINKS_SHARE_IMAGE],
  },
};

const primary = 'flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[#00E5FF] px-5 py-3 text-center text-[17px] font-black leading-tight text-black';
const outline = 'flex min-h-[56px] w-full items-center justify-center rounded-2xl border-2 border-[#00E5FF] px-5 py-3 text-center text-[17px] font-bold leading-tight text-[#00E5FF]';
const quiet = 'flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-[17px] font-bold leading-tight text-white';

function ItemLink({ item, first }: { item: HubItem; first: boolean }) {
  const className = item.kind === 'internal' ? (first ? primary : outline) : quiet;
  const rel = hubLinkRel(item);
  const target = hubLinkTarget(item);
  const described = item.kind === 'affiliate' ? 'affiliate-disclosure' : undefined;
  const inner = <span data-label>{item.label}</span>;
  if (item.kind === 'internal') {
    return (
      <Link href={item.url!} prefetch={false} data-link={item.id} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={item.url!}
      target={target ?? undefined}
      rel={rel ?? undefined}
      data-link={item.id}
      aria-describedby={described}
      className={className}
    >
      {inner}
    </a>
  );
}

export default function LinksPage() {
  const items = visibleHubItems();
  const main = items.filter((item) => item.section !== 'follow');
  const follow = items.filter((item) => item.section === 'follow');
  let lastSection: HubItem['section'];
  let disclosurePlaced = false;
  const lastAffiliate = [...main].reverse().find((item) => item.kind === 'affiliate')?.id;

  return (
    <main data-links-hub className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-10">
        <header className="mb-8">
          <p className="font-display text-[13px] font-bold uppercase tracking-[0.22em] text-[#00E5FF]">Final Evolution</p>
          <h1 className="mt-2 font-display text-[40px] font-black leading-none tracking-tight">Links</h1>
        </header>
        <div className="flex flex-col gap-3">
          {main.map((item, index) => {
            const heading = item.section && item.section !== lastSection ? item.section : null;
            lastSection = item.section;
            const showDisclosure = item.id === lastAffiliate && !disclosurePlaced;
            if (showDisclosure) disclosurePlaced = true;
            return (
              <div key={item.id} data-item={item.id}>
                {heading ? (
                  <h2 id={heading} className="mb-3 mt-5 font-display text-[13px] font-bold uppercase tracking-[0.18em] text-white/55">
                    {HUB_SECTION_TITLES[heading]}
                  </h2>
                ) : null}
                <ItemLink item={item} first={index === 0} />
                {item.code ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-2">
                    <p className="text-[15px] leading-tight">
                      <span className="text-white/55">Code </span>
                      <span data-code className="font-mono text-[16px] font-bold tracking-wide text-[#FFD700]">{item.code}</span>
                    </p>
                    <CopyCode code={item.code} />
                  </div>
                ) : null}
                {showDisclosure ? (
                  <p id="affiliate-disclosure" data-affiliate-disclosure className="mt-2 px-1 text-center text-[13px] leading-snug text-white/75">
                    {AFFILIATE_DISCLOSURE}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {follow.length > 0 ? (
          <nav aria-label={HUB_SECTION_TITLES.follow} data-follow className="mt-8">
            <h2 id="follow" className="mb-1 font-display text-[13px] font-bold uppercase tracking-[0.18em] text-white/55">
              {HUB_SECTION_TITLES.follow}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {follow.map((item) => (
                <a
                  key={item.id}
                  href={item.url!}
                  target={hubLinkTarget(item) ?? undefined}
                  rel={hubLinkRel(item) ?? undefined}
                  data-link={item.id}
                  className="inline-flex min-h-[44px] items-center text-[14px] font-semibold leading-tight text-white/80"
                >
                  <span data-label>{item.label}</span>
                </a>
              ))}
            </div>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
