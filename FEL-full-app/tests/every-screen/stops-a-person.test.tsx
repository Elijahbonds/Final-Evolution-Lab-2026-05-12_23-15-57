// EVERY-SCREEN phase 1, part B (2026-11-10): what stopped a person in training and coaching, each held by a test that
// fails on the old behaviour. Found by walking every job on the rig (docs/EVERY-SCREEN-JOBS.md).
//
//   1. The AI builder's session player sat UNDER the tab bar and the status rail: Start now / Set done could not be tapped.
//   2. A switched-off screen said "Opens soon" (or "coming soon") and nothing else: no why, no way on but the tab bar.
//   3. "My progress" had no door on Train.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OpensSoon } from '@/components/shop/opens-soon';
import { DarkInstead } from '@/components/every-screen/dark-instead';
import { HighlightNotice, highlightLoadMessage } from '@/components/coach-business/highlight-consent';
import { MyCombines, MINE_COMING_SOON } from '@/components/combine/my-combines';
import { ProgramList } from '@/components/signature/program-list';
import { OneOnOneBooker } from '@/components/group-booking/one-on-one-booker';
import { GROUP_DARK } from '@/lib/group-booking/copy';
import { NOT_READY_LINE } from '@/lib/signature/copy';
import { PROGRESS_HREF } from '@/components/result-card/result-card';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = join(dir, n);
    if (statSync(join(ROOT, p)).isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) walk(p, out); }
    else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) out.push(p);
  }
  return out;
};

describe('1. a session player is never mounted under the app\'s bars', () => {
  // The player is `fixed inset-0 z-[70]`. Inside a page whose <main> animates in, that z-index is trapped under the tab
  // bar (z-50) and the status rail (z-40): PLAT-P06 found it and made Layer (a portal to <body>). The AI builder, merged
  // later, mounted the player without it, and its one button was covered (measured on the rig, 2026-11-10: the element
  // on top of "Start now" was the tab bar's icon). Every mount outside the player's own folder must be in a Layer.
  const mounts = [...walk('app'), ...walk('components')]
    .filter((f) => !f.startsWith(join('components', 'session-player')))
    .flatMap((f) => read(f).split('\n').map((line, i) => ({ f, i: i + 1, line })).filter((x) => /<(SessionPlayer|CoachSessionPlayer)\b/.test(x.line)));

  it('finds the mounts it is guarding (the builder, the signature page, Today, the library sheet)', () => {
    const files = [...new Set(mounts.map((m) => m.f))].map((f) => f.split('\\').join('/'));
    expect(files).toEqual(expect.arrayContaining(['components/program-ask/program-builder.tsx', 'components/signature/program-page.tsx', 'app/coach/_components/today-view.tsx', 'components/library/exercise-sheet.tsx']));
  });
  it('every mount is inside <Layer>', () => {
    const bare = mounts.filter((m) => !/<Layer>\s*<(SessionPlayer|CoachSessionPlayer)\b/.test(m.line)).map((m) => `${m.f}:${m.i}`);
    expect(bare).toEqual([]);
  });
});

describe('2. a switched-off screen says why and what to do instead', () => {
  it('Opens soon, on a screen: the why line and one link (a product card still gets the bare line)', () => {
    const bare = renderToStaticMarkup(h(OpensSoon));
    expect(bare).toContain('data-opens-soon');
    expect(bare).not.toContain('<a ');                       // PLAT-P07's product state is unchanged: one line, no button
    const screen = renderToStaticMarkup(h(OpensSoon, GROUP_DARK.groups));
    expect(screen).toContain('Opens soon');
    expect(screen).toContain('data-opens-soon-why');
    expect(screen).toContain(GROUP_DARK.groups.why.replace(/'/g, '&#x27;'));
    expect(screen).toContain(`href="${GROUP_DARK.groups.instead.href}"`);
    expect(screen).toContain('data-opens-soon-instead');
  });
  it('the words promise no date and no price, and name nothing about how the app is built', () => {
    for (const d of Object.values(GROUP_DARK)) {
      expect(d.why.replace('1:1', 'one-to-one')).not.toMatch(/\d|\$|table|sql|database|deploy|soon/i);
      expect(d.instead.href).toMatch(/^\/(train|coach)$/);
      expect(d.instead.label.split(' ').length).toBeLessThanOrEqual(6);
    }
  });
  it('booking a 1:1 while it is off: the notice and a way on (it was "Opens soon" and a link back to the other "Opens soon")', () => {
    const html = renderToStaticMarkup(h(OneOnOneBooker, { view: { available: false } }));
    expect(html).toContain('data-opens-soon-why');
    expect(html).toContain('href="/train"');
  });
  it('no training or coaching screen mounts a bare <OpensSoon />', () => {
    const files = [...walk('app/groups'), ...walk('app/coach'), ...walk('app/train'), ...walk('components/group-booking'), ...walk('components/coach')];
    const bare = files.filter((f) => /<OpensSoon\s*\/>/.test(read(f)));
    expect(bare).toEqual([]);
  });
  it('an athlete\'s combines while they are off: the line, and two things that work today', () => {
    const html = renderToStaticMarkup(h(MyCombines, { available: false, events: [] }));
    expect(html).toContain(MINE_COMING_SOON);
    expect(html).toContain('data-dark-instead');
    expect(html).toContain('href="/play/mirror/assess?run=vertical"');
    expect(html).toContain(`href="${PROGRESS_HREF}"`);
  });
  it('signature programs while they are off: the daily drill and the library the line names are links', () => {
    const html = renderToStaticMarkup(h(ProgramList, { ready: false, admin: false, youth: false, programs: [] }));
    expect(html).toContain(NOT_READY_LINE.replace(/'/g, '&#x27;'));
    expect(html).toContain('href="/train/today-drill"');
    expect(html).toContain('href="/train/library"');
  });
  it('the coach\'s shot charts and bar speed while they are off: a way back under the notice', () => {
    for (const f of ['components/hoops-cam/coach-shots.tsx', 'components/vbt/coach-velocity.tsx']) {
      const src = read(f);
      const dark = src.split('\n').find((l) => /available\) return/.test(l)) ?? '';
      expect(dark, f).toContain('<DarkInstead');
      expect(dark, f).toContain("href: '/coach'");
    }
  });
  it('squads and teams while they are off (reached from Train): the drill and a game the line names, as links', () => {
    const src = read('components/groups/groups-home.tsx');
    const dark = src.split('\n').find((l) => /data-groups-coming-soon/.test(l)) ?? '';
    expect(dark).toContain('<DarkInstead');
    expect(dark).toContain("href: '/train/today-drill'");
  });
  it('a coach\'s "share a result?" link while sharing is off: says it is off (not "not for this account") and offers a way on', () => {
    expect(highlightLoadMessage(503)).toMatch(/isn't switched on yet/);
    expect(highlightLoadMessage(404)).toBe('This link is not for this account.');
    const html = renderToStaticMarkup(h(HighlightNotice, { msg: highlightLoadMessage(503) }));
    expect(html).toContain('data-dark-instead');
    expect(html).toContain('href="/coach"');
  });
  it('DarkInstead draws tap targets of 44 px, and nothing when it has no link', () => {
    const html = renderToStaticMarkup(h(DarkInstead, { links: [{ href: '/coach', label: 'Back to Coach' }] }));
    expect(html).toContain('min-h-11');
    expect(html).toContain('href="/coach"');
    expect(renderToStaticMarkup(h(DarkInstead, { links: [] }))).toBe('');
  });
});

describe('3. My progress has a door on Train', () => {
  it('a Train row opens the progress page, at the result card\'s own address', () => {
    const page = read('app/train/page.tsx');
    expect(PROGRESS_HREF).toBe('/train/progress');
    expect(page).toContain(`href: '${PROGRESS_HREF}'`);
    expect(page).toContain("t('train.cards.progress.title')");
    const words = JSON.parse(read('messages/en/train.json')) as { cards: Record<string, { title: string; line: string }> };
    expect(words.cards.progress.title).toBe('My progress');
    expect(words.cards.progress.line.split(' ').length).toBeLessThanOrEqual(12);
    expect(existsSync(join(ROOT, 'app/train/progress/page.tsx'))).toBe(true);
  });
});
