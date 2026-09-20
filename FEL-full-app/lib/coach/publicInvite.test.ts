import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_INVITE_TTL_MS, ensurePublicInvite } from './publicInvite';
import { INVITE_TTL_MS } from './invite';

/** A stand-in for the one table this touches. */
function db(existing: { token: string; expiresAt: Date } | null) {
  const updates: unknown[] = []; const creates: unknown[] = [];
  return {
    updates, creates,
    coachInvite: {
      findFirst: vi.fn(async () => existing),
      update: vi.fn(async (args: unknown) => { updates.push(args); return {}; }),
      create: vi.fn(async (args: { data: { token: string } }) => { creates.push(args); return { token: args.data.token }; }),
    },
  } as never as Parameters<typeof ensurePublicInvite>[0] & { updates: unknown[]; creates: unknown[] };
}

describe('the coach public invite', () => {
  it('makes one on first use and reuses it after that', async () => {
    const fresh = db(null);
    expect(await ensurePublicInvite(fresh, 'coach1', () => 'tok-new')).toBe('tok-new');
    expect((fresh as unknown as { creates: unknown[] }).creates).toHaveLength(1);

    const existing = db({ token: 'tok-old', expiresAt: new Date(Date.now() + PUBLIC_INVITE_TTL_MS) });
    expect(await ensurePublicInvite(existing, 'coach1', () => 'tok-new')).toBe('tok-old');
    expect((existing as unknown as { creates: unknown[] }).creates).toHaveLength(0);
  });

  it('a public link is always reusable — one that died on its first taker is a bug on a flyer', async () => {
    const fresh = db(null);
    await ensurePublicInvite(fresh, 'coach1', () => 'tok');
    const created = (fresh as unknown as { creates: { data: { use: string } }[] }).creates[0];
    expect(created.data.use).toBe('many');
  });

  it('refreshes a link that is about to age out, so an old flyer keeps working', async () => {
    const ageing = db({ token: 'tok-old', expiresAt: new Date(Date.now() + INVITE_TTL_MS.many - 1000) });
    await ensurePublicInvite(ageing, 'coach1', () => 'x');
    expect((ageing as unknown as { updates: unknown[] }).updates).toHaveLength(1);
  });
});
