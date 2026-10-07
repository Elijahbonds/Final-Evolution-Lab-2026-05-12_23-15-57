// COACH-AI Phase 8 (2026-10-07): which failures switch a pending-SQL feature off. The error shapes below are the ones
// the committed Prisma client actually threw against a throwaway Postgres 16 (P2010 + the SQLSTATE in meta.code).
import { describe, expect, it, vi } from 'vitest';
import { isMissingSchemaError, pendingProbe, type RawDb } from './pendingSchema';

const prismaErr = (code: string, message: string) => Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code, message } });

describe('isMissingSchemaError', () => {
  it('a missing column (42703) or table (42P01) is one', () => {
    expect(isMissingSchemaError(prismaErr('42703', 'column "readAt" does not exist'))).toBe(true);
    expect(isMissingSchemaError(prismaErr('42P01', 'relation "CoachAvailability" does not exist'))).toBe(true);
  });
  it('a refused foreign key (23503), a dropped connection, a non-error are not', () => {
    expect(isMissingSchemaError(prismaErr('23503', 'insert or update on table "CoachAvailability" violates foreign key constraint'))).toBe(false);
    expect(isMissingSchemaError(new Error('Connection terminated unexpectedly'))).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});

describe('pendingProbe.fail', () => {
  const yes: RawDb = { $queryRawUnsafe: async () => [{ ok: 1 }] as never, $executeRawUnsafe: async () => 0 };
  it('a foreign-key refusal leaves the feature on; a missing table turns it off until the next probe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = pendingProbe('t', 'probe');
    expect(await p.ready(yes, 0)).toBe(true);
    p.fail('t_write_failed', prismaErr('23503', 'violates foreign key constraint'), 1);
    expect(await p.ready({ ...yes, $queryRawUnsafe: async () => [] as never }, 2)).toBe(true); // still the cached yes
    p.fail('t_write_failed', prismaErr('42P01', 'relation "X" does not exist'), 3);
    expect(await p.ready(yes, 4)).toBe(false);
    warn.mockRestore();
  });
});
