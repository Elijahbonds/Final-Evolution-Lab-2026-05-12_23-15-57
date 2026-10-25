// ONB-05: the four public pages carry the owner-approved Appendix B copy (docs/PLATFORM-ROADMAP.md), word for word, with
// every owner blank drawn as a visible [OWNER: …] marker, and the EXAMPLE badges kept until the owner fills them.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PUBLIC_PAGE_COPY, TEAM_BOOK_OPEN, ownerBlanks, type CopyPart } from '@/lib/creator/creatorCatalog';
import { OwnerCopy } from '@/components/public-copy/owner-copy';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The Appendix B draft for a page: the quoted text after "- Draft:" in that page's block. */
function draftOf(route: string): string {
  const doc = read('docs/PLATFORM-ROADMAP.md');
  const at = doc.indexOf(`**\`${route}\`**`, doc.indexOf('## Appendix B'));
  expect(at, route).toBeGreaterThan(-1);
  const block = doc.slice(at, doc.indexOf('\n\n', doc.indexOf('- Draft:', at)));
  const m = /- Draft: "([\s\S]*)"\s*$/.exec(block);
  expect(m, route).toBeTruthy();
  return squash(m![1]);
}

/** Our parts, written back the way Appendix B writes them. Two markers are ours, said in the report: the P2 link the
 *  draft brackets without "owner:", and the brand policy's link (the draft names the policy, the page has no URL yet). */
function asDraft(parts: readonly CopyPart[]): string {
  return squash(parts.map((p) => (typeof p === 'string' ? p
    : p.owner === 'link to the application, P2' ? '[link to the application, P2]'
      : p.owner === 'brand policy link' ? '' : `[owner: ${p.owner}]`)).join(''));
}

describe('ONB-05: Appendix B, as approved', () => {
  it('/press says the draft, word for word', () => {
    expect(asDraft(PUBLIC_PAGE_COPY.press.body)).toBe(draftOf('/press'));
  });
  it('/media-kit says the draft, word for word', () => {
    expect(asDraft([PUBLIC_PAGE_COPY.mediaKit.lede, ' ', ...PUBLIC_PAGE_COPY.mediaKit.body])).toBe(draftOf('/media-kit'));
  });
  it('/team says the draft, word for word (its booking sentence only while the coach store is open)', () => {
    expect(asDraft([PUBLIC_PAGE_COPY.team.lede, ' ', ...PUBLIC_PAGE_COPY.team.body, ' ', TEAM_BOOK_OPEN])).toBe(draftOf('/team'));
  });
  it('/work-with-us says the draft, word for word', () => {
    expect(asDraft([PUBLIC_PAGE_COPY.workWithUs.lede, ' ', ...PUBLIC_PAGE_COPY.workWithUs.body])).toBe(draftOf('/work-with-us'));
  });

  it("every blank is one of the owner's (OWN-21) and is drawn as a visible marker", () => {
    const all = Object.values(PUBLIC_PAGE_COPY).flatMap((c) => ownerBlanks(c.body));
    expect(all).toEqual(['number', 'press email', 'monthly players, as of date', 'packages and rates', 'profiles',
      'link to the application, P2', 'brand policy link', 'days']);
    const html = renderToStaticMarkup(createElement(OwnerCopy, { parts: PUBLIC_PAGE_COPY.press.body }));
    expect(html).toContain('[OWNER: number]');
    expect(html).toContain('data-owner-blank="press email"');
    expect(html).toContain('Final Evolution Lab is a game and a training platform in one: play ');
  });

  it('each page renders its copy, and the media kit keeps its EXAMPLE badges', () => {
    expect(read('app/press/page.tsx')).toContain('PUBLIC_PAGE_COPY.press.body');
    expect(read('app/team/page.tsx')).toContain('PUBLIC_PAGE_COPY.team.body');
    expect(read('app/work-with-us/page.tsx')).toContain('PUBLIC_PAGE_COPY.workWithUs.body');
    const kit = read('app/media-kit/page.tsx');
    expect(kit).toContain('PUBLIC_PAGE_COPY.mediaKit.body');
    expect(kit).not.toContain('Everything marked EXAMPLE is draft information');
    expect(kit).toMatch(/audience\.isExample \? <ExampleBadge/);
    expect(kit).toMatch(/p\.priceIsExample \? <ExampleBadge/);
  });
});
