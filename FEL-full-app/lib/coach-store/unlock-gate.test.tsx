// UNLOCK-FLAG-GATE. vitest does not collect app/**, so app/program/unlock/layout.tsx is pinned from here (the
// lib/screen/routes.test.tsx pattern). Uses the real next/navigation notFound(), so the digest checked is the one
// Next itself turns into a 404.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import UnlockLayout, { dynamic } from '@/app/program/unlock/layout';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED;
  else process.env.COACH_STORE_ENABLED = ORIGINAL;
});

function digest(fn: () => unknown): string {
  try { fn(); return 'rendered'; } catch (e) { return String((e as { digest?: string }).digest); }
}

const child = createElement('p', { 'data-unlock-child': 'yes' }, 'unlock page');

describe('/program/unlock layout: coach store flag gate', () => {
  it('is force-dynamic, so the flag is read per request and not baked in at build time', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it.each([undefined, '', '0', 'false', 'off', 'nope'])('flag %j is off: notFound() (a 404), children never render', (v) => {
    if (v === undefined) delete process.env.COACH_STORE_ENABLED;
    else process.env.COACH_STORE_ENABLED = v;
    expect(digest(() => UnlockLayout({ children: child }))).toMatch(/^(NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404)$/);
  });

  it.each(['1', 'true', 'TRUE', ' on ', 'yes'])('flag %j is on: renders its children unchanged', (v) => {
    process.env.COACH_STORE_ENABLED = v;
    const out = UnlockLayout({ children: child });
    expect(out).toBe(child);
    expect(renderToStaticMarkup(createElement('div', null, out))).toContain('data-unlock-child="yes"');
  });

  it('reads the flag at call time: flipping the env between calls flips the result', () => {
    delete process.env.COACH_STORE_ENABLED;
    expect(digest(() => UnlockLayout({ children: child }))).not.toBe('rendered');
    process.env.COACH_STORE_ENABLED = '1';
    expect(digest(() => UnlockLayout({ children: child }))).toBe('rendered');
    delete process.env.COACH_STORE_ENABLED;
    expect(digest(() => UnlockLayout({ children: child }))).not.toBe('rendered');
  });

  it('is a server module using the shared flag helper, and the client page and parent layout keep no gate of their own', () => {
    const app = join(__dirname, '../../app/program');
    const layout = readFileSync(join(app, 'unlock/layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/['"]use client['"]/);
    expect(layout).toMatch(/import \{ isCoachStoreEnabled \} from '@\/lib\/flags'/);
    expect(layout).toMatch(/if \(!isCoachStoreEnabled\(\)\) notFound\(\);/);
    expect(readFileSync(join(app, 'unlock/page.tsx'), 'utf8')).toMatch(/^'use client';/);
    expect(readFileSync(join(app, 'layout.tsx'), 'utf8')).not.toMatch(/isCoachStoreEnabled|notFound/);
  });
});
