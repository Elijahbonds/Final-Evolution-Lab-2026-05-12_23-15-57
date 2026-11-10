// EVERY-SCREEN P3 (2026-11-10): the AI program builder's screen and the two wrong demos. The builder's rules and its 24
// asks are lib/program-ask/asks24.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLibraryFiles } from '@/lib/library/files';
import { demoClipFor } from '@/lib/library/demo';
import { readProgramAsk } from '@/lib/program-ask/request';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the two wrong demos show the labelled still (owner, 2026-11-10)', () => {
  const lib = new Map(loadLibraryFiles().map((e) => [e.id, e]));
  it('Split Squat Stretch no longer plays the jumping split; Spider Crawl no longer plays a push-up', () => {
    expect(demoClipFor(lib.get('split-squat-stretch')!)).toBeNull();
    expect(demoClipFor(lib.get('spider-crawl')!)).toBeNull();
  });
});

describe('the builder screen', () => {
  it('a number chip\'s − and + are 44 px targets (they were 36 px wide)', () => {
    const src = read('components/program-ask/program-builder.tsx');
    expect(src).not.toContain('h-11 w-9');
    expect(src.match(/className="grid h-11 w-11 place-items-center disabled:opacity-30"/g)).toHaveLength(2);
  });
});

describe('the ask is read as typed', () => {
  it('a bare 10–17 on its own is an age, under-18 rules apply, and the page says it assumed so', () => {
    const r = readProgramAsk('Soccer player, 17, no equipment, 3 days, 40 minutes.');
    expect(r.request.age).toBe('teen');
    expect(r.assumptions.join(' ')).toMatch(/17 on its own is read as the athlete's age/);
    expect(readProgramAsk('Band, 3 days, 12.').request.age).toBe('child');
  });
  it('a number with a unit, or one that is not an age, is not read as one', () => {
    for (const q of ['Band, full body, 3 days a week, 40 minutes.', 'Dumbbells, 12 weeks, 4 days.', 'Band, 25, 3 days.']) expect(readProgramAsk(q).request.age, q).toBe('adult');
  });
});
