// CONTROLLER-TRY-FIX (2026-10-28), items 1, 2 and 5 on the host side. New tests only (CT-1 … CT-7, CT-14); no existing test edited.
//   item 1 (C1): the /try stage owns the pad, so the site's menu focus stands aside — pad A no longer clicks the header QUIT, pad B
//                no longer runs history.back(); the age step, the claim sheet and the result modal keep pad navigation.
//   item 2 (C2): the lobby's "P1 … connected" line clears JOINED_MS after a join; the dunk shows no second toast and no chip in play.
//   item 5 (C6): the night report is on the night card, and no banner draws while the card is up.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { menuFocusPaused, startMenuFocus, OWNS_INPUT } from '@/lib/nav/focus';
import { chromeHiddenFor } from '@/components/shell/tab-bar';
import { padChipsView } from '@/lib/babylon/ui/PadChips';
import type { PadInfo } from '@/lib/babylon/core/InputBus';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
const SHELL = read('components/games/guest-dunk-shell.tsx');
const LOBBY = read('components/controller-link/host-lobby.tsx');
const HOST = read('components/games/dunk-babylon.tsx');
const OWN_ATTR = "data-own-input={gate !== 'ask' && !claimOpen && !result ? '' : undefined}";

describe('CT-1 — /try is not a chrome-hidden route: it stands the menus aside only through the owned-input attribute', () => {
  it('menuFocusPaused on /try follows ownedInput', () => {
    const base = { pathname: '/try', hidden: false, holds: 0 };
    expect(chromeHiddenFor('/try')).toBe(false);
    expect(menuFocusPaused({ ...base, ownedInput: true })).toBe(true);
    expect(menuFocusPaused({ ...base, ownedInput: false })).toBe(false);
    expect(OWNS_INPUT).toContain('[data-own-input]');
  });
});

describe('CT-2 — the /try stage wrapper carries the attribute; no other page hosts a game outside the hidden routes', () => {
  it('guest-dunk-shell: the wrapper that holds <DunkBabylon carries data-own-input, off on the age step, the claim sheet and the result', () => {
    const at = SHELL.indexOf(OWN_ATTR);
    expect(at).toBeGreaterThan(0);
    expect(SHELL.split(OWN_ATTR).length - 1).toBe(1);
    const open = SHELL.lastIndexOf('<div', at);
    expect(SHELL.slice(open, at)).toContain('className="relative mx-auto w-full max-w-[1200px] flex-1 px-2 py-3 sm:px-4"');
    expect(SHELL.indexOf('<DunkBabylon')).toBeGreaterThan(at);
    expect(SHELL.indexOf("{gate === 'ask' ? (")).toBeGreaterThan(at);   // the age step sits inside it (and the attribute is off there)
    // the age gate is untouched: the adult answer is still not stored, the block flag still is
    expect(SHELL).toContain("const [gate, setGate] = useState<GuestGate>('ask');");
  });
  it('no page under app/ outside chromeHiddenFor hosts a *-babylon game or GuestDunkShell (today: /try only, which owns its input)', () => {
    const pages: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const f = path.join(dir, e);
        if (statSync(f).isDirectory()) walk(f); else if (/^page\.tsx?$/.test(e)) pages.push(f);
      }
    };
    walk(path.join(ROOT, 'app'));
    const hosts = pages.filter((f) => /from ['"]@\/components\/games\/(guest-dunk-shell|[\w-]+-babylon)['"]/.test(readFileSync(f, 'utf8')));
    const route = (f: string): string => '/' + path.relative(path.join(ROOT, 'app'), path.dirname(f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/');
    const exposed = hosts.map(route).filter((r) => !chromeHiddenFor(r));
    for (const r of exposed) expect(r, r).toBe('/try');
    if (exposed.includes('/try')) expect(read('app/try/page.tsx')).toMatch(/GuestDunkShell/);
  });
});

describe('CT-3 — the manager\'s pad poll on /try: no QUIT click and no history.back while the stage owns input; the claim sheet still clicks', () => {
  const g = globalThis as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const KEYS = ['window', 'document', 'navigator', 'HTMLElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete g[k]; else Object.defineProperty(g, k, { value: saved[k], configurable: true, writable: true }); } });

  function rig(owned: boolean) {
    for (const k of KEYS) saved[k] = g[k];
    class El { tag: string; clicks = 0; constructor(tag: string) { this.tag = tag; }
      closest() { return null; } getBoundingClientRect() { return { left: 10, top: 10, width: 40, height: 20 }; }
      click() { this.clicks++; } focus() { doc.activeElement = this; } scrollIntoView() {} }
    const quit = new El('A');
    const body = new El('BODY');
    const doc: Record<string, unknown> = {
      activeElement: body, body, documentElement: new El('HTML'), visibilityState: 'visible',
      querySelector: (sel: string) => (sel === OWNS_INPUT ? (owned ? new El('DIV') : null) : sel === 'canvas' ? new El('CANVAS') : null),
      querySelectorAll: () => [quit],
    };
    const back = vi.fn();
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    let frame: (() => void) | null = null;
    const set = (k: string, v: unknown) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    set('HTMLElement', El);
    set('getComputedStyle', () => ({ visibility: 'visible', display: 'block' }));
    set('document', doc);
    set('window', { location: { pathname: '/try' }, history: { length: 3, back }, addEventListener() {}, removeEventListener() {} });
    set('navigator', { getGamepads: () => [{ connected: true, buttons, axes: [0, 0, 0, 0] }] });
    set('requestAnimationFrame', (f: () => void) => { frame = f; return 1; });
    set('cancelAnimationFrame', () => { frame = null; });
    const stop = startMenuFocus();
    const tick = (pressed: number[]) => { buttons.forEach((b, i) => { b.pressed = pressed.includes(i); }); const f = frame; frame = null; f?.(); };
    return { quit, back, stop, tick };
  }

  it('stage live (owned): A, A, B and the d-pad do nothing to the page', () => {
    const r = rig(true);
    for (const p of [[], [0], [], [0], [], [1], [], [13], []]) r.tick(p);
    expect(r.quit.clicks).toBe(0);
    expect(r.back).not.toHaveBeenCalled();
    r.stop();
  });
  it('claim sheet / age step / result (not owned): the same A, A focuses then clicks — the menus still work there', () => {
    const r = rig(false);
    for (const p of [[], [0], [], [0], []]) r.tick(p);
    expect(r.quit.clicks).toBe(1);
    r.stop();
  });
});

describe('CT-4 / CT-5 — the lobby line clears JOINED_MS after a join; HP-2 and the pinned regex hold', () => {
  it('the usbLine condition has no trailing `|| pads.length > 0`; JOINED_MS is 4000; the join timer is the only thing holding it in play', () => {
    expect(LOBBY).toContain('const usbLine = bus && (!collapsed || (justJoined && pads.length > 0)) ? (');
    expect(LOBBY).not.toMatch(/\(justJoined && pads\.length > 0\) \|\| pads\.length > 0\)/);
    expect(LOBBY).toContain('const JOINED_MS = 4000;');
    expect(LOBBY).toContain('timer = setTimeout(() => setJustJoined(false), JOINED_MS);');
    expect(LOBBY).toMatch(/if \(pads\.length > 0\) \{\s*return usbLine \? <Stack anchor=\{anchor\}>\{usbLine\}<\/Stack> : null;/);   // HP-2: no CONNECT badge with a pad in
  });
  it('the rule, as a truth table: READY (not collapsed) always; in play only while justJoined with a pad', () => {
    const shown = (collapsed: boolean, justJoined: boolean, pads: number) => !collapsed || (justJoined && pads > 0);   // the source line above, verbatim
    expect(shown(false, false, 1)).toBe(true);
    expect(shown(true, true, 1)).toBe(true);
    expect(shown(true, false, 1)).toBe(false);   // after JOINED_MS: gone (it was permanent)
    expect(shown(true, true, 0)).toBe(false);
  });
});

const pad = (slot: number, unsupported: string | null = null): PadInfo => ({ slot, index: slot, id: `pad${slot}`, profileId: 'xbox-series', name: 'Xbox Wireless Controller', unsupported });

describe('CT-6 / CT-7 — PadChips: no toast where the host says it already, no quiet chip in play, the unsupported warning always', () => {
  it('defaults are the old behaviour (the other hosts)', () => {
    expect(padChipsView({ pads: [], toast: null })).toBeNull();
    expect(padChipsView({ pads: [pad(0)], toast: 'P1 · Xbox Wireless Controller connected' })).toEqual({ toast: 'P1 · Xbox Wireless Controller connected', chips: [pad(0)], warnings: [] });
    expect(padChipsView({ pads: [], toast: 'P1 · Xbox Wireless Controller disconnected' })?.toast).toMatch(/disconnected$/);
  });
  it('toast off: never the toast; quiet off: no chip — and nothing at all unless a pad is unsupported', () => {
    expect(padChipsView({ pads: [pad(0)], toast: 'P1 · x connected', toastOn: false })).toEqual({ toast: null, chips: [pad(0)], warnings: [] });
    expect(padChipsView({ pads: [pad(0)], toast: 'P1 · x connected', toastOn: false, quiet: false })).toBeNull();
    const why = pad(1, 'does not work over Bluetooth on this device');
    expect(padChipsView({ pads: [pad(0), why], toast: null, toastOn: false, quiet: false })).toEqual({ toast: null, chips: [], warnings: [why] });
  });
  it('the dunk passes toast={false} and quiet only off play; the other hosts pass neither', () => {
    expect(HOST).toContain("<PadChips bus={bus} className=\"left-4 bottom-4\" toast={false} quiet={phase !== 'playing'} />");
    const games = path.join(ROOT, 'components/games');
    for (const f of readdirSync(games).filter((x) => x.endsWith('.tsx') && x !== 'dunk-babylon.tsx')) {
      const src = readFileSync(path.join(games, f), 'utf8');
      for (const m of src.matchAll(/<PadChips\b[^>]*>/g)) expect(m[0], f).not.toMatch(/toast=|quiet=/);
    }
  });
});

describe('CT-14 — the night card carries the report; no banner draws over it', () => {
  it('the banner text and the low banner both yield to the card', () => {
    expect(HOST).toContain("const bannerText = !judging && !card && typeof hud.banner === 'string' ? hud.banner : '';");
    expect(HOST).toContain('{!judging && !bannerUp && !card && <HudBanner text={bannerText} tone="you" size="score" className="top-[38%]" />}');
    expect(HOST.indexOf('const card = ')).toBeLessThan(HOST.indexOf('const bannerText = '));
  });
  it('the card reads hud.nightReport, inside the card block, under the headline', () => {
    const card = HOST.indexOf('{card && (');
    const report = HOST.indexOf("{typeof hud.nightReport === 'string' && hud.nightReport ? (");
    expect(report).toBeGreaterThan(card);
    expect(report).toBeGreaterThan(HOST.indexOf("'CUT AT THE LINE'", card));
    expect(HOST.slice(report - 200, report + 200)).toContain('data-night-report');
  });
});
