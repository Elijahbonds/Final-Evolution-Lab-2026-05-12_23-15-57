import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreatorHub } from '@/app/creator/_components/hub';

describe('CreatorHub', () => {
  it('routes every shipped creator discipline to a real play or guided create flow', () => {
    const html = renderToStaticMarkup(createElement(CreatorHub));
    const disciplineMarkers = html.match(/data-creator-discipline=/g) ?? [];
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    expect(disciplineMarkers).toHaveLength(9);
    expect(html).toContain('Nine creator disciplines, one arena');
    expect(html).toContain('Build your athlete');
    expect(html).toContain('data-creator-discipline="art"');
    // The hub has two tiers. First the player's ONE athlete record (lib/creator/schema/saveBuild.ts: "no mode may persist its
    // own parallel profile"): the Athlete Creator and, since lane/hoops-builder (owner 2026-11-12), the hoops builder, which
    // edits the hoops part of that same record (AthleteBuild.build.hoops). It is a sibling of the athlete card, not a tenth
    // discipline. Then the nine disciplines, unchanged.
    expect(hrefs.slice(0, 2)).toEqual(['/creator/athlete', '/creator/hoops']);
    expect(html).toContain('Your hoops player');
    // both athlete cards open real pages, not placeholders
    for (const route of ['athlete', 'hoops']) expect(existsSync(`app/creator/${route}/page.tsx`), route).toBe(true);
    expect(hrefs.slice(2)).toEqual([
      '/play/dance',
      '/play/acting',
      '/play/music',
      '/play/dunk',
      '/create/art',
      '/create/scene',
      '/create/cooking',
      '/create/fashion',
      '/create/writing',
    ]);
    expect(html).not.toContain('href=""');
    expect(html).not.toContain('coming in a future drop');
  });
});
