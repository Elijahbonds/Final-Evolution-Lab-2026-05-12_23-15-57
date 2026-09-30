// Education's further reading (MIRROR-COACH P9, 2026-09-30; owner decisions #8 and #25, rule (f)): a PLAIN citation —
// title, authors, publisher, year — framed as further reading and never as FEL's source. No cover, no quotes, no link, no
// affiliate. The server render is what the Playbook course shows, so it is pinned exactly.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FurtherReading } from './further-reading';
import { FURTHER_READING, FURTHER_READING_HEADING, citationLine } from '@/lib/education/furtherReading';

const html = renderToStaticMarkup(createElement(FurtherReading));
const text = html.replace(/<[^>]+>/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);

describe('further reading: the plain citation', () => {
  it('is exactly the citation the owner decided on', () => {
    expect(FURTHER_READING).toEqual([
      { title: 'Pain-Free Performance', authors: 'Dr. John Rusin with Glen Cordoza', publisher: 'Victory Belt Publishing', year: 2025 },
    ]);
    expect(citationLine(FURTHER_READING[0])).toBe('Pain-Free Performance, Dr. John Rusin with Glen Cordoza, Victory Belt Publishing, 2025.');
  });

  it('renders the heading, the citation and one framing line — nothing else', () => {
    expect(text).toEqual([
      FURTHER_READING_HEADING,
      'Pain-Free Performance, Dr. John Rusin with Glen Cordoza, Victory Belt Publishing, 2025.',
      'Listed as further reading. The course above is the Playbook’s own.',
    ]);
    expect(FURTHER_READING_HEADING).toBe('Further reading');
  });

  it('no link, no cover, no picture, no quote, no affiliate', () => {
    expect(html).not.toMatch(/<a\b|href=|<img\b|<picture\b|<svg\b|src=|srcset=|<blockquote\b|<q\b/i);
    // no quotation: no quote marks in anything it says (the markup's own attribute quotes are not text)
    expect(text.join(' ')).not.toMatch(/["“”«»]/);
    expect(html).not.toContain('&quot;');
    expect(html).not.toMatch(/\b(amazon|affiliate|buy|shop|order)\b|\btag=|\bref=/i);
    // the data has nowhere to put a link or an image
    for (const c of FURTHER_READING) expect(Object.keys(c).sort()).toEqual(['authors', 'publisher', 'title', 'year']);
  });

  it('framed as further reading, never as FEL\'s source', () => {
    const all = text.join(' ');
    expect(all).not.toMatch(/\b(source|based on|adapted|inspired|from the book|according to|endors|recommend|official)\b/i);
    expect(all).toMatch(/further reading/i);
  });

  it('is mounted under the Playbook course, and the book is named nowhere else in the app\'s copy', () => {
    const page = readFileSync(new URL('../../app/education/playbook/page.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/<ChapterList \/>\s*<FurtherReading \/>/);
    // every shipped line of app/, components/ and lib/ (code, not comments; data files whole): the title, and the
    // authors' names, appear only in the citation's own module
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx|json)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const src = readFileSync(p, 'utf8');
        const code = name.endsWith('.json') ? src : src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
        if (/Pain-Free Performance|Rusin|Cordoza/.test(code)) hits.push(p.slice(root.length));
      }
    };
    for (const d of ['app', 'components', 'lib']) walk(join(root, d));
    expect(hits).toEqual(['lib/education/furtherReading.ts']);
  });
});
