// The console view is three files that only work together: the pure rule (consoleView.ts), the shell that puts it on
// the stage (game-shell.tsx), and the stylesheet that reads it (app/game-surface.css). Nothing type-checks the seam
// between a React style object and a CSS custom property, so this reads the sources and holds the names together.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { consoleLayout, consoleStageVars } from './consoleView';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const shell = read('components/games/game-shell.tsx');
const css = read('app/game-surface.css');
const block = css.slice(css.indexOf('CONSOLE VIEW (console-view lane'));

describe('console view — the shell, the stylesheet and the rule agree', () => {
  it('the shell decides full-bleed from consoleLayout (every sideways screen), not from the landscape-PHONE test', () => {
    expect(shell).toMatch(/consoleLayout\(window\.innerWidth, window\.innerHeight\)/);
    expect(shell).toMatch(/setImmersive\(l\.console\)/);
    expect(shell).not.toMatch(/isLandscapePhone\(/);
  });

  it('the stage carries data-fel-console and the stage vars exactly while full-bleed', () => {
    expect(shell).toMatch(/data-fel-console=\{fullBleed \? '1' : undefined\}/);
    expect(shell).toMatch(/style=\{fullBleed \? consoleStageVars\(layout\)/);
    expect(shell).toMatch(/data-fel-corner/);
  });

  it('every custom property the rule writes is read by the stylesheet', () => {
    expect(block.length).toBeGreaterThan(0);
    for (const name of Object.keys(consoleStageVars(consoleLayout(1920, 1080)))) {
      expect(block, name).toContain(`var(${name}`);
    }
  });

  it('the stylesheet frames the host, sends the canvas back to the screen edge, and zooms only the HUD', () => {
    expect(block).toMatch(/\[data-fel-console\] > div:has\(> canvas\) \{/);
    expect(block).toMatch(/> div:has\(> canvas\) > canvas \{[^}]*width: calc\(100% \+ var\(--fel-frame-l\) \+ var\(--fel-frame-r\)\)/s);
    expect(block).toMatch(/> div:has\(> canvas\) > :not\(canvas\) \{\s*zoom: var\(--fel-hud-zoom, 1\);/);
    // the notch: the frame is never thinner than the device's safe-area inset
    for (const side of ['top', 'bottom', 'left', 'right']) expect(block).toContain(`env(safe-area-inset-${side}, 0px)`);
  });

  it('the READY card has its two-column hooks in BootSplash', () => {
    const splash = read('components/games/boot-splash.tsx');
    for (const hook of ['data-fel-fullbleed', 'data-splash-column', 'data-splash-pickers']) {
      expect(splash, hook).toContain(hook);
      expect(block, hook).toContain(`[${hook}]`);
    }
  });

  // controls-screen-2 (2026-10-06): at 1080p the dunk's "CONNECT A CONTROLLER" pills lay across its title. While the
  // card is up they go top-right; the rule finds them by HostLobby's own test ids, so it breaks if those are renamed.
  it('the controller pills move off the title while the READY card is up, found by HostLobby\'s test ids', () => {
    const lobby = read('components/controller-link/host-lobby.tsx');
    for (const id of ['host-lobby-badge', 'usb-connect-hint']) {
      expect(lobby, id).toContain(`data-testid="${id}"`);
      expect(block, id).toContain(`[data-fel-console] > div:has(> canvas):has(> [data-fel-fullbleed]) > div:has(> [data-testid="${id}"])`);
    }
    const rule = block.slice(block.indexOf('4c. The controller pills'));
    // off the left (the title's side) and onto a real right edge
    expect(rule).toMatch(/left: auto !important;\s*right: (?!auto)[\d.]+r?em !important;/);
    // the hosts that anchor them top-left, beside the title
    expect(read('components/games/dunk-babylon.tsx')).toMatch(/<HostLobby [^>]*anchor="left-4 top-14"/);
  });
});
