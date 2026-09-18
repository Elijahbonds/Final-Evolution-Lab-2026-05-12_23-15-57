// THE FALSE POSITIVE THIS MODULE WAS WRITTEN FOR (2026-09-14).
//
// The first version of the detector scanned the error MESSAGE for /P2021|42P01|does not exist/. Run
// against a live database with a stale password, it answered "the table is missing — run prisma db push",
// because Prisma pastes the calling source into its error message and the source it pasted was the line
// containing that very regex. The message below is the real one, trimmed.

import { describe, it, expect } from 'vitest';
import { isMissingTable, isUnreachable, TABLE_MISSING, PG_UNDEFINED_TABLE } from './errors';

/**
 * The actual error, reproduced in the shape it really arrives in: a PrismaClientInitializationError whose
 * `code` and `errorCode` are BOTH undefined — measured on this project, 2026-09-14 — carrying the code
 * frame Prisma pastes into the message.
 */
class PrismaClientInitializationError extends Error {}
const AUTH_FAILURE = Object.assign(new PrismaClientInitializationError(`
Invalid \`prisma.athleteBuild.findFirst()\` invocation in
  12   return /P2021|42P01|does not exist/i.test(s);
Authentication failed against database server, the provided database credentials for \`postgres\` are not valid.
`), { clientVersion: '6.7.0', errorCode: undefined, retryable: false });

describe('a missing table is not every database failure', () => {
  it('does NOT call a bad password a missing table, even when the message quotes the detector', () => {
    expect(AUTH_FAILURE.message).toContain('P2021');      // the trap is genuinely present in the text
    expect((AUTH_FAILURE as { code?: unknown }).code).toBeUndefined();   // and there is no code to go on
    expect(isMissingTable(AUTH_FAILURE)).toBe(false);
    expect(isUnreachable(AUTH_FAILURE)).toBe(true);       // recognised by the class Prisma chose
  });

  it('recognises the real thing by its code', () => {
    expect(isMissingTable(Object.assign(new Error('x'), { code: TABLE_MISSING }))).toBe(true);
    expect(isMissingTable(Object.assign(new Error('x'), { code: 'P2010', meta: { code: PG_UNDEFINED_TABLE } }))).toBe(true);
  });

  it('says no to everything else, including nonsense', () => {
    for (const e of [null, undefined, 'P2021', 42, new Error('P2021 does not exist'), { code: 'P2002' }]) {
      expect(isMissingTable(e), String(e)).toBe(false);
    }
    expect(isUnreachable(new Error('cannot reach database'))).toBe(false);
  });
});
