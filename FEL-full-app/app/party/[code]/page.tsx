import { PartyHub } from '@/components/party/social/party-hub';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Join a party · FEL', robots: { index: false } };

/** /party/<CODE> — PARTY-CHAT (2026-10-13): what an invite link and the party QR open. The code is the invitation. */
export default function PartyInvitePage({ params }: { params: { code: string } }) {
  return <PartyHub initialCode={params.code} />;
}
