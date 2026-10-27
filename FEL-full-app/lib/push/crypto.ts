// Web push cryptography, by hand (offline-push, round 8, OFF-03; owner rule: no new dependency). Server only.
//
//   · RFC 8291 message encryption: the "aes128gcm" content coding (RFC 8188) keyed by ECDH on P-256 with the browser's
//     key (p256dh) and auth secret. One record, so a payload is at most MAX_PAYLOAD_BYTES.
//   · RFC 8292 VAPID: an ES256 JSON Web Token signed with the application server's key, sent as
//     `Authorization: vapid t=<jwt>, k=<public key>`.
//
// Node's own crypto (ECDH, HMAC-SHA-256, AES-128-GCM, ECDSA with IEEE P1363 signatures) — the same primitives Web Crypto
// exposes. tests/push/crypto.test.ts checks every intermediate value and the final body against RFC 8291 Appendix A, and
// decrypts with an independent implementation (tests/helpers/pushDecrypt.ts).
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign, type KeyObject } from 'node:crypto';

export const b64u = {
  encode: (b: Uint8Array): string => Buffer.from(b).toString('base64url'),
  /** Strict-ish: base64url (padding tolerated), or null. */
  decode: (s: unknown): Buffer | null => {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(s)) return null;
    return Buffer.from(s.replace(/=+$/, ''), 'base64url');
  },
};

const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac('sha256', key).update(data).digest();
/** HKDF (RFC 5869) with one block of output, which is all RFC 8291 needs (32, 16 and 12 bytes). */
const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Buffer =>
  hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

/** RFC 8291 record size: one record per message. */
export const RECORD_SIZE = 4096;
/** Header (86) + padding delimiter (1) + GCM tag (16) leave this much for the message in one 4096-byte record. */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - 86 - 1 - 16;

/** Is this an uncompressed P-256 point that is on the curve? (RFC 8291 §7: a key not on the curve can leak ours.) */
export function isP256Point(pub: Uint8Array | null): boolean {
  if (!pub || pub.length !== 65 || pub[0] !== 4) return false;
  try {
    const e = createECDH('prime256v1');
    e.generateKeys();
    e.computeSecret(Buffer.from(pub));   // OpenSSL refuses a point that is not on the curve
    return true;
  } catch { return false; }
}

export interface EncryptInput {
  /** The browser's PushSubscription keys: p256dh (65 bytes) and auth (16 bytes). */
  uaPublic: Uint8Array;
  authSecret: Uint8Array;
  plaintext: Uint8Array;
  /** Tests only (RFC 8291 Appendix A): the sender's key pair and the salt. Otherwise fresh for every message. */
  asPrivate?: Uint8Array;
  salt?: Uint8Array;
}

export interface Encrypted {
  body: Buffer;
  /** Intermediate values, for the RFC test. */
  trace: { ecdhSecret: Buffer; prkKey: Buffer; keyInfo: Buffer; ikm: Buffer; prk: Buffer; cek: Buffer; nonce: Buffer; asPublic: Buffer; header: Buffer };
}

/** RFC 8291 §3.4 + RFC 8188: one aes128gcm record. Throws on a bad key or an oversized message. */
export function encryptPayload(input: EncryptInput): Encrypted {
  const { uaPublic, authSecret, plaintext } = input;
  if (!isP256Point(uaPublic)) throw new Error('push: the browser key is not a P-256 point');
  if (authSecret.length !== 16) throw new Error('push: the auth secret is not 16 bytes');
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error('push: the message is too long for one record');
  const ecdh = createECDH('prime256v1');
  if (input.asPrivate) ecdh.setPrivateKey(Buffer.from(input.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const salt = Buffer.from(input.salt ?? randomBytes(16));
  if (salt.length !== 16) throw new Error('push: the salt is not 16 bytes');

  const ecdhSecret = ecdh.computeSecret(Buffer.from(uaPublic));
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), Buffer.from(uaPublic), asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'latin1'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'latin1'), 12);

  const header = Buffer.alloc(16 + 4 + 1 + 65);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(65, 20);
  asPublic.copy(header, 21);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  return { body: Buffer.concat([header, sealed]), trace: { ecdhSecret, prkKey, keyInfo, ikm, prk, cek, nonce, asPublic, header } };
}

/** The application server's VAPID key pair, from the env's base64url private scalar (32 bytes). Null when unusable. */
export interface VapidKeys { publicKey: Buffer; privateKey: KeyObject }
export function vapidKeys(privateB64u: unknown, publicB64u: unknown): VapidKeys | null {
  const d = b64u.decode(privateB64u);
  const pubGiven = b64u.decode(publicB64u);
  if (!d || d.length !== 32 || !pubGiven) return null;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    const pub = ecdh.getPublicKey();
    if (!pub.equals(pubGiven)) return null;   // the two env values must be one pair
    const privateKey = createPrivateKey({
      key: { kty: 'EC', crv: 'P-256', d: b64u.encode(d), x: b64u.encode(pub.subarray(1, 33)), y: b64u.encode(pub.subarray(33, 65)) },
      format: 'jwk',
    });
    return { publicKey: pub, privateKey };
  } catch { return null; }
}

/** RFC 8292: a VAPID JWT lives at most 24 hours; ours, 12. */
export const VAPID_TTL_SEC = 12 * 60 * 60;

/** RFC 8292 §2: the JWT (ES256) for one push service origin, and the Authorization header that carries it. */
export function vapidAuthorization(endpoint: string, subject: string, keys: VapidKeys, nowSec: number = Math.floor(Date.now() / 1000)): string {
  const aud = new URL(endpoint).origin;
  const enc = (o: unknown) => b64u.encode(Buffer.from(JSON.stringify(o), 'utf8'));
  const input = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: nowSec + VAPID_TTL_SEC, sub: subject })}`;
  const sig = sign('sha256', Buffer.from(input, 'latin1'), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${input}.${b64u.encode(sig)}, k=${b64u.encode(keys.publicKey)}`;
}

/** A fresh VAPID key pair, base64url (scripts/push/make-vapid-keys.ts; the owner's step OWN-19). */
export function newVapidKeyPair(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const d = ecdh.getPrivateKey();
  const padded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - d.length)), d]);   // a scalar with a leading zero byte
  return { publicKey: b64u.encode(ecdh.getPublicKey()), privateKey: b64u.encode(padded) };
}
