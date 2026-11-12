// SCREEN-FIXES (owner, 2026-11-10): "/account and /profile/edit long copy moves to 16 px." Size only: no wording changes.
// READABLE.md's rule: a run of more than 12 words is body copy and reads at 16 px (TYPE.body) on a phone. Each section the
// two pages mount is rendered on the server here, and every element that sets its own text size and holds more than 12
// words must be at 16 px.
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => '/account', useSearchParams: () => new URLSearchParams() }));

import { AccountSettings } from '@/components/account/account-settings';
import { AccessibilitySettings } from '@/components/settings/accessibility-settings';
import { AthletePicker, HealthDataSection, PrqDataRights } from '@/components/profile-view';
import { ReferralCard } from '@/components/marketing/referral-card';

const SIZE = /\btext-(xs|sm|base|\[\d+(?:\.\d+)?px\])(?=\s|$)/;
const words = (s: string) => s.replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Every element with its own text-size class, with all the text inside it (a light parser: the markup is React's). */
function sized(html: string): { size: string; text: string }[] {
  const out: { size: string; text: string }[] = [];
  const stack: { tag: string; size: string | null; text: string }[] = [];
  const VOID = /^(br|img|input|hr|meta|link|source|path|circle|rect|line|polyline|polygon)$/;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) { for (const e of stack) e.text += ` ${m[5]}`; continue; }
    const [, close, tag, attrs, selfClose] = m;
    if (close) {
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i < 0) continue;
      for (const e of stack.splice(i)) if (e.size) out.push({ size: e.size, text: e.text.trim() });
      continue;
    }
    if (selfClose || VOID.test(tag)) continue;
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
    stack.push({ tag, size: SIZE.exec(cls)?.[0] ?? null, text: '' });
  }
  return out;
}

const SECTIONS: [string, ComponentType<Record<string, unknown>>, Record<string, unknown>][] = [
  ['/account: Your data', AccountSettings as never, { email: 'sam@example.test' }],
  ['/account: data rights', PrqDataRights as never, {}],
  ['/account: health data', HealthDataSection as never, {}],
  ['/account: accessibility', AccessibilitySettings as never, {}],
  ['/profile/edit: your athlete', AthletePicker as never, { initialKey: null }],
  ['/profile/edit: invite', ReferralCard as never, {}],
];

describe('long copy on /account and /profile/edit is 16 px', () => {
  it.each(SECTIONS)('%s', (_name, C, props) => {
    const runs = sized(renderToStaticMarkup(createElement(C, props)));
    const long = runs.filter((r) => words(r.text) > 12);
    // the section has long copy at all (so the check is not vacuous) …
    expect(long.length, 'long copy rendered').toBeGreaterThan(0);
    // … and every piece of it sets 16 px, or holds a child that sets its own size (the child is judged on its own)
    const small = long.filter((r) => r.size !== 'text-[16px]' && !runs.some((c) => c !== r && words(c.text) > 12 && r.text.includes(c.text) && c.text.length < r.text.length));
    expect(small.map((r) => `${r.size}: ${r.text.slice(0, 60)}`)).toEqual([]);
  });

  it('the /profile/edit page\'s own creator-card line and the card editor\'s lines are 16 px (read from the source: both need a server)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..', '..');
    expect(readFileSync(join(root, 'app/profile/edit/page.tsx'), 'utf8')).toMatch(/<p className=\{`mt-1 \$\{TYPE\.body\} text-white\/50`\}>Scanned by somebody new/);
    const editor = readFileSync(join(root, 'components/creator/card-editor.tsx'), 'utf8');
    expect(editor).toMatch(/\$\{TYPE\.body\} text-white\/50`\}>Customize the look/);
    expect(editor).toMatch(/\$\{TYPE\.body\} text-white\/50`\}>Play a mode/);
  });
});
