// Share code v2 (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): a whole slot, deflated where CompressionStream exists,
// v1-style otherwise; v1 codes still load; never a label, worn items, a name or a scan.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checksum, decodeShareCode, decodeSlotCode, encodeShareCode, encodeSlotCode, MAX_INFLATED_CHARS } from './shareCode';
import { emptyCreatorDoc, MAX_PARTS, type CreatorSlotV2 } from './doc';
import { sanitizeCreatorDoc } from './sanitize';

const SLOT: CreatorSlotV2 = {
  id: 's3', label: 'MY REAL NAME', body: 'female', base: { skinTone: '#33AA77', hairColor: '#F4F6FA', eyeColor: '#7FD8FF', hairStyle: 'Ponytail' },
  sliders: { faceLong: 0.4 }, frame: { heightScale: 1.02, buildScale: 0.98 }, equipped: { headwear: 'cap_nexus' },
  doc: {
    ...emptyCreatorDoc(),
    parts: [{ id: 'a1', shape: 'visor', bone: 'Head', pos: [0, 0.09, 0.035], rot: [0, 0, 0], scale: [0.97, 1.1, 1.18], colour: '#0B0B0B', finish: 'matte', mirror: false }],
    flags: { suit: true, hide: { eyes: true } }, eyes: { sclera: '#000000', glow: 0.8, pupil: 'slit' },
  },
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('encodeSlotCode / decodeSlotCode', () => {
  it('round-trips the whole slot (body, base, frame, doc incl. eyes and hide) as a deflated FEL2 code', async () => {
    const code = await encodeSlotCode(SLOT, { numbers: true });
    expect(code.startsWith('FEL2.')).toBe(true);
    const r = await decodeSlotCode(code);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc).toEqual(SLOT.doc);
    expect(r.base).toEqual(SLOT.base);
    expect(r.slot).toEqual({ body: 'female', sliders: { faceLong: 0.4 }, frame: { heightScale: 1.02, buildScale: 0.98 } });
  });
  it('never carries the label, the worn items, a name or an email; the sliders only when asked', async () => {
    const code = await encodeSlotCode({ ...SLOT, email: 'x@y.z', name: 'Jane' } as never);
    const r = await decodeSlotCode(code);
    expect(r.ok && r.slot?.sliders).toBeFalsy();
    const z = code.split('.')[1];
    const bytes = Uint8Array.from(atob(z.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((z.length + 3) % 4)), (c) => c.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    expect(json).not.toMatch(/MY REAL NAME|cap_nexus|x@y|Jane|"s3"/);
  });
  it('a scan body is exported as the male kit body (the code itself never says scan)', async () => {
    const code = await encodeSlotCode({ ...SLOT, body: 'scan' });
    const r = await decodeSlotCode(code);
    expect(r.ok && r.slot?.body).toBe('male');
    const z = code.split('.')[1];
    const bytes = Uint8Array.from(atob(z.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((z.length + 3) % 4)), (c) => c.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    expect(JSON.parse(json).k.body).toBe('male');
    expect(json).not.toMatch(/scan/);
  });
  it('is much shorter than v1 for a full slot (measured: 64 parts)', async () => {
    const parts = Array.from({ length: MAX_PARTS }, (_, i) => ({ id: `p${i}`, shape: 'spike', bone: 'Head', pos: [0.01 * i, 0.12, 0.03], rot: [10, -20, 30], scale: [0.5, 1.5, 0.5], colour: '#C8102E', finish: 'gloss', mirror: false }));
    const doc = sanitizeCreatorDoc({ v: 1, parts })!;
    const v1 = encodeShareCode(doc, SLOT.base);
    const v2 = await encodeSlotCode({ ...SLOT, doc });
    expect(v2.length).toBeLessThan(v1.length / 2.5);
    console.info(`[share code] 64 parts: v1 ${v1.length} chars, v2 ${v2.length} chars`);
  });
  it('without CompressionStream it falls back to a v1-style FEL1 code that a phase-1 decoder still reads', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const code = await encodeSlotCode(SLOT, { numbers: true });
    expect(code.startsWith('FEL1.')).toBe(true);
    const old = decodeShareCode(code);   // the phase-1 entry point: doc and base, the slot fields ignored by older readers
    expect(old.ok && old.doc).toEqual(SLOT.doc);
    const r = await decodeSlotCode(code);
    expect(r.ok && r.slot).toEqual({ body: 'female', sliders: { faceLong: 0.4 }, frame: { heightScale: 1.02, buildScale: 0.98 } });
  });
  it('a v1 code (phase 1) still decodes through the new entry point, with no slot fields', async () => {
    const v1 = encodeShareCode(SLOT.doc, SLOT.base);
    const r = await decodeSlotCode(v1);
    expect(r.ok && r.doc).toEqual(SLOT.doc);
    expect(r.ok && r.slot).toBeUndefined();
  });
  it('a FEL2 code with no DecompressionStream is unsupported, not guessed at', async () => {
    const code = await encodeSlotCode(SLOT);
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await decodeSlotCode(code)).toEqual({ ok: false, error: 'unsupported_version' });
  });
  it('typos, garbage and inflate bombs are refused', async () => {
    const code = await encodeSlotCode(SLOT);
    expect((await decodeSlotCode(code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a'))).ok).toBe(false);
    const junk = 'AAAA';
    expect(await decodeSlotCode(`FEL2.${junk}.${checksum(junk)}`)).toEqual({ ok: false, error: 'corrupt' });
    // a tiny payload that inflates past the limit
    const huge = new TextEncoder().encode(JSON.stringify({ d: { v: 1 }, pad: 'x'.repeat(MAX_INFLATED_CHARS * 2) }));
    const z = new Uint8Array(await new Response(new Blob([huge]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = ''; for (const b of z) bin += String.fromCharCode(b);
    const p = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(p.length).toBeLessThan(2000);
    expect(await decodeSlotCode(`FEL2.${p}.${checksum(p)}`)).toEqual({ ok: false, error: 'too_long' });
  });
  it('everything decoded is re-sanitised (an injected field or a bad colour never survives)', async () => {
    const json = JSON.stringify({ d: { v: 1, parts: [{ id: 'a', shape: 'spike', bone: 'Head', colour: 'red', evil: 1 }, { id: 'b', shape: 'spike', bone: 'Head', colour: '#fff', evil: 1 }] }, b: { skinTone: 'x' }, k: { body: 'scan', frame: { heightScale: 9 } } });
    const z = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = ''; for (const b of z) bin += String.fromCharCode(b);
    const p = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = await decodeSlotCode(`FEL2.${p}.${checksum(p)}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.parts).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/evil/);
    expect(r.base).toEqual({});
    expect(r.slot).toEqual({ body: 'male', frame: { heightScale: 1.04, buildScale: 1 } });
  });
});
