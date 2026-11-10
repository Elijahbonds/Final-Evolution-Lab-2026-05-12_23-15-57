// BINJGB-SHELF-1 F5 (Cyber build review dcbbec16): /api/analytics rebuilds the two anonymous homebrew events' props from an
// allowlist before storing them, so a hand-crafted POST can never store a file name, a hash or anything else under them.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normaliseHomebrewEvent } from '@/lib/binjgb/analyticsProps';

const h = vi.hoisted(() => ({ session: null as { user?: { id?: string } } | null, rows: [] as any[] }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvents: async (rows: any[]) => { h.rows.push(...rows); } }));

import { POST } from '@/app/api/analytics/route';

const post = (events: unknown[]) => POST(new Request('http://x/api/analytics', { method: 'POST', body: JSON.stringify({ events }) }));
const FILE = 'my game (USA).gbc';
const HASH = 'a'.repeat(64);

describe('normaliseHomebrewEvent (pure)', () => {
  it('homebrew_local_play is always exactly { source: "local" }', () => {
    for (const props of [undefined, null, {}, { source: 'local' }, { source: 'remote' }, { source: 'local', name: FILE, sha256: HASH }, { name: FILE }]) {
      expect(normaliseHomebrewEvent('homebrew_local_play', props as Record<string, unknown> | null | undefined)).toEqual({ keep: true, props: { source: 'local' } });
    }
  });

  it('homebrew_shelf_play keeps only a shipped slug (rebuilt from the manifest), otherwise it is dropped', () => {
    const titles = [{ slug: 'shipped', title: 'Shipped' }];
    expect(normaliseHomebrewEvent('homebrew_shelf_play', { slug: 'shipped', name: FILE, hash: HASH }, titles)).toEqual({ keep: true, props: { slug: 'shipped' } });
    for (const props of [{ slug: FILE }, { slug: HASH }, { slug: 42 }, {}, null, undefined]) {
      expect(normaliseHomebrewEvent('homebrew_shelf_play', props as Record<string, unknown> | null | undefined, titles)).toEqual({ keep: false });
    }
    // v1 ships no titles, so with the real manifest every shelf event is dropped
    expect(normaliseHomebrewEvent('homebrew_shelf_play', { slug: 'shipped' })).toEqual({ keep: false });
  });

  it('every other event passes through untouched', () => {
    const props = { kind: 'fps', detail: 'w=1' };
    expect(normaliseHomebrewEvent('game_diag', props)).toEqual({ keep: true, props });
    expect(normaliseHomebrewEvent('session_start', undefined)).toEqual({ keep: true, props: null });
  });
});

describe('POST /api/analytics: a crafted homebrew event never stores a file name or hash', () => {
  beforeEach(() => { h.rows = []; h.session = { user: { id: 'u1' } }; });

  it('local play: the stored row is { source: "local" } with no ids, whatever was posted', async () => {
    const res = await post([{ name: 'homebrew_local_play', props: { source: 'local', fileName: FILE, sha256: HASH, bytes: 'AAAA' }, ts: 1, sessionKey: 'page-1' }]);
    expect(res.status).toBe(204);
    expect(h.rows).toEqual([{ name: 'homebrew_local_play', props: { source: 'local' }, ts: 1, userId: null, guestId: null, sessionKey: null }]);
    expect(JSON.stringify(h.rows)).not.toContain(FILE);
    expect(JSON.stringify(h.rows)).not.toContain(HASH);
  });

  it('shelf play with an unknown slug (a file name, a hash) is dropped; the batch\'s other rows are stored as before', async () => {
    await post([
      { name: 'homebrew_shelf_play', props: { slug: FILE }, ts: 1, sessionKey: 'p' },
      { name: 'homebrew_shelf_play', props: { slug: HASH, extra: FILE }, ts: 2, sessionKey: 'p' },
      { name: 'session_start', props: { mode: 'dunk' }, ts: 3, sessionKey: 'p' },
    ]);
    expect(h.rows.map((r) => [r.name, r.props, r.userId, r.sessionKey])).toEqual([['session_start', { mode: 'dunk' }, 'u1', 'p']]);
    expect(JSON.stringify(h.rows)).not.toContain(FILE);
    expect(JSON.stringify(h.rows)).not.toContain(HASH);
  });
});
