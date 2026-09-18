/**
 * /dev/send — the trainer compose screen, without a session or a database.
 *
 * The compose form, the live clinical screening and the message preview are all client-side and pure, so
 * they can be looked at here. Creating a link still needs auth and Postgres and will fail from this page —
 * that is expected; this harness is for the part a screenshot can verify.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SendView } from '@/app/coach/_components/send-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Trainer Send Harness',
  robots: { index: false, follow: false },
};

export default function DevSendPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] p-4">
      <div className="mx-auto max-w-[900px]">
        <SendView me={{ coachId: 'dev_coach', displayName: 'Coach Mike', credentialed: true }} />
      </div>
    </div>
  );
}
