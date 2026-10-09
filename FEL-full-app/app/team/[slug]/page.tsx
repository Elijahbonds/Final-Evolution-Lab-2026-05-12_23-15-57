import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUsd } from '@/lib/books/bookCatalog';
import { approvedProducts, approvedServices, getApprovedProfile, startingAtCents } from '@/lib/creator/creatorCatalog';
import { printfulConfig } from '@/lib/creator/printful';
import { createOnboardingLink } from '@/lib/creator/payouts';
import { canSeePayouts, currentViewer } from '@/lib/creator/creatorViewer';
import { CreatorFrame, ExampleBadge, ProfilePhoto, SectionTitle } from '@/components/creator-platform/creator-frame';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }) {
  const profile = getApprovedProfile(params.slug);
  return { title: profile ? `${profile.name} — Final Evolution Team` : 'Team' };
}

/** Connect is a stub: disabled by default, and "not implemented" even when switched on. */
async function payoutState(slug: string): Promise<string> {
  try {
    return (await createOnboardingLink(slug)).reason;
  } catch {
    return 'NOT_IMPLEMENTED';
  }
}

export default async function TeamProfilePage({ params }: { params: { slug: string } }) {
  // Unknown and unapproved slugs are the same 404.
  const profile = getApprovedProfile(params.slug);
  if (!profile) notFound();

  const viewer = await currentViewer();
  const services = approvedServices(profile);
  const products = approvedProducts(profile);
  const merchLive = printfulConfig().enabled;
  const from = startingAtCents(profile);
  const payouts = canSeePayouts(viewer, profile) ? await payoutState(profile.slug) : null;

  return (
    <CreatorFrame signedIn={viewer.signedIn} title={profile.name} lede={profile.specialty}>
      <p className="mt-6 text-xs text-white/40">
        <Link href="/team" className="hover:text-white">Team</Link>
        <span> / {profile.name}</span>
      </p>

      <section className="mt-4 grid gap-6 md:grid-cols-[180px_1fr]">
        <ProfilePhoto name={profile.name} photoUrl={profile.photoUrl} size="lg" />
        <div>
          <SectionTitle>Bio</SectionTitle>
          <p className="mt-2 text-sm text-white/70">{profile.bio}</p>
          {from != null ? (
            <p className="mt-4 text-sm text-white">
              Starting at <span className="font-semibold">{formatUsd(from)}</span>
              <ExampleBadge />
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/work-with-us?profile=${profile.slug}`}
              className="rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd84a]"
            >
              Request a quote
            </Link>
            <Link href="/media-kit" className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:border-white/40">
              Media kit
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Reels</SectionTitle>
          {profile.reels.length === 0 ? (
            <p className="mt-2 text-sm text-white/45">Reel links placeholder.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {profile.reels.map((r) => (
                <li key={r.href}><a className="text-[#F5C518] hover:underline" href={r.href} target="_blank" rel="noopener noreferrer">{r.label}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SectionTitle>Links</SectionTitle>
          {profile.socials.length === 0 ? (
            <p className="mt-2 text-sm text-white/45">Social links placeholder.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {profile.socials.map((s) => (
                <li key={s.href}>
                  {s.href.startsWith('/') ? (
                    <Link className="text-[#F5C518] hover:underline" href={s.href}>{s.label}</Link>
                  ) : (
                    <a className="text-[#F5C518] hover:underline" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle>Services</SectionTitle>
        {profile.hoursAreExample ? <p className="mt-1 text-[11px] text-white/40">Open hours are EXAMPLE hours until confirmed.</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-[#141414] p-4">
              <p className="text-sm font-semibold text-white">{s.name}</p>
              <p className="mt-1 text-xs text-white/50">{s.durationMinutes} min · {s.description}</p>
              <p className="mt-2 text-sm text-white">
                Starting at {formatUsd(s.priceCents)}
                {s.priceIsExample ? <ExampleBadge /> : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/team/${profile.slug}/book/${encodeURIComponent(s.id)}`}
                  className="rounded-md bg-[#F5C518] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#ffd84a]"
                >
                  Book a time
                </Link>
                <Link
                  href={`/work-with-us?profile=${profile.slug}`}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-white/40"
                >
                  Request a quote
                </Link>
              </div>
            </div>
          ))}
          {services.length === 0 ? <p className="text-sm text-white/45">No services are listed yet.</p> : null}
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle>Merch</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {products.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-[#141414] p-4">
              <p className="text-sm font-semibold text-white">{p.name}</p>
              <p className="mt-1 text-xs text-white/60">
                {formatUsd(p.priceCents)}
                {p.priceIsExample ? <ExampleBadge /> : null}
              </p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                {merchLive ? 'Checkout not open yet' : 'Coming soon'}
              </p>
            </div>
          ))}
        </div>
        {products.length === 0 ? <p className="mt-2 text-sm text-white/45">No merch yet.</p> : null}
      </section>

      {payouts ? (
        <section className="mt-10 rounded-2xl border border-[#F5C518]/30 bg-[#161206] p-5">
          <SectionTitle>Payouts</SectionTitle>
          <p className="mt-2 text-sm text-white">Get paid: coming soon</p>
          <p className="mt-1 text-[11px] text-white/45">
            Only you and admins see this block. Stripe Connect onboarding is not built yet ({payouts}).
          </p>
        </section>
      ) : null}
    </CreatorFrame>
  );
}
