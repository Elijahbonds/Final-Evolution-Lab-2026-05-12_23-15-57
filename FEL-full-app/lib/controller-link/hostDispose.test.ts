// hostDispose.test.ts — MUSIC-SUITE P10 (2026-09-29): a HostSession disposed while its room is still being made starts
// nothing afterwards. Measured live first (scripts/probes/_music-p10-phone-dispose.mts): leaving the Academy with a phone
// paired left the page polling a never-joined room's mailbox ~5 times a second for good — the session React's dev
// double-mount built and disposed inside `await createRoom`, which then started its poll and its ping anyway.
// The REAL HostSession; only the signaling HTTP and the WebRTC link are faked (node has neither).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => ({
  polls: 0,
  stops: 0,
  resolveRoom: null as null | ((code: string) => void),
}));
vi.mock('./transport/webrtc', () => ({ PeerLink: class { close() { /* */ } } }));
vi.mock('./transport/signaling', () => ({
  createRoom: () => new Promise<string>((r) => { fx.resolveRoom = r; }),
  lookupRoom: async () => null,
  postSignal: async () => undefined,
  pollSignals: () => { fx.polls++; return () => { fx.stops++; }; },
}));

import { HostSession } from './host';
import { MODE_CONTROLLERS } from './schemas/registry';

beforeEach(() => { fx.polls = 0; fx.stops = 0; fx.resolveRoom = null; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const session = () => new HostSession({ config: MODE_CONTROLLERS.music_flip, onInput: () => undefined });

describe('HostSession.start after dispose (MUSIC-SUITE P10)', () => {
  it('disposed during createRoom: no mailbox poll and no ping timer ever start', async () => {
    const s = session();
    const started = s.start();
    s.dispose();                         // the lobby unmounted while the room POST was in flight
    fx.resolveRoom!('ZOMBIE');
    await expect(started).resolves.toBe('ZOMBIE');
    expect(fx.polls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);  // no PING_MS interval left behind
  });

  it('a live session still starts both, and dispose stops them (the ordinary path is unchanged)', async () => {
    const s = session();
    const started = s.start();
    fx.resolveRoom!('LIVE42');
    await expect(started).resolves.toBe('LIVE42');
    expect(fx.polls).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    s.dispose();
    expect(fx.stops).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
