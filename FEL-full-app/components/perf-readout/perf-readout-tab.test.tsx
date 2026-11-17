// The PERF tab (device-perf, owner 2026-11-12): never shown to a player, never on by default, and the readout's code is not even
// downloaded until the server has opened the owner tools for this user (the feel panel's gate).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerfReadoutTab } from './perf-readout-tab';
import { resetFeelForTests, setFeelUser } from '@/lib/feel-panel/feel';

afterEach(() => resetFeelForTests());
const src = readFileSync('components/perf-readout/perf-readout-tab.tsx', 'utf8');

describe('PerfReadoutTab', () => {
  it('renders nothing for a player (the server never said yes)', () => {
    expect(renderToStaticMarkup(createElement(PerfReadoutTab))).toBe('');
  });
  it('renders nothing on the server render, even for the owner (the tab appears only after the client has the yes)', () => {
    setFeelUser(true);
    expect(renderToStaticMarkup(createElement(PerfReadoutTab))).toBe('');
  });
  it('reads the gate from the feel panel store and imports the readout only dynamically, after the yes', () => {
    expect(src).toContain("from '@/lib/feel-panel/feel'");
    expect(src).toMatch(/if \(!userAllowed\) return;\s+let dead = false;/);
    expect(src).not.toMatch(/^import .*perfReadout/m);
    expect(src).toContain("import('@/lib/babylon/core/perfReadout')");
  });
  it('opens the overlay only on a tap, or again after a reload in the same tab where the owner had it open', () => {
    expect(src).toContain('onClick={() => (open ? mod.closePerfReadout() : mod.openPerfReadout())}');
    expect(src.match(/openPerfReadout\(\)/g)?.length).toBe(2);
    expect(src).toContain('if (m.readoutWasOpen()) m.openPerfReadout();');
  });
  it('is mounted once for every /play route, beside the feel panel', () => {
    const layout = readFileSync('app/play/layout.tsx', 'utf8');
    expect(layout).toContain('<PerfReadoutTab />');
  });
});
