import { PartyHub } from '@/components/party/social/party-hub';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Party · FEL', robots: { index: false } };

/** /party — PARTY-CHAT (2026-10-13): start a PSN-style party, or join one by code. The party lives in the root layout. */
export default function PartyPage({ searchParams }: { searchParams?: { code?: string } }) {
  return <PartyHub initialCode={typeof searchParams?.code === 'string' ? searchParams.code : ''} />;
}
