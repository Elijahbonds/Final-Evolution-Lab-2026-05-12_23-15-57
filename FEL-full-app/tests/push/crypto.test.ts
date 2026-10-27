// RFC 8291 (web push encryption) and RFC 8292 (VAPID) against the RFCs themselves (offline-push, round 8, OFF-03).
// The vectors are RFC 8291 Appendix A, copied from https://www.rfc-editor.org/rfc/rfc8291.txt (checked 2026-10-26).
import { createECDH, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_PAYLOAD_BYTES, b64u, encryptPayload, isP256Point, newVapidKeyPair, vapidAuthorization, vapidKeys, VAPID_TTL_SEC } from '@/lib/push/crypto';
import { decryptPush } from '../helpers/pushDecrypt';

const d = (s: string) => b64u.decode(s.replace(/\s+/g, ''))!;
const RFC = {
  plaintext: d('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
  asPublic: d('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
  asPrivate: d('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
  uaPublic: d('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
  uaPrivate: d('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'),
  salt: d('DGv6ra1nlYgDCS1FRnbzlw'),
  authSecret: d('BTBZMqHH6r4Tts7J_aSIgg'),
  ecdhSecret: d('kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs'),
  prkKey: d('Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k'),
  keyInfo: d(`V2ViUHVzaDogaW5mbwAEJXGyvs3942BVG q8e0PTNNmwR zr5VX4m8t7GGpTM5FzFo7OLr4BhZe9MEebhuPI-OztV3
    ylkYfpJGmQ22ggCLDgT-M_SrDepxkU21WCP3O1SUj0Ew bZIHMtu5pZpTKGSCIA5Zent7wmC6HCJ5mFgJkuk5cwAv MBKiiujwa7t45ewP`),
  ikm: d('S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg'),
  prk: d('09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc'),
  cek: d('oIhVW04MRdy2XN9CiKLxTg'),
  nonce: d('4h_95klXJ5E_qnoN'),
  header: d('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8'),
  body: d(`DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
    mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
    pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`),
};

describe('RFC 8291 Appendix A: every intermediate value and the message body', () => {
  const out = encryptPayload({ uaPublic: RFC.uaPublic, authSecret: RFC.authSecret, plaintext: RFC.plaintext, asPrivate: RFC.asPrivate, salt: RFC.salt });
  it.each([
    ['as_public', 'asPublic'], ['ecdh_secret', 'ecdhSecret'], ['PRK_key', 'prkKey'], ['key_info', 'keyInfo'], ['IKM', 'ikm'],
    ['PRK', 'prk'], ['CEK', 'cek'], ['NONCE', 'nonce'], ['the 86-octet header', 'header'],
  ] as const)('%s', (_name, k) => {
    expect(b64u.encode(out.trace[k])).toBe(b64u.encode(RFC[k]));
  });
  it('the whole body, byte for byte', () => {
    // 86 header + 41 message + 1 delimiter + 16 tag. (The RFC's example request prints "Content-Length: 145"; its own
    // base64url body decodes to 144 octets, which is what this matches.)
    expect(out.body.length).toBe(144);
    expect(b64u.encode(out.body)).toBe(b64u.encode(RFC.body));
  });
  it('the RFC body decrypts, with an independent Web Crypto implementation, to "When I grow up, I want to be a watermelon"', async () => {
    const plain = await decryptPush(RFC.body, { publicKey: RFC.uaPublic, privateKey: RFC.uaPrivate }, RFC.authSecret);
    expect(Buffer.from(plain).toString('utf8')).toBe('When I grow up, I want to be a watermelon');
  });
});

describe('encryption with fresh keys, as every real send does', () => {
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const ua = { publicKey: browser.getPublicKey(), privateKey: browser.getPrivateKey() };
  const auth = Buffer.from('0123456789abcdef');

  it('round-trips, and two sends of one message never share a salt, a key or a body', async () => {
    const msg = Buffer.from(JSON.stringify({ title: "Today's session is ready", url: '/coach' }));
    const a = encryptPayload({ uaPublic: ua.publicKey, authSecret: auth, plaintext: msg });
    const b = encryptPayload({ uaPublic: ua.publicKey, authSecret: auth, plaintext: msg });
    expect(Buffer.from(await decryptPush(a.body, ua, auth)).toString()).toBe(msg.toString());
    expect(Buffer.from(await decryptPush(b.body, ua, auth)).toString()).toBe(msg.toString());
    expect(a.body.subarray(0, 16).equals(b.body.subarray(0, 16))).toBe(false);
    expect(a.trace.asPublic.equals(b.trace.asPublic)).toBe(false);
  });

  it('a wrong auth secret does not decrypt', async () => {
    const a = encryptPayload({ uaPublic: ua.publicKey, authSecret: auth, plaintext: Buffer.from('x') });
    await expect(decryptPush(a.body, ua, Buffer.from('fedcba9876543210'))).rejects.toThrow();
  });

  it('refuses a key off the curve, a short auth secret and a message too long for one record', () => {
    const offCurve = Buffer.from(ua.publicKey); offCurve[64] ^= 1;
    expect(isP256Point(offCurve)).toBe(false);
    expect(isP256Point(ua.publicKey)).toBe(true);
    expect(isP256Point(Buffer.alloc(65))).toBe(false);
    expect(() => encryptPayload({ uaPublic: offCurve, authSecret: auth, plaintext: Buffer.from('x') })).toThrow(/P-256/);
    expect(() => encryptPayload({ uaPublic: ua.publicKey, authSecret: Buffer.alloc(8), plaintext: Buffer.from('x') })).toThrow(/16 bytes/);
    expect(() => encryptPayload({ uaPublic: ua.publicKey, authSecret: auth, plaintext: Buffer.alloc(MAX_PAYLOAD_BYTES + 1) })).toThrow(/too long/);
    expect(() => encryptPayload({ uaPublic: ua.publicKey, authSecret: auth, plaintext: Buffer.alloc(MAX_PAYLOAD_BYTES) })).not.toThrow();
  });
});

describe('RFC 8292 VAPID', () => {
  const pair = newVapidKeyPair();
  const keys = vapidKeys(pair.privateKey, pair.publicKey)!;

  it('a new pair is one 32-byte scalar and its 65-byte point, and the env values must be one pair', () => {
    expect(b64u.decode(pair.privateKey)!.length).toBe(32);
    expect(b64u.decode(pair.publicKey)!.length).toBe(65);
    expect(keys).not.toBeNull();
    expect(vapidKeys(pair.privateKey, newVapidKeyPair().publicKey)).toBeNull();
    expect(vapidKeys('', pair.publicKey)).toBeNull();
    expect(vapidKeys(undefined, undefined)).toBeNull();
    expect(vapidKeys('not base64!', pair.publicKey)).toBeNull();
  });

  it('the header is "vapid t=<ES256 JWT>, k=<public key>", and the JWT verifies with that key', () => {
    const now = 1_800_000_000;
    const h = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc:def', 'mailto:ops@fel.example', keys, now);
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h)!;
    expect(m).not.toBeNull();
    expect(JSON.parse(b64u.decode(m[1])!.toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(b64u.decode(m[2])!.toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: now + VAPID_TTL_SEC, sub: 'mailto:ops@fel.example' });
    expect(VAPID_TTL_SEC).toBeLessThanOrEqual(24 * 60 * 60);   // RFC 8292 §2: no more than 24 hours
    expect(m[4]).toBe(pair.publicKey);
    const sig = b64u.decode(m[3])!;
    expect(sig.length).toBe(64);   // ES256 is r || s, not DER (RFC 7518 §3.4)
    const pub = b64u.decode(pair.publicKey)!;
    const jwk = { kty: 'EC', crv: 'P-256', x: b64u.encode(pub.subarray(1, 33)), y: b64u.encode(pub.subarray(33)) };
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, sig)).toBe(true);
    expect(verify('sha256', Buffer.from(`${m[1]}.${m[2]}x`), { key, dsaEncoding: 'ieee-p1363' }, sig)).toBe(false);
  });
});
