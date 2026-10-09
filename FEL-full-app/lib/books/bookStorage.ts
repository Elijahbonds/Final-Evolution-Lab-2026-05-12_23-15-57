/**
 * Short-lived V4 signed URLs for the private Firebase Storage bucket.
 *
 * The bucket is a Cloud Storage bucket. Objects stay private; this signature
 * is the only way a browser reads one. No public download URL is built here.
 */

import { createHash, createSign, type KeyObject } from 'crypto';

export const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;
const HOST = 'storage.googleapis.com';

export interface GcsSignInput {
  bucket: string;
  objectPath: string;
  clientEmail: string;
  privateKey: string | KeyObject;
  ttlSeconds: number;
  now?: Date;
  contentType: string;
  disposition: 'inline' | 'attachment';
  downloadName: string;
}

export function clampSignedUrlTtl(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return 600;
  return Math.min(Math.floor(ttlSeconds), MAX_SIGNED_URL_TTL_SECONDS);
}

function safeDownloadName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || 'download').slice(0, 120);
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function canonicalQuery(pairs: Array<[string, string]>): string {
  return [...pairs]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Sign one GET. Throws if the object is outside `books/` so a bug in the
 * caller cannot mint a URL for the rest of the bucket.
 */
export function signGcsV4(input: GcsSignInput): string {
  if (!input.objectPath.startsWith('books/') || input.objectPath.includes('..') || input.objectPath.includes('\\')) {
    throw new Error('refusing to sign a path outside the book library');
  }
  if (!input.bucket || !input.clientEmail) throw new Error('storage signer is not configured');

  const ttl = clampSignedUrlTtl(input.ttlSeconds);
  const now = input.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const day = stamp.slice(0, 8);
  const scope = `${day}/auto/storage/goog4_request`;
  const credential = `${input.clientEmail}/${scope}`;
  const disposition = `${input.disposition}; filename="${safeDownloadName(input.downloadName)}"`;

  const pairs: Array<[string, string]> = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', credential],
    ['X-Goog-Date', stamp],
    ['X-Goog-Expires', String(ttl)],
    ['X-Goog-SignedHeaders', 'host'],
    ['response-content-disposition', disposition],
    ['response-content-type', input.contentType],
  ];
  const query = canonicalQuery(pairs);
  const canonicalUri = `/${encodePath(`${input.bucket}/${input.objectPath}`)}`;
  const canonical = [
    'GET',
    canonicalUri,
    query,
    `host:${HOST}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const hash = createHash('sha256').update(canonical).digest('hex');
  const toSign = ['GOOG4-RSA-SHA256', stamp, scope, hash].join('\n');
  const signature = createSign('RSA-SHA256').update(toSign).sign(input.privateKey).toString('hex');
  return `https://${HOST}${canonicalUri}?${query}&X-Goog-Signature=${signature}`;
}

export interface BookStorageConfig {
  bucket: string;
  clientEmail: string;
  privateKey: string;
}

/** Credentials from the environment. Missing config returns null — never a public URL. */
export function bookStorageConfig(env: NodeJS.ProcessEnv = process.env): BookStorageConfig | null {
  const bucket = env.FIREBASE_STORAGE_BUCKET || 'final-evolution-lab.firebasestorage.app';
  const json = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        return { bucket, clientEmail: parsed.client_email, privateKey: parsed.private_key };
      }
    } catch {
      return null;
    }
    return null;
  }
  const clientEmail = env.FIREBASE_CLIENT_EMAIL || '';
  const privateKey = (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) return null;
  return { bucket, clientEmail, privateKey };
}

export function signedUrlTtl(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.BOOK_SIGNED_URL_TTL_SECONDS ?? 600);
  return clampSignedUrlTtl(raw);
}
