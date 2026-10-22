import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { CODE_ALPHABET, codeFromBytes, codeOfToken, codeTokenPrefix, formatCode, normalizeCode, tokenWithCode } from './inviteCode';
import { newCodedToken } from './inviteServer';
import { invitePath } from './invite';

describe('invite codes', () => {
  it('8 Crockford characters from 5 bytes, every one of the 40 bits used', () => {
    expect(codeFromBytes(new Uint8Array([0, 0, 0, 0, 0]))).toBe('00000000');
    expect(codeFromBytes(new Uint8Array([255, 255, 255, 255, 255]))).toBe('ZZZZZZZZ');
    expect(codeFromBytes(new Uint8Array([0, 0, 0, 0, 1]))).toBe('00000001');
    expect(codeFromBytes(new Uint8Array([128, 0, 0, 0, 0]))).toBe('G0000000');
    expect(() => codeFromBytes(new Uint8Array(4))).toThrow();
  });

  it('never prints a character that reads as two (I, L, O, U)', () => {
    expect(CODE_ALPHABET).not.toMatch(/[ILOU]/);
    for (let i = 0; i < 200; i++) expect(codeFromBytes(randomBytes(5))).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('forgives what people type: case, spaces, dashes, O for 0, I or L for 1', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeCode('ab cd 2345')).toBe('ABCD2345');
    expect(normalizeCode('OOIL-2345')).toBe('0011' + '2345');
    expect(formatCode('ABCD2345')).toBe('ABCD-2345');
  });

  it('refuses anything that is not one code', () => {
    for (const bad of ['', 'ABC', 'ABCD23456', 'ABCD-23U5', 'ABCD~2345', null, 42]) expect(normalizeCode(bad), String(bad)).toBeNull();
  });

  it('a coded token keeps the link at full strength and gives its code back; an old token has none', () => {
    const { code, token } = newCodedToken();
    expect(token.startsWith(codeTokenPrefix(code))).toBe(true);
    expect(token.length).toBe(8 + 1 + 32);
    expect(codeOfToken(token)).toBe(code);
    expect(codeOfToken(randomBytes(24).toString('base64url'))).toBeNull();
    expect(codeOfToken('ABCDEFGH')).toBeNull();
    // `~` is unreserved: the link needs no escaping
    expect(invitePath(tokenWithCode('ABCD2345', 'x'))).toBe('/coach/join/ABCD2345~x');
  });

  it('an old base64url token can never look coded (no `~` in base64url)', () => {
    for (let i = 0; i < 500; i++) expect(randomBytes(24).toString('base64url')).not.toContain('~');
  });
});
