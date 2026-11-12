// THE PREMIUM SYSTEM (lane/premium-ui, docs/PLAN-UI-10PHASE.md P1): six type sizes on two faces, surfaces the text ladder
// reads on, one accent with its ink, and motion that stops when either the device or the app's own setting says so.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TYPE, TYPE_SIZES_PX, NUM } from './type';
import { ELEVATION, RADII } from './space';
import { DURATION, MOTION_ATTR, durationFor, motionAttrValue } from './motion';
import { canVibrate } from './feedback';
import { COLOR, TEXT_LADDER, BODY_CONTRAST_MIN } from './tokens';
import { contrastRatio, parseColor } from '@/lib/a11y/wcag';

const ROOT = join(__dirname, '..', '..');
const theme = readFileSync(join(ROOT, 'app/theme.css'), 'utf8');
const hex = (h: string) => parseColor(h)!;
const prop = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(theme)?.[1]?.trim();

describe('the type scale: six sizes, two faces', () => {
  const sizes = new Set(Object.values(TYPE_SIZES_PX).flatMap((s) => [s.phone, s.wide]));
  it('six roles and no more than six phone sizes', () => {
    expect(Object.keys(TYPE_SIZES_PX)).toEqual(['display', 'title', 'heading', 'body', 'small', 'label']);
    expect(new Set(Object.values(TYPE_SIZES_PX).map((s) => s.phone)).size).toBe(6);
  });
  it('every role class sets only the scale\'s sizes, and only the display or the text face', () => {
    for (const [role, cls] of Object.entries(TYPE)) {
      const px = [...cls.matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
      expect(px.length, role).toBeGreaterThan(0);
      for (const p of px) expect(sizes.has(p), `${role} ${p}px`).toBe(true);
      expect(cls, role).toMatch(/\bfont-(display|sans)\b/);
      expect(cls, role).not.toMatch(/font-mono/);
    }
  });
  it('numbers are tabular, on the display face', () => {
    expect(NUM).toMatch(/tabular-nums/);
    expect(NUM).toMatch(/font-display/);
  });
});

describe('the surfaces: the text ladder reads on each (WCAG 1.4.3)', () => {
  for (const [name, e] of Object.entries(ELEVATION)) {
    it(`${name} (${e.composite}) is declared and every text step is ≥ 4.5:1 on it`, () => {
      expect(prop(e.var), e.var).toBeTruthy();
      expect(prop(e.var)!.toLowerCase()).toContain(name === 'overlay' ? 'rgba(20, 26, 34' : e.composite);
      for (const t of TEXT_LADDER) expect(contrastRatio(hex(COLOR[t]), hex(e.composite)), `${t} on ${name}`).toBeGreaterThanOrEqual(BODY_CONTRAST_MIN);
    });
  }
  it('one accent, and its ink reads on it', () => {
    expect(prop('--fel-accent')!.toLowerCase()).toBe(COLOR.cyan.toLowerCase());
    expect(contrastRatio(hex(prop('--fel-accent-ink')!), hex(COLOR.cyan))).toBeGreaterThanOrEqual(7);
  });
  it('radii are on the scale, and the card radius is the existing token', () => {
    expect(prop('--fel-r-card')).toBe(`${RADII.card}px`);
    expect(prop('--fel-r-sm')).toBe(`${RADII.sm}px`);
    expect(prop('--fel-r-md')).toBe(`${RADII.md}px`);
    expect(prop('--fel-r-xl')).toBe(`${RADII.xl}px`);
  });
});

describe('motion: three durations, zero when reduced from either source', () => {
  it('the CSS durations are the TypeScript ones', () => {
    expect(prop('--fel-dur-fast')).toBe(`${DURATION.fast}ms`);
    expect(prop('--fel-dur-base')).toBe(`${DURATION.base}ms`);
    expect(prop('--fel-dur-slow')).toBe(`${DURATION.slow}ms`);
  });
  it('the app\'s own setting (data-fel-motion="reduce") zeroes them and stops the premium animations', () => {
    expect(theme).toMatch(/html\[data-fel-motion="reduce"\]\s*\{\s*--fel-dur-fast:\s*0ms;\s*--fel-dur-base:\s*0ms;\s*--fel-dur-slow:\s*0ms;/);
    expect(theme).toMatch(/html\[data-fel-motion="reduce"\] :is\(\.fel-enter, \.fel-fade, \.fel-skeleton, \.fel-ring-arc\) \{ animation: none !important;/);
  });
  it('the device\'s setting does too, unless the player chose Full in the app', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{\s*html:not\(\[data-fel-motion="full"\]\) \{ --fel-dur-fast: 0ms;[\s\S]*?\n\}/.exec(theme);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/:is\(\.fel-enter, \.fel-fade, \.fel-skeleton, \.fel-ring-arc\) \{ animation: none !important;/);
  });
  it('the attribute and the pure rules', () => {
    expect(MOTION_ATTR).toBe('data-fel-motion');
    expect(motionAttrValue('system')).toBeNull();
    expect(motionAttrValue('reduce')).toBe('reduce');
    expect(motionAttrValue('full')).toBe('full');
    expect(durationFor(240, 'system', true)).toBe(0);
    expect(durationFor(240, 'full', true)).toBe(240);
    expect(durationFor(240, 'reduce', false)).toBe(0);
  });
  it('only opacity and transform animate in the premium keyframes (compositor-only)', () => {
    for (const k of ['fel-enter', 'fel-fade']) {
      const body = new RegExp(`@keyframes ${k} \\{([^\\n]*)\\}`).exec(theme)?.[1] ?? '';
      const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
      expect(props.length, k).toBeGreaterThan(0);
      for (const p of props) expect(['opacity', 'transform']).toContain(p);
    }
  });
});

describe('haptics: only where there is a Vibration API, never under reduced motion', () => {
  it('canVibrate', () => {
    expect(canVibrate({ vibrate: () => true }, false)).toBe(true);
    expect(canVibrate({ vibrate: () => true }, true)).toBe(false);
    expect(canVibrate({}, false)).toBe(false);
    expect(canVibrate(undefined, false)).toBe(false);
  });
});
