// The wave-3 HUD leftovers (lane/w3-present): the lower third, the dunk host's bottom column, the three-point standings on a phone, the
// duel's name card, the penalty's "PENALTY n OF 5", and the three components moved onto the TV HUD rules. Static markup and source scans
// (no DOM here); the geometry itself was measured on the rig (1080p, 1280x720, 390x844, 844x390) and is in the commit message.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HudLowerThird, LOWER_THIRD_MS, lowerThirdFires } from './tv-hud';
import { MicCaption } from './mic-caption';
import { RaceCourseMap, ThreatWarning } from './race-course-map';

const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8');
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, '&').replace(/&gt;/g, '>');

describe('the lower third', () => {
  it('fires on a new non-empty key and never on the one already shown, an empty key or junk', () => {
    expect(lowerThirdFires(null, 'P2|4/6')).toBe(true);
    expect(lowerThirdFires('P2|4/6', 'P2|4/6')).toBe(false);
    expect(lowerThirdFires('P2|4/6', 'P1|5/6')).toBe(true);
    for (const k of ['', undefined, null, 7, {}]) expect(lowerThirdFires(null, k)).toBe(false);
  });
  it('holds a couple of seconds, not longer', () => { expect(LOWER_THIRD_MS).toBeGreaterThanOrEqual(1800); expect(LOWER_THIRD_MS).toBeLessThanOrEqual(3200); });
  it('is a slot until its effect fires it (no card in the markup the server renders), left-aligned and no wider than 58 % on a phone', () => {
    const m = html(h(HudLowerThird, { cardKey: 'k', title: 'PLAYER 2' }));
    expect(m).toContain('data-hud-lower-third-slot'); expect(m).not.toContain('data-hud-lower-third=');
    const src = read('tv-hud/lower-third.tsx');
    expect(src).toContain('max-w-[58%]'); expect(src).toContain('justify-start');
    expect(src).toMatch(/if \(!enabled \|\| !lowerThirdFires\(seen\.current, cardKey\)\) return;/);   // a disabled host does not consume the key
  });
  it('is on the TV HUD system and imports nothing that scores', () => {
    const src = read('tv-hud/lower-third.tsx');
    expect(src).not.toMatch(/text-\[(9|10|11)px\]/); expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const i of [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])) expect(i).toMatch(/^(react|framer-motion|\.\/tokens|\.\/use-hud-motion)$/);
  });
});

describe('the MC lower third in the dunk host\'s bottom column', () => {
  const dunk = read('dunk-babylon.tsx');
  it('the hint, the take-off chip, the beat strip, the MC caption and the call are ONE flex column, so none can cross another at any zoom', () => {
    expect(dunk).toMatch(/data-dunk-bottom className="[^"]*flex-col-reverse/);
    const col = dunk.slice(dunk.indexOf('data-dunk-bottom'), dunk.indexOf('NIGHT CARD (TRY-ONBOARD G1)'));
    for (const k of ['{hint && (', '{takeoff && (', '{strip && <DunkBeatStrip', '<MicCaption flow', '{call && (']) expect(col, k).toContain(k);
    expect(col.indexOf('{hint && (')).toBeLessThan(col.indexOf('{takeoff && ('));            // flex-col-reverse: the first child is the lowest
    expect(col.indexOf('<MicCaption flow')).toBeLessThan(col.indexOf('{call && ('));
  });
  it('the old absolutely placed layers are gone (the caption outside the frame, the 2.6 rem offsets, the 58 % call)', () => {
    expect(dunk).not.toMatch(/<MicCaption text=/);
    expect(dunk).not.toContain('+ 2.6rem');
    expect(dunk).not.toContain('top-[58%]');
  });
  it('the call yields to the SLAM! cue (the QTE window is the one thing on screen then) and the cue sits a little higher', () => {
    expect(dunk).toMatch(/hud\.slamPulse !== true && typeof hud\.call === 'string'/);
    expect(dunk).toContain('absolute inset-x-0 top-[43%] text-center');
  });
  it('MicCaption has a flow mode (a column child, not a layer of its own) and keeps its console-view hook', () => {
    const flow = html(h(MicCaption, { text: 'Oh he is up there!', who: 'MC', flow: true }));
    expect(flow).toContain('relative flex w-full'); expect(flow).not.toContain('absolute'); expect(flow).toContain('data-mic-line');
    const layer = html(h(MicCaption, { text: 'x', who: 'MC' }));
    expect(layer).toContain('absolute inset-x-0 bottom-[14%]');   // every other hoops host is unchanged
  });
});

describe('the three-point standings', () => {
  const tp = read('three-point-babylon.tsx');
  it('on a phone they join the score stack in the flow; from 640 px up they are the corner plate, from 1024 px below the racks', () => {
    expect(tp).toContain('data-hud="standings-stack"'); expect(tp).toMatch(/standings-stack"[\s\S]{0,120}<Standings/);
    expect(tp).toMatch(/className="px-3 py-1\.5 sm:hidden" data-hud="standings-stack"/);
    expect(tp).toMatch(/className="absolute right-4 top-4 z-20 hidden px-3 py-2 sm:block lg:top-\[33%\]" data-hud="standings-corner"/);
  });
  it('both draw the same rows from one component (the key, the form, the score, the line)', () => {
    expect((tp.match(/<Standings rows=/g) ?? []).length).toBe(2);
    expect(tp).toMatch(/function Standings\([\s\S]{0,800}r\.form === 'HOT'[\s\S]{0,400}r\.line === 'CHAMPION'/);
  });
});

describe('the duel\'s player-turn name card and the shootout\'s PENALTY n OF 5', () => {
  it('the duel keys the card on the active player and the dunk number, tones it by side, and is gated on playing', () => {
    const s = read('dunkduel-babylon.tsx');
    expect(s).toContain('<HudLowerThird'); expect(s).toContain('cardKey={who ? `${who}|${count}` : \'\'}');
    expect(s).toContain("tone={who === 'P2' ? 'them' : 'you'}"); expect(s).toContain('enabled={showHud}');
  });
  it('the shootout: only the penalty host, keyed on the round label, "PENALTY n OF m" or the label itself (SUDDEN DEATH), with the tally', () => {
    const s = read('timing-babylon.tsx');
    expect(s).toContain("modeKey === 'penalty' && (() => {"); expect(s).toContain("/^KICK (\\d+)\\/(\\d+)$/");
    expect(s).toContain('title={m ? `PENALTY ${m[1]} OF ${m[2]}` : label}');
    expect(s).toContain("enabled={phase === 'playing'}");
    expect(s).toContain('YOU ${hnode(hud.goals, 0)} – ${hnode(hud.themGoals, 0)} THEM');
  });
});

describe('race-course-map, dunk-poster and three-point-options on the TV HUD rules', () => {
  for (const f of ['race-course-map.tsx', 'dunk-poster.tsx', 'three-point-options.tsx']) {
    it(`${f}: the system's tokens, no sub-floor text, no raw hex, no mono face`, () => {
      const s = read(f);
      expect(s).toMatch(/from '\.\/tv-hud'/); expect(s).not.toMatch(/text-\[(9|10|11)px\]/); expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); expect(s).not.toMatch(/\bfont-mono\b/);
    });
  }
  it('the course map still draws only once the outline arrives and keeps its API; the warning is on the palette', () => {
    expect(html(h(RaceCourseMap, { hud: {} }))).toBe('');
    const m = html(h(RaceCourseMap, { hud: { mapPath: 'M10,10 L90,90', mapMe: '50,50,90', mapField: '20,20;30,30' } }));
    expect(m).toContain('data-hud="course-map"'); expect(m).toContain('<path'); expect((m.match(/<circle/g) ?? []).length).toBe(2);
    expect(html(h(ThreatWarning, { words: undefined, side: 'LEFT', now: false, action: 'X' }))).toBe('');
    const w = html(h(ThreatWarning, { words: 'SHELL', side: 'LEFT', now: true, action: 'X' }));
    expect(w).toContain('SHELL — X'); expect(w).toContain('rgb(0, 255, 157)');   // the good tone, once it is time to act
  });
});
