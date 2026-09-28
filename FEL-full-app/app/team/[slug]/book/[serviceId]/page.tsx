import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUsd } from '@/lib/books/bookCatalog';
import { getApprovedProfile, getBookableService } from '@/lib/creator/creatorCatalog';
import { currentViewer } from '@/lib/creator/creatorViewer';
import { CreatorFrame, ExampleBadge, SectionTitle } from '@/components/creator-platform/creator-frame';
import { SlotPicker } from '@/components/creator-platform/slot-picker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Book a time — Final Evolution Team' };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function BookServicePage({
  params,
  searchParams,
}: {
  params: { slug: string; serviceId: string };
  searchParams: { checkout?: string };
}) {
  const profile = getApprovedProfile(params.slug);
  const found = getBookableService(safeDecode(params.serviceId));
  if (!profile || !found || found.profile.slug !== profile.slug) notFound();
  const { service } = found;
  const viewer = await currentViewer();

  return (
    <CreatorFrame signedIn={viewer.signedIn} title="Book a time" lede={`${service.name} with ${profile.name}`}>
      <p className="mt-6 text-xs text-white/40">
        <Link href="/team" className="hover:text-white">Team</Link>
        <span> / </span>
        <Link href={`/team/${profile.slug}`} className="hover:text-white">{profile.name}</Link>
        <span> / Book</span>
      </p>
      {searchParams.checkout === 'cancel' ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          Checkout cancelled. Nothing was charged. The time is released when the checkout expires.
        </p>
      ) : null}
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#101010] p-5">
        <SectionTitle>{service.name}</SectionTitle>
        <p className="mt-2 text-sm text-white/70">{service.description}</p>
        <p className="mt-2 text-sm text-white">
          {service.durationMinutes} min · {formatUsd(service.priceCents)}
          {service.priceIsExample ? <ExampleBadge /> : null}
        </p>
        {profile.hoursAreExample ? <p className="mt-1 text-[11px] text-white/40">Open hours are EXAMPLE hours until confirmed.</p> : null}
        <SlotPicker serviceId={service.id} timeZone={profile.timeZone} />
      </section>
    </CreatorFrame>
  );
}
