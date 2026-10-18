import Link from 'next/link';
import { approvedProfiles, coachStoreBookHref, publicProfileSpecialty } from '@/lib/creator/creatorCatalog';
import { bookHrefWhenStoreOpen } from '@/lib/creator/coachStoreLink';
import { CreatorFrame, ProfilePhoto, SectionTitle } from '@/components/creator-platform/creator-frame';
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
      lede="Meet the people behind FEL. Book a session through the coach store, or request a quote."
    >
      <section className="mt-8">
        <SectionTitle>Profiles</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => {
            const bookHref = bookHrefWhenStoreOpen(coachStoreBookHref(profile));
            return (
              <div
                key={profile.slug}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#101010] p-4 hover:border-white/30"
              >
                <Link href={`/team/${profile.slug}`} className="flex gap-4">
                  <ProfilePhoto name={profile.name} photoUrl={profile.photoUrl} />
                  <div className="min-w-0">
                    <p className="fel-heading text-2xl text-white">{profile.name}</p>
                    <p className="text-xs text-white/50">{publicProfileSpecialty(profile)}</p>
                  </div>
                </Link>
                {bookHref ? (
                  <Link
                    href={bookHref}
                    className="self-start rounded-md bg-[#F5C518] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#ffd84a]"
                  >
                    Book
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
        {profiles.length === 0 ? <p className="mt-3 text-sm text-white/50">No profiles are published yet.</p> : null}
      </section>
    </CreatorFrame>
  );
}
