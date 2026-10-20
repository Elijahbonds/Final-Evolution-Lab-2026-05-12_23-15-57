// The feel panel's sheet (feel-panel lane, owner 2026-10-20): each knob's name, default, current value, a slider inside its safe min/max,
// reset one, reset all, copy values, and a clear "FEEL OVERRIDES ON" while overrides apply. No DOM here: the sheet is pure, so it is
// rendered to markup for what it says and called as a function so its controls can be pressed against the REAL store (lib/feel-panel).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findAll, type Found } from '@/tests/helpers/driveRender';
import { FeelSheet, type FeelSheetProps } from './feel-sheet';
import { FEEL_KNOBS } from '@/lib/feel-panel/knobs';
import {
  feel, feelValuesJson, getFeelState, resetAllFeelOverrides, resetFeelForTests, resetFeelOverride, setFeelOverride, setFeelSession, setFeelUser,
} from '@/lib/feel-panel/feel';
import { feelSessionBlock, playtestHref } from '@/lib/feel-panel/sessionGate';

let copied: string | null = null;
const props = (o: Partial<FeelSheetProps> = {}): FeelSheetProps => ({
  knobs: FEEL_KNOBS, state: getFeelState(), open: true, playtestHref: null, copied: false,
  onOpen: () => {}, onSet: (id, v) => { setFeelOverride(id, v); }, onReset: resetFeelOverride, onResetAll: resetAllFeelOverrides,
  onCopy: () => { copied = feelValuesJson(); }, ...o,
});
const html = (o: Partial<FeelSheetProps> = {}) => renderToStaticMarkup(createElement(FeelSheet, props(o)));
const tree = (o: Partial<FeelSheetProps> = {}) => FeelSheet(props(o));
const byId = (t: unknown, id: string): Found => {
  const hits = findAll(t as never, (el) => el.props?.['data-testid'] === id);
  if (hits.length !== 1) throw new Error(`${hits.length} × ${id}`);
  return hits[0];
};
const PLAYTEST = feelSessionBlock('/play/threevthree', '?playtest=1');

beforeEach(() => { resetFeelForTests(); copied = null; (globalThis as { window?: unknown }).window = { localStorage: undefined }; });
afterEach(() => { resetFeelForTests(); delete (globalThis as { window?: unknown }).window; });

describe('the feel sheet', () => {
  it('closed: only the slim FEEL tab; no "FEEL OVERRIDES ON" while nothing applies', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    const out = html({ open: false });
    expect(out).toContain('data-testid="feel-tab"');
    expect(out).not.toContain('FEEL OVERRIDES ON');
    expect(out).not.toContain('data-testid="feel-sheet"');
  });

  it('open: every knob with its name, id, default, current value and a slider inside its safe min/max', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    const out = html();
    for (const k of FEEL_KNOBS) {
      expect(out).toContain(k.label);
      expect(out).toContain(k.id);
      const slider = byId(tree(), `feel-slider-${k.id}`).props;
      expect([slider.type, slider.min, slider.max, slider.step, slider.value]).toEqual(['range', k.min, k.max, k.step, k.def]);
    }
    expect(out).toContain('default 2.40 m');
    expect(out).toContain('default 0.35 s');
    expect(out).toContain('default 0.90 s');
    expect(out).toContain('default 0.010 m');
    expect(out).toContain('Reset all');
    expect(out).toContain('Copy values');
  });

  it('a slider moved in a playtest run: the knob reads the new value, the row shows it, and "FEEL OVERRIDES ON" shows (open AND closed)', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    byId(tree(), 'feel-slider-hoops.aiHandRangeM').props.onChange({ currentTarget: { value: '3.2' } });
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(3.2);
    const open = html();
    expect(open).toContain('FEEL OVERRIDES ON · 1');
    expect(open).toMatch(/data-testid="feel-cur-hoops\.aiHandRangeM"[^>]*>3\.20 m</);
    expect(html({ open: false })).toContain('FEEL OVERRIDES ON · 1');
  });

  it('reset one, then reset all', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    setFeelOverride('hoops.aiHandRangeM', 3.2); setFeelOverride('hoops.aiHandGapSec', 1.5);
    byId(tree(), 'feel-reset-hoops.aiHandRangeM').props.onClick();
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    expect(feel('hoops.aiHandGapSec', 0.9)).toBe(1.5);
    expect(byId(tree(), 'feel-reset-hoops.aiHandRangeM').props.disabled).toBe(true);   // nothing to reset
    byId(tree(), 'feel-reset-all').props.onClick();
    expect(feel('hoops.aiHandGapSec', 0.9)).toBe(0.9);
    expect(html()).not.toContain('FEEL OVERRIDES ON');
  });

  it('copy values: the overrides as JSON', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    setFeelOverride('hoops.aiHandDwellSec', 0.5);
    byId(tree(), 'feel-copy').props.onClick();
    expect(JSON.parse(copied!)).toEqual({ 'hoops.aiHandDwellSec': 0.5 });
  });

  it('a normal (paying) run: the overrides are SAVED but NOT applied, the sheet says why, and offers a playtest restart', () => {
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', ''));
    setFeelOverride('hoops.aiHandRangeM', 3.2);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    const out = html({ playtestHref: playtestHref('/play/threevthree', '') });
    expect(out).not.toContain('FEEL OVERRIDES ON');
    expect(out).toContain('NOT applied here');
    expect(out).toContain('Overrides apply only in a playtest run');
    expect(out).toContain('href="/play/threevthree?playtest=1"');
  });

  it('an Arena duel: not applied, and the reason is the stake', () => {
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', '?arena=m_1&playtest=1'));
    setFeelOverride('hoops.aiHandRangeM', 3.2);
    const out = html();
    expect(out).toContain('Arena duel: a staked score.');
    expect(out).not.toContain('FEEL OVERRIDES ON');
  });
});

describe('the wiring (source pins: these files cannot render here)', () => {
  it('app/play/layout.tsx mounts the panel once for every /play route, inside a Suspense (it reads the search params)', () => {
    const src = readFileSync('app/play/layout.tsx', 'utf8');
    expect(src).toContain("import { FeelPanel } from '@/components/feel-panel/feel-panel';");
    expect(src).toContain('<Suspense fallback={null}><FeelPanel /></Suspense>');
  });
  it('the panel asks the server first and draws nothing until it says enabled: true', () => {
    const src = readFileSync('components/feel-panel/feel-panel.tsx', 'utf8');
    expect(src).toContain("fetch('/api/feel-panel', { cache: 'no-store' })");
    expect(src).toContain('j?.enabled === true');
    expect(src).toContain('if (!allowed) return null;');
    expect(src).toContain('setFeelSession(feelSessionBlock(pathname, search))');
    expect(src).toMatch(/return \(\) => \{ dead = true; setFeelUser\(false\); \};/);
  });
  it('GameShell never mints a challenge link from a page that used overrides', () => {
    const src = readFileSync('components/games/game-shell.tsx', 'utf8');
    expect(src).toContain('if (!result || feelOverridesUsed()) return;');
  });
  it('3v3 reads the AI hand range through the knob, not the bare constant', () => {
    const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
    expect(src).toContain('< aiHandRangeM() ? opp : null');
    expect(src).not.toMatch(/<\s*AI_HAND_RANGE_M\b/);
  });
});
