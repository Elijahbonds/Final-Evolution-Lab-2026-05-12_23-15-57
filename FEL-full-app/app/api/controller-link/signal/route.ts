// SDP / ICE relay. Carries only the handshake — once the data channel opens,
// gameplay input goes peer-to-peer and this endpoint sees nothing more.
//
// Polling rather than streaming is a deliberate serverless concession: a join
// exchanges a handful of messages over a couple of seconds, so a 250ms poll
// costs a few requests once per device and then stops. It is not the hot path.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSignalStore } from '@/lib/controller-link/signalStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PostBody = z.object({
  code: z.string().min(1).max(8),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  // SDP blobs are large; ICE candidates are small. Cap generously but finitely.
  data: z.unknown(),
  /** Sent by a joining phone so the host can list it before the channel opens. */
  announce: z.object({ name: z.string().max(24) }).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const code = body.code.toUpperCase();
  const store = getSignalStore();
  if (!(await store.getRoom(code))) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 });
  }

  if (body.announce) await store.addPeer(code, body.from, body.announce.name);

  const seq = await store.push(code, { from: body.from, to: body.to, data: body.data });
  return NextResponse.json({ seq });
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code')?.toUpperCase();
  const to = url.searchParams.get('to');
  const after = Number(url.searchParams.get('after') ?? '0');

  if (!code || !to || !Number.isFinite(after)) {
    return NextResponse.json({ error: 'code, to, after required' }, { status: 400 });
  }

  const store = getSignalStore();
  const room = await store.getRoom(code);
  if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 });

  const messages = await store.poll(code, to, after);
  return NextResponse.json({
    messages,
    peers: room.peers.map((p) => ({ peerId: p.peerId, name: p.name })),
  });
}
