// EVERY-SCREEN P8 part 2 (2026-11-11): "Your things" — what part 2 changed on the wallet, store, closet, profile and
// support screens (sizes, names and layout only: never money, price, payment or policy wording), as tests that fail on
// the code before it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicTopBar } from '@/components/public-chrome';

const src = (p: string) => readFileSync(p, 'utf8');

describe('44 px and named', () => {
  it('the shard chips carry a name and are 44 px; the picked one reads at 4.5:1 or better', () => {
    const w = src('components/wallet/exchange-widget.tsx');
    expect(w).toContain('aria-label={`${n} shards`} aria-pressed={shards === n}');
    expect(w).toContain('min-h-11 min-w-11 rounded-full');
    expect(w).not.toContain("shards === n ? '#A855F7'");   // white on it is 3.96:1
  });
  it('the closet studio\'s top-bar buttons are 44 px, and on a phone the tools sit in two columns beside the character', () => {
    const c = src('components/closet-view.tsx');
    expect(c).toContain("const hudBtn = 'pointer-events-auto flex min-h-11 min-w-11 items-center justify-center");
    expect(c).toContain('flex flex-wrap justify-end gap-1 max-md:grid max-md:grid-cols-2');
  });
  it('the ticks that were 13 px boxes are real checkboxes inside 44 px labels', () => {
    for (const f of ['components/creator/look-consent.tsx', 'components/closet/slot-bar.tsx', 'components/closet/paint-tab.tsx', 'components/privacy/scan-save-account.tsx']) {
      const s = src(f);
      expect(s, f).toContain('className="peer sr-only"');
      expect(s, f).toContain('peer-focus-visible:ring-2');
    }
  });
  it('every delete in the slot bar still asks first', () => {
    expect(src('components/closet/slot-bar.tsx')).toContain('setConfirmDelete');
  });
});

describe('one type scale', () => {
  it('the public bar\'s name is on the 20 px step and keeps its space ("FINAL EVOLUTION LAB")', () => {
    const html = renderToStaticMarkup(h(PublicTopBar));
    expect(html).toContain('text-[20px]');
    expect(html).toMatch(/FINAL EVOLUTION<\/span> LAB/);
  });
  it('the account\'s headings move from 18 to 20 px', () => {
    expect(src('components/profile-view.tsx')).not.toMatch(/\btext-lg\b/);
    expect(src('components/privacy/scan-save-account.tsx')).toContain('fel-heading text-[20px] font-bold');
  });
});

describe('empty states lead on, with labels the app already uses', () => {
  it('no duels yet -> Challenge someone', () => {
    const s = src('components/profile-v2/squad-section.tsx');
    expect(s.match(/>Challenge someone/g)?.length).toBe(2);
  });
});

describe('the controls panel hides nothing at 150 % text', () => {
  it('its rows scroll in their own box once the fit is at its floor, and the fit reads that box', () => {
    const p = src('components/games/controls-panel.tsx');
    expect(p).toMatch(/data-controls-rows className="[^"]*\bmin-h-0\b[^"]*\boverflow-y-auto\b/);
    expect(p).toContain("panel.querySelector<HTMLElement>('[data-controls-rows]')");
    expect(p).toContain('font-mono text-[14px] font-black text-[#22d3ee]">{r.input}');   // the size is phase 7's, untouched
  });
});
