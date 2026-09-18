// Room create / lookup. Deliberately unauthenticated: a phone joining by QR is
// a guest with no FEL account, which is the entire point of "no install". The
// room code is the capability — 4 chars from a 31-glyph alphabet, and a room is
// useless the moment the host closes it.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSignalStore } from '@/lib/controller-link/signalStore';
import { makeRoomCode } from '@/lib/controller-link/codes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CreateBody = z.object({
  modeId: z.string().min(1).max(64),
  hostId: z.string().min(1).max(64),
});

export async function POST(req: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof CreateBody>;
  try {
    parsed = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const store = getSignalStore();
  await store.sweep();

  // Retry on the (rare) collision rather than handing back a live room.
  let code = makeRoomCode();
  for (let i = 0; i < 5 && (await store.getRoom(code)); i++) code = makeRoomCode();
  if (await store.getRoom(code)) {
    return NextResponse.json({ error: 'could not allocate room' }, { status: 503 });
  }

  const room = await store.createRoom(code, parsed.modeId, parsed.hostId);
  return NextResponse.json({ code: room.code, modeId: room.modeId });
}

export async function GET(req: Request): Promise<NextResponse> {
  const code = new URL(req.url).searchParams.get('code')?.toUpperCase();
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const room = await getSignalStore().getRoom(code);
  if (!room) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Never leak the message buffer or host id to a joining phone.
  return NextResponse.json({
    code: room.code,
    modeId: room.modeId,
    peers: room.peers.map((p) => ({ peerId: p.peerId, name: p.name })),
  });
}
