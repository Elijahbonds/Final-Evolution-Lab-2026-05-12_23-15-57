// CONTROLLER-TRY-FIX item 4 (C5, 2026-10-28): the pad-aware label map, the full dunk controls panel, the pause's device line and the
// READY card's pad line. New tests only (CT-9 … CT-12, CT-22); no existing test edited — `generic` / no family is today's words exactly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CANONICAL_BUTTONS, PAD_LABELS, familyFor, padLabel, pauseDeviceLine, relabelInput, withButtons, type LabelFamily } from './padLabels';
import { controlRows, controlsSheet, moveLines } from '@/lib/ui/controlsScreen';
import { PANEL_MAX_CHARS, PANEL_MAX_LINES } from '@/lib/babylon/ui/panelLines';
import { PAUSED_HEADLINE, PausedLayer, pauseHowLine } from '@/components/games/paused-layer';
import { PAD_START_LINE, PadStartLine } from '@/components/games/boot-splash';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
const DUNK_HINT = 'HOLD to run · tap JUMP at the line · press to flush';

describe('CT-9 — the label map', () => {
  it('familyFor: the two Xbox and two PlayStation profiles; everything else generic', () => {
    expect(familyFor('xbox-series')).toBe('xbox');
    expect(familyFor('xbox-one')).toBe('xbox');
    expect(familyFor('dualsense')).toBe('playstation');
    expect(familyFor('dualshock4')).toBe('playstation');
    for (const id of ['generic-standard', 'generic-fallback', 'switch-pro', 'switch2-pro', 'joycon-pair', 'joycon-single', '', undefined, null]) expect(familyFor(id as string), String(id)).toBe('generic');
  });
  it('every family defines every canonical button; generic is today\'s words; Xbox says RT / LT / RB / LB / MENU / VIEW', () => {
    for (const f of Object.keys(PAD_LABELS) as LabelFamily[]) for (const b of CANONICAL_BUTTONS) expect(typeof PAD_LABELS[f][b], `${f} ${b}`).toBe('string');
    for (const b of CANONICAL_BUTTONS) expect(padLabel(b)).toBe(b);
    expect([padLabel('R2', 'xbox'), padLabel('L2', 'xbox'), padLabel('R1', 'xbox'), padLabel('L1', 'xbox'), padLabel('START', 'xbox'), padLabel('SELECT', 'xbox')]).toEqual(['RT', 'LT', 'RB', 'LB', 'MENU', 'VIEW']);
    expect([padLabel('A', 'playstation'), padLabel('B', 'playstation'), padLabel('X', 'playstation'), padLabel('Y', 'playstation'), padLabel('START', 'playstation')]).toEqual(['CROSS', 'CIRCLE', 'SQUARE', 'TRIANGLE', 'OPTIONS']);
    expect(padLabel('L2', 'keyboard')).toBe('');   // PM: no key is bound for LT / L2
  });
  it('no family (or generic) leaves every mode\'s pad rows and move lines exactly as they were', () => {
    for (const m of ['dunk', 'surf', 'snowboard', 'velocitykart', 'adventure', 'karate-vs', 'onevone']) {
      expect(controlRows(m, 'pad', 'generic'), m).toEqual(controlRows(m, 'pad'));
      expect(moveLines(m, 'pad', 'generic'), m).toEqual(moveLines(m, 'pad'));
      expect(controlsSheet(m, 'pad', {}), m).toEqual(controlsSheet(m, 'pad'));
      expect(controlsSheet(m, 'keys', { family: 'xbox' }), m).toEqual(controlsSheet(m, 'keys'));   // a family names pad buttons only
    }
  });
  it('an Xbox pad\'s dunk rows: HOLD RT to RUN (not R2), A to SLAM, MENU to PAUSE; PlayStation: CROSS, OPTIONS', () => {
    const row = (rs: { input: string; action: string }[], a: string) => rs.find((r) => r.action === a)?.input;
    const xb = controlRows('dunk', 'pad', 'xbox');
    expect([row(xb, 'RUN'), row(xb, 'SLAM'), row(xb, 'PAUSE'), row(xb, 'LOOK'), row(xb, 'MOVE')]).toEqual(['HOLD RT', 'A', 'MENU', 'R-STICK', 'L-STICK']);
    const ps = controlRows('dunk', 'pad', 'playstation');
    expect([row(ps, 'RUN'), row(ps, 'SLAM'), row(ps, 'STYLE'), row(ps, 'PAUSE')]).toEqual(['HOLD R2', 'CROSS', 'CIRCLE', 'OPTIONS']);
    expect(relabelInput('HOLD RB', 'playstation')).toBe('HOLD R1');
    expect(relabelInput('HOLD RB', 'xbox')).toBe('HOLD RB');
    expect(relabelInput('R-STICK', 'xbox')).toBe('R-STICK');
  });
});

describe('CT-10 — withButtons names the buttons in a line; no family is the line unchanged', () => {
  it('the dunk\'s static hint', () => {
    expect(withButtons(DUNK_HINT)).toBe(DUNK_HINT);
    expect(withButtons(DUNK_HINT, null)).toBe(DUNK_HINT);
    expect(withButtons(DUNK_HINT, 'xbox')).toBe('HOLD RT to run · tap A to JUMP at the line · press A to flush');
    expect(withButtons(DUNK_HINT, 'playstation')).toBe('HOLD R2 to run · tap CROSS to JUMP at the line · press CROSS to flush');
    expect(withButtons(DUNK_HINT, 'generic')).toBe('HOLD R2 to run · tap A to JUMP at the line · press A to flush');
    expect(withButtons('HOLD to run — then tap jump', 'xbox')).toBe('HOLD RT to run — then tap A to jump');
  });
  it('button tokens, and never a word that is a letter', () => {
    expect(withButtons('A MAKE', 'playstation')).toBe('A MAKE');
    expect(withButtons('A · RUN IT BACK — 2 ATTEMPTS LEFT', 'playstation')).toBe('CROSS · RUN IT BACK — 2 ATTEMPTS LEFT');
    expect(withButtons('PRACTICE · R1 TO LEAVE', 'xbox')).toBe('PRACTICE · RB TO LEAVE');
    expect(withButtons('X — NEXT PROP FAMILY', 'playstation')).toBe('SQUARE — NEXT PROP FAMILY');
    expect(withButtons('D-PAD UP + Y', 'playstation')).toBe('D-PAD UP + TRIANGLE');
    expect(withButtons('HIGHLIGHTS — A / B GOES TO THE CUT', 'xbox')).toBe('HIGHLIGHTS — A / B GOES TO THE CUT');
    expect(withButtons('HIGHLIGHTS — A / B GOES TO THE CUT', 'playstation')).toBe('HIGHLIGHTS — CROSS / CIRCLE GOES TO THE CUT');
    expect(withButtons('CALL IT (L1 alone)', 'xbox')).toBe('CALL IT (LB alone)');
    expect(withButtons('HOLD SLAM — HANG ON THE RIM', 'playstation')).toBe('HOLD SLAM — HANG ON THE RIM');
  });
  it('the dunk host decorates the live hint at render; the mode\'s literals are unchanged', () => {
    const host = read('components/games/dunk-babylon.tsx');
    expect(host).toContain("const hint = typeof hud.hint === 'string' && hud.hint && phase === 'playing' ? withButtons(hud.hint, padFamily) : '';");
    expect(host).toContain('bus.onPads((pads) => setPadFamily(pads.length ? familyFor(pads[0].profileId) : null))');
    expect(read('lib/babylon/modes/DunkMode.ts')).toContain("const RUN_LIVE_HINT = 'HOLD to run — then tap jump';");
  });
});

describe('CT-11 — the full dunk panel: Y, L1, R1, L2, the d-pad tricks and SELECT, each line inside the panel\'s budget', () => {
  it('pad (xbox): every button the dunk reads is on it', () => {
    const rows = controlRows('dunk', 'pad', 'xbox');
    const inputs = rows.map((r) => r.input);
    for (const want of ['Y', 'LB', 'RB', 'HOLD LT', 'D-PAD + A/B/X/Y', 'VIEW']) expect(inputs, want).toContain(want);
    const g = controlRows('dunk', 'pad');
    for (const want of ['Y', 'L1', 'R1', 'HOLD L2', 'D-PAD + A/B/X/Y', 'SELECT']) expect(g.map((r) => r.input), want).toContain(want);
    for (const f of ['xbox', 'playstation', 'generic'] as const) {
      const s = controlsSheet('dunk', 'pad', { family: f });
      for (const r of s.rows) expect(`${r.input} ${r.action}`.length, `${f} ${r.input}`).toBeLessThanOrEqual(PANEL_MAX_CHARS);
      for (const l of s.lines) expect(l.length, l).toBeLessThanOrEqual(PANEL_MAX_CHARS);
      expect(s.lines.length).toBeLessThanOrEqual(PANEL_MAX_LINES);
    }
  });
  it('keys: no L2 row (no key bound, PM), and the others on their keys; touch: none of them', () => {
    const keys = controlRows('dunk', 'keys');
    const at = (a: string) => keys.find((r) => r.action === a)?.input;
    expect(at('GATHER (TWO-FOOT)')).toBeUndefined();
    expect([at('SELF-LOB · AIR TRICK'), at('CALL YOUR DUNK'), at('PRACTICE'), at('CAMERA')]).toEqual(['I', 'Q', 'E', 'C']);
    const touch = controlRows('dunk', 'touch').map((r) => r.action);
    for (const a of ['SELF-LOB · AIR TRICK', 'CALL YOUR DUNK', 'PRACTICE', 'GATHER (TWO-FOOT)', 'AIR TRICK', 'CAMERA']) expect(touch).not.toContain(a);
  });
});

describe('CT-12 — the pause: the pinned headline unchanged; a device line under it from paused-layer.tsx only', () => {
  it('the line: Press START / MENU / OPTIONS on a pad, Press ESC on the keys, none on touch', () => {
    expect(PAUSED_HEADLINE).toBe('PAUSED — TAP TO RESUME');
    expect(pauseHowLine({ padFamily: 'generic', touch: false })).toBe('Press START');
    expect(pauseHowLine({ padFamily: 'xbox', touch: true })).toBe('Press MENU');
    expect(pauseHowLine({ padFamily: 'playstation', touch: false })).toBe('Press OPTIONS');
    expect(pauseHowLine({ padFamily: null, touch: false })).toBe('Press ESC');
    expect(pauseHowLine({ padFamily: null, touch: true })).toBeNull();
    expect(pauseDeviceLine('touch')).toBeNull();
  });
  it('server markup is the old screen (the line is read after mount); the line sits right under the headline in the source', () => {
    const html = renderToStaticMarkup(createElement(PausedLayer, { onResume: () => {} }));
    expect(html).not.toContain('data-pause-device-line');
    const src = read('components/games/paused-layer.tsx');
    expect(src.indexOf('{how && <span data-pause-device-line')).toBeGreaterThan(src.indexOf('{PAUSED_HEADLINE}</span>'));
    expect(src).not.toMatch(/data-pause-device-line[^\n]*\bz-/);
  });
});

describe('CT-22 — READY: "or press any button" under TAP TO START, only with a pad in', () => {
  it('the copy matches the night card\'s, and the server markup draws nothing (no pad there)', () => {
    expect(PAD_START_LINE).toBe('or press any button');
    expect(read('components/games/dunk-babylon.tsx')).toContain('>or press any button<');
    expect(renderToStaticMarkup(createElement(PadStartLine))).toBe('');
    const splash = read('components/games/boot-splash.tsx');
    expect(splash.indexOf("{props.phase === 'ready' && <PadStartLine />}")).toBeGreaterThan(splash.indexOf('TAP TO START\n'));
  });
});
