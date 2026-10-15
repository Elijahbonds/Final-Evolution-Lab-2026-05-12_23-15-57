// The fight presentation pieces, rendered (lane/w3-present, wave 3): the intro's name plates, the slam text's timing, the replay tag, and
// that the combat hosts draw them. Static markup (no DOM here): what each draws from the HUD keys it is handed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FightIntroPlates, FightSlam, ReplayBug, SLAM_MS, slamMs } from './fight-presentation';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, '&').replace(/&gt;/g, '>');
const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8');
const plates = (beat: unknown) => html(h(FightIntroPlates, { beat, foeName: 'RIVAL SENSEI', foeSub: 'PRO', meName: 'YOU', meSub: 'STRAIGHT' }));

describe('the intro name plates', () => {
  it('the rival\'s plate while the camera is on him, the player\'s on the player, both in the wide', () => {
    const foe = plates('foe'), me = plates('me'), wide = plates('wide');
    expect(foe).toContain('data-fight-plate="foe"'); expect(foe).not.toContain('data-fight-plate="me"');
    expect(me).toContain('data-fight-plate="me"'); expect(me).not.toContain('data-fight-plate="foe"');
    expect(wide).toContain('data-fight-plate="foe"'); expect(wide).toContain('data-fight-plate="me"');
    expect(foe).toContain('RIVAL SENSEI'); expect(foe).toContain('PRO'); expect(me).toContain('YOU'); expect(me).toContain('STRAIGHT');
  });
  it('outside the intro nothing is drawn (the hud key is empty / absent / junk)', () => {
    for (const beat of ['', undefined, null, 7, 'nonsense']) { const m = plates(beat); expect(m).not.toContain('data-fight-plate'); }
  });
  it('the rival is the danger tone and the player the cyan: the palette, not hex', () => {
    const wide = plates('wide');
    expect(wide).toContain('rgb(255, 51, 102)'); expect(wide).toContain('rgb(0, 229, 255)');
    expect(wide).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('a name the mode did not send falls back (YOU / RIVAL), never a blank plate', () => {
    const m = html(h(FightIntroPlates, { beat: 'wide', foeName: undefined, foeSub: undefined, meName: undefined, meSub: undefined }));
    expect(m).toContain('RIVAL'); expect(m).toContain('YOU');
  });
  it('draws at the 10-foot scale (the banner step), in the display face of the frame', () => {
    expect(plates('foe')).toContain('font-size:calc(24px + (var(--fel-hud-zoom, 1) - 1) * 4px)');
  });
});

describe('the slam text', () => {
  it('draws nothing until the mode sends a call (the layer is there, empty)', () => {
    const m = html(h(FightSlam, { text: '', seq: 0 }));
    expect(m).toContain('data-fight-slam'); expect(m).not.toContain('data-fight-slam-call');
  });
  it('FIGHT! is shorter than a ROUND card; the call is gone in about a second', () => {
    expect(SLAM_MS.fight).toBeLessThan(SLAM_MS.default);
    expect(SLAM_MS.default).toBeLessThanOrEqual(1200);
    expect(slamMs('FIGHT!')).toBe(SLAM_MS.fight); expect(slamMs('ROUND 2')).toBe(SLAM_MS.default); expect(slamMs('K.O.')).toBe(SLAM_MS.default);
  });
  it('the timer is not cancelled when the mode clears the key (a call is on screen for its own length): no cleanup on the call/seq effect', () => {
    const s = read('fight-presentation.tsx');
    const effect = s.slice(s.indexOf('useEffect(() => {\n    if (!call'), s.indexOf('useEffect(() => () =>'));
    expect(effect).not.toMatch(/return \(\) =>/);
    expect(effect).toMatch(/if \(timer\.current\) clearTimeout\(timer\.current\)/);   // a new call restarts it
  });
});

describe('the replay tag', () => {
  it('says REPLAY and how to skip it, only while a replay plays', () => {
    expect(html(h(ReplayBug, { on: false }))).toBe('');
    const m = html(h(ReplayBug, { on: true }));
    expect(m).toContain('REPLAY'); expect(m).toContain('ANY BUTTON SKIPS');
  });
});

describe('the combat hosts draw them', () => {
  it('Karate VS: the plates, the slam and the tag; the stat band steps aside for the intro and for a replay', () => {
    const s = read('karate-vs-babylon.tsx');
    for (const k of ['FightIntroPlates', 'FightSlam', 'ReplayBug', 'hud.intro', 'hud.slam', 'hud.slamSeq', 'hud.replay', 'hud.foeName', 'hud.meSub']) expect(s, k).toContain(k);
    expect(s).toMatch(/!intro && !replaying && \(\s*<CombatHudBand/);
  });
  it('Showdown, Duel and Mixed: the REPLAY tag, and the stat band steps aside while a KO plays back', () => {
    for (const f of ['showdown-babylon.tsx', 'duel-babylon.tsx', 'mixedcombat-babylon.tsx']) {
      const s = read(f);
      expect(s, f).toContain('<ReplayBug on={replaying} />');
      expect(s, f).toContain('hud.replay');
    }
    expect(read('showdown-babylon.tsx')).toMatch(/\{!replaying && \(\s*<CombatHudBand/);
    for (const f of ['duel-babylon.tsx', 'mixedcombat-babylon.tsx']) expect(read(f), f).toContain("phase === 'playing' && !replaying");
  });
  it('the file is on the TV HUD system: no sub-floor text, no raw hex, no mono face', () => {
    const s = read('fight-presentation.tsx');
    expect(s).toMatch(/from '\.\/tv-hud'/);
    expect(s).not.toMatch(/text-\[(9|10|11)px\]/); expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); expect(s).not.toMatch(/\bfont-mono\b/);
  });
  it('imports nothing that scores, times or judges (it draws the keys it is handed)', () => {
    const imports = [...read('fight-presentation.tsx').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) expect(i).toMatch(/^(react|framer-motion|\.\/tv-hud)$/);
  });
});
