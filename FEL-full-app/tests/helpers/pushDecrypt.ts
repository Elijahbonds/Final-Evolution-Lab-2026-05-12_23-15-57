// The browser's side of RFC 8291, written apart from lib/push/crypto.ts on purpose (offline-push, round 8): a test that
// decrypts with the sender's own code proves only that the code agrees with itself. This one uses Web Crypto
// (crypto.subtle: ECDH, HKDF, AES-GCM), as a browser does, and reads the header the way RFC 8188 §2 lays it out.
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Decrypt an aes128gcm push body with the browser's key pair and auth secret. Returns the plaintext bytes. */
export async function decryptPush(body: Uint8Array, ua: { publicKey: Uint8Array; privateKey: Uint8Array }, authSecret: Uint8Array): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const records = body.slice(21 + idlen);
  if (records.length > rs) throw new Error('more than one record');
  const pub = ua.publicKey;
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: Buffer.from(pub.slice(1, 33)).toString('base64url'), y: Buffer.from(pub.slice(33, 65)).toString('base64url'),
    d: Buffer.from(ua.privateKey).toString('base64url'),
  };
  const priv = await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const peer = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: peer }, priv, 256));
  const ikm = await hkdf(authSecret, ecdh, cat(enc('WebPush: info'), new Uint8Array([0]), pub, asPublic), 32);
  const cek = await hkdf(salt, ikm, cat(enc('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, cat(enc('Content-Encoding: nonce'), new Uint8Array([0])), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, records));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 2) throw new Error('not the last record (delimiter is not 0x02)');
  return padded.slice(0, end);
}
