import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PUBLIC_PAGE_COPY, getApprovedProfile } from '@/lib/creator/creatorCatalog';
import { BUDGET_RANGES, INQUIRIES_UNAVAILABLE_MESSAGE, INQUIRY_SOURCES } from '@/lib/creator/inquiry';
import { inquiriesReady, type RawDb } from '@/lib/creator/inquiryStore';
import { currentViewer } from '@/lib/creator/creatorViewer';
import { CreatorFrame, SectionTitle } from '@/components/creator-platform/creator-frame';
import { InquiryForm } from '@/components/creator-platform/inquiry-form';
import { OwnerCopy } from '@/components/public-copy/owner-copy';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Work with us — Final Evolution Lab' };

export default async function WorkWithUsPage({ searchParams }: { searchParams: { profile?: string; source?: string } }) {
  const viewer = await currentViewer();
  // The form needs the CreatorInquiry table (pending SQL). Until it exists, say so instead of taking input we cannot keep.
  const open = await inquiriesReady(prisma as unknown as RawDb);
  const profile = searchParams.profile ? getApprovedProfile(searchParams.profile) : undefined;
  const requested = searchParams.source ?? (profile ? 'team-profile' : 'work-with-us');
  const source = (INQUIRY_SOURCES as readonly string[]).includes(requested) ? requested : 'work-with-us';

  return (
    <CreatorFrame
      signedIn={viewer.signedIn}
      title={<>Work <span className="text-[#F5C518]">with us</span></>}
      lede={PUBLIC_PAGE_COPY.workWithUs.lede}
    >
      {/* ONB-05: Appendix B as approved (2026-10-20); [OWNER: …] marks a blank the owner still fills. */}
      <OwnerCopy parts={PUBLIC_PAGE_COPY.workWithUs.body} className="mt-6 max-w-2xl text-sm leading-relaxed text-white/75" />
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#101010] p-5">
        <SectionTitle>{profile ? `Inquiry for ${profile.name}` : 'Inquiry'}</SectionTitle>
        {open ? (
          <>
            <InquiryForm budgets={BUDGET_RANGES} profile={profile?.slug ?? null} source={source} />
            <p className="mt-4 text-[11px] text-white/35">
              We store your name, email and message to reply to you, and delete them after 12 months. See the <Link href="/privacy" className="underline">privacy policy</Link>.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80" role="status">
            {INQUIRIES_UNAVAILABLE_MESSAGE} You can reach us through <Link href="/support" className="underline">Support</Link>.
          </p>
        )}
      </section>
    </CreatorFrame>
  );
}
