// lib/coach/brandingServer.ts — COACH-DELIVERY COA-04 (2026-10-26): a coach's brand, stored and read (CoachBranding, raw SQL
// behind the lane's probe; prisma/pending/2026-10-26-coach-delivery.sql).
//
//   brandingBoard  GET   /api/coach/branding      the coach's own brand and whether logo uploads are on
//   brandingAct    POST  /api/coach/branding      { action: 'save', name?, accent? } | { action: 'logo_upload', contentType,
//                                                 bytes } (a signed PUT) | { action: 'logo_set', objectName } | { action: 'logo_clear' }
//   brandingFor    the coach page, the athlete's Today, the invite email
// Only a certified coach brands (the builder's own gate). Before the pending SQL: no brand anywhere, writes 503.
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/public/_prisma/client';
import { objectUrl } from '@/lib/soundtrack/storage';
import { deliveryReady, NOT_READY, readRows, res, strOrNull, writeRows, type RawDb, type Res } from './delivery/probe';
import { bucketFrom, signOwnPut, UploadsComingSoon, type SignDeps } from './delivery/media';
import { checkLogo, cleanAccent, cleanBrandName, LOGO_PREFIX, logoObjectOk, type Branding } from './branding';

export type BrandingDb = RawDb & Pick<PrismaClient, 'facilitatorProfile' | 'coachingProgram'>;
type Env = Readonly<Record<string, string | undefined>>;

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
export const SQL = {
  get: `SELECT "coachId", "name", "accent", "logoPath" FROM "CoachBranding" WHERE "coachId" = ANY($1::text[])`,
  save: `INSERT INTO "CoachBranding" ("coachId", "name", "accent", "updatedAt") VALUES ($1, $2, $3, ${NOW}) ON CONFLICT ("coachId") DO UPDATE SET "name" = EXCLUDED."name", "accent" = EXCLUDED."accent", "updatedAt" = EXCLUDED."updatedAt"`,
  setLogo: `INSERT INTO "CoachBranding" ("coachId", "logoPath", "updatedAt") VALUES ($1, $2, ${NOW}) ON CONFLICT ("coachId") DO UPDATE SET "logoPath" = EXCLUDED."logoPath", "updatedAt" = EXCLUDED."updatedAt"`,
} as const;

/** The public bucket a logo lives in (the existing creator one), or null: no logo uploads, and no logo shown. */
export const logoBucket = (env: Env = process.env): string | null => bucketFrom(env.CREATOR_MEDIA_PUBLIC_BUCKET);

/** Each coach's brand (only the ones that have one). Never throws; empty before the SQL. */
export async function brandingFor(db: RawDb, coachIds: readonly string[], now = Date.now(), env: Env = process.env): Promise<Map<string, Branding>> {
  const out = new Map<string, Branding>();
  if (!coachIds.length) return out;
  const rows = await readRows(db, now, 'branding_read_failed', () => db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.get, [...coachIds]));
  const bucket = logoBucket(env);
  for (const r of rows ?? []) {
    const logoPath = strOrNull(r.logoPath);
    out.set(String(r.coachId), { name: strOrNull(r.name), accent: strOrNull(r.accent), logoUrl: bucket && logoPath ? objectUrl(bucket, logoPath) : null });
  }
  return out;
}

async function certified(db: BrandingDb, userId: string): Promise<boolean> {
  const f = await db.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } }).catch(() => null);
  return f?.certificationStatus === 'certified';
}

export async function brandingBoard(db: BrandingDb, coachId: string, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  if (!(await deliveryReady(db, now.getTime()))) return res(200, { available: false });
  const mine = (await brandingFor(db, [coachId], now.getTime(), env)).get(coachId) ?? { name: null, accent: null, logoUrl: null };
  return res(200, { available: true, branding: mine, uploads: !!logoBucket(env), certified: await certified(db, coachId) });
}

export async function brandingAct(db: BrandingDb, coachId: string, body: unknown, now: Date = new Date(), env: Env = process.env, deps: SignDeps = {}): Promise<Res> {
  const nowMs = now.getTime();
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!(await deliveryReady(db, nowMs))) return NOT_READY;
  if (!(await certified(db, coachId))) return res(403, { error: 'facilitator_not_certified' });
  if (b.action === 'save') {
    const a = cleanAccent(b.accent ?? null);
    if (!a.ok) return res(400, { error: a.error });
    const n = await writeRows(db, nowMs, 'branding_write_failed', () => db.$executeRawUnsafe(SQL.save, coachId, cleanBrandName(b.name), a.accent));
    return n ? res(200, { ok: true }) : res(500, { error: 'not_saved' });
  }
  if (b.action === 'logo_upload') {
    const c = checkLogo(b.contentType, b.bytes);
    if (!c.ok) return res(400, { error: c.error });
    const objectName = `${LOGO_PREFIX}${coachId}/${randomUUID().replace(/-/g, '')}.${c.ext}`;
    try {
      const put = await signOwnPut({ bucket: logoBucket(env), objectName, contentType: String(b.contentType), bytes: Number(b.bytes) }, deps);
      return res(200, { ok: true, objectName, put: { url: put.url, headers: put.headers } });
    } catch (e) {
      if (e instanceof UploadsComingSoon) return res(503, { error: 'uploads_off' });
      throw e;
    }
  }
  if (b.action === 'logo_set') {
    if (!logoBucket(env)) return res(503, { error: 'uploads_off' });
    if (!logoObjectOk(coachId, b.objectName)) return res(400, { error: 'bad_logo' });
    const n = await writeRows(db, nowMs, 'branding_write_failed', () => db.$executeRawUnsafe(SQL.setLogo, coachId, b.objectName));
    return n ? res(200, { ok: true }) : res(500, { error: 'not_saved' });
  }
  if (b.action === 'logo_clear') {
    const n = await writeRows(db, nowMs, 'branding_write_failed', () => db.$executeRawUnsafe(SQL.setLogo, coachId, null));
    return n === null ? NOT_READY : res(200, { ok: true });
  }
  return res(400, { error: 'unknown_action' });
}

/** The brand an athlete sees on Today: the coach of their newest active program, if that coach has one. */
export async function myBranding(db: BrandingDb, athleteId: string, now: Date = new Date(), env: Env = process.env): Promise<Res> {
  if (!(await deliveryReady(db, now.getTime()))) return res(200, { branding: null });
  const p = await db.coachingProgram.findFirst({ where: { clientId: athleteId, isActive: true }, orderBy: { createdAt: 'desc' }, select: { coachId: true } }).catch(() => null);
  if (!p) return res(200, { branding: null });
  return res(200, { branding: (await brandingFor(db, [p.coachId], now.getTime(), env)).get(p.coachId) ?? null });
}
