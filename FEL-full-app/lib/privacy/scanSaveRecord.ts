// AB-04: read and write the one ScanSaveOptIn row. Grant and revoke are for a verified adult only
// (readDobYear + verifiedAdult from the age-reset lane). A minor cannot create the row.
//
// Missing table → opted-in false, and a grant answers 'unavailable' instead of throwing.

import { SCAN_SAVE_CONSENT_VERSION, SCAN_SAVE_SCOPE } from './scanSaveConsent';
import { readDobYear, verifiedAdult, type GateDb } from './scanSaveGate';
import { scanSaveOptIn } from './scanSaveOptIn';
import { activeSharedBookingIds } from './coachShare';

export interface ScanSaveStatus {
  verifiedAdult: boolean;
  optedIn: boolean;
  sharedBookingIds: string[];
  coaches: { id: string; name: string }[];
}

type StatusDb = {
  scanSaveOptIn: {
    findUnique: (args: { where: { userId: string }; select: { coachShares: true } }) => Promise<{ coachShares: unknown } | null>;
    upsert: (args: {
      where: { userId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  coachClient: {
    findMany: (args: {
      where: { clientId: string; endedAt: null };
      select: { coachId: true; coach: { select: { name: true } } };
    }) => Promise<{ coachId: string; coach: { name: string | null } | null }[]>;
  };
};

const CLOSED: ScanSaveStatus = { verifiedAdult: false, optedIn: false, sharedBookingIds: [], coaches: [] };

function asDb(db: unknown): StatusDb {
  return db as StatusDb;
}

export async function readScanSaveStatus(db: unknown, userId: string): Promise<ScanSaveStatus> {
  const client = asDb(db);
  try {
    const dobYear = await readDobYear(db as GateDb, userId, 'scan_save_status');
    const adult = verifiedAdult(dobYear);
    if (!adult) return CLOSED;
    const optedIn = await scanSaveOptIn(client, userId);
    let sharedBookingIds: string[] = [];
    let coaches: ScanSaveStatus['coaches'] = [];
    try {
      const row = await client.scanSaveOptIn.findUnique({ where: { userId }, select: { coachShares: true } });
      sharedBookingIds = activeSharedBookingIds(row?.coachShares);
    } catch {
      sharedBookingIds = [];
    }
    if (optedIn) {
      try {
        const links = await client.coachClient.findMany({
          where: { clientId: userId, endedAt: null },
          select: { coachId: true, coach: { select: { name: true } } },
        });
        coaches = links.map((l) => ({ id: l.coachId, name: l.coach?.name || 'My coach' }));
      } catch {
        coaches = [];
      }
    }
    return { verifiedAdult: true, optedIn, sharedBookingIds, coaches };
  } catch {
    return CLOSED;
  }
}

/** 'refused' — not a verified adult. 'unavailable' — the table could not be written. */
export async function setScanSaveGranted(db: unknown, userId: string, granted: boolean): Promise<'ok' | 'refused' | 'unavailable'> {
  const client = asDb(db);
  const dobYear = await readDobYear(db as GateDb, userId, 'scan_save_grant');
  if (!verifiedAdult(dobYear)) return 'refused';
  const now = new Date();
  try {
    if (granted) {
      await client.scanSaveOptIn.upsert({
        where: { userId },
        create: {
          userId,
          scope: SCAN_SAVE_SCOPE,
          granted: true,
          grantedAt: now,
          revokedAt: null,
          consentTextVersion: SCAN_SAVE_CONSENT_VERSION,
        },
        update: {
          scope: SCAN_SAVE_SCOPE,
          granted: true,
          grantedAt: now,
          revokedAt: null,
          consentTextVersion: SCAN_SAVE_CONSENT_VERSION,
        },
      });
    } else {
      await client.scanSaveOptIn.upsert({
        where: { userId },
        create: {
          userId,
          scope: SCAN_SAVE_SCOPE,
          granted: false,
          grantedAt: null,
          revokedAt: now,
          consentTextVersion: SCAN_SAVE_CONSENT_VERSION,
        },
        update: { granted: false, revokedAt: now },
      });
    }
    return 'ok';
  } catch {
    return 'unavailable';
  }
}
