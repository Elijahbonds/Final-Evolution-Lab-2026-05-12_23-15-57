// The sprint's photo finish (lane/w3-present, wave 3): the print the host draws from the still and the two raw times the mode sends, and the
// host's hold of the result for it. Static markup (no DOM here) plus the wiring scans the other host tests use.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhotoFinishPrint } from './photo-finish';
import { PACER_FINISH_S, PHOTO_HOLD_MS } from '@/lib/babylon/racing/photoFinish';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&amp;/g, '&').replace(/&gt;/g, '>');
const read = (f: string) => readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
const STILL = 'data:image/jpeg;base64,/9j/4AAQ';
const print = (over: Record<string, unknown> = {}) => html(h(PhotoFinishPrint, { src: STILL, line: 0.42, you: 12.84, pacer: 13.4, ...over }));

describe('the print', () => {
  it('draws the still with the finish line at the row the mode projected, under a PHOTO FINISH caption', () => {
    const m = print();
    expect(m).toContain('data-photo-finish'); expect(m).toContain(`src="${STILL}"`); expect(m).toContain('PHOTO FINISH');
    expect(m).toMatch(/data-photo-line[^>]*style="[^"]*top:42%/);
    expect(m).toContain('FINISH');
  });
  it('the player first: YOU BY the gap, the player\'s marker on the line, the pacer\'s to its right', () => {
    const m = print();
    expect(m).toContain('YOU BY 0.56 s');
    expect(m).toContain('YOU 12.84 s'); expect(m).toContain('PACER 13.40 s');
    const left = (who: string) => Number(new RegExp(`data-photo-marker="${who}"[^>]*style="left:([\\d.]+)%`).exec(m)?.[1]);
    expect(left('you')).toBeLessThan(left('pacer'));
  });
  it('the pacer first: PACER BY, and the markers swap', () => {
    const m = print({ you: 13.71 });
    expect(m).toContain('PACER BY 0.31 s');
    const left = (who: string) => Number(new RegExp(`data-photo-marker="${who}"[^>]*style="left:([\\d.]+)%`).exec(m)?.[1]);
    expect(left('pacer')).toBeLessThan(left('you'));
  });
  it('a ruler of ticks (about ten across), the line\'s mark among them', () => {
    const m = print();
    const ticks = (m.match(/data-photo-tick/g) ?? []).length;
    expect(ticks).toBeGreaterThanOrEqual(5); expect(ticks).toBeLessThanOrEqual(14);
    expect(m).toContain('data-photo-line-mark');
  });
  it('no finish line when it was off the frame, no print when there is no still', () => {
    expect(print({ line: null })).not.toContain('data-photo-line=');
    for (const src of [undefined, null, '', 5]) expect(print({ src })).toBe('');
  });
  it('a missing pacer time is the signed-off 13.4 s; a missing player time is a dead heat, never a crash', () => {
    expect(print({ pacer: undefined })).toContain('PACER 13.40 s');
    expect(print({ you: undefined })).toContain('DEAD HEAT');
  });
  it('on the TV HUD system: the palette, no raw hex, no sub-floor text, no mono face', () => {
    const s = read('components/games/photo-finish.tsx');
    expect(s).toMatch(/from '\.\/tv-hud'/);
    expect(s).not.toMatch(/text-\[(9|10|11)px\]/); expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); expect(s).not.toMatch(/\bfont-mono\b/);
  });
  it('imports nothing that scores or times a race beyond the pure ruler', () => {
    const imports = [...read('components/games/photo-finish.tsx').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) expect(i).toMatch(/^(react|framer-motion|\.\/tv-hud|@\/lib\/babylon\/racing\/photoFinish)$/);
  });
});

describe('the sprint host holds the result for the print', () => {
  const host = read('components/games/sprint-babylon.tsx');
  it('draws the print from the photo keys, and drops the metronome once the race is photographed', () => {
    expect(host).toContain('<PhotoFinishPrint src={hud.photoSrc} line={hud.photoLine} you={hud.photoYou} pacer={hud.photoPacer} />');
    expect(host).toMatch(/Number\(hud\.beat\) > 0 && !hud\.photoSrc/);
  });
  it('holds onEnd for PHOTO_HOLD_MS only when a still arrived, and hands it over on a press, a tap or the timer', () => {
    expect(host).toContain('PHOTO_HOLD_MS');
    expect(host).toMatch(/if \(disposed \|\| typeof still !== 'string' \|\| !still\) \{ onEndRef\.current\(result\); return; \}/);
    expect(host).toMatch(/bus\.on\(\(e\) => \{ if \(holdRef\.current && 'pressed' in e && e\.pressed\) holdRef\.current\.go\(\); \}\)/);
    expect(host).toMatch(/onPointerDown=\{\(\) => holdRef\.current\?\.go\(\)\}/);
    expect(host).toMatch(/const go = \(\): void => \{ if \(done\) return; done = true;/);   // once
  });
  it('a host that has gone does not send the held result, and the skip listener is released', () => {
    expect(host).toMatch(/offSkip\(\);/);
    expect(host).toMatch(/if \(holdRef\.current\) \{ clearTimeout\(holdRef\.current\.timer\); holdRef\.current = null; \}/);
  });
  it('the hold is short and finite', () => { expect(PHOTO_HOLD_MS).toBeLessThanOrEqual(3500); });
});

describe('the sprint mode takes the photo', () => {
  const mode = read('lib/babylon/modes/SprintMode.ts');
  it('at the tape, once, from finish(); the pacer\'s crossing is its own curve\'s (RIVAL_TIME_S), the same 13.4 s the print assumes', () => {
    expect(mode).toMatch(/finishBeat\(ctx, won\);\s*capturePhoto\(ctx, rawS\);/);
    expect(mode.match(/capturePhoto\(ctx, rawS\)/g)?.length).toBe(1);
    expect(mode).toMatch(/const RIVAL_TIME_S = 13\.4;/);
    expect(PACER_FINISH_S).toBe(13.4);
    expect(mode).toMatch(/photoPacer: RIVAL_TIME_S/);
  });
  it('sends the RAW crossing time (the photo is a physical fact; the official time carries the dip and the penalties)', () => {
    expect(mode).toMatch(/photoYou: Number\(rawS\.toFixed\(3\)\)/);
  });
  it('reads the frame as DRAWN (the dunk poster\'s way), never through a second render target, and never lets a failed capture touch the race', () => {
    expect(mode).toMatch(/Tools\.CreateScreenshot\(engine, cam, \{ precision: 0\.5 \}/);
    expect(mode).not.toMatch(/RenderTargetTexture/);
    expect(mode).toMatch(/catch \(e\) \{ console\.warn\('\[SPRINT-PHOTO\] capture failed', e\); \}/);
  });
  it('a new race clears the last photo', () => {
    expect(mode).toMatch(/ctx\.setHud\(\{ photoSrc: null, photoLine: null \}\)/);
  });
  it('a DNF is not photographed (the capture is in finish(), which only the player\'s own tape reaches)', () => {
    const dnf = mode.slice(mode.indexOf("say('DID NOT FINISH'"), mode.indexOf("say('DID NOT FINISH'") + 400);
    expect(dnf).not.toContain('capturePhoto');
  });
});
