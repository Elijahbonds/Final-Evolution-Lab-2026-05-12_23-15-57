// SHARE LINKS FOR STUDIO VENUES (NEX-06, round 8; docs/NEXUS-ROADMAP.md §2.3, §3.2; owner 2026-10-20 Q5–Q7).
//
// THE RULES, AS DECIDED:
//   who opens   any SIGNED-IN account (Q5). A link is unlisted: nothing lists it, it works at once (Q7).
//   who makes   the owner (founder / admin) and verified adults (18+, the strict rule creative cards use: isVerifiedAdultStrict).
//               A teen builds but stays private: no link (Q6). Today only the Studio's audience can reach the Studio at all
//               (audience.ts: founder and admin), so every route here re-checks that too.
//   what shows  the venue and the creator's display name (Q6). Never a look code or a cast (published.ts publicView), never an
//               account id.
//   moderation  the venue's typed text (its name, every script banner) is SCREENED at create (shareScreen.ts, the safety lane's
//               screen once it lands); the same publish gate as a published venue (keep-out, readability, the phone column the
//               editor measured); a report button on the landing (the safety lane's report flow, shareReport.ts); founder /
//               admin TAKEDOWN nulls the payload; the creator's REVOKE does the same. Revoked, taken down, unknown and malformed
//               links all answer the same "not found".
//   practice    a shared venue plays as PRACTICE: the run is started unpaid (components/games/game-shell.tsx reads `?share=`
//               as a playtest run), never in a competitive context (runtime.ts drops it there), never ranked or staked.
//
// THE TOKEN is 192 bits (lib/share/service.ts's size), shown to the creator once; the table keeps only its sha256.
// STORAGE is pending SQL (prisma/pending/2026-10-26-studio-share.sql), read through the coach pendingSchema seam: before the owner
// applies it every call answers `not_ready` (503), never a 500, and it switches on within ~5 minutes after.
// Every statement is parameterised; nothing from a request is put into SQL text.

import { createHash, randomBytes } from 'node:crypto';
import { isVerifiedAdultStrict } from '@/lib/age/ageRules';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { sanitizeVenueExport, type StudioVenueExport } from './exportVenue';
import { publicView } from './published';
import { publishGate, type PhoneSample } from './publishGate';
import { screenShareText } from './shareScreen';
import { modeRoute } from './shareHandoff';
import { studioAudienceAllows } from './audience';
import { targetOf } from './targets';

export const SHARE_TABLE = 'StudioShareLink';
export const shareProbe = pendingProbe('studio_share', `SELECT 1 FROM information_schema.tables WHERE table_name = 'StudioShareLink'`);

/** Caps (new, assumption): live links per creator, and links made per hour. */
export const SHARE_LIMITS = { livePerCreator: 50, perHour: 20 } as const;

/** 192 bits, base64url (32 characters). */
export function newShareToken(): string { return randomBytes(24).toString('base64url'); }
export function hashShareToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function isShareToken(x: unknown): x is string { return typeof x === 'string' && /^[A-Za-z0-9_-]{32}$/.test(x); }
const newId = (): string => `ssl_${randomBytes(12).toString('base64url')}`;
export function isShareId(x: unknown): x is string { return typeof x === 'string' && /^ssl_[A-Za-z0-9_-]{16}$/.test(x); }

export type MakerAnswer = 'ok' | 'teen' | 'unknown_age';
/** May this account MAKE a link? The owner's roles always; anyone else only a verified adult (strict). */
export function shareMakerAllowed(role: string | null | undefined, dobYear: number | null | undefined, now: Date = new Date()): MakerAnswer {
  if (studioAudienceAllows(role)) return 'ok';
  if (isVerifiedAdultStrict(dobYear, now)) return 'ok';
  return typeof dobYear === 'number' ? 'teen' : 'unknown_age';
}

/** Every text a creator typed that a viewer will read: the venue's name and its scripts' banner lines. */
export function typedTexts(exp: StudioVenueExport): Array<{ field: string; text: string }> {
  const out = [{ field: 'venue name', text: exp.name }];
  for (const s of exp.scripts ?? []) for (const n of s.nodes) if (n.kind === 'banner' && typeof n.params.text === 'string') out.push({ field: 'banner', text: n.params.text });
  return out;
}

export type SharePrep = { ok: true; exp: StudioVenueExport } | { ok: false; problems: string[] };

/** The venue a link may carry: sanitised, without a cast, through the publish gate and the text screen. */
export function prepareShare(raw: unknown, phone: PhoneSample | null): SharePrep {
  const s = sanitizeVenueExport(raw);
  if (!s || !targetOf(s.target)) return { ok: false, problems: ['This is not a venue a mode can play.'] };
  const exp = publicView(s);
  const problems = publishGate(exp, phone).problems.map((p) => p.message);
  for (const t of typedTexts(exp)) {
    const r = screenShareText(t.text);
    if (!r.ok) problems.push(`The ${t.field} “${t.text}” has a word that is not allowed here (“${r.found}”). Change it and share again.`);
  }
  return problems.length ? { ok: false, problems } : { ok: true, exp };
}

/** Where a link opens: the mode's own page, with the hand-off key (the live tiebreak is Tennis's variant). STUDIO-EASY: the table
 *  moved to shareHandoff.ts (client-safe, no node crypto) so the Studio's production Play-test opens the same pages. */
export function shareRoute(mode: string, key: string): string | null { return modeRoute(mode, key); }

export { SHARE_HANDOFF_PREFIX } from './shareHandoff';

// ── the database (pending SQL) ──────────────────────────────────────────────────────────────────────────────────────────

export type ShareResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; problems?: string[] };
const notReady = { ok: false as const, status: 503, error: 'share_not_ready' };

async function ready(db: RawDb, now: number): Promise<boolean> { return shareProbe.ready(db, now); }

/** Make a link. The caller has checked the session, the audience and shareMakerAllowed. */
export async function createShareLink(db: RawDb, o: { creatorId: string; creatorName: string | null; venue: unknown; phone: PhoneSample | null; now?: number }): Promise<ShareResult<{ id: string; token: string; mode: string; venueName: string }>> {
  const now = o.now ?? Date.now();
  const prep = prepareShare(o.venue, o.phone);
  if (!prep.ok) return { ok: false, status: 422, error: 'share_refused', problems: prep.problems };
  if (!(await ready(db, now))) return notReady;
  try {
    const live = await db.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*)::int AS n FROM "StudioShareLink" WHERE "creatorId" = $1 AND "status" = 'live'`, o.creatorId);
    if (Number(live?.[0]?.n ?? 0) >= SHARE_LIMITS.livePerCreator) return { ok: false, status: 429, error: 'too_many_links' };
    const recent = await db.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*)::int AS n FROM "StudioShareLink" WHERE "creatorId" = $1 AND "createdAt" > $2`, o.creatorId, new Date(now - 3_600_000));
    if (Number(recent?.[0]?.n ?? 0) >= SHARE_LIMITS.perHour) return { ok: false, status: 429, error: 'rate_limited' };
    const id = newId();
    const token = newShareToken();
    const name = o.creatorName ? o.creatorName.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60) : null;
    const screenedName = name && screenShareText(name).ok ? name : null;   // a display name that trips the screen is not shown
    await db.$executeRawUnsafe(
      `INSERT INTO "StudioShareLink" ("id", "tokenHash", "creatorId", "creatorName", "mode", "venueName", "payload", "status", "opens", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'live', 0, $8)`,
      id, hashShareToken(token), o.creatorId, screenedName, prep.exp.target, prep.exp.name, JSON.stringify(prep.exp), new Date(now),
    );
    return { ok: true, value: { id, token, mode: prep.exp.target, venueName: prep.exp.name } };
  } catch (e) {
    shareProbe.fail('studio_share_create_failed', e, now);
    return { ok: false, status: 503, error: 'share_not_ready' };
  }
}

export interface OpenedShare { id: string; mode: string; venueName: string; creatorName: string | null; venue: StudioVenueExport }

/** Open a link (any signed-in account). Revoked, taken down, unknown and malformed are the same null. Counts the open. */
export async function openShareLink(db: RawDb, token: unknown, now: number = Date.now()): Promise<ShareResult<OpenedShare | null>> {
  if (!isShareToken(token)) return { ok: true, value: null };
  if (!(await ready(db, now))) return notReady;
  try {
    const rows = await db.$queryRawUnsafe<Array<{ id: string; mode: string; venueName: string; creatorName: string | null; payload: unknown }>>(
      `SELECT "id", "mode", "venueName", "creatorName", "payload" FROM "StudioShareLink" WHERE "tokenHash" = $1 AND "status" = 'live' AND "payload" IS NOT NULL`, hashShareToken(token));
    const r = rows?.[0];
    if (!r) return { ok: true, value: null };
    // the stored payload is read as untrusted again (a hand-edited row cannot carry a cast or skip the sanitiser)
    const raw = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
    const venue = sanitizeVenueExport(raw);
    if (!venue || venue.target !== r.mode) return { ok: true, value: null };
    await db.$executeRawUnsafe(`UPDATE "StudioShareLink" SET "opens" = "opens" + 1 WHERE "id" = $1`, r.id);
    return { ok: true, value: { id: r.id, mode: r.mode, venueName: r.venueName, creatorName: r.creatorName, venue: publicView(venue) } };
  } catch (e) {
    shareProbe.fail('studio_share_open_failed', e, now);
    return notReady;
  }
}

/** The creator revokes their own link: the payload is deleted. Anyone else's link, or none, is the same `false`. */
export async function revokeShareLink(db: RawDb, id: unknown, creatorId: string, now: number = Date.now()): Promise<ShareResult<boolean>> {
  if (!isShareId(id)) return { ok: true, value: false };
  if (!(await ready(db, now))) return notReady;
  try {
    const n = await db.$executeRawUnsafe(`UPDATE "StudioShareLink" SET "payload" = NULL, "status" = 'revoked', "endedAt" = $3 WHERE "id" = $1 AND "creatorId" = $2 AND "status" = 'live'`, id, creatorId, new Date(now));
    return { ok: true, value: Number(n) > 0 };
  } catch (e) { shareProbe.fail('studio_share_revoke_failed', e, now); return notReady; }
}

/** Founder / admin take a link down (the caller checked the database role): the payload is deleted. */
export async function takedownShareLink(db: RawDb, id: unknown, now: number = Date.now()): Promise<ShareResult<boolean>> {
  if (!isShareId(id)) return { ok: true, value: false };
  if (!(await ready(db, now))) return notReady;
  try {
    const n = await db.$executeRawUnsafe(`UPDATE "StudioShareLink" SET "payload" = NULL, "status" = 'taken_down', "endedAt" = $2 WHERE "id" = $1 AND "status" <> 'taken_down'`, id, new Date(now));
    return { ok: true, value: Number(n) > 0 };
  } catch (e) { shareProbe.fail('studio_share_takedown_failed', e, now); return notReady; }
}

export interface MyShare { id: string; mode: string; venueName: string; status: string; opens: number; createdAt: string }

/** The creator's own links (no token: it is never stored). */
export async function listShareLinks(db: RawDb, creatorId: string, now: number = Date.now()): Promise<ShareResult<MyShare[]>> {
  if (!(await ready(db, now))) return notReady;
  try {
    const rows = await db.$queryRawUnsafe<Array<{ id: string; mode: string; venueName: string; status: string; opens: number; createdAt: Date }>>(
      `SELECT "id", "mode", "venueName", "status", "opens", "createdAt" FROM "StudioShareLink" WHERE "creatorId" = $1 ORDER BY "createdAt" DESC LIMIT 100`, creatorId);
    return { ok: true, value: (rows ?? []).map((r) => ({ id: r.id, mode: r.mode, venueName: r.venueName, status: r.status, opens: Number(r.opens), createdAt: new Date(r.createdAt).toISOString() })) };
  } catch (e) { shareProbe.fail('studio_share_list_failed', e, now); return notReady; }
}
