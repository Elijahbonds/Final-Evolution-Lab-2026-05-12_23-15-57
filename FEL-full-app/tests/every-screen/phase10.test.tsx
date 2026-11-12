// EVERY-SCREEN P10 part A (2026-11-12): "The whole app, once more": one look, speed, and the carried-over items, as tests
// that fail on the code before it. Sizes, layout and timing only; no words, prices or feel numbers.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { opensToVisitors, reservesRail } from '@/components/shell/status-rail';

const src = (p: string) => readFileSync(p, 'utf8');

describe('speed: a tap answers before the heavy work', () => {
  it('Studio: "Make it for me" paints its answer, then builds the court after that frame', () => {
    const f = src('components/nexus-studio/first-court.tsx');
    expect(f).toContain('requestAnimationFrame(() => setTimeout(() => {');
    expect(f).toContain('aria-busy={building} disabled={building}');
    expect(f).toContain('Make it for me');   // the label is unchanged
  });
  it('the profile athlete is drawn once, not every frame, when WebGL has no graphics chip', () => {
    const a = src('components/profile-v2/athlete-3d.tsx');
    expect(a).toContain("classifyGpu(");
    expect(a).toContain('const want = visible && onScreen && (!software || turning);');
  });
  it('the boss fight starts in a transition', () => {
    expect(src('components/games/glitch-boss-game.tsx')).toContain('startTransition(() => setStarted(true))');
  });
});

describe('nothing jumps as it loads', () => {
  it('/shop/shards draws its packs from the server\'s answer, as /store does', () => {
    expect(src('app/shop/shards/page.tsx')).toContain('<ShardStore initialPurchasesEnabled={coinPacksOnSale()} />');
  });
  it('the coach invite holds the top bar\'s place for a signed-in visitor', () => {
    expect(opensToVisitors('/coach/join/abc')).toBe(true);
    expect(opensToVisitors('/profile')).toBe(false);
    expect(reservesRail('/coach/join/abc')).toBe(false);   // unchanged: a signed-out visitor never sees a bar vanish
    expect(src('components/shell/status-rail.tsx')).toContain('<div aria-hidden data-fel-rail-spacer className="h-0" />');
    expect(src('app/coach/join/[token]/page.tsx')).toContain("const HOLD_RAIL = '[data-fel-rail-spacer]{height:3.5rem!important}';");
  });
});

describe('the start card\'s how-to panel scrolls as a whole (phase 7\'s recommendation; the owner has not answered)', () => {
  it('the panel is the scroll box; the rows and lines have none of their own', () => {
    const p = src('components/games/controls-panel.tsx');
    expect(p).toMatch(/className=\{`flex w-\[min\(30rem,92vw\)\] min-h-0 flex-col gap-1\.5 overflow-y-auto/);
    expect(p).toContain('<span data-controls-rows className="[zoom:var(--fel-controls-fit,1)] grid shrink-0');
    expect(p).toContain('<span data-controls-lines className="[zoom:var(--fel-controls-fit,1)] block shrink-0');
  });
  it('only a pad (which cannot scroll a box) is still stepped down to fit; a long line is 16 px elsewhere', () => {
    const p = src('components/games/controls-panel.tsx');
    expect(p).toContain("if (device !== 'pad') { apply(1); return; }");
    expect(p).toContain("device === 'pad' ? 'text-[14px]' : lineSize(l, 'text-[14px]')");
  });
});

describe('cut-offs and small targets carried over', () => {
  it('story zones are centred by motion\'s own transform (the class translate never applied)', () => {
    const s = src('components/story-map.tsx');
    expect(s).toContain("x: '-50%', y: '-50%'");
    expect(s).not.toContain('absolute z-10 -translate-x-1/2 -translate-y-1/2');
  });
  it('the grocery list\'s buttons and rows are 44 px', () => {
    const g = src('components/kitchens/grocery-list.tsx');
    expect(g).toContain('onClick={copy} className="flex min-h-11');
    expect(g).toContain('onClick={share} className="flex min-h-11');
  });
});
