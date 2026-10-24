// perf-lag: the analytics route stores the fps / ttfp perf stats with no user, guest or page key, and every other row as before.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as { user?: { id?: string } } | null, guest: undefined as string | undefined, rows: [] as any[] }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: (n: string) => (n === 'fel_guest' && h.guest ? { value: h.guest } : undefined) }) }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvents: async (rows: any[]) => { h.rows.push(...rows); } }));

import { POST } from '@/app/api/analytics/route';
import { hashGuestToken } from '@/lib/guest';

// A token in the minted format (32 base64url chars): the route stores its hash as the guest id, never the token.
const TOKEN = 'G'.repeat(32);

const post = (events: unknown[]) => POST(new Request('http://x/api/analytics', { method: 'POST', body: JSON.stringify({ events }) }));

describe('POST /api/analytics: anonymous perf stats', () => {
  beforeEach(() => { h.rows = []; h.session = { user: { id: 'u1' } }; h.guest = undefined; });

  it('a signed-in page: fps / ttfp rows keep no ids, its other rows keep theirs', async () => {
    const res = await post([
      { name: 'game_diag', props: { kind: 'fps', mode: 'onevone', detail: 'w=1' }, ts: 1, sessionKey: 'page-1' },
      { name: 'game_diag', props: { kind: 'ttfp', mode: 'dunk', detail: 'ready=1' }, ts: 2, sessionKey: 'page-1' },
      { name: 'game_diag', props: { kind: 'load', mode: 'dunk', detail: 'x' }, ts: 3, sessionKey: 'page-1' },
      { name: 'session_start', props: { mode: 'dunk' }, ts: 4, sessionKey: 'page-1' },
    ]);
    expect(res.status).toBe(204);
    expect(h.rows.map((r) => [r.props?.kind ?? r.name, r.userId, r.guestId, r.sessionKey])).toEqual([
      ['fps', null, null, null],
      ['ttfp', null, null, null],
      ['load', 'u1', null, 'page-1'],
      ['session_start', 'u1', null, 'page-1'],
    ]);
  });

  it('a guest page: the guest cookie never reaches a perf row', async () => {
    h.session = null; h.guest = TOKEN;
    await post([
      { name: 'game_diag', props: { kind: 'fps', mode: 'onevone', detail: 'w=1' }, ts: 1, sessionKey: 'page-2' },
      { name: 'game_diag', props: { kind: 'frame', mode: 'onevone', detail: 'x' }, ts: 2, sessionKey: 'page-2' },
    ]);
    expect(h.rows.map((r) => [r.props.kind, r.userId, r.guestId, r.sessionKey])).toEqual([
      ['fps', null, null, null],
      ['frame', null, hashGuestToken(TOKEN), 'page-2'],
    ]);
  });
});
