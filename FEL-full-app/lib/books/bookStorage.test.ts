import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bookStorageConfig, clampSignedUrlTtl, signGcsV4 } from './bookStorage';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function verifySignedGet(url: string): boolean {
  const parsed = new URL(url);
  const signature = parsed.searchParams.get('X-Goog-Signature');
  if (!signature) return false;
  const pairs: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, key) => {
    if (key !== 'X-Goog-Signature') pairs.push([key, value]);
  });
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const query = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  const canonical = [
    'GET',
    parsed.pathname,
    query,
    'host:storage.googleapis.com',
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const hash = createHash('sha256').update(canonical).digest('hex');
  const date = parsed.searchParams.get('X-Goog-Date')!;
  const credential = parsed.searchParams.get('X-Goog-Credential')!;
  const scope = credential.slice(credential.indexOf('/') + 1);
  const toSign = ['GOOG4-RSA-SHA256', date, scope, hash].join('\n');
  return createVerify('RSA-SHA256').update(toSign).verify(publicKey, Buffer.from(signature, 'hex'));
}

describe('private book storage signatures', () => {
  const now = new Date('2026-09-26T18:00:00.000Z');

  it('signs a short-lived URL on the storage host and not a public download link', () => {
    const url = signGcsV4({
      bucket: 'final-evolution-lab.firebasestorage.app',
      objectPath: 'books/blueprint/audio/01-chapter-1.mp3',
      clientEmail: 'signer@test.iam.gserviceaccount.com',
      privateKey,
      ttlSeconds: 600,
      now,
      contentType: 'audio/mpeg',
      disposition: 'inline',
      downloadName: 'chapter-1.mp3',
    });
    expect(url.startsWith('https://storage.googleapis.com/final-evolution-lab.firebasestorage.app/books/blueprint/audio/01-chapter-1.mp3?')).toBe(true);
    expect(url).toContain('X-Goog-Expires=600');
    expect(url).toContain('X-Goog-Algorithm=GOOG4-RSA-SHA256');
    expect(url).not.toContain('alt=media');
    expect(url).not.toContain('token=');
    expect(verifySignedGet(url)).toBe(true);
  });

  it('refuses to sign anything outside books/ and clamps a long lifetime', () => {
    expect(() => signGcsV4({
      bucket: 'final-evolution-lab.firebasestorage.app',
      objectPath: '../secrets/key',
      clientEmail: 'signer@test.iam.gserviceaccount.com',
      privateKey,
      ttlSeconds: 60,
      now,
      contentType: 'text/plain',
      disposition: 'attachment',
      downloadName: 'key.txt',
    })).toThrow(/book library/);
    expect(clampSignedUrlTtl(999_999)).toBe(3600);
  });

  it('reads the bucket and service account from the environment and never invents a key', () => {
    expect(bookStorageConfig({} as NodeJS.ProcessEnv)).toBeNull();
    const cfg = bookStorageConfig({
      FIREBASE_STORAGE_BUCKET: 'final-evolution-lab.firebasestorage.app',
      FIREBASE_CLIENT_EMAIL: 'signer@test.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    } as NodeJS.ProcessEnv);
    expect(cfg?.bucket).toBe('final-evolution-lab.firebasestorage.app');
    expect(cfg?.privateKey).toContain('\nabc\n');
  });
});
