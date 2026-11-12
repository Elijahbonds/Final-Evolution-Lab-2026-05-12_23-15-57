// WHO CAN SEE THIS (PROFILE V2; owner 2026-10-24: friends only, and teens private). An adult picks public or
// friends-only (default friends-only; stored on the card's published flag). An under-18 or unknown-age account is
// always private and gets no switch. Coaches always see their athletes.
// PRODUCT COPY FOR OWNER REVIEW: the explainer lines below (docs/PROFILE-V2.md, "owner calls").
import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { Section, Card } from './section';
import { PublicToggle } from './public-toggle';

export function PrivacySection({ data }: { data: ProfileV2Data }) {
  const p = data.privacy;
  return (
    <Section id="privacy" title="Who can see your profile" purpose="Your progress is yours. Choose who else sees it." accent="#00FF9D">
      <Card>
        {p.minorOrUnknown ? (
          <p className="flex items-start gap-2.5 text-[14px] leading-snug text-white/70">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fel-emerald" aria-hidden />
            <span><b className="text-white">Private.</b> Only you and your coaches can see your profile. Accounts under 18 never get a public page.</span>
          </p>
        ) : p.cardSlug ? (
          <>
            <PublicToggle initial={p.visibility === 'public'} />
            <p className="mt-2 text-[12px] text-fel-dim">Your page: <Link href={`/u/${p.cardSlug}`} className="font-mono text-fel-cyan underline-offset-2 hover:underline">/u/{p.cardSlug}</Link></p>
          </>
        ) : (
          <p className="text-[14px] leading-snug text-white/60">
            <b className="text-white">Friends only.</b> Want a public page? <Link href="/profile/edit#card" className="font-bold text-fel-cyan underline-offset-2 hover:underline">Make your card</Link>, then switch it on here.
          </p>
        )}
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-white/60"><ShieldCheck className="h-3.5 w-3.5 text-fel-cyan" aria-hidden />Coaches who can see it</p>
          <p className="mt-1 text-[12px] text-white/50">{p.coaches.length ? p.coaches.join(', ') : 'None. A coach you join sees your profile.'}</p>
        </div>
      </Card>
    </Section>
  );
}
