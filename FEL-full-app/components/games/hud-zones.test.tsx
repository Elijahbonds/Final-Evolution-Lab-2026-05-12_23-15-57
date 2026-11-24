// look-screens phase A2 (docs/LOOK-PASS-AUDIT.md, lib/ui/hudZones.ts): one HUD layout for the hoops on a phone held upright.
// vitest runs in node (no layout engine, no matchMedia), so this pins what decides it: the knobs' two ends, where each row and
// piece goes (nothing a player reads is dropped), the server render (= today's layout: the zones need the client to know the
// phone is upright), and the wiring in the files that draw it. The pixels — text over a player or the rim, pieces over the
// court, tap sizes — are measured in a browser: scripts/probes/look-screens/hud.mts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import {
  DECK_FADE_MIN, DECK_FADE_OVER_BODY, DECK_HINT_MODES, deckFadeOverBody, DUNK_UPRIGHT_PIECES, HUD_ZONES_UPRIGHT, hoopsRowZone, hudZonesUpright, ZONES_QUERY,
} from '@/lib/ui/hudZones';
import { UPRIGHT_PHONE_QUERY } from '@/lib/ui/compactHeader';
import { HoopsBottomStack, StackLine } from './hoops-bottom-stack';
import { MicToggle } from './mic-caption';
import { InSlot, resetSlotsForTests, useUprightZones } from './hud-zones';

const g = globalThis as { window?: unknown };
function knobs(v: Record<string, number>) {
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(v)]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, s: string) => { m.set(k, s); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
}
beforeEach(() => { resetFeelForTests(); resetSlotsForTests(); });
afterEach(() => { resetFeelForTests(); delete g.window; });

describe('the knobs', () => {
  it('ui.hudZonesUpright ships at 1; 0 turns the zones off', () => {
    expect(HUD_ZONES_UPRIGHT).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('ui.hudZonesUpright')!;
    expect(k.def).toBe(HUD_ZONES_UPRIGHT);
    expect([k.min, k.max, k.step]).toEqual([0, 1, 1]);
    expect(hudZonesUpright()).toBe(true);
    knobs({ 'ui.hudZonesUpright': 0 });
    expect(hudZonesUpright()).toBe(false);
  });
  it('ui.deckFadeOverBody ships at 1 (the solid deck, today); clamped to [0.35, 1]', () => {
    expect(DECK_FADE_OVER_BODY).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('ui.deckFadeOverBody')!;
    expect(k.def).toBe(1);
    expect([k.min, k.max]).toEqual([DECK_FADE_MIN, 1]);
    expect(deckFadeOverBody()).toBe(1);
    knobs({ 'ui.deckFadeOverBody': 0.5 });
    expect(deckFadeOverBody()).toBe(0.5);
  });
  it('the zones bite on the same upright phone as the compact header', () => {
    expect(ZONES_QUERY).toBe(UPRIGHT_PHONE_QUERY);
  });
});

describe('where everything goes (nothing a player reads is dropped)', () => {
  it('1v1 / 3v3: the hint to the deck slot; the shot meter, the MC\'s line and the call to the line slot', () => {
    expect(hoopsRowZone('hint')).toBe('deck');
    for (const k of ['meter', 'mic', 'call']) expect(hoopsRowZone(k)).toBe('line');
  });
  it('the Dunk: every piece of the eleven has a zone, and over the court is the strip plus the line slot', () => {
    const zones = DUNK_UPRIGHT_PIECES as Record<string, string>;
    for (const piece of ['score', 'round', 'dunkNum', 'hype', 'hint', 'mic', 'call', 'takeoff', 'beats', 'field', 'prop', 'specials', 'style', 'micToggle']) {
      expect(['strip', 'line', 'menu'], piece).toContain(zones[piece]);
    }
    // the four readouts the audit counted that are read between plays leave the court
    for (const piece of ['field', 'prop', 'specials', 'style', 'micToggle']) expect(zones[piece]).toBe('menu');
  });
});

describe('the server render (and every screen the client has not yet seen upright) is today\'s layout', () => {
  function Zones() { return <i data-z={useUprightZones() ? '1' : '0'} />; }
  it('useUprightZones is false on the server', () => {
    expect(renderToStaticMarkup(<Zones />)).toContain('data-z="0"');
  });
  it('InSlot draws the fallback (today\'s place) with no slot', () => {
    expect(renderToStaticMarkup(<InSlot name="menu" fallback={<b>here</b>}><u>menu</u></InSlot>)).toBe('<b>here</b>');
  });
  it('the bottom stack is the one column above the deck, as before', () => {
    const html = renderToStaticMarkup(<HoopsBottomStack rows={[['hint', <StackLine key="h" text="TAP THE STICK TO JAB" />], ['call', <b key="c">AND ONE</b>]]} />);
    expect(html).toContain('data-hoops-bottom');
    expect(html).toContain('flex-col-reverse');
    expect(html).not.toContain('data-hoops-zone');
  });
  it('the MIX / MC / CC switches render where the host put them', () => {
    const html = renderToStaticMarkup(<MicToggle />);
    expect(html).toContain('right-3 top-[18%]');
    expect(html).not.toContain('data-mic-switches="menu"');
  });
});

describe('the wiring', () => {
  const overlay = readFileSync('lib/babylon/ui/TouchOverlay.tsx', 'utf8');
  const dunk = readFileSync('components/games/dunk-babylon.tsx', 'utf8');
  const stack = readFileSync('components/games/hoops-bottom-stack.tsx', 'utf8');
  const menu = readFileSync('components/games/compact-header.tsx', 'utf8');
  it('the deck: no ghost d-pad upright in the zones — its 172 x 72 place kept as the deck slot; the ghost everywhere else', () => {
    expect(overlay).toMatch(/\? \(zones && !landscape\s*\? \(DECK_HINT_MODES\.has\(props\.modeId\)\s*\? <div ref=\{deckSlot\.ref\} \{\.\.\.deckSlot\.attr\} className="pointer-events-none relative h-\[72px\] w-\[172px\]" \/>\s*: <div aria-hidden="true" className="pointer-events-none h-\[72px\] w-\[72px\]" \/>\)\s*: <HollowDPad \/>\)/);
  });
  it('the deck slot holds a hint only where the camera keeps bodies above the deck (1v1); 3v3 keeps the empty place', () => {
    expect([...DECK_HINT_MODES]).toEqual(['onevone']);
  });
  it('the deck fade applies only upright in the zones, and only below 1', () => {
    expect(overlay).toContain("const fade = !landscape && zones ? deckFadeOverBody() : 1;");
    expect(overlay).toContain('return fade < 1 ? <div data-deck-fade style={{ opacity: fade }}>{cluster}</div> : cluster;');
    expect(overlay).toMatch(/\{fadeCluster\(fade, cfg\.turbo && !landscape/);
  });
  it('the stack: the hint portals into the deck slot, the rest hang under the strip read top-down', () => {
    expect(stack).toContain("const deck = deckEl ? live.filter(([k]) => hoopsRowZone(k) === 'deck') : [];");
    expect(stack).toContain('const lines = live.filter((r) => !deck.includes(r)).reverse();');
    expect(stack).toContain('style={{ top: LINE_SLOT_TOP }}');
  });
  it('the menu holds the slot the folded pieces go to', () => {
    expect(menu).toContain('<div ref={slot.ref} {...slot.attr} className="flex flex-col items-stretch gap-1.5 empty:hidden" />');
  });
  it('the Dunk: upright its row and column share one flow; anywhere else the row is the frame\'s direct child as before', () => {
    expect(dunk).toContain("const wrapTop = (row: ReactNode) => (zones ? <div className=\"absolute inset-x-0 top-0 flex flex-col\">{row}{topColumn()}</div> : row);");
    expect(dunk).toContain('{!zones && bottomColumn()}');
    // the top column comes after the original in the file, so the bottom column's own pins (dunk-hud-stable, wave3-hud) read the original
    expect(dunk.indexOf('<div data-dunk-bottom')).toBeLessThan(dunk.indexOf('<div data-dunk-lines'));
    expect(dunk).toContain("{(judging || timing || bannerUp) && !zones ? (");
    expect(dunk).toContain('<InSlot name="menu" fallback={<div><DunkFieldBoard value={hud.field} compact /></div>}><DunkFieldBoard value={hud.field} compact /></InSlot>');
    expect(dunk).toContain('return <InSlot name="menu" fallback={chips}>');
  });
});
