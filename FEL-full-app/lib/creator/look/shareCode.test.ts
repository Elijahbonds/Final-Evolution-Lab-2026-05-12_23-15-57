// Share codes (IMPROVE (2026-10-06), CREATOR-PLAN phase 1): round trip, version handling, tampered input, size limits,
// and the privacy promise (a code never carries a name, an email or face-scan numbers).
import { describe, expect, it } from 'vitest';
import { MAX_SHARE_CODE_CHARS, checksum, decodeShareCode, encodeShareCode } from './shareCode';
import { sanitizeCreatorDoc } from './sanitize';
import { MAX_PARTS, emptyCreatorDoc, type CreatorDoc } from './doc';

const LOOK: CreatorDoc = sanitizeCreatorDoc({
  v: 1,
  parts: [
    { id: 'hair1', shape: 'spike', bone: 'Head', pos: [0, 0.12, -0.02], rot: [-20, 0, 15], scale: [0.6, 2.2, 0.6], colour: '#ffd700', finish: 'gloss', mirror: true },
    { id: 'pad', shape: 'shoulderPad', bone: 'LeftArm', colour: '#222', finish: 'metal' },
  ],
  paint: [
    { id: 'suit', type: 'fill', region: 'all', surface: 'skin', colours: ['#c00000'] },
    { id: 'web', type: 'pattern', pattern: 'web', region: 'head', colours: ['#000000', '#c00000'], opacity: 0.8 },
    { id: 'chest', type: 'stamp', stamp: 'bolt', region: 'torsoFront', at: { x: 0.5, y: 0.4, rot: 10, scale: 0.6, stretch: 1.4 }, colours: ['#ffffff'], mirror: true },
    { id: 'txt', type: 'text', text: 'Lab 23', region: 'torsoBack', colours: ['#ffffff', '#000000'] },
  ],
  colours: { jersey: '#c00000', accent: '#ffffff' },
  shape: { face: { faceLong: 0.3 }, body: { shoulders: 1.08 } },
  flags: { suit: true },
})!;

const encode = (d: CreatorDoc = LOOK, b: unknown = {}) => encodeShareCode(d, b);
/** A well-formed code around any payload (the checksum recomputed, as an attacker can). */
const forge = (payloadJson: string, version = 1) => {
  const b64 = Buffer.from(payloadJson, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `FEL${version}.${b64}.${checksum(b64)}`;
};

describe('round trip', () => {
  it('decodes back to exactly the sanitised doc and base', () => {
    const code = encode(LOOK, { hairStyle: 'Afro', skinTone: '#8d5524', eyeColor: '#3a5a7a' });
    expect(code.startsWith('FEL1.')).toBe(true);
    expect(code).toMatch(/^FEL1\.[A-Za-z0-9_-]+\.[0-9a-z]{7}$/);
    const r = decodeShareCode(code);
    expect(r).toEqual({ ok: true, doc: LOOK, base: { hairStyle: 'Afro', skinTone: '#8D5524', eyeColor: '#3A5A7A' } });
  });
  it('round-trips the empty doc and survives whitespace / line breaks in a paste', () => {
    const code = encode(emptyCreatorDoc());
    expect(code.length).toBeLessThan(40);
    expect(decodeShareCode(code)).toEqual({ ok: true, doc: emptyCreatorDoc(), base: {} });
    const split = `  ${code.slice(0, 10)}\n${code.slice(10, 20)} \t${code.slice(20)}  `;
    expect(decodeShareCode(split)).toEqual({ ok: true, doc: emptyCreatorDoc(), base: {} });
  });
  it('is short: defaults are left out of the payload', () => {
    const one = sanitizeCreatorDoc({ v: 1, parts: [{ id: 'a', shape: 'horn', bone: 'Head', colour: '#ffffff' }] })!;
    const json = Buffer.from(encode(one).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(json).not.toMatch(/"pos"|"rot"|"scale"|"finish"|"mirror"|"paint"|"shape":\{|"flags"/);
    expect(decodeShareCode(encode(one))).toMatchObject({ ok: true, doc: one });
  });
  it('a full-budget doc still encodes under the code limit and decodes intact', () => {
    const big = sanitizeCreatorDoc({ v: 1, parts: Array.from({ length: MAX_PARTS }, (_, i) => ({ id: `p${i}`, shape: 'plate', bone: 'Spine2', colour: '#123456', pos: [0.1, 0.2, 0.3] })) })!;
    const code = encode(big);
    expect(code.length).toBeLessThan(MAX_SHARE_CODE_CHARS);
    expect(decodeShareCode(code)).toEqual({ ok: true, doc: big, base: {} });
  });
});

describe('privacy', () => {
  it('never carries a name, an email, the face-scan sliders or unknown fields — on encode', () => {
    const dirty = { ...LOOK, name: 'Jane Real', email: 'jane@example.com', scan: { landmarks: [0.1] } } as unknown as CreatorDoc;
    const code = encode(dirty, { hairStyle: 'Afro', sliders: { faceLong: 0.9 }, name: 'Jane Real', email: 'jane@example.com' });
    const json = Buffer.from(code.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(json).not.toMatch(/Jane|jane@|example\.com|landmarks|sliders|"name"|"email"|"scan"/);
  });
  it('…and on decode, when someone hand-builds a code that carries them', () => {
    const r = decodeShareCode(forge(JSON.stringify({ d: { v: 1, name: 'Jane', parts: [] }, b: { sliders: { faceLong: 1 }, email: 'x@y.z', hairStyle: 'Buzz' }, extra: 1 })));
    expect(r).toEqual({ ok: true, doc: emptyCreatorDoc(), base: { hairStyle: 'Buzz' } });
  });
});

describe('versions', () => {
  it('refuses a code from a newer format instead of guessing', () => {
    const payload = encode().split('.').slice(1).join('.');
    expect(decodeShareCode(`FEL2.${payload}`)).toEqual({ ok: false, error: 'unsupported_version' });
    expect(decodeShareCode(`FEL0.${payload}`)).toEqual({ ok: false, error: 'unsupported_version' });
  });
  it('refuses a doc whose own version is not v1', () => {
    expect(decodeShareCode(forge(JSON.stringify({ d: { v: 2, parts: [] } })))).toEqual({ ok: false, error: 'invalid' });
    expect(decodeShareCode(forge(JSON.stringify({ d: null })))).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('tampered and malformed input', () => {
  it('a changed character fails the checksum', () => {
    const code = encode();
    const [head, payload, check] = code.split('.');
    const i = Math.floor(payload.length / 2);
    const flipped = payload.slice(0, i) + (payload[i] === 'A' ? 'B' : 'A') + payload.slice(i + 1);
    expect(decodeShareCode(`${head}.${flipped}.${check}`)).toEqual({ ok: false, error: 'corrupt' });
    expect(decodeShareCode(`${head}.${payload.slice(0, -4)}.${check}`)).toEqual({ ok: false, error: 'corrupt' });
  });
  it('a payload swapped for another valid one fails the checksum (the JSON alone would parse)', () => {
    const [head, , check] = encode().split('.');
    const other = encode(emptyCreatorDoc()).split('.')[1];
    expect(decodeShareCode(`${head}.${other}.${check}`)).toEqual({ ok: false, error: 'corrupt' });
  });
  it('a re-checksummed tamper is still sanitised: hostile values never reach the doc', () => {
    const r = decodeShareCode(forge(JSON.stringify({ d: { v: 1,
      parts: [{ id: 'x', shape: 'spike', bone: 'Head', colour: '#fff', scale: [1e9, -1e9, NaN], pos: [1e9, 0, 0] }, { id: 'y', shape: '<script>', bone: 'Head', colour: '#fff' }],
      colours: { jersey: 'javascript:alert(1)', accent: '#0f0' },
    } })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.parts).toEqual([{ id: 'x', shape: 'spike', bone: 'Head', colour: '#FFFFFF', pos: [0.6, 0, 0], rot: [0, 0, 0], scale: [8, 0.05, 1], finish: 'matte', mirror: false }]);
    expect(r.doc.colours).toEqual({ accent: '#00FF00' });
  });
  it('rejects junk with a reason, never throws', () => {
    expect(decodeShareCode('')).toEqual({ ok: false, error: 'empty' });
    expect(decodeShareCode('   ')).toEqual({ ok: false, error: 'empty' });
    expect(decodeShareCode(undefined)).toEqual({ ok: false, error: 'empty' });
    expect(decodeShareCode(42)).toEqual({ ok: false, error: 'empty' });
    expect(decodeShareCode('hello world')).toEqual({ ok: false, error: 'not_a_code' });
    expect(decodeShareCode('FEL1.abc')).toEqual({ ok: false, error: 'not_a_code' });
    expect(decodeShareCode('FEL1.ab+c/.0000000')).toEqual({ ok: false, error: 'not_a_code' });
    expect(decodeShareCode(forge('{not json'))).toEqual({ ok: false, error: 'corrupt' });
    // valid base64url, but not UTF-8
    const bad = Buffer.from([0xff, 0xfe, 0xfd]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeShareCode(`FEL1.${bad}.${checksum(bad)}`)).toEqual({ ok: false, error: 'corrupt' });
  });
  it('size limits: an over-long code is refused before any decoding', () => {
    const long = `FEL1.${'A'.repeat(MAX_SHARE_CODE_CHARS)}.0000000`;
    expect(decodeShareCode(long)).toEqual({ ok: false, error: 'too_long' });
    expect(decodeShareCode('x'.repeat(MAX_SHARE_CODE_CHARS * 3))).toEqual({ ok: false, error: 'too_long' });
  });
});
