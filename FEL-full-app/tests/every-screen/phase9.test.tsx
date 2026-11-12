// EVERY-SCREEN P9 (2026-11-11): "Learn, create and the public pages" — what phase 9 changed (sizes, layout and names;
// never legal, policy, price or payment words), as tests that fail on the code before it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch } from '@/components/ui/switch';
import { LEGAL_PROSE } from '@/lib/legal/legalProse';
import { startHref } from '@/components/guidance/pathway-panel';

const src = (p: string) => readFileSync(p, 'utf8');

describe('the shared switch is a 44 px target that looks the same', () => {
  it('the button is 44 × 44 px and the 44 × 24 px track is drawn inside it', () => {
    const html = renderToStaticMarkup(h(Switch, { 'aria-label': 'Health data collection' }));
    expect(html).toMatch(/<button[^>]*class="[^"]*\bh-11 w-11\b/);
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*\bh-6 w-11\b[^"]*group-data-\[state=checked\]:bg-primary/);
    expect(html).toContain('aria-label="Health data collection"');
    expect(html).toContain('role="switch"');
  });
});

describe('the terms pages: layout and size only', () => {
  it('their headings sit on the app\'s steps (30 and 20 px; were 24 and 18)', () => {
    expect(LEGAL_PROSE).toContain('[&_h1]:text-[30px]');
    expect(LEGAL_PROSE).toContain('[&_h2]:text-[20px]');
    expect(LEGAL_PROSE).not.toMatch(/\[&_h1\]:text-2xl|\[&_h2\]:text-lg/);
  });
  it('the store-terms tick before Buy is a real checkbox in a 44 px label, still unticked by default', () => {
    const b = src('components/press/buy-button.tsx');
    expect(b).toContain('className="peer sr-only"');
    expect(b).toContain('flex min-h-11 max-w-xs cursor-pointer');
    expect(b).toContain('disabled={busy || !termsAgreed}');
  });
});

describe('44 px on the public frames', () => {
  it('the press and creator frames\' links are 44 px tall', () => {
    for (const f of ['components/press/press-frame.tsx', 'components/creator-platform/creator-frame.tsx']) {
      const s = src(f);
      expect(s, f).toContain('inline-flex min-h-11 items-center hover:text-white/70">Final Evolution Lab');
      expect(s, f).toContain('inline-flex min-h-11 min-w-11 items-center justify-center hover:text-white/70">Terms');
    }
  });
});

describe('every pathway leads on', () => {
  it('each discipline\'s next step opens its own create flow (sport: Train)', () => {
    expect(startHref('sport')).toBe('/train');
    expect(startHref('music')).toBe('/create/music');
    expect(startHref('nonsense')).toBe('/create');
  });
});

describe('nothing is cut off or pushed sideways', () => {
  it('the athlete creator stacks on a phone (the 192 px column beside it pushed the page 172 px wide)', () => {
    const a = src('app/creator/athlete/_components/athlete-creator.tsx');
    expect(a).toContain('max-md:flex-col');
    expect(a).toContain('max-md:overflow-x-auto');
  });
  it('the topic blurbs are not clamped', () => {
    expect(src('components/learn/topic-picker.tsx')).not.toContain('line-clamp-3 text-fel-dim');
  });
});
