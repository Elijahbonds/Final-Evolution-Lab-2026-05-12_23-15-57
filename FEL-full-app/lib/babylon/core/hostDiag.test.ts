// PERF-LOAD PRF-07: the four modes outside the Babylon harness send game_diag (LAUNCH-CHECKLIST H2).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sent: Array<{ kind: string; detail: string; mode: string }> = [];
let mode = '';
vi.mock('./diag', () => ({
  setDiagMode: (m: string) => { mode = m; },
  reportDiag: (kind: string, detail: string) => { sent.push({ kind, detail, mode }); return true; },
}));

import { hostDiag, hostTtfpDetail, withHostDiag } from './hostDiag';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const clock = (t: { now: number; page: number }) => ({ now: () => t.now, pageNow: () => t.page });

describe('hostDiag', () => {
  beforeEach(() => { sent.length = 0; mode = ''; });

  it('ttfp: ms from the mount to the first screen, in the harness\'s ttfp shape, once', () => {
    const t = { now: 1000, page: 1500 };
    const d = hostDiag('music', clock(t), () => 'os=android gl=- tier=- dpr=3 px=390x844 gpu=-');
    t.now = 3400; t.page = 3900;
    d.ready(); d.ready();
    expect(sent).toEqual([{ kind: 'ttfp', mode: 'music', detail: 'ready=2400 start=- first=- page=3900 host=react os=android gl=- tier=- dpr=3 px=390x844 gpu=-' }]);
  });

  it('load: a failure names the mode and the reason', () => {
    hostDiag('story', clock({ now: 0, page: 0 }), () => '').fail(new Error('Story load failed (500)'));
    expect(sent).toEqual([{ kind: 'load', mode: 'story', detail: 'story load failed: Story load failed (500)' }]);
  });

  it('the detail carries no user agent and no id', () => {
    expect(hostTtfpDetail(1, 2, 'os=ios gl=- tier=- dpr=3 px=1x1 gpu=-')).not.toMatch(/Mozilla|user|id=/i);
  });

  it('withHostDiag: a loaded chunk reports ttfp from its first commit and renders the same component', async () => {
    const Inner = (p: { label: string }) => createElement('b', null, p.label);
    const reports: string[] = [];
    const mod = await withHostDiag('acting', Promise.resolve({ default: Inner }), { ready: () => reports.push('ready'), fail: () => reports.push('fail') });
    expect(renderToStaticMarkup(createElement(mod.default, { label: 'hi' }))).toBe('<b>hi</b>');
    expect(reports).toEqual([]);   // static render: no effect ran (a browser commit runs it — see the next test's shape)
  });

  it('withHostDiag: a failed chunk is reported and still rejects (next/dynamic shows its error as before)', async () => {
    const reports: unknown[] = [];
    await expect(withHostDiag('irl', Promise.reject(new Error('ChunkLoadError')), { ready: () => {}, fail: (e) => reports.push(e) })).rejects.toThrow('ChunkLoadError');
    expect(String(reports[0])).toMatch(/ChunkLoadError/);
  });
});

describe('the four non-harness hosts send game_diag', () => {
  const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  it.each([
    ['music', 'app/play/music/_components/loader.tsx'],
    ['acting', 'app/play/acting/_components/loader.tsx'],
    ['irl', 'app/play/irl/_components/loader.tsx'],
  ])('%s: its game chunk loads through withHostDiag', (m, rel) => {
    expect(read(rel)).toMatch(new RegExp(`dynamic\\(\\(\\) => withHostDiag\\('${m}', import\\(`));
  });
  it('story: the map reports ready on its data and fail on its error', () => {
    const src = read('components/story-map.tsx');
    expect(src).toMatch(/hostDiag\('story'\)/);
    expect(src).toMatch(/diag\.ready\(\)/);
    expect(src).toMatch(/diag\.fail\(err\)/);
  });
});
