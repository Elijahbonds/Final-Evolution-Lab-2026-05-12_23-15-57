// THE PAGE A TEXTED LINK OPENS (2026-09-13).
//
// Owner decision: open preview, account only to start tracking. Somebody who is not a user — a prospect, a
// parent, another coach — taps this from iMessage and gets the whole thing, immediately, with no wall.
//
// Two things this page must not do:
//   · it must not ask who you are before showing you anything, which is the whole point;
//   · it must not show a client's numbers, which is enforced upstream (the payload physically has none —
//     lib/share/shareable.ts) rather than by remembering not to render them here.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { readShare } from '@/lib/share/service';
import { toSummaryLine } from '@/lib/share/plaintext';
import type { Share, SharedItem } from '@/lib/share/shareable';
import { BadgeCheck, Clock, Lock, UserPlus } from 'lucide-react';
import { invitePath } from '@/lib/coach/invite';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const share = await readShare(prisma, String(params?.token ?? ''));
  if (!share) return { title: 'Not found — Final Evolution Lab' };
  const summary = toSummaryLine(share);
  return {
    title: `${share.title} — Final Evolution Lab`,
    description: summary,
    // the link preview in the message thread: this is the first thing the recipient sees
    openGraph: { title: share.title, description: summary, type: 'article' },
  };
}

function Item({ item }: { item: SharedItem }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-white/90">{item.title}</span>
        {item.frequency ? <span className="text-xs text-white/45">{item.frequency}x/week</span> : null}
        <span className="text-xs text-white/35">{item.minutes} min</span>
      </div>
      {item.prescription ? <p className="mt-1 text-sm text-white/70">{item.prescription}</p> : null}
      {item.opensAt?.length ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/40">
          <Lock className="h-3 w-3" />
          Opens at {item.opensAt.map((o) => `${o.label} ${o.need}`).join(', ')}
        </p>
      ) : null}
    </li>
  );
}

function Body({ share }: { share: Share }) {
  switch (share.kind) {
    case 'drill':
      return (
        <>
          <ul className="space-y-2"><Item item={share.item} /></ul>
          {share.note ? <p className="mt-4 whitespace-pre-wrap text-white/80">{share.note}</p> : null}
        </>
      );

    case 'program':
      return (
        <>
          {share.outcome ? <p className="mb-5 text-white/70">{share.outcome}</p> : null}
          <div className="space-y-5">
            {share.weeks.map((w) => (
              <section key={w.week}>
                <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-white/40">
                  Week {w.week} · {w.focus}
                </h2>
                <ul className="space-y-2">{w.items.map((i, n) => <Item key={`${i.protocolKey}-${n}`} item={i} />)}</ul>
              </section>
            ))}
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-xs text-white/45">
            <Clock className="h-3.5 w-3.5" /> Retest after week {share.retestAfterWeeks}.
          </p>
        </>
      );

    case 'selection':
      return (
        <>
          <ul className="space-y-2">{share.items.map((i) => <Item key={i.protocolKey} item={i} />)}</ul>
          {share.note ? <p className="mt-4 whitespace-pre-wrap text-white/80">{share.note}</p> : null}
        </>
      );

    case 'recommendation':
      return <p className="whitespace-pre-wrap leading-relaxed text-white/85">{share.body}</p>;
  }
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const token = String(params?.token ?? '');
  const share = await readShare(prisma, token);
  // missing, revoked and expired are one answer
  if (!share) notFound();

  // TIE: whoever is reading this can become this coach's client. The invite is READ only — it was created when the
  // coach made the share — so a stranger opening a link never causes a write.
  const row = await prisma.shareLink.findUnique({ where: { token }, select: { coachId: true } });
  const publicInvite = row
    ? await prisma.coachInvite.findFirst({
        where: { coachId: row.coachId, use: 'many', closedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }, select: { token: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-7">
        {share.forName ? (
          <p className="mb-1 text-sm text-white/50">For {share.forName}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-white">{share.title}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-white/55">
          From {share.by.displayName}
          {share.by.credentialed ? (
            <span className="inline-flex items-center gap-1 text-emerald-400/80">
              <BadgeCheck className="h-3.5 w-3.5" /> Certified
            </span>
          ) : null}
        </p>
      </header>

      <Body share={share} />

      {/* the only thing behind an account: tracking it. Reading is free. */}
      <div className="mt-9 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-white/70">
          Sign in to track this and see which parts are open to you.
        </p>
        <Link
          href="/api/auth/signin"
          className="mt-3 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Start tracking
        </Link>
      </div>

      {publicInvite && (
        <div className="mt-4 rounded-xl border border-[#00E5FF]/25 bg-[#00E5FF]/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <UserPlus className="h-4 w-4 text-[#00E5FF]" />
            Want {share.by.displayName} to program for you?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Join their roster and they can build your training, watch your movement screens and send you work.
          </p>
          <Link
            href={invitePath(publicInvite.token)}
            className="mt-3 inline-block rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-bold text-[#050505]"
          >
            Train with {share.by.displayName}
          </Link>
        </div>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-white/30">
        Training guidance from an independent coach. Final Evolution Lab is a performance and movement
        platform — nothing here is medical advice, diagnosis or treatment.
      </p>
    </main>
  );
}
