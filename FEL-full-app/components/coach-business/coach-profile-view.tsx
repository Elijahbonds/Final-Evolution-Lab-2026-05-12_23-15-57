// COACH-BUSINESS: a coach's public page — who they are, results clients chose to share, packages, and the coach store's
// own listings when the coach sells there. Presentational: app/coach/[slug]/page.tsx loads and filters everything (no
// client is named here, and only adult-approved highlights ever arrive — lib/coach-business/profile.ts).
import Link from 'next/link';
import { PACKAGE_KIND_LABELS, packagePriceLabel, type CoachPackage, type PackageAction } from '@/lib/coach-business/packages';
import { goalLabel, sportLabel } from '@/lib/coach-business/market';
import type { PublicHighlight, PublicProfile } from '@/lib/coach-business/profile';
import { PAYMENTS_NOT_LIVE } from '@/lib/coach-business/config';
import { ApplyForm, PackageCta } from './package-actions';
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
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-white" data-coach-profile>
      {p.testMode ? <p className="mb-4 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm">TEST MODE. Card 4242 4242 4242 4242.</p> : null}
      {p.marketOn ? <Link href="/coaches" className="text-xs font-bold uppercase tracking-widest text-cyan-300/80">← Find a coach</Link> : <p className="text-xs uppercase tracking-widest text-white/50">Final Evolution</p>}

      <header className="mt-2">
        <h1 className="text-3xl font-black leading-tight">{profile.displayName}</h1>
        {profile.headline ? <p className="mt-2 text-lg text-white/80">{profile.headline}</p> : null}
        {profile.specialties.length || p.sports.length ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Specialties">
            {[...profile.specialties, ...p.sports.map(sportLabel)].map((s) => (
              <li key={s} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">{s}</li>
            ))}
          </ul>
        ) : null}
        {profile.certifications.length ? <p className="mt-3 text-sm text-white/60">Certifications: {profile.certifications.join(' · ')}</p> : null}
        {!p.acceptingClients ? <p className="mt-3 text-sm font-bold text-amber-200">Not taking new clients right now.</p> : null}
      </header>

      {profile.bio ? (
        <section className="mt-6" aria-labelledby="about">
          <h2 id="about" className="text-sm font-bold uppercase tracking-wider text-white/50">About</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/80">{profile.bio}</p>
          {p.goals.length ? <p className="mt-3 text-sm text-white/60">Helps with: {p.goals.map(goalLabel).join(' · ')}</p> : null}
        </section>
      ) : null}

      {p.highlights.length ? (
        <section className="mt-8" aria-labelledby="results" data-results>
          <h2 id="results" className="text-sm font-bold uppercase tracking-wider text-white/50">Results</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {p.highlights.map((h) => (
              <li key={h.id} className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm leading-relaxed text-white/85">
                <p>“{h.text}”</p>
                <p className="mt-2 text-xs text-white/40">Shared by a client</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {priced.length ? (
        <section className="mt-8" aria-labelledby="packages" data-packages>
          <h2 id="packages" className="text-sm font-bold uppercase tracking-wider text-white/50">Packages</h2>
          {!p.paymentsLive && anyApply ? (
            <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70" data-payments-not-live>
              {PAYMENTS_NOT_LIVE} Apply and the coach will reply.
            </p>
          ) : null}
          <ul className="mt-3 space-y-3">
            {priced.map((k) => (
              <li key={k.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" data-package={k.kind}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold">{k.title}</h3>
                  <p className="text-base font-black text-cyan-200">{packagePriceLabel(k.priceCents, k.kind)}</p>
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/40">
                  {PACKAGE_KIND_LABELS[k.kind]}{k.sessions ? ` · ${k.sessions} sessions` : ''}{k.spotsLeft !== null && k.spotsLeft > 0 ? ` · ${k.spotsLeft} ${k.spotsLeft === 1 ? 'spot' : 'spots'} open` : ''}
                </p>
                {k.summary ? <p className="mt-2 text-sm text-white/70">{k.summary}</p> : null}
                <ul className="mt-3 space-y-1 text-sm text-white/80">
                  {k.includes.map((line) => <li key={line} className="flex gap-2"><span aria-hidden="true" className="text-cyan-300">✓</span><span>{line}</span></li>)}
                </ul>
                {k.action === 'book' ? <FeeBreakdown priceCents={k.priceCents} kind={k.kind} /> : null}
                <div className="mt-4">{k.action ? <PackageCta slug={profile.slug} packageId={k.id} action={k.action} /> : null}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {p.store && p.store.listings.length ? (
        <section className="mt-8" aria-labelledby="store">
          <h2 id="store" className="text-sm font-bold uppercase tracking-wider text-white/50">Sessions and programs</h2>
          {p.store.lines.map((line) => <p key={line} className="mt-1 text-sm text-white/60">{line}</p>)}
          <ul className="mt-3 space-y-3">
            {p.store.listings.map((l) => (
              <li key={l.id} className="rounded-2xl border border-white/10 p-4">
                <h3 className="font-bold">{l.title}</h3>
                {l.description ? <p className="text-sm text-white/60">{l.description}</p> : null}
                <p className="mt-2 text-sm font-bold">{l.priceLabel}</p>
                <Link href={l.href} className="mt-3 inline-block rounded-xl bg-cyan-300 px-3 py-2 text-sm font-bold text-black">View</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {p.marketOn && p.acceptingClients ? (
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-labelledby="work-together">
          <h2 id="work-together" className="text-lg font-bold">Work with {profile.displayName}</h2>
          <p className="mt-1 text-sm text-white/60">Tell the coach your goal. They reply by email.</p>
          <div className="mt-3"><ApplyForm slug={profile.slug} label="Apply to train" /></div>
          <p className="mt-3 text-xs text-white/50" data-guardian-line>Under 18? A parent or guardian contacts the coach, and the coach sends a join code your parent or guardian approves.</p>
        </section>
      ) : null}
    </main>
  );
}
