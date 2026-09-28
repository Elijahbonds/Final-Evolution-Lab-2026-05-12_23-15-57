import Link from 'next/link';
import { getApprovedProfile } from '@/lib/creator/creatorCatalog';
import { BUDGET_RANGES, INQUIRY_SOURCES } from '@/lib/creator/inquiry';
import { currentViewer } from '@/lib/creator/creatorViewer';
import { CreatorFrame, SectionTitle } from '@/components/creator-platform/creator-frame';
import { InquiryForm } from '@/components/creator-platform/inquiry-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Work with us — Final Evolution Lab' };

export default async function WorkWithUsPage({ searchParams }: { searchParams: { profile?: string; source?: string } }) {
  const viewer = await currentViewer();
  const profile = searchParams.profile ? getApprovedProfile(searchParams.profile) : undefined;
  const requested = searchParams.source ?? (profile ? 'team-profile' : 'work-with-us');
  const source = (INQUIRY_SOURCES as readonly string[]).includes(requested) ? requested : 'work-with-us';

  return (
    <CreatorFrame
      signedIn={viewer.signedIn}
      title={<>Work <span className="text-[#F5C518]">with us</span></>}
      lede="Brand partnerships, appearances and custom work. Tell us what you have in mind."
    >
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#101010] p-5">
        <SectionTitle>{profile ? `Inquiry for ${profile.name}` : 'Inquiry'}</SectionTitle>
        <InquiryForm budgets={BUDGET_RANGES} profile={profile?.slug ?? null} source={source} />
        <p className="mt-4 text-[11px] text-white/35">
          We store what you send here to reply to you. See the <Link href="/privacy" className="underline">privacy policy</Link>.
        </p>
      </section>
    </CreatorFrame>
  );
}
