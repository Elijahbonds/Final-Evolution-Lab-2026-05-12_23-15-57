// GAME-HUD (lane/game-hud, 2026-11-12): the in-game HUD and the touch controller on the twelve game screens the
// every-screen pass left failing (docs/every-screen/needs.json: "game lanes"). Size, layout and contrast only: what each
// HUD says, when it says it and every feel number are as they were. The browser measurements (before and after, phone
// and desktop) are scripts/probes/game-hud/; this file holds the rules without a browser.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { HUD_TEXT_ALPHA, HUD_TYPE, HudMeter, hudLineStep } from '@/components/games/tv-hud';
import { READABLE, sizeMiss, wordCount } from '@/lib/readable/rules';
import { VC_MIN_LABEL_PX, VC_TAP_PX, faceLabelPx } from '@/components/games/virtual-controller';

const read = (f: string) => readFileSync(path.resolve(__dirname, '../..', f), 'utf8');

describe('a HUD line takes the HUD line floor (hudLineStep)', () => {
  it('a 3+ word run at a 12 px step reads at 14 px, the scorer\'s HUD line rule', () => {
    for (const t of ['0 YD · 0 EVA', 'BALL ON 0', '1ST AT 10', 'WAVE 1 · 0 KO', 'LEAD 0.6 s', 'ROOKIE · NEON ROOFTOP RUN', 'RING 128 m', '0.0 s TO KEELE']) {
      for (const step of ['caption', 'label'] as const) {
        expect(sizeMiss(HUD_TYPE[step].phone, { words: wordCount(t), phone: true, hud: 'phone' }), `${t} at ${step}`).toBe('hud-small');
        const now = hudLineStep(t, step);
        expect(now).toBe('body');
        expect(sizeMiss(HUD_TYPE[now].phone, { words: wordCount(t), phone: true, hud: 'phone' }), t).toBeNull();
      }
    }
    expect(HUD_TYPE.body.phone).toBe(READABLE.hudPhonePx);
  });
  it('a label or value (1-2 words) keeps the step it was given, and a big step is never made smaller', () => {
    for (const t of ['PLACE', 'LAP 1/3', 'CHECKPOINT 0/2', 'NO ITEM', 12, null, undefined]) {
      expect(hudLineStep(t, 'caption')).toBe('caption');
      expect(hudLineStep(t, 'label')).toBe('label');
    }
    for (const big of ['value', 'stat', 'score', 'banner', 'hero'] as const) expect(hudLineStep('A LONG LINE OF WORDS', big)).toBe(big);
  });
  it('HudMeter draws its label at the step it is given, and at caption when given none (every other host unchanged)', () => {
    const at = (html: string) => Number(/font-size:calc\((\d+)px/.exec(html.replace(/\s+/g, ''))?.[1]);
    expect(at(renderToStaticMarkup(<HudMeter label="SPEED 4.2 m/s" value={1} />))).toBe(HUD_TYPE.caption.phone);
    expect(at(renderToStaticMarkup(<HudMeter label="SPEED 4.2 m/s" labelSize={hudLineStep('SPEED 4.2 m/s', 'caption')} value={1} />))).toBe(14);
  });
});

describe('the touch controller (VirtualController: the story screens)', () => {
  it('no face-button label under 12 px at any phone width (it was 10.8 px for STRIKE / ATTACK at 390 px)', () => {
    expect(VC_MIN_LABEL_PX).toBe(READABLE.minPx);
    for (let vw = 320; vw <= 1280; vw += 10) {
      const diamond = Math.min(vw * 0.44, 176) * 0.42, single = Math.min(vw * 0.32, 128);
      for (const size of [diamond, single]) for (const long of [true, false]) expect(faceLabelPx(size, long)).toBeGreaterThanOrEqual(12);
    }
    // where the old rule was already over the floor, the size is exactly the old one
    expect(faceLabelPx(128, false)).toBe(128 * 0.2);
    expect(faceLabelPx(100, true)).toBe(15);
  });
  it('the tray\'s Controls and hide buttons tap at 44 px, drawn at their old 28 px, in a row exactly as tall as before', () => {
    const src = read('components/games/virtual-controller.tsx');
    expect(VC_TAP_PX).toBe(44);
    const help = src.slice(src.indexOf('aria-label="Controls help"'), src.indexOf('aria-label="Hide controller"'));
    expect(help).toMatch(/-my-2 flex min-h-11/);
    expect(help).toMatch(/<span className="flex items-center gap-1\.5 rounded-full border[^"]*py-1 text-\[12px\]/);
    const hide = src.slice(src.indexOf('aria-label="Hide controller"'), src.indexOf('aria-label="Hide controller"') + 700);
    expect(hide).toMatch(/-my-2 -mr-2 flex h-11 w-11/);
    expect(hide).toMatch(/<span className="flex h-7 w-7/);
    // the shoulder / trigger buttons (GUARD) at 44 px
    expect(src).toMatch(/className="pointer-events-auto relative flex min-h-11 select-none touch-none items-center justify-center overflow-hidden rounded-xl px-7/);
  });
});

describe('the capture menu\'s corner: one rule the HUD keeps clear of (app/game-surface.css, rule 6)', () => {
  const css = read('app/game-surface.css');
  it('the numbers come from where the shell draws the menu: 8 px in, an 8 px bar round a 44 px button', () => {
    const hud = read('components/capture/game-capture-hud.tsx');
    expect(hud).toMatch(/position: 'absolute',\s*top: 8,\s*left: 8,/);
    const view = read('components/capture/capture-hud-view.tsx');
    expect(view).toMatch(/padding: 8, borderRadius: 12/);
    expect(view).toMatch(/minWidth: 44, minHeight: 44/);
    // 8 + 8 + 44 + 8 = 68 px down the stage; the host's top is 12 + 1 px down it; a top row's own py-3 (12 px) is inside
    // the frame: a frame 46 px down puts the row's chips at 13 + 46 + 12 = 71 px, clear of the menu's 68
    expect(13 + 46 + 12).toBeGreaterThan(68);
    expect(css).toMatch(/div:not\(\[data-fel-console\]\):has\(> \[data-capture-ui\]\) > div:has\(> canvas\) > \[data-hud-frame\] \{\s*top: max\(46px, env\(safe-area-inset-top, 0px\)\) !important;/);
    expect(css).toMatch(/padding-left: max\(1rem, calc\(\(74px - var\(--fel-frame-l\)\) \/ var\(--fel-hud-zoom, 1\)\)\);/);
  });
  it('the HUD frame is the one place the rule lands (a HudFrame host needs no change of its own)', () => {
    expect(read('components/games/tv-hud/hud-frame.tsx')).toMatch(/data-hud-frame/);
  });
  it('a sideways phone in play keeps its own rule (the menu is in the bottom row there): the console rule is for taller screens', () => {
    const i = css.indexOf('6. THE CAPTURE MENU');
    expect(i).toBeGreaterThan(0);
    expect(css.slice(i)).toMatch(/@media \(min-height: 521px\) \{\s*\[data-fel-console\]:has\(> \[data-capture-ui\]\)/);
  });
});

describe('the twelve screens\' own HUD fixes (size and contrast only)', () => {
  it('no mode of this lane draws its hint at the 12 px caption any more (HudLine\'s own step is body, 14 px)', () => {
    for (const f of ['football', 'freerun', 'aero-aces', 'velocity-kart']) {
      const src = read(`components/games/${f}-babylon.tsx`);
      expect(src, f).not.toMatch(/<HudLine text=\{typeof hud\.hint[^>]*size="caption"/);
    }
  });
  it('the empty item slot (NONE / NO ITEM) is drawn at the faint alpha, which passes 4.5:1, not 0.35 (2.91:1)', () => {
    for (const f of ['aero-aces', 'velocity-kart']) {
      const src = read(`components/games/${f}-babylon.tsx`);
      expect(src, f).not.toMatch(/\? 1 : 0\.35\}/);
      expect(src, f).toMatch(/\? 1 : HUD_TEXT_ALPHA\.faint\}/);
    }
    expect(HUD_TEXT_ALPHA.faint).toBeGreaterThanOrEqual(0.6);
  });
});
