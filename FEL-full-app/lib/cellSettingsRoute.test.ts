// Saving a Cell provider key with no NEXTAUTH_SECRET (2026-09-24). Cell crypto fails closed, and before this the throw
// left the POST handler as Next's bare, non-JSON 500: Studio's saveKey could not parse it, swallowed the error and
// showed nothing. The route now answers JSON the client can show. Session and database are in-process stand-ins;
// nothing here opens a connection.
import { afterEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    cellApiKey: {
      upsert: (...a: unknown[]) => upsert(...a),
      findMany: async () => [{ provider: 'openai', hint: '1234', updatedAt: new Date(0) }],
    },
    cellSettings: { findUnique: async () => null },
  },
}));

import { POST } from '@/app/api/cell/settings/route';
import { decryptSecret } from './cell-crypto';

const saveKey = () =>
  POST(new Request('http://fel.local/api/cell/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openai', apiKey: 'sk-live-1234' }),
  }));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); upsert.mockReset(); });

describe('POST /api/cell/settings — provider key', () => {
  it('stores the key encrypted once, under the secret, and answers the masked state', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const res = await saveKey();
    expect(res.status).toBe(200);
    expect((await res.json()).keys).toEqual([expect.objectContaining({ provider: 'openai', hint: '1234' })]);
    expect(upsert).toHaveBeenCalledTimes(1);
    const { create, update } = upsert.mock.calls[0][0] as { create: { keyCipher: string }; update: { keyCipher: string } };
    expect(create.keyCipher).toBe(update.keyCipher);
    expect(create.keyCipher).not.toContain('sk-live');
    expect(decryptSecret(create.keyCipher)).toBe('sk-live-1234');
  });

  it('answers a missing secret as JSON the client can show, and stores nothing', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', '');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await saveKey();
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j).toMatchObject({ error: 'server_misconfigured' });
    expect(j.message).toMatch(/NEXTAUTH_SECRET/);
    expect(upsert).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
  });
});
