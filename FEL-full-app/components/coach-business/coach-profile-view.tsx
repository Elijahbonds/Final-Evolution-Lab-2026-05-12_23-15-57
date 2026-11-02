// COACH-BUSINESS: a coach's public page — who they are, results clients chose to share, packages, and the coach store's
// own listings when the coach sells there. Presentational: app/coach/[slug]/page.tsx loads and filters everything (no
// client is named here, and only adult-approved highlights ever arrive — lib/coach-business/profile.ts).
import Link from 'next/link';
import { PACKAGE_KIND_LABELS, type CoachPackage, type PackageAction } from '@/lib/coach-business/packages';
import { goalLabel, sportLabel } from '@/lib/coach-business/market';
import type { PublicHighlight, PublicProfile } from '@/lib/coach-business/profile';
import { PAYMENTS_NOT_LIVE } from '@/lib/coach-business/config';
import { ApplyForm, PackageBuy } from './package-actions';
import { cardLine, coachPackageItem } from '@/lib/shop/model';
import { ProductCard } from '@/components/shop/product-card';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { FeeBreakdown } from './fee-breakdown';

export interface ProfilePackage extends CoachPackage { spotsLeft: number | null; action: PackageAction | null }

export interface StoreListingCard { id: string; title: string; description: string | null; priceLabel: string; href: string }

export interface CoachProfileViewProps {
  profile: PublicProfile;
  sports: string[];
  goals: string[];
  highlights: PublicHighlight[];
  packages: ProfilePackage[];
  /** The coach store's listings (the owner's own store), when the store is on and this coach sells there. */
  store: { listings: StoreListingCard[]; lines: string[] } | null;
  paymentsLive: boolean;
  testMode: boolean;
  acceptingClients: boolean;
  /** Marketplace on: applying is open and the page links back to /coaches. */
  marketOn: boolean;
}

export function CoachProfileView(p: CoachProfileViewProps) {
  const { profile } = p;
  const priced = p.packages.filter((k) => k.action !== null);
  const anyApply = priced.some((k) => k.action === 'apply');
  // PLAT-P07 (2026-11-02): the shop front's shape — a hero (name, headline, the tags), the packages as the one product
  // card with the one buy sheet behind Book (components/shop), Opens soon where a package cannot be bought yet, then the
  // coach store's listings as the same card, then Apply. The bio and results sit below the packages.
  return (
    <main className={L.page} data-coach-profile>
      {p.testMode ? <p className="mb-4 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm">TEST MODE. Card 4242 4242 4242 4242.</p> : null}
      {p.marketOn ? <Link href="/coaches" className={L.eyebrow}>← Find a coach</Link> : <p className={L.eyebrow}>Coach</p>}

      <header>
        <h1 className={L.title}>{profile.displayName}</h1>
        {profile.headline ? <p className={L.lede}>{profile.headline}</p> : null}
        {profile.specialties.length || p.sports.length ? (
          <ul className={`${L.chips} mt-3`} aria-label="Specialties">
            {[...profile.specialties, ...p.sports.map(sportLabel)].map((s) => (
              <li key={s} className={`${L.chip} ${L.chipOn}`}>{s}</li>
            ))}
          </ul>
        ) : null}
        {!p.acceptingClients ? <p className={L.owned.replace('text-[#7BD389]', 'text-amber-200')}>Not taking new clients right now.</p> : null}
      </header>

      {priced.length ? (
        <section className={L.section} aria-labelledby="packages" data-packages>
          <h2 id="packages" className={L.sectionTitle}>Packages</h2>
          {!p.paymentsLive && anyApply ? (
            <p className={`${L.lede} mb-3 mt-0`} data-payments-not-live>{PAYMENTS_NOT_LIVE} Apply and the coach will reply.</p>
          ) : null}
          <ul className={L.grid}>
            {priced.map((k) => {
              const item = coachPackageItem(k);
              const meta = `${PACKAGE_KIND_LABELS[k.kind]}${k.sessions ? ` · ${k.sessions} sessions` : ''}${k.spotsLeft !== null && k.spotsLeft > 0 ? ` · ${k.spotsLeft} ${k.spotsLeft === 1 ? 'spot' : 'spots'} open` : ''}`;
              return (
                <li key={k.id} data-package={k.kind}>
                  <ProductCard item={item} side={k.action === 'full' ? 'Full' : [k.sessions ? `${k.sessions} sessions` : null, k.spotsLeft !== null && k.spotsLeft > 0 ? `${k.spotsLeft} open` : null].filter(Boolean).join(' · ') || null}>
                    <PackageBuy slug={profile.slug} item={item} includes={[meta, ...k.includes]} />
                  </ProductCard>
                  {k.action === 'book' ? <FeeBreakdown priceCents={k.priceCents} kind={k.kind} /> : null}
                  {k.action === 'apply' ? <div className="mt-2"><ApplyForm slug={profile.slug} packageId={k.id} /></div> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {p.store && p.store.listings.length ? (
        <section className={L.section} aria-labelledby="store">
          <h2 id="store" className={L.sectionTitle}>Sessions and programs</h2>
          <ul className={L.grid}>
            {p.store.listings.map((l) => (
              <li key={l.id}>
                <ProductCard item={{ id: l.id, kind: 'store_listing', title: l.title, oneLine: cardLine(l.title, l.description, l.priceLabel), priceLabel: l.priceLabel, cadence: 'once', state: 'buy' }} href={l.href} />
              </li>
            ))}
          </ul>
          {p.store.lines.map((line) => <p key={line} className={`${L.lede} mt-2`}>{line}</p>)}
        </section>
      ) : null}

      {profile.bio ? (
        <section className={L.section} aria-labelledby="about">
          <h2 id="about" className={L.sectionTitle}>About</h2>
          <p className={`${L.lede} mt-0 whitespace-pre-line`}>{profile.bio}</p>
          {p.goals.length ? <p className={L.lede}>Helps with: {p.goals.map(goalLabel).join(' · ')}</p> : null}
          {profile.certifications.length ? <p className={L.lede}>Certifications: {profile.certifications.join(' · ')}</p> : null}
        </section>
      ) : null}

      {p.highlights.length ? (
        <section className={L.section} aria-labelledby="results" data-results>
          <h2 id="results" className={L.sectionTitle}>Results</h2>
          <ul className={L.grid}>
            {p.highlights.map((h) => (
              <li key={h.id} className={L.card}>
                <p className={L.cardLine}>“{h.text}”</p>
                <p className={L.cardSide}>Shared by a client</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {p.marketOn && p.acceptingClients ? (
        <section className={`${L.section} ${L.card}`} aria-labelledby="work-together">
          <h2 id="work-together" className={L.cardTitle}>Work with {profile.displayName}</h2>
          <p className={L.cardLine}>Tell the coach your goal. They reply by email.</p>
          <div className="mt-3"><ApplyForm slug={profile.slug} label="Apply to train" /></div>
          <p className={`${L.cardSide} mt-3 normal-case tracking-normal`} data-guardian-line>Under 18? A parent or guardian contacts the coach, and the coach sends a join code your parent or guardian approves.</p>
        </section>
      ) : null}
    </main>
  );
}
