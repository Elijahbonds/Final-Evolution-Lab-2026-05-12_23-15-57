// lib/readable/rules.ts and sourceScan.ts: the readability standard's numbers and judgments (docs/READABLE.md).
import { describe, expect, it } from 'vitest';
import { TV_MIN_READ_PX } from '@/components/games/tv-hud/tokens';
import { TYPE_SIZES_PX } from '@/lib/design/type';
import {
  READABLE, clipOverrun, contrastMiss, isKeyInfo, minReadMs, percentile, pixelContrast, readableMs, sizeMiss, textCollides, wordCount,
} from './rules';
import { contrastOnSurfaces, minPassingAlpha, scanFontSizes, scanTextColours, textColourHex } from './sourceScan';

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

describe('the numbers come from the systems they guard', () => {
  it('12 px is the type scale’s smallest role, 16 px its body, 24 px the HUD’s 10-foot floor', () => {
    expect(READABLE.minPx).toBe(TYPE_SIZES_PX.label.phone);
    expect(READABLE.bodyPx).toBe(TYPE_SIZES_PX.body.phone);
    expect(READABLE.hudTvPx).toBe(TV_MIN_READ_PX);
  });
});

describe('size', () => {
  it('under 12 px fails anywhere; body copy under 16 px fails on a phone only', () => {
    expect(sizeMiss(11, { words: 2, phone: true })).toBe('tiny');
    expect(sizeMiss(12, { words: 2, phone: true })).toBeNull();
    expect(sizeMiss(14, { words: 20, phone: true })).toBe('body-small');
    expect(sizeMiss(14, { words: 20, phone: false })).toBeNull();
    expect(sizeMiss(14, { words: 12, phone: true })).toBeNull();   // a supporting line (TYPE.small, ≤ 12 words)
    expect(sizeMiss(16, { words: 40, phone: true })).toBeNull();
  });
  it('HUD lines: 14 px on a phone; all HUD text 24 px on a 1080p TV', () => {
    expect(sizeMiss(13, { words: 3, phone: true, hud: 'phone' })).toBe('hud-small');   // a line
    expect(sizeMiss(14, { words: 3, phone: true, hud: 'phone' })).toBeNull();
    expect(sizeMiss(12, { words: 2, phone: true, hud: 'phone' })).toBeNull();          // a label or value: the 12 px floor
    expect(sizeMiss(11, { words: 1, phone: true, hud: 'phone' })).toBe('tiny');
    expect(sizeMiss(22.5, { words: 2, phone: false, hud: 'tv' })).toBe('hud-tv-small');
    expect(sizeMiss(27, { words: 2, phone: false, hud: 'tv' })).toBeNull();
  });
});

describe('contrast from pixels', () => {
  it('11 px #999 on white is 2.85:1 — a miss; #f2f5f9 on the ink clears it', () => {
    const white = Array.from({ length: 40 }, () => ({ bg: rgb(255, 255, 255) }));
    const r = pixelContrast(rgb(153, 153, 153), white);
    expect(r).toBeCloseTo(2.85, 1);
    expect(contrastMiss(r, 11, 400)).toBe('contrast');
    const ink = Array.from({ length: 40 }, () => ({ bg: rgb(5, 5, 5) }));
    expect(contrastMiss(pixelContrast(rgb(242, 245, 249), ink), 16, 400)).toBeNull();
  });
  it('the text’s alpha is drawn on each background pixel', () => {
    const ink = Array.from({ length: 10 }, () => ({ bg: rgb(5, 5, 5) }));
    expect(pixelContrast(rgb(255, 255, 255, 0.4), ink)).toBeLessThan(4.5);
    expect(pixelContrast(rgb(255, 255, 255, 0.55), ink)).toBeGreaterThan(4.5);
  });
  it('a bright patch behind a third of the letters fails the run; one stray pixel does not', () => {
    const mostlyDark = [...Array.from({ length: 99 }, () => ({ bg: rgb(5, 5, 5) })), { bg: rgb(250, 250, 250) }];
    expect(pixelContrast(rgb(255, 255, 255), mostlyDark)).toBeGreaterThan(10);
    const third = [...Array.from({ length: 66 }, () => ({ bg: rgb(5, 5, 5) })), ...Array.from({ length: 34 }, () => ({ bg: rgb(240, 240, 240) }))];
    expect(contrastMiss(pixelContrast(rgb(255, 255, 255), third), 16, 400)).toBe('contrast');
  });
  it('text with no solid colour (a gradient fill) is read from its own pixels', () => {
    expect(pixelContrast(null, [{ bg: rgb(5, 5, 5), ink: rgb(0, 229, 255) }])).toBeGreaterThan(10);
  });
  it('large text needs 3:1', () => {
    expect(contrastMiss(3.2, 24, 400)).toBeNull();
    expect(contrastMiss(3.2, 18.66, 700)).toBeNull();
    expect(contrastMiss(3.2, 18.66, 400)).toBe('contrast');
    expect(contrastMiss(2.5, 30, 800)).toBe('contrast-large');
  });
  it('percentile', () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(percentile([5, 1, 3, 2, 4], 1)).toBe(5);
    expect(Number.isNaN(percentile([], 0.5))).toBe(true);
  });
});

describe('read time', () => {
  it('0.3 s a word plus 1 s', () => {
    expect(wordCount('HOLD to run — then tap jump')).toBe(6);
    expect(minReadMs('HOLD to run — then tap jump')).toBe(2800);
    expect(minReadMs('')).toBe(0);
    expect(readableMs('GOAL!', 1500)).toBe(1500);          // never shortens
    expect(readableMs('UP NEXT PLAYER 2 DUNK 4 OF 6 WINDMILL', 2400)).toBe(3700);
  });
});

describe('clipping, collisions, key information', () => {
  it('overrun on the worst side', () => {
    expect(clipOverrun({ left: 0, top: 0, right: 100, bottom: 20 }, { left: 0, top: 0, right: 70, bottom: 40 })).toBe(30);
    expect(clipOverrun({ left: 10, top: 0, right: 60, bottom: 20 }, { left: 0, top: 0, right: 70, bottom: 40 })).toBe(0);
  });
  it('two different runs overlapping by more than a quarter collide; a stacked copy does not', () => {
    const a = { rect: { left: 0, top: 0, right: 100, bottom: 20 }, text: 'First' };
    expect(textCollides(a, { rect: { left: 30, top: 4, right: 130, bottom: 24 }, text: 'Second' })).toBe(true);
    expect(textCollides(a, { rect: { left: 30, top: 4, right: 130, bottom: 24 }, text: 'First' })).toBe(false);
    expect(textCollides(a, { rect: { left: 0, top: 19, right: 100, bottom: 39 }, text: 'Next line' })).toBe(false);
  });
  it('numbers, alerts, headings and controls are key information', () => {
    expect(isKeyInfo('Score 12,345')).toBe(true);
    expect(isKeyInfo('Something went wrong', { role: 'alert' })).toBe(true);
    expect(isKeyInfo('Train', { tag: 'H1' })).toBe(true);
    expect(isKeyInfo('Start', { inControl: true })).toBe(true);
    expect(isKeyInfo('A quiet line of copy')).toBe(false);
  });
});

describe('the source scanner', () => {
  it('finds sizes under 12 px in classes and inline styles, with any variant', () => {
    const src = `<p className="text-[10px] md:text-[11px] text-[12px] !text-[9.5px] text-[0.6rem] text-xs" style={{ fontSize: 10 }}/>
      <i style={{ fontSize: '11px', lineHeight: 1 }}/> <b style={{ fontSize: 14 }}/>`;
    expect(scanFontSizes(src).map((f) => f.match)).toEqual(['text-[10px]', 'md:text-[11px]', '!text-[9.5px]', 'text-[0.6rem]', 'fontSize: 10', "fontSize: '11px'"]);
  });
  it('reads the floor of a clamp(), the ceiling of a min() and the floor of a max()', () => {
    const src = 'text-[clamp(28px,8vw,44px)] text-[min(2.4vh,11px)] text-[clamp(10px,2vw,14px)] text-[max(12px,1vw)] text-[min(3.2vh,16px)]';
    expect(scanFontSizes(src).map((f) => f.match)).toEqual(['text-[min(2.4vh,11px)]', 'text-[clamp(10px,2vw,14px)]']);
  });
  it('judges a text colour on the dark surfaces; ignores dark ink, disabled variants and non-colours', () => {
    const src = 'text-white/40 text-white/60 text-white text-black text-fel-bg disabled:text-white/30 text-center text-sm text-neutral-500 placeholder:text-white/30 text-fel-dim';
    expect(scanTextColours(src).map((f) => f.match)).toEqual(['text-white/40', 'text-neutral-500', 'placeholder:text-white/30']);
    expect(scanTextColours('placeholder-white/30 placeholder-white/50').map((f) => f.match)).toEqual(['placeholder-white/30']);
  });
  it('white needs 50 % to clear 4.5:1 on every surface; the ladder’s quietest step clears it solid', () => {
    expect(textColourHex('fel-quiet')).toBe('#7d8794');
    expect(contrastOnSurfaces('#ffffff', 0.45)).toBeLessThan(4.5);
    expect(minPassingAlpha('#ffffff', 0.3)).toBe(0.5);
    expect(contrastOnSurfaces('#7d8794')).toBeGreaterThanOrEqual(4.5);
    expect(minPassingAlpha('#737373')).toBeNull();   // neutral-500 never clears the raised panel
  });
});
