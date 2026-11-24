// improve-screens phase 6 (docs/IMPROVE-10-PHASE-AUDIT.md #10, #11; lib/ui/touchTargets.ts): nothing under a thumb button, every tap
// at least 44 px. vitest runs in node (no layout), so this pins the markup each fix depends on at both ends of the knob
// ui.touchTargets44 (1 = the fixes, 0 = each screen exactly as before). The boxes themselves are measured in a browser:
// scripts/probes/improve-screens/touch.mts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { TOUCH_TARGETS_44, touchTargets44, veniceHintPlace } from '@/lib/ui/touchTargets';
import { FirstVisitHint } from '@/app/play/venice/wayfinding';
import { MicToggle } from './mic-caption';
import { DialogueBox } from '@/components/adventure/DialogueBox';

const g = globalThis as { window?: unknown };
function knob(v: number) {
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify({ 'ui.touchTargets44': v })]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, s: string) => { m.set(k, s); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/venice', '?playtest=1'));
}
beforeEach(() => { resetFeelForTests(); });
afterEach(() => { resetFeelForTests(); delete g.window; });

const noop = () => {};
const cmd = { press: noop, release: noop, choose: noop, skip: noop, setMirror: noop, reloadBindings: noop } as never;
const line = { speaker: 'Guide', text: 'Welcome.', shown: 8, placeholder: false, choices: [{ id: 'a', text: 'Go' }], choiceIndex: 0, hold01: 0 } as never;
const skipOf = (html: string) => /<button[^>]*class="([^"]*)"[^>]*>SKIP/.exec(html)?.[1] ?? '';
const chipButtons = (html: string) => [...html.matchAll(/<button type="button"[^>]*class="([^"]*)"/g)].map((m) => m[1]);

describe('the knob', () => {
  it('ships at 1; the catalogue row matches', () => {
    expect(TOUCH_TARGETS_44).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('ui.touchTargets44')!;
    expect([k.def, k.min, k.max, k.step]).toEqual([1, 0, 1, 1]);
    expect(touchTargets44()).toBe(true);
  });
});

describe('Venice: the first-visit hint is never under the touch deck', () => {
  it('1, touch: the walk-up card\'s slot under the mini-map (the card and the hint are never up together)', () => {
    knob(1);
    expect(veniceHintPlace(true)).toBe('top-[9.25rem]');
    expect(renderToStaticMarkup(h(FirstVisitHint, { onDismiss: noop, touch: true }))).toContain('top-[9.25rem]');
    expect(readFileSync('app/play/venice/stage.tsx', 'utf8')).toContain("wayfinding ? 'top-[9.25rem]' : 'top-[4.25rem]'");
    expect(readFileSync('app/play/venice/stage.tsx', 'utf8')).toContain('{hint && !cardUp && <FirstVisitHint');
  });
  it('1, no touch (no deck): where it was', () => {
    knob(1);
    expect(veniceHintPlace(false)).toBe('bottom-[9.5rem]');
  });
  it('0: where it was, touch or not', () => {
    knob(0);
    const html = renderToStaticMarkup(h(FirstVisitHint, { onDismiss: noop, touch: true }));
    expect(html).toContain('absolute inset-x-4 bottom-[9.5rem] z-10 mx-auto');
    expect(html).not.toContain('top-[9.25rem]');
  });
});

describe('the dunk stack\'s MIX / MC / CC chips (MicToggle flow)', () => {
  it('1: each button is a 44 px box with the chip drawn inside it; the MIX / MC row reaches up, the CC row down', () => {
    knob(1);
    const b = chipButtons(renderToStaticMarkup(h(MicToggle, { flow: true })));
    expect(b).toHaveLength(3);
    for (const c of b) expect(c).toContain('min-h-[44px]');
    expect(b[0]).toContain('-mt-[22px]'); expect(b[1]).toContain('-mt-[22px]'); expect(b[2]).toContain('-mb-[22px]');
  });
  it('0: the chips are the buttons, as before (no 44 px box)', () => {
    knob(0);
    for (const c of chipButtons(renderToStaticMarkup(h(MicToggle, { flow: true })))) expect(c).not.toContain('min-h-[44px]');
  });
  it('the corner version (1v1, 3v3, 3-Point) keeps its 44 px boxes at either end', () => {
    for (const v of [0, 1]) {
      resetFeelForTests(); knob(v);
      for (const c of chipButtons(renderToStaticMarkup(h(MicToggle, {})))) expect(c).toContain('min-h-[44px]');
    }
  });
});

describe('the story dialogue: SKIP and the choices', () => {
  it('1: SKIP is a 44 x 44 box whose -6 px margins keep the header row its height; a choice is at least 44 px', () => {
    knob(1);
    const html = renderToStaticMarkup(h(DialogueBox, { d: line, cmd }));
    expect(skipOf(html)).toContain('min-h-[44px] min-w-[44px]');
    expect(skipOf(html)).toContain('-my-1.5');
    expect(html).toMatch(/<button[^>]*class="[^"]*min-h-\[44px\][^"]*"[^>]*>Go</);
  });
  it('0: as before', () => {
    knob(0);
    const html = renderToStaticMarkup(h(DialogueBox, { d: line, cmd }));
    expect(skipOf(html)).toBe('ml-auto rounded px-2 py-0.5 text-[12px] font-bold tracking-widest text-white/60 hover:bg-white/10');
    expect(html).not.toContain('min-h-[44px]');
  });
});

describe('/workout: the two tick lines', () => {
  const src = readFileSync('components/workout-view.tsx', 'utf8');
  it('1: each line is a 44 px label holding the real checkbox (visually hidden, named by the same words) and its drawn box', () => {
    expect(src).toContain('{touchTargets44() ? (');
    expect(src).toMatch(/<label className=\{`flex min-h-11 cursor-pointer[^`]*`\}>\s*<input type="checkbox" checked=\{checked\} onChange=\{\(e\) => onChange\(e\.target\.checked\)\} className="peer sr-only" \/>/);
    expect(src).toContain('<TickLine checked={consent} onChange={setConsent} top><span>{DEMO_CONSENT} <span className="text-white/50">Not medical advice.</span></span></TickLine>');
    expect(src).toContain('<TickLine checked={ageOk} onChange={setAgeOk}><span>I am 13 or older.</span></TickLine>');
  });
  it('0: the old two labels, word for word', () => {
    expect(src).toContain('<input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[#00E5FF]" />');
    expect(src).toContain('<input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="accent-[#00E5FF]" />');
  });
  it('the demo still needs both ticks', () => {
    expect(src).toContain('disabled={!consent || !ageOk}');
  });
});
