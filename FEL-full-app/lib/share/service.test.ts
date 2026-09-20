// REVOKED, EXPIRED AND NEVER-EXISTED ARE ONE ANSWER (2026-09-13).
//
// The service is thin, and three of its behaviours are load-bearing enough to test against a fake database
// rather than trust:
//
//   · revoking DELETES the content, so a render path that forgets to check a flag has nothing to render;
//   · a dead link is indistinguishable from a link that never existed, so a forwarded URL teaches a stranger
//     nothing about whether to try again;
//   · the leak guard runs at the WRITE, not only in the builder, because the builder is not the only way to
//     construct an object.

import { describe, it, expect, beforeEach } from 'vitest';
import { createShare, readShare, revokeShare, listShares, ShareRefused, MAX_LIVE_SHARES_PER_COACH } from './service';
import { shareDrill, ShareLeak, type Share, type SharedBy } from './shareable';
import { PLATFORM_PROTOCOLS } from '../profile/protocol';
import { Prisma } from '@/public/_prisma/client';

const BY: SharedBy = { coachId: 'coach_me', displayName: 'Coach Mike', credentialed: true };
const drill = (o = {}) => shareDrill('depth_drop', PLATFORM_PROTOCOLS, BY, o).share!;

/** An in-memory stand-in for the one model the service touches. */
interface Row {
  id: string; token: string; coachId: string; kind: string; title: string; forName: string | null;
  payload: unknown; revokedAt: Date | null; expiresAt: Date | null; views: number; createdAt: Date;
}

function fakeDb() {
  const rows: Row[] = [];
  let n = 0;
  const find = (w: { token?: string; id?: string }) =>
    rows.find((r) => (w.token !== undefined ? r.token === w.token : r.id === w.id)) ?? null;

  // `select` has to be honoured for the index test to mean anything — a fake that returned whole rows
  // regardless would pass while the real query leaked the payload. (It did, on the first run.)
  const project = (row: Row, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, (row as never)[k]])) : row;

  return {
    rows,
    shareLink: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data, select }: any) => {
        const row: Row = {
          id: `id_${++n}`, views: 0, createdAt: new Date(), revokedAt: null,
          forName: null, expiresAt: null, ...data,
        };
        rows.push(row);
        return project(row, select);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where, select }: any) => {
        const row = find(where);
        return row ? project(row, select) : null;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const row = find(where);
        if (!row) throw new Error('no row');
        for (const [k, v] of Object.entries(data)) {
          // the service passes Prisma.DbNull to clear a Json column
          if (v && typeof v === 'object' && 'increment' in (v as object)) {
            (row as never as Record<string, number>)[k] += (v as { increment: number }).increment;
          } else if (v === Prisma.DbNull) {
            (row as never as Record<string, unknown>)[k] = null;
          } else {
            (row as never as Record<string, unknown>)[k] = v;
          }
        }
        return row;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async ({ where }: any) =>
        rows.filter((r) => r.coachId === where.coachId && (where.revokedAt === null ? r.revokedAt === null : true)).length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where, take, select }: any) =>
        rows.filter((r) => r.coachId === where.coachId).slice(0, take ?? 50).map((r) => project(r, select)),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

let db: ReturnType<typeof fakeDb>;
beforeEach(() => { db = fakeDb(); });

describe('creating', () => {
  it('mints a token and stores the payload', async () => {
    const created = await createShare(db, 'coach_me', drill());
    expect(created.token).toHaveLength(32);
    expect(created.kind).toBe('drill');
    expect(await readShare(db, created.token)).not.toBeNull();
  });

  it('a coach cannot create a share attributed to somebody else', async () => {
    await expect(createShare(db, 'someone_else', drill())).rejects.toThrow(ShareRefused);
  });

  it('THE LEAK GUARD RUNS AT THE WRITE, not only in the builder', async () => {
    // an object assembled by hand rather than by shareDrill() — the builder's guard never ran
    const handmade = { ...drill(), prq: [{ composite: 88 }] } as unknown as Share;
    await expect(createShare(db, 'coach_me', handmade)).rejects.toThrow(ShareLeak);
    expect(db.rows).toHaveLength(0);
  });

  it('and so does the clinical screen', async () => {
    const bad = { ...drill(), note: 'This will cure your tendinitis.' } as Share;
    await expect(createShare(db, 'coach_me', bad)).rejects.toThrow(ShareRefused);
    expect(db.rows).toHaveLength(0);
  });

  it('a coach is bounded on live links', async () => {
    for (let i = 0; i < MAX_LIVE_SHARES_PER_COACH; i++) {
      db.rows.push({
        id: `x${i}`, token: `t${i}`, coachId: 'coach_me', kind: 'drill', title: 't', forName: null,
        payload: {}, revokedAt: null, expiresAt: null, views: 0, createdAt: new Date(),
      });
    }
    await expect(createShare(db, 'coach_me', drill())).rejects.toThrow(/revoke some/i);
  });
});

describe('READING: DEAD LINKS ARE INDISTINGUISHABLE FROM LINKS THAT NEVER EXISTED', () => {
  it('a live link reads', async () => {
    const { token } = await createShare(db, 'coach_me', drill({ note: 'Quiet landings.' }));
    const share = await readShare(db, token);
    expect(share?.kind).toBe('drill');
  });

  it('missing, revoked and expired all return null — the same null', async () => {
    const live = await createShare(db, 'coach_me', drill());
    const expiring = await createShare(db, 'coach_me', drill(), { expiresAt: new Date(Date.now() - 1000) });
    await revokeShare(db, 'coach_me', live.token);

    expect(await readShare(db, live.token)).toBeNull();          // revoked
    expect(await readShare(db, expiring.token)).toBeNull();      // expired
    expect(await readShare(db, 'a'.repeat(32))).toBeNull();      // never existed
  });

  it('a malformed token never reaches the database', async () => {
    let touched = false;
    const spy = { ...db, shareLink: { ...db.shareLink, findUnique: async () => { touched = true; return null; } } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readShare(spy as any, '../../../etc/passwd')).toBeNull();
    expect(touched).toBe(false);
  });

  it('an expiry in the future still reads', async () => {
    const { token } = await createShare(db, 'coach_me', drill(), { expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await readShare(db, token)).not.toBeNull();
  });

  it('reading bumps the view count without blocking', async () => {
    const { token } = await createShare(db, 'coach_me', drill());
    await readShare(db, token);
    await new Promise((r) => setTimeout(r, 0));           // the increment is fire-and-forget
    expect(db.rows[0].views).toBe(1);
  });
});

describe('REVOKING DELETES THE CONTENT, NOT A FLAG', () => {
  it('the payload is actually gone from the row', async () => {
    const { token } = await createShare(db, 'coach_me', drill({ note: 'A private cue.' }));
    expect(JSON.stringify(db.rows[0].payload)).toContain('A private cue.');

    await revokeShare(db, 'coach_me', token);
    expect(db.rows[0].payload).toBeNull();
    expect(JSON.stringify(db.rows)).not.toContain('A private cue.');
  });

  it('but the receipt survives, so the trainer keeps their history', async () => {
    const { token } = await createShare(db, 'coach_me', drill());
    await revokeShare(db, 'coach_me', token);
    const list = await listShares(db, 'coach_me');
    expect(list).toHaveLength(1);
    expect(list[0].revokedAt).toBeInstanceOf(Date);
  });

  it('revoking twice is fine — the intent is satisfied either way', async () => {
    const { token } = await createShare(db, 'coach_me', drill());
    expect(await revokeShare(db, 'coach_me', token)).toBe(true);
    expect(await revokeShare(db, 'coach_me', token)).toBe(true);
  });

  it('somebody else’s link cannot be revoked, and says "not found" rather than "not yours"', async () => {
    const { token } = await createShare(db, 'coach_me', drill());
    expect(await revokeShare(db, 'other_coach', token)).toBe(false);
    expect(db.rows[0].revokedAt).toBeNull();
    // identical answer to a token that does not exist
    expect(await revokeShare(db, 'other_coach', 'b'.repeat(32))).toBe(false);
  });
});

describe('the trainer’s index is an index', () => {
  it('it does not return the content of what they sent', async () => {
    await createShare(db, 'coach_me', drill({ note: 'A private cue.' }));
    const list = await listShares(db, 'coach_me');
    expect(JSON.stringify(list)).not.toContain('A private cue.');
    expect(list[0]).toHaveProperty('views');
  });
});
