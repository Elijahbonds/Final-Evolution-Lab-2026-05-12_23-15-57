/**
 * V4 signed URLs for the private clip bucket. The bucket name comes from COACH_REVIEWS_BUCKET.
 * Signing uses the metadata-server token and IAM signBlob. No extra package.
 * Originals live under coach-reviews/originals/. Replies live under coach-reviews/replies/
 * so a 90-day lifecycle rule on originals/ cannot delete a coach's annotated video.
 */
import { createHash } from 'node:crypto';
import { CLIP_MIME, GET_TTL_SEC, MAX_CLIP_BYTES, ORIGINALS_PREFIX, PUT_TTL_SEC, REPLIES_PREFIX } from './constants';

export class UploadsComingSoon extends Error {
  constructor() {
    super('Uploads coming soon');
    this.name = 'UploadsComingSoon';
  }
}

const HOST = 'storage.googleapis.com';

export function reviewsBucket(env: NodeJS.ProcessEnv = process.env): string {
  const name = (env.COACH_REVIEWS_BUCKET ?? '').trim();
  if (!name || !/^[a-z0-9][a-z0-9._-]{1,220}$/.test(name)) throw new UploadsComingSoon();
  return name;
}

function decodeRepeated(value: string): string {
  let cur = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return cur;
}

/** Reject anything that could climb out of the reviews prefix. */
export function assertObjectName(name: string): void {
  const decoded = decodeRepeated(name);
  const bad = name.includes('..') || decoded.includes('..') || name.includes('\\') || name.startsWith('/')
    || /%(?:2e|2E)\.|\.(?:%2e|%2E)|%(?:2e|2E)%(?:2e|2E)/.test(name);
  if (bad) throw new Error('bad_object');
  if (!name.startsWith(ORIGINALS_PREFIX) && !name.startsWith(REPLIES_PREFIX)) throw new Error('bad_object');
  if (!/^coach-reviews\/(?:originals|replies)\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(name)) throw new Error('bad_object');
}

export function originalObjectName(bookingId: string, fileId: string, ext: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(bookingId) || !/^[A-Za-z0-9_-]+$/.test(fileId)) throw new Error('bad_object');
  if (!/^[a-z0-9]+$/.test(ext)) throw new Error('bad_object');
  const name = `${ORIGINALS_PREFIX}${bookingId}/${fileId}.${ext}`;
  assertObjectName(name);
  return name;
}

export function replyObjectName(bookingId: string, fileId: string, ext: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(bookingId) || !/^[A-Za-z0-9_-]+$/.test(fileId)) throw new Error('bad_object');
  if (!/^[a-z0-9]+$/.test(ext)) throw new Error('bad_object');
  const name = `${REPLIES_PREFIX}${bookingId}/${fileId}.${ext}`;
  assertObjectName(name);
  return name;
}

export function extForMime(mime: string): string | null {
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  return null;
}

export function mimeAllowed(mime: string): boolean {
  return (CLIP_MIME as readonly string[]).includes(mime);
}

export interface SignDeps {
  now?: () => Date;
  /** Signs the string-to-sign and returns the raw signature bytes as hex. */
  sign?: (stringToSign: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  token?: () => Promise<{ accessToken: string; email: string }>;
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(bucket: string, objectName: string): string {
  return `/${rfc3986(bucket)}/${objectName.split('/').map(rfc3986).join('/')}`;
}

function stamp(d: Date): { date: string; datestamp: string } {
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return { date: iso, datestamp: iso.slice(0, 8) };
}

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function defaultSign(stringToSign: string, deps: SignDeps): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = deps.token
    ? await deps.token()
    : await metadataIdentity(fetchImpl);
  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(token.email)}:signBlob`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: Buffer.from(stringToSign).toString('base64') }),
  });
  if (!res.ok) throw new UploadsComingSoon();
  const json = await res.json() as { signedBlob?: string };
  if (!json.signedBlob) throw new UploadsComingSoon();
  return Buffer.from(json.signedBlob, 'base64').toString('hex');
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

function signedUrl(input: {
  method: 'PUT' | 'GET';
  bucket: string;
  objectName: string;
  expiresSec: number;
  now: Date;
  contentType?: string;
  bytes?: number;
  signature: string;
  email: string;
}): { url: string; headers: Record<string, string> } {
  const { date, datestamp } = stamp(input.now);
  const scope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${input.email}/${scope}`;
  const headers: Record<string, string> = { host: HOST };
  if (input.method === 'PUT') {
    headers['content-type'] = input.contentType ?? '';
    headers['x-goog-content-length-range'] = `${input.bytes},${input.bytes}`;
  }
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const query: [string, string][] = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', credential],
    ['X-Goog-Date', date],
    ['X-Goog-Expires', String(input.expiresSec)],
    ['X-Goog-SignedHeaders', signedHeaders],
  ];
  const canonicalQuery = query.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
  const path = encodePath(input.bucket, input.objectName);
  const canonical = [input.method, path, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['GOOG4-RSA-SHA256', date, scope, sha256hex(canonical)].join('\n');
  // signature is already computed by the caller from this same string. Rebuilt here only to attach it.
  void stringToSign;
  const url = `https://${HOST}${path}?${canonicalQuery}&X-Goog-Signature=${input.signature}`;
  const browser: Record<string, string> = {};
  if (input.method === 'PUT' && input.contentType && input.bytes) {
    browser['Content-Type'] = input.contentType;
    browser['x-goog-content-length-range'] = `${input.bytes},${input.bytes}`;
  }
  return { url, headers: browser };
}

export async function canonicalStringToSign(input: {
  method: 'PUT' | 'GET';
  bucket: string;
  objectName: string;
  expiresSec: number;
  now: Date;
  email: string;
  contentType?: string;
  bytes?: number;
}): Promise<string> {
  const built = await buildRequest(input);
  return built.stringToSign;
}

async function buildRequest(input: {
  method: 'PUT' | 'GET';
  bucket: string;
  objectName: string;
  expiresSec: number;
  now: Date;
  email: string;
  contentType?: string;
  bytes?: number;
}): Promise<{ stringToSign: string; urlBase: string; headers: Record<string, string> }> {
  const { date, datestamp } = stamp(input.now);
  const scope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${input.email}/${scope}`;
  const headerMap: Record<string, string> = { host: HOST };
  const browser: Record<string, string> = {};
  if (input.method === 'PUT') {
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
    ['X-Goog-Credential', credential],
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

export async function signGetUrl(objectName: string, deps: SignDeps = {}, ttlSec = GET_TTL_SEC): Promise<string> {
  assertObjectName(objectName);
  const expires = Math.min(Math.max(1, ttlSec), GET_TTL_SEC);
  const bucket = reviewsBucket();
  const now = (deps.now ?? (() => new Date()))();
  const email = 'signer';
  const built = await buildRequest({ method: 'GET', bucket, objectName, expiresSec: expires, now, email: deps.sign ? email : email });
  // email in the credential must be the service account. When a custom signer is injected, tests pass it via token.
  return finish(built, deps, { method: 'GET', bucket, objectName, expiresSec: expires, now });
}

async function serviceEmail(deps: SignDeps): Promise<string> {
  if (deps.token) return (await deps.token()).email;
  if (deps.sign) return 'signer@test.iam.gserviceaccount.com';
  const fetchImpl = deps.fetchImpl ?? fetch;
  return (await metadataIdentity(fetchImpl)).email;
}

async function finish(
  _pre: { stringToSign: string; urlBase: string; headers: Record<string, string> },
  deps: SignDeps,
  input: { method: 'PUT' | 'GET'; bucket: string; objectName: string; expiresSec: number; now: Date; contentType?: string; bytes?: number },
): Promise<string> {
  const email = await serviceEmail(deps);
  const built = await buildRequest({ ...input, email });
  const signature = deps.sign ? await deps.sign(built.stringToSign) : await defaultSign(built.stringToSign, deps);
  return `${built.urlBase}&X-Goog-Signature=${signature}`;
}

/**
 * Deletes one original clip with the runtime token. A 404 counts as already gone.
 * Replies are refused here so a sweep cannot remove annotated video.
 */
export async function deleteOriginalObject(
  objectName: string,
  deps: Pick<SignDeps, 'fetchImpl' | 'token'> = {},
): Promise<'deleted' | 'missing'> {
  assertObjectName(objectName);
  if (!objectName.startsWith(ORIGINALS_PREFIX)) throw new Error('bad_object');
  const bucket = reviewsBucket();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = deps.token ? await deps.token() : await metadataIdentity(fetchImpl);
  const url = `https://${HOST}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
  const res = await fetchImpl(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (res.status === 404) return 'missing';
  if (!res.ok) throw new UploadsComingSoon();
  return 'deleted';
}

export async function signPutUrl(input: {
  objectName: string;
  contentType: string;
  bytes: number;
}, deps: SignDeps = {}): Promise<{ url: string; headers: Record<string, string> }> {
  if (!mimeAllowed(input.contentType)) throw new Error('bad_type');
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_CLIP_BYTES) {
    throw new Error('Trim to 60 seconds or less.');
  }
  assertObjectName(input.objectName);
  const bucket = reviewsBucket();
  const now = (deps.now ?? (() => new Date()))();
  const email = await serviceEmail(deps);
  const built = await buildRequest({
    method: 'PUT', bucket, objectName: input.objectName, expiresSec: PUT_TTL_SEC, now, email,
    contentType: input.contentType, bytes: input.bytes,
  });
  const signature = deps.sign ? await deps.sign(built.stringToSign) : await defaultSign(built.stringToSign, deps);
  return { url: `${built.urlBase}&X-Goog-Signature=${signature}`, headers: built.headers };
}

// signedUrl is kept for readers of the request shape; finish() is what the routes call.
void signedUrl;
