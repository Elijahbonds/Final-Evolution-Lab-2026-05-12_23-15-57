import Link from 'next/link';
import { formatUsd } from '@/lib/books/bookCatalog';
import {
  AUDIENCE_STATS,
  MEDIA_KIT,
  mediaKitHighlightsForDisplay,
  mediaKitProfile,
  packageDetailForDisplay,
  profileBioForDisplay,
} from '@/lib/creator/creatorCatalog';
import { currentViewer } from '@/lib/creator/creatorViewer';
import { CreatorFrame, ExampleBadge, ProfilePhoto, SectionTitle } from '@/components/creator-platform/creator-frame';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Media kit — Final Evolution Lab' };

export default async function MediaKitPage() {
  const viewer = await currentViewer();
  const profile = mediaKitProfile();
  const audience = AUDIENCE_STATS;
  const highlights = mediaKitHighlightsForDisplay(MEDIA_KIT);

  return (
    <CreatorFrame
      signedIn={viewer.signedIn}
      title={<>Media <span className="text-[#F5C518]">kit</span></>}
      lede="For brands and partners. Numbers and rates marked EXAMPLE are unconfirmed until Elijah approves them."
    >
      <section className="mt-8 grid gap-6 md:grid-cols-[180px_1fr]">
        {profile ? <ProfilePhoto name={profile.name} photoUrl={profile.photoUrl} size="lg" /> : null}
        <div>
          <SectionTitle>Bio</SectionTitle>
          <p className="fel-heading mt-1 text-3xl text-white">{profile?.name ?? 'Final Evolution Lab'}</p>
          <p className="mt-2 text-sm text-white/70">{profileBioForDisplay(profile)}</p>
          <Link href="/work-with-us?source=media-kit" className="mt-4 inline-block rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd84a]">
            Inquire
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle>Highlights</SectionTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
          {highlights.map((h) => <li key={h}>{h}</li>)}
        </ul>
      </section>

      <section className="mt-10">
        <div className="flex items-center">
          <SectionTitle>Audience</SectionTitle>
          {audience.isExample ? <ExampleBadge label="Example data" /> : null}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {audience.stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-[#141414] p-4">
              <p className="text-[11px] uppercase tracking-wider text-white/45">{s.label}</p>
              <p className="fel-heading mt-1 text-3xl text-white">{s.value}</p>
            </div>
          ))}
        </div>
        {audience.isExample ? (
          <p className="mt-2 text-[11px] text-white/35">Fixture numbers, not real stats.</p>
        ) : null}
      </section>

      <section className="mt-10">
        <div className="flex items-center">
          <SectionTitle>Past partners</SectionTitle>
          {MEDIA_KIT.partnersConfirmed ? null : <ExampleBadge label="Unconfirmed" />}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MEDIA_KIT.pastPartners.map((name) => (
            <span key={name} className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80">{name}</span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle>Packages and rates</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {MEDIA_KIT.packages.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-[#141414] p-4">
              <p className="text-sm font-semibold text-white">{p.name}</p>
              <p className="mt-1 text-xs text-white/50">{packageDetailForDisplay(p)}</p>
              <p className="mt-2 text-sm text-white">
                From {formatUsd(p.priceCents)}
                {p.priceIsExample ? <ExampleBadge /> : null}
              </p>
            </div>
          ))}
        </div>
        <Link href="/work-with-us?source=media-kit" className="mt-4 inline-block rounded-md bg-[#F5C518] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd84a]">
          Inquire
        </Link>
      </section>
    </CreatorFrame>
  );
}
