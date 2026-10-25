'use client';

// A live session's room (COACH-LIVE, 2026-10-25): asks the server's door (GET /api/coach/live), then shows the coach's
// side or the client's. A refusal is said in plain words (lib/coach/live/gate.ts REFUSAL_WORDS).
import { useEffect, useState } from 'react';
import { REFUSAL_WORDS, type LiveGateRefusal } from '@/lib/coach/live/gate';
import { CoachLive } from './coach-live';
import { ClientLive } from './client-live';
import type { LiveJoin } from './live-words';

export interface LiveRoomApi { join: string; signal: string; summary: string }
export const LIVE_API: LiveRoomApi = { join: '/api/coach/live', signal: '/api/coach/live/signal', summary: '/api/coach/live/summary' };

export function LiveRoom({ room, api = LIVE_API }: { room: string; api?: LiveRoomApi }) {
  const [join, setJoin] = useState<LiveJoin | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    fetch(`${api.join}?room=${encodeURIComponent(room)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (gone) return;
      if (!r.ok) { setRefused(REFUSAL_WORDS[j.error as LiveGateRefusal] ?? 'This live session is not available right now.'); return; }
      setJoin({ role: j.role, clientVideo: j.clientVideo === true, clientBand: j.clientBand === 'adult' ? 'adult' : 'teen', iceServers: Array.isArray(j.iceServers) ? j.iceServers : [] });
    }).catch(() => { if (!gone) setRefused('Could not reach the server. Check your connection and try again.'); });
    return () => { gone = true; };
  }, [room, api.join]);
  if (refused) return <p className="mx-auto max-w-xl px-4 py-8 text-white/80" data-live-refused>{refused}</p>;
  if (!join) return <p className="mx-auto max-w-xl px-4 py-8 text-white/60">Opening the live session…</p>;
  return join.role === 'coach'
    ? <CoachLive room={room} join={join} signalApi={api.signal} summaryApi={api.summary} />
    : <ClientLive room={room} join={join} signalApi={api.signal} />;
}
