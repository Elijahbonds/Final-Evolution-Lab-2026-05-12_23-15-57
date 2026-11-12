// COACH-DELIVERY COA-09 (2026-10-27; owner 2026-10-20: "NO YouTube (own storage only; strict no-ads)"): nothing in app/,
// components/ or lib/ embeds YouTube. Every source file (tests excluded, they may quote the URLs they check) is read: no
// YouTube embed URL (youtube.com/embed, youtube-nocookie), and no <iframe> that points at YouTube. A YouTube URL may still
// appear as a plain outbound link or in a parser that turns it into one.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const SKIP = new Set([join(ROOT, 'lib/generated')]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.has(p)) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?|mts)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const EMBED = /youtube\.com\/embed|youtube-nocookie/i;
const IFRAME_YT = /<iframe\b[^>]*(youtu\.?be|youtube)/is;

export function offenders(files: readonly { file: string; text: string }[]): string[] {
  return files.filter((f) => EMBED.test(f.text) || IFRAME_YT.test(f.text) || (/<iframe\b/i.test(f.text) && /youtu/i.test(f.text.slice(f.text.search(/<iframe\b/i), f.text.search(/<iframe\b/i) + 600)))).map((f) => f.file);
}

describe('no YouTube embed anywhere', () => {
  const files = ['app', 'components', 'lib'].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));

  it('control: the scan reads the three trees and catches each embed shape', () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(files.some((f) => f.file === 'components/library/library-demo.tsx')).toBe(true);
    expect(offenders([{ file: 'a', text: 'src={`https://www.youtube.com/embed/${id}`}' }])).toEqual(['a']);
    expect(offenders([{ file: 'b', text: "src: 'https://www.youtube-nocookie.com/x'" }])).toEqual(['b']);
    expect(offenders([{ file: 'c', text: '<iframe\n  src={ytUrl("youtu.be/abc")} />' }])).toEqual(['c']);
    expect(offenders([{ file: 'd', text: '<a href="https://youtu.be/abc">Watch</a>' }])).toEqual([]);   // a plain link is allowed
  });

  it('0 offenders in app/, components/ and lib/', () => {
    expect(offenders(files)).toEqual([]);
  });
});
