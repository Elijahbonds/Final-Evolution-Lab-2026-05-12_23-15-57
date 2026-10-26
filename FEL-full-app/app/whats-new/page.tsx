import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { publicReleases, type Release } from '@/lib/release/notes';
import data from '@/lib/release/releases.json';
import { WhatsNewView } from './view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: "What's new" };

// WHAT'S NEW (QG-05, quality-gates lane, 2026-10-25). Owner, quality round 2026-10-20: "an in-app What's new page". The
// notes are generated from merged pull requests by scripts/release-notes.ts into lib/release/releases.json (the process:
// docs/RELEASE.md); this shows the public ones, newest release first. Public, like the legal pages: reachable signed out.
export default async function WhatsNewPage() {
  const session = await getServerSession(authOptions);
  const releases = publicReleases((data as { releases: Release[] }).releases);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <WhatsNewView releases={releases} />
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
