// hoops-followups (2026-11-19): the MIX / MC / CC chips over the court were drawn 22 px tall, half the 44 px tap rule (measured in play
// on /play/onevone and /play/threevthree by scripts/probes/hoops-followups/inplay.mts). Each button is now a see-through 44 px box with
// the chip drawn inside it as before; the top row's boxes reach up, the CC row's down. In `flow` (the dunk host's stack) as before.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MicToggle } from './mic-caption';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';

const g = globalThis as { window?: unknown };
/** the feel override ui.touchTargets44 (improve-screens phase 6), as the owner's panel sets it */
function touchTargets44(v: number) {
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify({ 'ui.touchTargets44': v })]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: () => {}, removeItem: () => {} } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1'));
}
afterEach(() => { resetFeelForTests(); delete g.window; });

/** Each <button ...> opening tag, by its data-qa or aria-label. */
function buttons(markup: string): Array<{ label: string; cls: string; style: string; inner: string }> {
  const out: Array<{ label: string; cls: string; style: string; inner: string }> = [];
  const re = /<button([^>]*)>(.*?)<\/button>/g;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    const attrs = m[1];
    const label = /aria-label="([^"]*)"/.exec(attrs)?.[1] ?? '';
    out.push({ label, cls: /class="([^"]*)"/.exec(attrs)?.[1] ?? '', style: /style="([^"]*)"/.exec(attrs)?.[1] ?? '', inner: m[2] });
  }
  return out;
}

describe('the MC chips: a 44 px tap target, the same chip drawn', () => {
  it('in a corner (1v1, 3v3, 3-Point, the carnival, the duel): every chip is a 44 px box, the top row reaching up and CC down', () => {
    const b = buttons(renderToStaticMarkup(h(MicToggle, {})));
    expect(b.map((x) => x.label)).toEqual(['Open the sound mix', expect.stringMatching(/^Turn the announcer o(n|ff)$/), expect.stringMatching(/subtitles/)]);
    for (const x of b) {
      expect(x.cls).toContain('min-h-[44px]');
      expect(x.style).toBe('');                                   // the button itself draws nothing
      expect(x.inner).toMatch(/^<span class="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1/);   // the chip, as before
    }
    expect(b[0].cls).toContain('-mt-[22px]'); expect(b[1].cls).toContain('-mt-[22px]');
    expect(b[2].cls).toContain('-mb-[22px]');
  });

  // test changed (improve-screens phase 6, 2026-11-22): the dunk stack's chips measured 44-49 x 22 px on a 390 x 844 phone, so with
  // ui.touchTargets44 1 (shipped) they get the corner's 44 px boxes too (components/games/touch-targets.test.tsx pins that end). This
  // case now pins the switch's 0 end, which is exactly the old flow chips.
  it('in the dunk host stack (`flow`) with ui.touchTargets44 0: the chips are the buttons, as before', () => {
    touchTargets44(0);
    const b = buttons(renderToStaticMarkup(h(MicToggle, { flow: true })));
    expect(b).toHaveLength(3);
    for (const x of b) {
      expect(x.cls).toMatch(/^pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1/);
      expect(x.cls).not.toContain('min-h-[44px]');
      expect(x.style).toContain('background');
      expect(x.inner).not.toContain('<span class="pointer-events-auto');
    }
  });

  it('in the dunk host stack (`flow`) with ui.touchTargets44 1 (shipped): 44 px boxes with the chip drawn inside, as in a corner', () => {
    const b = buttons(renderToStaticMarkup(h(MicToggle, { flow: true })));
    expect(b).toHaveLength(3);
    for (const x of b) {
      expect(x.cls).toContain('min-h-[44px]');
      expect(x.style).toBe('');
      expect(x.inner).toMatch(/^<span class="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1/);
    }
  });
});
