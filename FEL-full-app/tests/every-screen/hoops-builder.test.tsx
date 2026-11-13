// lane/hoops-builder (owner 2026-11-12): the hoops builder screen keeps the every-screen rules — its first frame is its full shape (no
// layout shift when the build arrives), every control is at least 44 px and named, text sits on the type scale, and it is reachable
// from the Creator.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => <a href={href} {...(p as object)}>{children as never}</a> }));

import HoopsBuilder from '@/app/creator/hoops/_components/hoops-builder';

const src = (p: string) => readFileSync(p, 'utf8');

describe('the hoops builder screen', () => {
  const html = renderToStaticMarkup(<HoopsBuilder />);

  it('draws its whole shape on the first frame: the points, three positions, a height, five ratings at the standard 50', () => {
    expect(html).toContain('data-testid="hb-points-left"');
    for (const p of ['Guard', 'Wing', 'Big']) expect(html).toContain(`>${p}</button>`);
    expect(html).toContain('6&#x27;4&quot;');
    for (const id of ['speed', 'handle', 'shooting', 'finishing', 'defense']) expect(html).toContain(`data-testid="hb-rating-${id}"`);
    expect((html.match(/>50<\/p>/g) ?? []).length).toBe(5);
    expect(html).toContain('Loading your ratings');
  });

  it('every button is at least 44 px and has a name; the position is a radio group', () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(3 + 2 + 10);
    for (const b of buttons) {
      expect(/\b(min-h-11|h-11|min-h-14)\b/.test(b), b).toBe(true);
    }
    for (const id of ['Speed', 'Handle', 'Shooting', 'Finishing', 'Defense']) {
      expect(html).toContain(`aria-label="Raise ${id}"`);
      expect(html).toContain(`aria-label="Lower ${id}"`);
    }
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Taller"');
    // before the build arrives nothing can be spent
    expect((html.match(/aria-label="Raise [A-Za-z]+" disabled=""/g) ?? []).length).toBe(5);
  });

  it('text on the type scale only: no raw pixel sizes under 12, and at most four sizes besides body', () => {
    const s = src('app/creator/hoops/_components/hoops-builder.tsx');
    expect(s).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/);
    expect(s).not.toMatch(/text-\[\d+px\]/);
    const roles = new Set([...s.matchAll(/TYPE\.(\w+)/g)].map((m) => m[1]).filter((r) => r !== 'body'));
    expect([...roles].sort()).toEqual(['heading', 'label', 'small', 'title']);
  });

  it('is reachable from the Creator hub and from the athlete creator', () => {
    expect(src('app/creator/_components/hub.tsx')).toContain('href="/creator/hoops"');
    expect(src('app/creator/athlete/_components/athlete-creator.tsx')).toContain('href="/creator/hoops"');
  });

  it('the status line holds its room, so a message never pushes the page', () => {
    expect(src('app/creator/hoops/_components/hoops-builder.tsx')).toContain('min-h-[3rem] text-fel-gold');
  });
});
