import { JoinForm } from '@/components/party/join-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Join a game · FEL', robots: { index: false } };

/**
 * /join — type the code on the TV (MULTIPLAYER lane, 2026-10-06). For a friend who cannot scan the QR (a TV across the
 * room, a camera that will not focus): short enough to read off a TV and type. Not signed-in only, like the controller
 * page it leads to: the room code is the capability, and nothing here reads or writes anyone's data. `?code=` arrives
 * filled in (a pasted invite).
 */
export default function JoinPage({ searchParams }: { searchParams?: { code?: string } }) {
  const code = typeof searchParams?.code === 'string' ? searchParams.code : '';
  return <JoinForm initialCode={code} />;
}
