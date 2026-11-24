// look-screens phase A1 (docs/LOOK-PASS-AUDIT.md, lib/ui/compactHeader.ts): on a phone held upright the game header is one
// row and its tools are in the "⋯" menu. vitest runs in node (no layout engine), so this pins what decides it: the rules
// (upright only, under the attribute), the knob's two ends (0 = today's wrapping header and today's menu exactly), the PRQ
// line the menu prints, the menu drawing the tools (and keeping them mounted while closed), and that the shell wires it.
// The header's height is measured in a browser: scripts/probes/look-screens/header.mts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import {
  COMPACT_GAME_HEADER, COMPACT_HEADER_ATTR, COMPACT_HEADER_CSS, compactGameHeader, menuPrqLine, UPRIGHT_PHONE_QUERY,
} from '@/lib/ui/compactHeader';
import { prqDisplay } from '@/lib/prq-display';
import { CaptureHudView } from '@/components/capture/capture-hud-view';
import { MenuGameTools, useCompactHeader } from './compact-header';

const g = globalThis as { window?: unknown };
function knob(v: number) {
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify({ 'ui.compactGameHeader': v })]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, s: string) => { m.set(k, s); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
}
beforeEach(() => { resetFeelForTests(); });
afterEach(() => { resetFeelForTests(); delete g.window; });

const noop = () => {};
const hud = (extra: Record<string, unknown> = {}) => (
  <CaptureHudView
    phase="idle" aspect="16:9" streamOn={false} controlsHidden={false}
    note={null} codecNote={null} dunkFilm={false} canShareTake={false} canShareReplay={false} busy={false}
    onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop} onDiscard={noop}
    onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
    {...extra}
  />
);

function Header() {
  const c = useCompactHeader();
  return <header {...c.header} data-menu={c.menu ? '1' : '0'} />;
}

describe('the rules', () => {
  it('bite only on a phone held upright, and only under the attribute', () => {
    expect(UPRIGHT_PHONE_QUERY).toBe('(max-width: 640px) and (orientation: portrait)');
    expect(COMPACT_HEADER_CSS.startsWith(`@media ${UPRIGHT_PHONE_QUERY}{`)).toBe(true);
    expect(COMPACT_HEADER_CSS.endsWith('}')).toBe(true);
    const inner = COMPACT_HEADER_CSS.slice(`@media ${UPRIGHT_PHONE_QUERY}{`.length, -1);
    for (const r of inner.split('}').filter(Boolean)) expect(r.startsWith(`[${COMPACT_HEADER_ATTR}]`)).toBe(true);
  });
  it('hide the tools on the header\'s own shape (BODY beside the pause; everything after that group), keep the row from wrapping, and pad it 8 px (44 + 16 + 1 border = 61 px ≤ 64)', () => {
    expect(COMPACT_HEADER_CSS).toContain(`[${COMPACT_HEADER_ATTR}] > div > .ml-auto > :not([data-fel-pause-slot]):not([data-fel-pause]){display:none!important}`);
    expect(COMPACT_HEADER_CSS).toContain(`[${COMPACT_HEADER_ATTR}] > div > .ml-auto ~ *{display:none!important}`);
    expect(COMPACT_HEADER_CSS).toContain(`[${COMPACT_HEADER_ATTR}] > div{flex-wrap:nowrap;padding-top:8px;padding-bottom:8px}`);
    expect(COMPACT_HEADER_CSS).toContain('text-overflow:ellipsis');
  });
});

describe('the knob ui.compactGameHeader', () => {
  it('ships at 1, and the catalogue row says so', () => {
    expect(COMPACT_GAME_HEADER).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('ui.compactGameHeader')!;
    expect(k.def).toBe(COMPACT_GAME_HEADER);
    expect([k.min, k.max, k.step]).toEqual([0, 1, 1]);
    expect(compactGameHeader()).toBe(true);
  });
  it('1: the header carries the attribute (the server render too, so the first paint is one row); the menu waits for the client', () => {
    knob(1);
    const html = renderToStaticMarkup(<Header />);
    expect(html).toContain(`${COMPACT_HEADER_ATTR}=""`);
    expect(html).toContain('data-menu="0"');
  });
  it('0: no attribute, so no rule matches: the wrapping header exactly, and no tools in the menu', () => {
    knob(0);
    expect(compactGameHeader()).toBe(false);
    const html = renderToStaticMarkup(<Header />);
    expect(html).not.toContain(COMPACT_HEADER_ATTR);
    expect(html).toContain('data-menu="0"');
  });
});

describe('the PRQ line in the menu', () => {
  it('nothing measured: "Not measured yet", never the NOT MEASURED badge', () => {
    expect(menuPrqLine(prqDisplay(null))).toBe('PRQ · Not measured yet');
    expect(menuPrqLine(prqDisplay(null))).not.toContain('NOT MEASURED');
  });
  it('a measured read keeps the badge\'s own words', () => {
    const d = prqDisplay({ score: 58, measured: 2, total: 8 });
    expect(menuPrqLine(d)).toBe(d.badge);
    expect(menuPrqLine(d)).toMatch(/^PRQ 58 · .+ · 2\/8$/);
  });
  it('before the profile arrives', () => {
    expect(menuPrqLine(null)).toBe('PRQ · loading');
  });
});

describe('the "⋯" menu with the game\'s tools', () => {
  const tools = <MenuGameTools body={<button type="button">BODY</button>} graphics={<select id="g" />} prq={prqDisplay(null)}
    fullscreen={{ available: true, on: false, toggle: noop }} />;
  it('without tools: today\'s menu exactly (closed: no panel, no menu)', () => {
    const html = renderToStaticMarkup(hud());
    expect(html).not.toContain('capture-panel');
    expect(html).not.toContain('role="menu"');
  });
  it('closed: the tools stay mounted (body play keeps its camera) but the panel is not shown, and no role="menu" is drawn', () => {
    const html = renderToStaticMarkup(hud({ gameTools: tools }));
    expect(html).toMatch(/data-testid="capture-panel" style="[^"]*display:none/);
    expect(html).toContain('data-testid="menu-game-tools"');
    expect(html).not.toContain('role="menu"');
  });
  it('open: the capture items first (the same seven), then every header tool: BODY, graphics, full screen, the PRQ line', () => {
    const html = renderToStaticMarkup(hud({ gameTools: tools, defaultMenuOpen: true }));
    expect(html).toMatch(/data-testid="capture-panel" style="[^"]*display:flex/);
    expect(html).toContain('role="menu"');
    expect(html.indexOf('data-testid="capture-record"')).toBeLessThan(html.indexOf('data-testid="menu-game-tools"'));
    expect((html.match(/role="menuitem"/g)?.length ?? 0) + (html.match(/role="menuitemcheckbox"/g)?.length ?? 0)).toBe(6);
    expect(html).toContain('>BODY</button>');
    expect(html).toContain('<select id="g">');
    expect(html).toContain('aria-label="Full screen"');
    expect(html).toContain('PRQ · Not measured yet');
  });
  it('stream mode with the controls hidden: the tools stay mounted, hidden', () => {
    const html = renderToStaticMarkup(hud({ gameTools: tools, controlsHidden: true, streamOn: true }));
    expect(html).toContain('data-testid="menu-game-tools"');
    expect(html).toMatch(/<div hidden="" style="display:none">/);
  });
});

describe('GameShell wires it', () => {
  const shell = readFileSync('components/games/game-shell.tsx', 'utf8');
  it('the header carries the attribute and the rules are rendered', () => {
    expect(shell).toContain('<CompactHeaderStyle />');
    expect(shell).toMatch(/<header data-game-chrome ref=\{headerRef\} \{\.\.\.compact\.header\}/);
  });
  it('the header\'s markup is today\'s: the shape the rules key on (the title block, the pushed-right pause and BODY, then the PRQ badge, graphics and full screen)', () => {
    const header = shell.slice(shell.indexOf('<header data-game-chrome'), shell.indexOf('</header>'));
    expect(header).toContain('<div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">');
    expect(header).toContain('<div className="min-w-0">');
    expect(header).toMatch(/<div className="ml-auto flex items-center gap-3">\s*\{stageFitOn && isBabylon\(mode\) \? <span data-fel-pause-slot[^\n]*\n\s*<BodyControl \/>\s*<\/div>/);
    expect(header.indexOf('<BodyControl />')).toBeLessThan(header.indexOf('{profile.display.badge}'));
    expect(header.indexOf('{profile.display.badge}')).toBeLessThan(header.indexOf('<GraphicsToggle />'));
    expect(header.indexOf('<GraphicsToggle />')).toBeLessThan(header.indexOf('onClick={onFullscreen}'));
  });
  it('the pause renders with data-fel-pause, the one control the rule keeps beside the slot', () => {
    expect(readFileSync('components/games/pause-button.tsx', 'utf8')).toContain('data-fel-pause\n');
  });
  it('the menu gets the tools only on the upright phone, and never in full screen or the stream view', () => {
    expect(shell).toContain('const menuTools = compact.menu && !fullBleed && !streamOn');
    expect(shell).toContain('gameTools={menuTools}');
    expect(shell).toContain('graphics={<GraphicsToggle id="fel-graphics-menu" />}');
  });
});
