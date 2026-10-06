// CREATOR-PLAN phase 4d: photo mode's card — the composition, and the share code printed on it whole.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, CODE_SIZES, MONO_ADVANCE, cardLayout, containRect, drawCard, fitCode, photoFileName, shotRenderSize, wrapCode, type Card2D } from './photoCard';
import { ARCHETYPES } from '../__fixtures__/archetypes';
import { encodeSlotCode, decodeSlotCode } from '../shareCode';

function recorder() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const grad = { addColorStop: () => {} };
  const ctx: Card2D = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: (...a) => { calls.push({ fn: 'fillRect', args: a }); },
    strokeRect: (...a) => { calls.push({ fn: 'strokeRect', args: a }); },
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => { calls.push({ fn: 'stroke', args: [] }); },
    fillText: (...a) => { calls.push({ fn: 'fillText', args: a }); },
    drawImage: (...a) => { calls.push({ fn: 'drawImage', args: a }); },
    createLinearGradient: () => grad, createRadialGradient: () => grad,
  };
  return { ctx, calls };
}

describe('the code on the card', () => {
  it('wraps without losing or reordering a character', () => {
    const code = 'FEL2.' + 'abcdefghij'.repeat(37) + 'xyz';
    const lines = wrapCode(code, 64);
    expect(lines.join('')).toBe(code);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(64);
    expect(wrapCode('', 10)).toEqual(['']);
  });
  it('every archetype\'s real v2 code is printed whole, at a readable size, inside the card', async () => {
    for (const a of ARCHETYPES) {
      const code = await encodeSlotCode(a.slot);
      const L = cardLayout({ label: a.slot.label, code });
      expect(L.codeLines.join('')).toBe(code);
      expect(L.codeSize).toBeGreaterThanOrEqual(16);   // ≤ ~1k characters: big enough to read off a phone screen
      expect(L.h).toBe(CARD_H);
      const texts = L.ops.filter((o) => o.op === 'text').map((o) => (o as { text: string }).text);
      expect(texts.join('')).toContain(code);
      // the printed code round-trips through the paste box
      const back = await decodeSlotCode(L.codeLines.join(''));
      expect(back.ok).toBe(true);
      for (const o of L.ops) if (o.op === 'text') { expect(o.y).toBeLessThanOrEqual(L.h); expect(o.x).toBeLessThanOrEqual(CARD_W); }
      // each code line fits the card's width in the monospace advance
      for (const line of L.codeLines) expect(line.length * L.codeSize * MONO_ADVANCE).toBeLessThanOrEqual(CARD_W - 80 + 1e-6);
    }
  });
  it('a huge code shrinks to the smallest size, then grows the card — never drops a character', () => {
    const code = 'Z'.repeat(50_000);
    const L = cardLayout({ label: 'BIG', code });
    expect(L.codeSize).toBe(CODE_SIZES[CODE_SIZES.length - 1]);
    expect(L.h).toBeGreaterThan(CARD_H);
    expect(L.codeLines.join('')).toBe(code);
    expect(fitCode('abc', 1000, 200).size).toBe(CODE_SIZES[0]);
  });
});

describe('the composition', () => {
  it('backdrop, glow, the shot, a frame with corner ticks, the name, the code', () => {
    const L = cardLayout({ label: 'Hero', code: 'FEL2.abc', frame: 'neon', backdrop: 'nightGame', accent: '#FFD700' });
    const kinds = L.ops.map((o) => o.op);
    expect(kinds.slice(0, 3)).toEqual(['gradient', 'glow', 'image']);
    expect(kinds.filter((k) => k === 'line').length).toBe(8);
    const name = L.ops.find((o) => o.op === 'text' && o.text === 'HERO');
    expect(name).toBeTruthy();
    expect(L.ops.find((o) => o.op === 'stroke')).toMatchObject({ colour: '#FFD700' });
    expect(cardLayout({ label: 'x', code: 'y', frame: 'none' }).ops.some((o) => o.op === 'stroke' || o.op === 'line')).toBe(false);
    expect(cardLayout({ label: '', code: 'y', backdrop: 'nope', accent: 'red' }).ops[0]).toMatchObject({ top: '#0C0C11' });
  });
  it('draws through a 2D context: the shot contained, every text drawn', () => {
    const L = cardLayout({ label: 'Hero', code: 'FEL2.' + 'q'.repeat(300) });
    const { ctx, calls } = recorder();
    drawCard(ctx, L, { img: true }, { w: 500, h: 1000 });
    const img = calls.find((c) => c.fn === 'drawImage')!;
    const [, x, y, w, h] = img.args as number[];
    expect(h).toBeCloseTo(880, 6); expect(w).toBeCloseTo(440, 6);
    expect(x).toBeCloseTo(40 + (1000 - 440) / 2, 6); expect(y).toBe(40);
    const texts = calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0] as string);
    expect(texts.join('')).toContain('q'.repeat(300));
  });
  it('contain keeps the aspect; a broken size fills the box', () => {
    expect(containRect(200, 100, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: 25, w: 100, h: 50 });
    expect(containRect(0, 0, { x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
  it('file names and render sizes', () => {
    expect(photoFileName('Dark Lord 2')).toBe('fel-look-dark-lord-2.png');
    expect(photoFileName('')).toBe('fel-look-look.png');
    expect(photoFileName('../../etc')).toBe('fel-look-etc.png');
    expect(shotRenderSize('mobile').width).toBeLessThan(shotRenderSize('desktop').width);
  });
});

describe('teens: nothing is uploaded', () => {
  it('photo mode never sends anything anywhere (no fetch, no beacon, no form) — the card is a local download', () => {
    for (const f of ['lib/creator/look/studio/photoCard.ts', 'components/closet/studio/photo-mode.tsx']) {
      const src = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/\bfetch\(|sendBeacon|XMLHttpRequest|<form|navigator\.share|\/api\//);
    }
  });
});
