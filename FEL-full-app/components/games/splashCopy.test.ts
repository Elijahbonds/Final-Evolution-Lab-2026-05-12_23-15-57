// QA P1-18 (2026-09-27): the tennis splash read "CENTRE COURT"; the app writes US English everywhere else.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const splash = stripComments(readFileSync(path.resolve(__dirname, 'boot-splash.tsx'), 'utf8'));

describe('the READY splash copy', () => {
  it('the tennis court is the CENTER COURT', () => {
    expect(splash).toContain("tennis: { venue: 'tennis-court', sub: 'CENTER COURT'");
  });
  it('no British "centre" in any venue line', () => {
    expect(splash).not.toMatch(/CENTRE|Centre/);
  });
});
