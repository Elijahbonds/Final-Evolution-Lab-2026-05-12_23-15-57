// The hoops hosts' shared HUD pieces, rendered (lane/hud-hoops): the 1v1 / 3v3 release bar, the judges' row, the dunk beat strip and
// field board, the MC's line and its switch. What each draws from the numbers it is handed, and that none of them reads a scoring or
// judging module (the pieces sum and show what the mode hands them; the mode owns every rule).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HoopsShotMeter, shotMeterWindow } from './hoops-shot-meter';
import { JudgeCards } from './judge-cards';
import { DunkBeatStrip } from './dunk-beat-strip';
import { DunkFieldBoard } from './dunk-field-board';
import { MicCaption } from './mic-caption';
import { encodeBeatStrip } from '@/lib/babylon/core/DunkBeats';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, '&').replace(/&gt;/g, '>');
const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the 1v1 / 3v3 release bar', () => {
  it('reads the green window as centre,half and clamps nothing else', () => {
    const w = shotMeterWindow('0.7,0.08');
    expect(w?.from).toBeCloseTo(0.62, 10);
    expect(w?.to).toBeCloseTo(0.78, 10);
    for (const bad of [undefined, null, 5, '', '0.7', '0.7,0.1,0.2', 'a,b', 'NaN,0.1']) expect(shotMeterWindow(bad)).toBeNull();
  });

  it('draws the window and the marker where the mode says, and no fill (the bar the owner has felt)', () => {
    const m = html(h(HoopsShotMeter, { t: 0.58, green: '0.7,0.08' }));
    expect(m).toContain('data-hud-meter-marker');
    expect(m).toContain('left:58%');            // the marker sits at the meter's value
    expect(m).toContain('left:62%');            // the green window starts at centre - half
    expect(m).toContain('width:16%');           // ...and is 2 x half wide
    expect(m).not.toContain('data-hud-meter-fill');
  });

  it('with no window published it is the marker alone', () => {
    const m = html(h(HoopsShotMeter, { t: 0.3, green: undefined }));
    expect(m).toContain('left:30%');
    expect(m).not.toContain('left:-');
  });
});

describe("the judges' row", () => {
  const cards = [{ name: 'Kobe', score: 9, line: 'Clean.' }, { name: 'Vince', score: 10, line: 'From the elbow!' }, { name: 'Dom', score: '8', line: 'Solid.' }];

  it('one card per judge, the running total is the sum of the cards, the last card speaks', () => {
    const m = html(h(JudgeCards, { cards }));
    for (const c of cards) expect(m).toContain(c.name);
    expect(m).toContain('>27<');                // 9 + 10 + 8 (a string score still sums)
    expect(m).toContain('Solid.');              // the card that just flipped
    expect(m).not.toContain('From the elbow!'); // not the earlier ones
  });

  it('the total climbs as the cards flip', () => {
    expect(html(h(JudgeCards, { cards: cards.slice(0, 1) }))).toContain('>9<');
    expect(html(h(JudgeCards, { cards: cards.slice(0, 2) }))).toContain('>19<');
  });

  it('no cards, nothing drawn', () => {
    expect(html(h(JudgeCards, { cards: [] }))).toBe('');
  });
});

describe('the dunk beat strip', () => {
  const strip = (perfect: boolean) => encodeBeatStrip({ at: 2, marks: [{ beat: 'rise', grade: 'onbeat', label: 'WINDMILL' }, { beat: 'hang', grade: 'early', label: '360' }], slam: 'ontime', perfect });

  it('four beats lit up to the one the flight is on, the tricks under their beats, onbeat starred', () => {
    const m = html(h(DunkBeatStrip, { value: strip(false) }));
    expect(m).toContain('data-fel-beats="2"');
    for (const w of ['RISE', 'HANG', 'PRE', 'SLAM', 'WINDMILL', '360', 'ON TIME']) expect(m).toContain(w);
    expect(m).toContain('★ ');
    expect(m).not.toContain('PERFECT FLIGHT');
  });

  it('a perfect flight is called, and lit', () => {
    const m = html(h(DunkBeatStrip, { value: strip(true) }));
    expect(m).toContain('PERFECT FLIGHT');
    expect(m).toContain('box-shadow:0 0 0 2px');
  });

  it('anything malformed or empty reads as no strip', () => {
    for (const v of ['', null, undefined, 'junk', '9||x|0']) expect(html(h(DunkBeatStrip, { value: v }))).toBe('');
  });
});

describe('the dunk field board', () => {
  const round1 = 'round1;YOU|47|player|in;RAY|44|live|in;KAI|39|highlight|in;MO|31|highlight|in';

  it('the cut line sits under the second row in the first round, the stage is named', () => {
    const m = html(h(DunkFieldBoard, { value: round1 }));
    expect(m).toContain('data-fel-field="round1"');
    expect(m).toContain('FIRST ROUND · TOP 2 GO THROUGH');
    expect(m.match(/aria-label="the cut line"/g)?.length).toBe(1);
    expect(m.indexOf('RAY')).toBeLessThan(m.indexOf('the cut line'));
    expect(m.indexOf('the cut line')).toBeLessThan(m.indexOf('KAI'));
  });

  it('after the cut: the finalists are ticked, the cut dunkers struck, the champion starred, and no cut line', () => {
    const m = html(h(DunkFieldBoard, { value: 'done;YOU|212|player|champ;RAY|198|live|through;KAI|160|highlight|out' }));
    expect(m).toContain('★');
    expect(m).toContain('✓');
    expect(m).toContain('line-through');
    expect(m).not.toContain('the cut line');
  });

  it('empty or malformed: nothing', () => {
    expect(html(h(DunkFieldBoard, { value: '' }))).toBe('');
    expect(html(h(DunkFieldBoard, { value: null }))).toBe('');
  });
});

describe("the MC's line", () => {
  it('a line draws in the console-view hook (data-mic-line), the speaker beside it; no line, nothing', () => {
    const m = html(h(MicCaption, { text: 'Oh he is up there!', who: 'MC' }));
    expect(m).toContain('data-mic-line');
    expect(m).toContain('Oh he is up there!');
    expect(m).toContain('>MC<');
    expect(html(h(MicCaption, { text: '', who: 'MC' }))).toBe('');
    expect(html(h(MicCaption, { text: 42, who: 'MC' }))).toBe('');
  });
});

describe('the pieces read no scoring or judging module', () => {
  // Each piece shows what the mode hands it. Its imports may be React, the HUD system, an icon, the audio toggle's own kits and
  // the two pure decoders of the dunk strings (DunkBeats / DunkField): no rules, no judging, no pay, no session.
  const ALLOWED = [/^react$/, /^react-dom/, /^lucide-react$/, /^\.\/tv-hud$/, /^@\/lib\/babylon$/, /^@\/lib\/babylon\/core\/(DunkBeats|DunkField)$/,
    /^@\/lib\/babylon\/audio\/(SoundKit|mic\/VoiceKit)$/, /^@\/lib\/audio\/ui\/VolumeMixer$/];
  for (const f of ['hoops-shot-meter.tsx', 'judge-cards.tsx', 'dunk-beat-strip.tsx', 'dunk-field-board.tsx', 'mic-caption.tsx']) {
    it(`${f} imports only what it draws with`, () => {
      const specs = [...read(f).matchAll(/^import [^;]*? from '([^']+)'/gm)].map((m) => m[1]);
      expect(specs.length).toBeGreaterThan(0);
      for (const s of specs) expect(ALLOWED.some((a) => a.test(s)), `${f} imports ${s}`).toBe(true);
    });
  }
});
