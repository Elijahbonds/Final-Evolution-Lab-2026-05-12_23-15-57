// SCREEN-FIX wording (2026-09-29): the grown-up step is never called by its old name (Cyber 1); plain words for the
// jargon and the device (S-7, owner addendum 2); one contact address in one constant (owner addendum 1 and the 8:13 AM
// update); the stop line (owner addendum 3). A scan of every screen file, code and comments alike.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as COPY from './copy';
import { PROVISIONAL_LABEL, THRESHOLDS } from './PROPOSED-thresholds';
import { StartStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { PreviewLabel } from '@/app/play/mirror/assess/_components/screen-ui';

const ROOT = join(__dirname, '../..');
/** Every file under the screen's folders (tests included), and the app root's provider switch. */
function screenFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts)$/.test(f)) out.push(relative(ROOT, p));
    }
  };
  for (const d of ['app/screen', 'app/play/mirror/assess', 'lib/screen']) walk(join(ROOT, d));
  return [...out, 'components/providers.tsx'];
}
const FILES = screenFiles();
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('Cyber 1: the grown-up step, and never the old word', () => {
  // the word is built here, not written, so this file passes its own scan
  const OLD = new RegExp(['con', 'sent'].join(''), 'i');
  it('the scan covers the screen', () => {
    expect(FILES).toEqual(expect.arrayContaining(['app/screen/privacy/page.tsx', 'app/play/mirror/assess/_components/gate-steps.tsx', 'lib/screen/store.ts', 'lib/screen/flow.ts', 'components/providers.tsx']));
  });
  it.each(FILES)('%s', (f) => {
    expect(read(f)).not.toMatch(OLD);
  });
  it('the checkbox says "A grown-up is with me"', () => {
    expect(COPY.GROWN_UP_CHECKBOX).toBe('A grown-up is with me');
  });
});

describe('S-7: plain words', () => {
  it('"this device": the old word for the device is gone from the screen', () => {
    // One exception, never shown on the screen: the sign-off register's label for t3.lrGap, which lib/assess's test keeps
    // in step with docs/MIRROR-ASSESS-THRESHOLDS.md (mirror-assess's doc, changed today: its rewording is routed).
    const REGISTER_LABEL = THRESHOLDS['t3.lrGap'].label;
    expect(REGISTER_LABEL.endsWith(['computed on the', 'phone'].join(' '))).toBe(true);
    for (const f of FILES) expect(read(f).split(REGISTER_LABEL).join(''), f).not.toMatch(/\b(this|the) phone\b/i);
  });

  it('owner addendum 2: "Early version" for the PROPOSED label, on the screen', () => {
    expect(COPY.EARLY_VERSION).toBe('Early version');
    const h = renderToStaticMarkup(createElement(PreviewLabel));
    expect(text(h)).toContain('Early version');
    expect(text(h)).not.toMatch(/PROPOSED|preview/i);
    expect(h).not.toContain('PROPOSED');
    // the PROPOSED file's own label is unchanged: mirror-coach's screen-next-steps.tsx imports it
    expect(PROVISIONAL_LABEL).toBe('PROPOSED · preview');
    for (const f of FILES.filter((x) => x.endsWith('.tsx') && !x.includes('.test.'))) expect(read(f), f).not.toMatch(/PROVISIONAL_LABEL|PREVIEW_LINE|ProposedTag|>PROPOSED</);
  });

  it('owner addendum 2: "Ankle bend (knee-to-wall)" and "Hands-on-hips jump" on the start card', () => {
    expect(COPY.SCREEN_TEST_NAMES).toEqual({ T1: 'Overhead squat', T2: 'Ankle bend (knee-to-wall)', T3: 'Single-leg squat', T5: 'Hands-on-hips jump' });
    const t = text(renderToStaticMarkup(createElement(StartStep, { onStart: () => {} })));
    expect(t).toContain('Ankle bend (knee-to-wall), each side');
    expect(t).toContain('Hands-on-hips jump');
    expect(t).not.toMatch(/dorsiflexion|countermovement/i);
    expect(t).toContain('Everything runs on this device.');
  });

  it('the double colon is gone: no line on the start card says "X: y: z"', () => {
    const h = renderToStaticMarkup(createElement(StartStep, { onStart: () => {} }));
    const lines = h.split(/<\/?(?:p|li|h2|button|section|div)[^>]*>/).map((x) => text(x).trim()).filter(Boolean);
    expect(lines).toContain(COPY.MORE_CHECKS_LINE);
    for (const l of lines) expect(l.match(/:/g)?.length ?? 0, l).toBeLessThan(2);
    expect(text(h)).not.toMatch(/full screen: coming later/i);
  });
});

describe('owner addendum 1 (and the 8:13 AM update): one contact address, in one constant', () => {
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  it('the constant is FinalEvolution.us@gmail.com', () => {
    expect(COPY.SCREEN_CONTACT_EMAIL).toBe('FinalEvolution.us@gmail.com');
  });
  it('the only address written in any screen source file is that one, in lib/screen/copy.ts only', () => {
    const found: string[] = [];
    for (const f of FILES.filter((x) => !x.includes('.test.'))) for (const m of read(f).matchAll(EMAIL)) found.push(`${f} ${m[0]}`);
    expect(found).toEqual(['lib/screen/copy.ts FinalEvolution.us@gmail.com']);
  });
  it('no placeholder is left anywhere in the screen', () => {
    const PLACEHOLDER = new RegExp(['<CONTACT', '_EMAIL>'].join(''));     // built, so this file passes its own scan
    for (const f of FILES) expect(read(f), f).not.toMatch(PLACEHOLDER);
  });
});

describe('owner addendum 3: the stop line', () => {
  it('reads "Not a medical exam. If anything hurts, stop."', () => {
    expect(COPY.STOP_LINE).toBe('Not a medical exam. If anything hurts, stop.');
  });
});
