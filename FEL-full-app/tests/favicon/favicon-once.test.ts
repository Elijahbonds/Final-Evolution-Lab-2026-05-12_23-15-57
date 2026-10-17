// FDB-2 (2026-10-17): /favicon.svg once per document, not five times between /links and /try.
//
// Measured on the prod build (phone profile, /links → "Play FEL" → /try): five requests, all `max-age=0` revalidations —
// two on the /links load (`metadata.icons` rendered an `icon` and a `shortcut icon` link to the same file) and three more
// in the client-side hop to /try, because Next re-renders the metadata's links on every navigation. After: one `<link>` in
// the root layout's own <head>, which a navigation never re-renders — one request, on the /links load (FDB-2 capture).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const layout = readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n');

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (/^(layout|page|template)\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe('the favicon is one link in the root layout\'s <head>', () => {
  it('the root layout has exactly one icon link, to /favicon.svg, inside its own <head>', () => {
    expect(layout).toContain("const FAVICON_HREF = '/favicon.svg'");
    const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('</head>'));
    expect(head).toContain('<link rel="icon" href={FAVICON_HREF} type="image/svg+xml" />');
    expect(code(layout).match(/rel="(?:shortcut )?icon"/g)).toHaveLength(1);
    expect(existsSync(path.join(ROOT, 'public/favicon.svg'))).toBe(true);
  });
  it('no route\'s metadata declares icons again (Next would re-render those links on every navigation)', () => {
    const offenders = routeFiles(path.join(ROOT, 'app')).filter((f) => /\bicons\s*:/.test(code(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
  it('and no app/icon.* or app/favicon.* file asks Next to add its own icon link', () => {
    expect(readdirSync(path.join(ROOT, 'app')).filter((f) => /^(icon|favicon|apple-icon)\./.test(f))).toEqual([]);
  });
});
