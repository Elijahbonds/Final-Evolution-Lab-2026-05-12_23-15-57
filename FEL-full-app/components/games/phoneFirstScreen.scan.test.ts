// PHONE-FIRST-SCREEN (2026-10-17) — the first screen of /play/dunk at 393x852 and 1280x800, pinned where it lives.
//
//   1. THE GAME HEADER WRAPS. Its one row needs ~600 px (measured natural widths: Home 75, FLIGHT NIGHT 108, BODY 76,
//      the PRQ badge 166, the graphics select 118, full screen 32); a 393 px phone squeezed the items into 3-4 line
//      stacks and the row still ran to 497 px, cutting off the graphics select and the full-screen button. It wraps
//      into two rows on a phone — Home · title · BODY, then PRQ · graphics · full screen — which is why BODY sits
//      before the badge, and the badge never breaks its own line.
//   2. THE READY CARD'S TOP-LEFT CORNER. GameShell's capture menu (⋯) owns the stage's corner and covered the MOTION
//      chip; MOTION covered VENICE BEACH COURT at 1280x800; upright, the USB pill covered it (on /try too). The chip is
//      moved beside the ⋯ by a data hook, and the column starts below the corner row (app/game-surface.css 4d).
//
// The geometry itself was measured on a live server (393x852, 844x390, 1280x720, 1280x800, 1920x1080) — the report is
// ~/Claude/outbox/PHONE-FIRST-SCREEN-LAYOUT-REPORT-2026-10-17.md. These pins hold the values that geometry came from.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const shell = read('components/games/game-shell.tsx');
const splash = read('components/games/boot-splash.tsx');
const css = read('app/game-surface.css');
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(a);
  return src.slice(a, b);
};
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the game header on a phone', () => {
  const header = between(shell, '<header data-game-chrome', '</header>');

  it('wraps its row instead of overflowing it', () => {
    expect(header).toContain('className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"');
    // the title can shrink inside its own row; Home never shrinks
    expect(header).toContain('<div className="min-w-0">');
    expect(header).toMatch(/className="flex shrink-0 items-center gap-1\.5 rounded-md border/);
  });

  it('orders the controls for the two-row split: BODY (pushed right) before the PRQ badge, then graphics, then full screen', () => {
    const at = (s: string): number => { const i = header.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    expect(at('Home')).toBeLessThan(at('{title}'));
    expect(at('{title}')).toBeLessThan(at('<BodyControl />'));
    expect(at('<BodyControl />')).toBeLessThan(at('{profile.display.badge}'));
    expect(at('{profile.display.badge}')).toBeLessThan(at('<GraphicsToggle />'));
    expect(at('<GraphicsToggle />')).toBeLessThan(at('onClick={onFullscreen}'));
    expect(header).toMatch(/<div className="ml-auto flex items-center gap-3">\s*<BodyControl \/>\s*<\/div>/);
  });

  it('keeps the PRQ badge on one line, and only BODY pushes the controls right', () => {
    expect(header).toContain('className="whitespace-nowrap rounded-md border px-2.5 py-1 font-mono text-xs"');
    expect(header.match(/ml-auto/g)).toHaveLength(1);
  });
});

describe("the READY card's corner", () => {
  it('wraps the MOTION chip in a data hook, still in the corner by default (no ⋯ on /try)', () => {
    expect(splash).toContain('<div data-splash-corner className="absolute left-3 top-3 z-10 flex"><MotionSetting compact /></div>');
    // the column itself is unchanged: where it must start lower is decided in game-surface.css
    expect(splash).toContain('data-splash-column className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4 ');
  });

  it('puts the chip beside the shell\'s ⋯: 76 px in on the screen, at any HUD zoom', () => {
    const r = rule('div:has(> [data-capture-ui]) > div:has(> canvas) > [data-fel-fullbleed] > [data-splash-corner]');
    expect(r).toContain('left: calc(4.75rem / var(--fel-hud-zoom, 1));');
    // the hook it keys on: the capture HUD's wrapper is the stage's own child
    expect(read('components/capture/game-capture-hud.tsx')).toContain('data-capture-ui="1"');
  });

  it('sideways, keeps the chip in the band above the columns: zoom capped like the shell corner (1.25x), top-aligned with the ⋯', () => {
    const r = rule('[data-fel-console]:has(> [data-capture-ui]) > div:has(> canvas) > [data-fel-fullbleed] > [data-splash-corner]');
    expect(r).toContain('--fel-splash-corner-zoom: min(var(--fel-hud-zoom, 1), 1.25);');
    expect(r).toContain('zoom: calc(var(--fel-splash-corner-zoom) / var(--fel-hud-zoom, 1));');
    expect(r).toContain('left: calc(4.75rem / var(--fel-splash-corner-zoom));');
    expect(r).toContain('top: calc(0.5rem / var(--fel-splash-corner-zoom));');
    // the cap is the shell corner controls' own (rule 3)
    expect(css).toContain('--fel-corner-zoom: min(var(--fel-hud-zoom, 1), 1.25);');
    // and the console columns keep their padding: no rule moves them for the corner
    expect(css).not.toMatch(/\[data-fel-console\][^{]*\[data-splash-column\] \{[^}]*padding-top/);
  });

  it('upright, starts the column below the corner row, and below the controller pills where a host has them', () => {
    expect(rule('div:has(> [data-capture-ui]) > div:has(> canvas) > [data-fel-fullbleed] > [data-splash-column]'))
      .toContain('padding-top: 3.5rem;');
    const media = between(css, '@media (max-aspect-ratio: 6/5) {', '\n}\n');
    expect(media).toContain('div:has(> canvas):has(> div > [data-testid="host-lobby-badge"], > div > [data-testid="usb-connect-hint"]) > [data-fel-fullbleed] > [data-splash-column] {');
    expect(media).toContain('padding-top: 5.25rem;');
    expect(media).toContain('justify-content: flex-start;');
    expect(media).toContain('row-gap: 0.875rem;');
    // the pills rule comes after the shell rule (same specificity: the later one wins for the dunk)
    expect(css.indexOf('@media (max-aspect-ratio: 6/5) {')).toBeGreaterThan(css.indexOf('> [data-splash-column] {\n  padding-top: 3.5rem;'));
    // the pills it clears: the dunk's anchor and the two testids
    expect(read('components/games/dunk-babylon.tsx')).toMatch(/<HostLobby [^>]*anchor="left-4 top-14"/);
    const lobby = read('components/controller-link/host-lobby.tsx');
    expect(lobby).toContain('data-testid="usb-connect-hint"');
    expect(lobby).toContain('data-testid="host-lobby-badge"');
  });
});
