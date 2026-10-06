// lib/soundtrack/storage.ts — CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06, "storage = Google Cloud Storage").
//
// Creator uploads (songs, stems, voice lines, covers) go to Google Cloud Storage with V4 signed URLs, signed by the
// runtime's own service account through the metadata server and IAM signBlob: no new package. This is a COPY of the
// pattern in lib/coach-store/storage.ts (coach-store owns that file and its private clip bucket); storage.test.ts checks
// the canonical request built here against coach-store's own `canonicalStringToSign`, byte for byte.
//
// TWO BUCKETS, so nothing a reviewer has not passed is ever readable by the public:
//   CREATOR_MEDIA_BUCKET         private. Uploads land under pending/<userId>/<fileId>.<ext>. A lifecycle rule deletes
//                                pending/ after 30 days (owner action), which disposes of rejected work too.
//   CREATOR_MEDIA_PUBLIC_BUCKET  public-read (allUsers: Storage Object Viewer), CORS for the app's origin (WebAudio plays
//                                cross-origin audio as silence without it). An approval COPIES each pending object to
//                                tracks/<userId>/<fileId>.<ext> here, immutable-cached.
// FAILS CLOSED: either name unset (or malformed) and every call throws UploadsComingSoon, which the routes turn into a
// 503 "uploads coming soon". Nothing falls back to the old public S3 path.

import { createHash } from 'node:crypto';

export class UploadsComingSoon extends Error {
  constructor() { super('Uploads coming soon'); this.name = 'UploadsComingSoon'; }
}

const HOST = 'storage.googleapis.com';
export const PENDING_PREFIX = 'pending/';
export const PUBLIC_PREFIX = 'tracks/';
/**
 * PIPELINES (owner, 2026-10-06, "teen private uploads YES: owner-only private area, never public"). A creator who is not
 * a verified 18+ uploads under private/<userId>/ in the PRIVATE bucket. Nothing ever copies that prefix to the public
 * bucket: publicObjectName and pendingObjectOf accept pending/ only, so promoteCardMedia skips it, and the rules in
 * lib/soundtrack/privateUploads.ts keep a card carrying it private, out of review and out of rotation.
 */
export const PRIVATE_PREFIX = 'private/';
export const PUT_TTL_SEC = 15 * 60;
export const GET_TTL_SEC = 60 * 60;
export const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** owner, 2026-10-06: about 8 MB and at most 4 minutes of audio. Covers are small images. */
export const MEDIA_LIMITS = { audioBytes: 8 * 1024 * 1024, imageBytes: 2 * 1024 * 1024, audioSeconds: 240 } as const;

/** What may be uploaded, and the extension it is stored under. mp3/m4a are new (the plan's piece C); wav/webm stay. */
export const MEDIA_MIME: Readonly<Record<string, { ext: string; kind: 'audio' | 'image' }>> = {
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
  'audio/mp4': { ext: 'm4a', kind: 'audio' },
  'audio/x-m4a': { ext: 'm4a', kind: 'audio' },
  'audio/wav': { ext: 'wav', kind: 'audio' },
  'audio/webm': { ext: 'webm', kind: 'audio' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
};

const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,220}$/;

export function creatorMediaBuckets(env: NodeJS.ProcessEnv = process.env): { pending: string; public: string } {
  const pending = (env.CREATOR_MEDIA_BUCKET ?? '').trim();
  const pub = (env.CREATOR_MEDIA_PUBLIC_BUCKET ?? '').trim();
  if (!BUCKET_RE.test(pending) || !BUCKET_RE.test(pub) || pending === pub) throw new UploadsComingSoon();
  return { pending, public: pub };
}

const SEG = /^[A-Za-z0-9_-]{1,80}$/;
const OBJECT_RE = /^(pending|tracks|private)\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{2,5}$/;

/** Reject anything that could climb out of the two prefixes (the regex admits no dot-segments, slashes or escapes). */
export function assertMediaObject(name: string, prefix: string): void {
  if (!name.startsWith(prefix) || !OBJECT_RE.test(name)) throw new Error('bad_object');
}

export function pendingObjectName(userId: string, fileId: string, ext: string): string {
  if (!SEG.test(userId) || !SEG.test(fileId) || !/^[a-z0-9]{2,5}$/.test(ext)) throw new Error('bad_object');
  const name = `${PENDING_PREFIX}${userId}/${fileId}.${ext}`;
  assertMediaObject(name, PENDING_PREFIX);
  return name;
}

/** PIPELINES: an owner-only private upload's object name (teens and unknown-age creators). Never promotable. */
export function privateObjectName(userId: string, fileId: string, ext: string): string {
  if (!SEG.test(userId) || !SEG.test(fileId) || !/^[a-z0-9]{2,5}$/.test(ext)) throw new Error('bad_object');
  const name = `${PRIVATE_PREFIX}${userId}/${fileId}.${ext}`;
  assertMediaObject(name, PRIVATE_PREFIX);
  return name;
}

export const publicObjectName = (pendingName: string): string => {
  assertMediaObject(pendingName, PENDING_PREFIX);
  return PUBLIC_PREFIX + pendingName.slice(PENDING_PREFIX.length);
};

export const objectUrl = (bucket: string, objectName: string): string => `https://${HOST}/${bucket}/${objectName}`;

/** A URL this module issued for the pending bucket → its object name; anything else (S3, house audio, a data URL) → null. */
export function pendingObjectOf(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  let pending: string;
  try { pending = creatorMediaBuckets(env).pending; } catch { return null; }
  const base = `https://${HOST}/${pending}/`;
  if (typeof url !== 'string' || !url.startsWith(base)) return null;
  const name = url.slice(base.length);
  try { assertMediaObject(name, PENDING_PREFIX); return name; } catch { return null; }
}

// ── V4 signing (the coach-store pattern) ────────────────────────────────────────────────────────────────────────────
export interface SignDeps {
  now?: () => Date;
  sign?: (stringToSign: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  token?: () => Promise<{ accessToken: string; email: string }>;
  env?: NodeJS.ProcessEnv;
}

function rfc3986(v: string): string {
  return encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
const encodePath = (bucket: string, objectName: string) => `/${rfc3986(bucket)}/${objectName.split('/').map(rfc3986).join('/')}`;
function stamp(d: Date): { date: string; datestamp: string } {
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return { date: iso, datestamp: iso.slice(0, 8) };
}
const sha256hex = (v: string) => createHash('sha256').update(v).digest('hex');

export interface SignInput {
  method: 'PUT' | 'GET'; bucket: string; objectName: string; expiresSec: number; now: Date; email: string;
  contentType?: string; bytes?: number;
}

/** The canonical request and string-to-sign (exported for the cross-check against coach-store's builder). */
export function buildSignedRequest(input: SignInput): { stringToSign: string; urlBase: string; headers: Record<string, string> } {
  const { date, datestamp } = stamp(input.now);
  const scope = `${datestamp}/auto/storage/goog4_request`;
  const headerMap: Record<string, string> = { host: HOST };
  const browser: Record<string, string> = {};
  if (input.method === 'PUT') {
    // The SIZE IS BOUND INTO THE SIGNATURE: GCS refuses a body of any other length (owner, 2026-10-06: "bind the size").
    headerMap['content-type'] = input.contentType ?? '';
    headerMap['x-goog-content-length-range'] = `${input.bytes},${input.bytes}`;
    browser['Content-Type'] = input.contentType ?? '';
    browser['x-goog-content-length-range'] = `${input.bytes},${input.bytes}`;
  }
  const names = Object.keys(headerMap).sort();
  const canonicalHeaders = names.map((h) => `${h}:${headerMap[h]}\n`).join('');
  const signedHeaders = names.join(';');
  const query: [string, string][] = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', `${input.email}/${scope}`],
    ['X-Goog-Date', date],
    ['X-Goog-Expires', String(input.expiresSec)],
    ['X-Goog-SignedHeaders', signedHeaders],
  ];
  const canonicalQuery = query.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
  const path = encodePath(input.bucket, input.objectName);
  const canonical = [input.method, path, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['GOOG4-RSA-SHA256', date, scope, sha256hex(canonical)].join('\n');
  return { stringToSign, urlBase: `https://${HOST}${path}?${canonicalQuery}`, headers: browser };
}

async function metadataIdentity(fetchImpl: typeof fetch): Promise<{ accessToken: string; email: string }> {
  const headers = { 'Metadata-Flavor': 'Google' };
  const [tokenRes, emailRes] = await Promise.all([
    fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers }),
    fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', { headers }),
  ]);
  if (!tokenRes.ok || !emailRes.ok) throw new UploadsComingSoon();
  const tokenJson = await tokenRes.json() as { access_token?: string };
  const email = (await emailRes.text()).trim();
  if (!tokenJson.access_token || !email) throw new UploadsComingSoon();
  return { accessToken: tokenJson.access_token, email };
}

const identity = (deps: SignDeps) => deps.token ? deps.token() : metadataIdentity(deps.fetchImpl ?? fetch);

async function signBlob(stringToSign: string, deps: SignDeps): Promise<string> {
  if (deps.sign) return deps.sign(stringToSign);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const id = await identity(deps);
  const res = await fetchImpl(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(id.email)}:signBlob`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${id.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: Buffer.from(stringToSign).toString('base64') }),
  });
  if (!res.ok) throw new UploadsComingSoon();
  const json = await res.json() as { signedBlob?: string };
  if (!json.signedBlob) throw new UploadsComingSoon();
  return Buffer.from(json.signedBlob, 'base64').toString('hex');
}

async function serviceEmail(deps: SignDeps): Promise<string> {
  if (deps.token) return (await deps.token()).email;
  if (deps.sign) return 'signer@test.iam.gserviceaccount.com';
  return (await metadataIdentity(deps.fetchImpl ?? fetch)).email;
}

/** Checks a requested upload against the limits. Returns the file's extension, or an error a player can read. */
export function checkUpload(input: { contentType: unknown; bytes: unknown; durationSec?: unknown }):
  { ok: true; ext: string; kind: 'audio' | 'image' } | { ok: false; error: string } {
  const spec = typeof input.contentType === 'string' ? MEDIA_MIME[input.contentType] : undefined;
  if (!spec) return { ok: false, error: 'unsupported content type' };
  const max = spec.kind === 'audio' ? MEDIA_LIMITS.audioBytes : MEDIA_LIMITS.imageBytes;
  const b = input.bytes;
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 1) return { ok: false, error: 'bytes: the file size is required' };
  if (b > max) return { ok: false, error: spec.kind === 'audio' ? 'Audio files can be up to 8 MB.' : 'Images can be up to 2 MB.' };
  if (spec.kind === 'audio') {
    const d = input.durationSec;
    if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return { ok: false, error: 'durationSec: the track length is required' };
    if (d > MEDIA_LIMITS.audioSeconds) return { ok: false, error: 'Tracks can be up to 4 minutes.' };
  }
  return { ok: true, ext: spec.ext, kind: spec.kind };
}

/** A signed PUT for one pending upload, exactly `bytes` long. */
export async function signCreatorPut(input: { objectName: string; contentType: string; bytes: number }, deps: SignDeps = {}):
  Promise<{ url: string; headers: Record<string, string>; pendingUrl: string }> {
  const chk = checkUpload({ contentType: input.contentType, bytes: input.bytes, durationSec: 1 });
  if (!chk.ok) throw new Error(chk.error);
  // PIPELINES: a private/ upload signs the same way, into the same private bucket (never the public one).
  assertMediaObject(input.objectName, input.objectName.startsWith(PRIVATE_PREFIX) ? PRIVATE_PREFIX : PENDING_PREFIX);
  const { pending } = creatorMediaBuckets(deps.env);
  const now = (deps.now ?? (() => new Date()))();
  const email = await serviceEmail(deps);
  const built = buildSignedRequest({
    method: 'PUT', bucket: pending, objectName: input.objectName, expiresSec: PUT_TTL_SEC, now, email,
    contentType: input.contentType, bytes: input.bytes,
  });
  const signature = await signBlob(built.stringToSign, deps);
  return { url: `${built.urlBase}&X-Goog-Signature=${signature}`, headers: built.headers, pendingUrl: objectUrl(pending, input.objectName) };
}

/** A short-lived GET for review staff to hear a pending upload. */
export async function signPendingGet(objectName: string, deps: SignDeps = {}): Promise<string> {
  assertMediaObject(objectName, PENDING_PREFIX);
  const { pending } = creatorMediaBuckets(deps.env);
  const now = (deps.now ?? (() => new Date()))();
  const email = await serviceEmail(deps);
  const built = buildSignedRequest({ method: 'GET', bucket: pending, objectName, expiresSec: GET_TTL_SEC, now, email });
  return `${built.urlBase}&X-Goog-Signature=${await signBlob(built.stringToSign, deps)}`;
}

/**
 * PIPELINES: a short-lived GET for the OWNER to hear or see one of their own private uploads. `ownerSeg` is the owner's
 * id as the upload route wrote it into the name; an object under anyone else's private/ folder is refused.
 */
export async function signPrivateGet(objectName: string, ownerSeg: string, deps: SignDeps = {}): Promise<string> {
  assertMediaObject(objectName, PRIVATE_PREFIX);
  if (!objectName.startsWith(`${PRIVATE_PREFIX}${ownerSeg}/`)) throw new Error('bad_object');
  const { pending } = creatorMediaBuckets(deps.env);
  const now = (deps.now ?? (() => new Date()))();
  const email = await serviceEmail(deps);
  const built = buildSignedRequest({ method: 'GET', bucket: pending, objectName, expiresSec: GET_TTL_SEC, now, email });
  return `${built.urlBase}&X-Goog-Signature=${await signBlob(built.stringToSign, deps)}`;
}

/**
 * Copy one approved pending object into the public bucket (GCS rewrite, which may take several calls for a large
 * object), immutable-cached. Returns the public URL.
 */
export async function promoteToPublic(objectName: string, deps: SignDeps = {}): Promise<string> {
  const { pending, public: pub } = creatorMediaBuckets(deps.env);
  const dest = publicObjectName(objectName);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const id = await identity(deps);
  const ext = objectName.slice(objectName.lastIndexOf('.') + 1);
  const contentType = Object.entries(MEDIA_MIME).find(([, v]) => v.ext === ext)?.[0];
  const base = `https://${HOST}/storage/v1/b/${encodeURIComponent(pending)}/o/${encodeURIComponent(objectName)}/rewriteTo/b/${encodeURIComponent(pub)}/o/${encodeURIComponent(dest)}`;
  let token: string | undefined;
  for (let i = 0; i < 8; i++) {
    const res = await fetchImpl(token ? `${base}?rewriteToken=${encodeURIComponent(token)}` : base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${id.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cacheControl: PUBLIC_CACHE_CONTROL, ...(contentType ? { contentType } : {}) }),
    });
    if (!res.ok) throw new UploadsComingSoon();
    const json = await res.json() as { done?: boolean; rewriteToken?: string };
    if (json.done) return objectUrl(pub, dest);
    token = json.rewriteToken;
    if (!token) break;
  }
  throw new UploadsComingSoon();
}

/** Every media URL a card payload carries, whatever its discipline (payload v1 and the plan's v2 mixUrl). */
export function mediaUrlsOf(art: unknown): string[] {
  const a = (art ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const k of ['mixUrl', 'performanceUrl', 'coverArtUrl', 'coverUrl', 'photoUrl', 'highlightReelUrl']) {
    if (typeof a[k] === 'string' && a[k]) out.push(a[k] as string);
  }
  if (Array.isArray(a.stemUrls)) for (const u of a.stemUrls) if (typeof u === 'string' && u) out.push(u);
  return [...new Set(out)];
}

/** On approval: copy each of the card's pending uploads to the public bucket. pendingUrl → publicUrl. */
export async function promoteCardMedia(art: unknown, deps: SignDeps = {}): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const url of mediaUrlsOf(art)) {
    const name = pendingObjectOf(url, deps.env);
    if (name) map[url] = await promoteToPublic(name, deps);
  }
  return map;
}

/** For review staff: url → a signed GET for each pending upload (others pass through). Never throws: no bucket = {}. */
export async function cardMediaPreview(art: unknown, deps: SignDeps = {}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const url of mediaUrlsOf(art)) {
    const name = pendingObjectOf(url, deps.env);
    if (!name) continue;
    try { out[url] = await signPendingGet(name, deps); } catch { /* the bucket is not set up: no preview link */ }
  }
  return out;
}
