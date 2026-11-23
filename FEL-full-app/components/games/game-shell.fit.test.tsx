// improve-screens phase 1 (docs/IMPROVE-10-PHASE-AUDIT.md §2.3, lib/ui/stageFit.ts): on a phone held upright the game's
// stage takes the screen its header really leaves. vitest runs in node (no layout engine), so this pins the parts that
// decide it: the arithmetic, the rules and their fallback, the knob's two ends (0 = today's calc(100dvh-3.25rem) box
// exactly: no attribute, so no rule matches), and that both shells wire it to the header and the stage they really
// render. The pixels themselves are measured in a browser: scripts/probes/improve-screens/fit.mts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { chromeHeight, stageFitsHeader, STAGE_FIT_ATTR, STAGE_FIT_CSS, STAGE_FIT_VAR, STAGE_FITS_HEADER } from '@/lib/ui/stageFit';
import { StageFitStyle, useStageFit } from './stage-fit';

const g = globalThis as { window?: unknown };
function knob(v: number | null) {
  const m = new Map<string, string>();
  if (v !== null) m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'ui.stageFitsHeader': v }));
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, s: string) => { m.set(k, s); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
}
beforeEach(() => { resetFeelForTests(); });
afterEach(() => { resetFeelForTests(); delete g.window; });

function Stage({ layoutUp }: { layoutUp: boolean }) {
  const headerRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fit = useStageFit(headerRef, stageRef, layoutUp);
  return <div ref={stageRef} {...fit}><StageFitStyle /></div>;
}

describe('chromeHeight: what the stage leaves for the header and its own padding', () => {
  it('the 1v1 header measured on a 390 x 844 phone (three rows, 169 px) plus 12 + 12 padding', () => {
    expect(chromeHeight(169, 12, 12)).toBe(193);
  });
  it('rounds UP, so a fractional header never leaves the last row of the game a hair off the screen', () => {
    expect(chromeHeight(60.4, 12, 12)).toBe(85);
  });
  it('no header (0), NaN or a negative reading count as 0', () => {
    expect(chromeHeight(0, 12, 12)).toBe(24);
    expect(chromeHeight(Number.NaN, 12, Number.NaN)).toBe(12);
    expect(chromeHeight(-5, 0, 0)).toBe(0);
  });
});

describe('the rules', () => {
  it('match only under the attribute, and fall back to 3.25rem until the header is measured (the first paint is today\'s box)', () => {
    const rules = STAGE_FIT_CSS.split('\n');
    expect(rules).toHaveLength(2);
    for (const r of rules) expect(r).toContain(`[${STAGE_FIT_ATTR}] `);
    expect(rules[0]).toBe(`[${STAGE_FIT_ATTR}] [class*="100dvh-3.25rem"]{height:calc(100dvh - var(${STAGE_FIT_VAR}, 3.25rem))}`);
  });
  it('the hoops host rule carries no !important, so game-surface.css\'s sideways and full-screen !important rules still win there', () => {
    expect(STAGE_FIT_CSS.split('\n')[0]).not.toContain('!important');
    const surface = readFileSync('app/game-surface.css', 'utf8');
    expect(surface).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\) \{\s*\[class\*="100dvh-3\.25rem"\] \{\s*height: 100% !important;/);
    expect(surface).toMatch(/:fullscreen \[class\*="100dvh-3\.25rem"\]/);
  });
  it('a 16:10 host upright is capped at the screen less the chrome, never taller than game-surface.css\'s 84svh', () => {
    const r = STAGE_FIT_CSS.split('\n')[1];
    expect(r).toMatch(/^@media \(max-width: 640px\) and \(orientation: portrait\)/);
    expect(r).toContain('min-height:min(84svh, calc(100svh - var(--fel-chrome-h, 0px)))!important');
    expect(readFileSync('app/game-surface.css', 'utf8')).toContain('min-height: 84svh !important;');
  });
});

describe('the knob ui.stageFitsHeader', () => {
  it('ships at 1, and the catalogue row says so', () => {
    expect(STAGE_FITS_HEADER).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('ui.stageFitsHeader')!;
    expect(k.def).toBe(STAGE_FITS_HEADER);
    expect([k.min, k.max, k.step]).toEqual([0, 1, 1]);
    expect(stageFitsHeader()).toBe(true);
  });
  it('1: the stage carries the attribute while the page layout is up', () => {
    knob(1);
    expect(renderToStaticMarkup(<Stage layoutUp />)).toContain(`${STAGE_FIT_ATTR}=""`);
  });
  it('0: no attribute, so no rule matches and the host keeps calc(100dvh - 3.25rem) exactly', () => {
    knob(0);
    expect(stageFitsHeader()).toBe(false);
    const html = renderToStaticMarkup(<Stage layoutUp />);
    expect(html).not.toContain(STAGE_FIT_ATTR + '=');
    expect(html).not.toContain(STAGE_FIT_VAR + ':');
  });
  it('sideways / full screen / stream (the layout is not up): no attribute, knob on or off', () => {
    knob(1);
    expect(renderToStaticMarkup(<Stage layoutUp={false} />)).not.toContain(STAGE_FIT_ATTR + '=');
  });
});

describe('the shells wire it to the header and the stage they render', () => {
  const shell = readFileSync('components/games/game-shell.tsx', 'utf8');
  const guest = readFileSync('components/games/guest-dunk-shell.tsx', 'utf8');
  it('GameShell: the header is measured, the stage carries the attribute, and only while neither full-bleed nor streaming', () => {
    expect(shell).toContain('const stageFit = useStageFit(headerRef, stageRef, !fullBleed && !streamOn);');
    expect(shell).toMatch(/<header data-game-chrome ref=\{headerRef\}/);
    expect(shell).toMatch(/ref=\{stageRef\}[\s\S]{0,200}\{\.\.\.stageFit\}/);
    expect(shell).toContain('<StageFitStyle />');
  });
  it('GameShell: a harness game holds the Pause button\'s place from the first frame while fitted, so the header never grows mid-game', () => {
    expect(shell).toContain('const stageFitOn = stageFit[STAGE_FIT_ATTR] !== undefined;');
    expect(shell).toContain('{stageFitOn && isBabylon(mode) ? <span data-fel-pause-slot className="grid h-11 w-11 shrink-0 place-items-center"><PauseButton /></span> : <PauseButton />}');
  });
  it('the /try guest dunk: its header and its stage', () => {
    expect(guest).toContain('const stageFit = useStageFit(headerRef, stageRef, true);');
    expect(guest).toMatch(/<header ref=\{headerRef\} className="sticky top-0/);
    expect(guest).toMatch(/<div ref=\{stageRef\} \{\.\.\.stageFit\} className="relative mx-auto w-full max-w-\[1200px\] flex-1 px-2 py-3/);
    expect(guest).toContain('<StageFitStyle />');
  });
});
