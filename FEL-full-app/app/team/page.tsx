import Link from 'next/link';
import { approvedProfiles, startingAtCents } from '@/lib/creator/creatorCatalog';
import { formatUsd } from '@/lib/books/bookCatalog';
import { CreatorFrame, ExampleBadge, ProfilePhoto, SectionTitle } from '@/components/creator-platform/creator-frame';
import { currentViewer } from '@/lib/creator/creatorViewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team — Final Evolution Lab' };

export default async function TeamPage() {
  const viewer = await currentViewer();
  const profiles = approvedProfiles();

  return (
    <CreatorFrame
      signedIn={viewer.signedIn}
      title={<>Final Evolution <span className="text-[#F5C518]">Team</span></>}
      lede="Book a session, request a quote, or pick up merch from the people behind FEL."
    >
      <section className="mt-8">
        <SectionTitle>Profiles</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => {
            const from = startingAtCents(profile);
            return (
              <Link
                key={profile.slug}
                href={`/team/${profile.slug}`}
                className="flex gap-4 rounded-2xl border border-white/10 bg-[#101010] p-4 hover:border-white/30"
              >
                <ProfilePhoto name={profile.name} photoUrl={profile.photoUrl} />
                <div className="min-w-0">
                  <p className="fel-heading text-2xl text-white">{profile.name}</p>
                  <p className="text-xs text-white/50">{profile.specialty}</p>
                  {from != null ? (
                    <p className="mt-2 text-sm text-white/80">
                      From {formatUsd(from)}
                      <ExampleBadge />
                    </p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
        {profiles.length === 0 ? <p className="mt-3 text-sm text-white/50">No profiles are published yet.</p> : null}
      </section>
    </CreatorFrame>
  );
}
