// lib/privacy/scanSaveOptIn.ts — AB-04 (2026-10-03): has this account opted in to saving movement numbers?
//
// The second half of canSaveScanNumbers (lib/privacy/scanSaveGate.ts). The first half is verifiedAdult() on
// User.dobYear. This reads ScanSaveOptIn. A live grant is scope `jump_numbers`, granted true, and revokedAt null.
// One row covers jump numbers, Prove It, and re-screen history.
//
// FAIL CLOSED. A missing row, a revoked row, a wrong scope, a thrown read (the table is not on production until
// prisma/pending/2026-10-04-adult-optin-ab04.sql is applied) → false. Nothing here reads an env var, a header, or
// a request field. The log line is the error's name and code only — never a user id, email, birth year, or age.
//
// This file does not import scanSaveGate (that file imports this one).

const SCOPE = 'jump_numbers';

type OptInRow = { granted: boolean; revokedAt: Date | string | null; scope: string };

type OptInDb = {
  scanSaveOptIn: {
    findUnique: (args: {
      where: { userId: string };
      select: { granted: true; revokedAt: true; scope: true };
    }) => Promise<OptInRow | null>;
  };
};

function loggable(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : fallback;
}

function logOptInFailure(e: unknown): void {
  const err = (e && typeof e === 'object' ? e : {}) as { name?: unknown; code?: unknown };
  const code = loggable(err.code, '');
  console.warn(`[privacy] scan_save_opt_in_read_failed ${loggable(err.name, typeof e)}${code ? ` ${code}` : ''}`);
}

/**
 * True only for a live `jump_numbers` grant. False on any error, a missing row, or a revoked row.
 * The `db` argument is the route's prisma (or a transaction client); a stand-in with the same shape works in tests.
 */
export async function scanSaveOptIn(db: unknown, userId: string): Promise<boolean> {
  if (typeof userId !== 'string' || !userId) return false;
  try {
    const client = db as OptInDb;
    const row = await client.scanSaveOptIn.findUnique({
      where: { userId },
      select: { granted: true, revokedAt: true, scope: true },
    });
    if (!row || row.scope !== SCOPE || row.granted !== true || row.revokedAt != null) return false;
    return true;
  } catch (e) {
    logOptInFailure(e);
    return false;
  }
}
