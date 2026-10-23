// NP-1: while the AI is off, the entry points to the coach chat and the Studio/CELL are removed, not labelled.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ai = vi.hoisted(() => ({ state: 'loading' as 'loading' | 'available' | 'coming_soon' }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, () => {}] }));
vi.mock('next/link', () => ({ default: (p: any) => createElement('a', { href: p.href }, p.children) }));

import { CoachView } from '@/app/coach/_components/coach-view';
import { CellOrb } from '@/components/cell-orb';

// COACH-LOOP P1 (2026-10-20), test changed: the tab label is wrapped in a <span> so it can truncate at 390 px
// (app/coach/_components/coach-view.tsx); the tab is still a button whose whole label is "Coach"
const coachTab = (html: string) => />Coach(?:<\/span>)?<\/button>/.test(html);

describe('NP-1 AI entry points', () => {
  for (const s of ['coming_soon', 'loading'] as const) {
    it(`${s}: the Coach chat tab is removed (no label) and the other tabs stay`, () => {
      ai.state = s;
      const html = renderToStaticMarkup(createElement(CoachView));
      expect(coachTab(html)).toBe(false);
      expect(html).toContain('Exercises');
      expect(html).not.toMatch(/coming soon/i);
    });
    it(`${s}: CELL orb (and its Studio link) renders nothing`, () => {
      ai.state = s;
      expect(renderToStaticMarkup(createElement(CellOrb))).toBe('');
    });
  }
  it('available: the Coach tab and the CELL orb come back', () => {
    ai.state = 'available';
    expect(coachTab(renderToStaticMarkup(createElement(CoachView)))).toBe(true);
    expect(renderToStaticMarkup(createElement(CellOrb))).not.toBe('');
  });
});
