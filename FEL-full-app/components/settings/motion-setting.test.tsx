// HOTFIX (2026-09-24): the reduced-motion override's two surfaces — the Profile section (three choices) and the boot
// splash's corner chip. A server render is their FIRST paint (the stored choice is read after mount), so that paint must
// already be a working control that says what it does.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { MotionSetting, motionChip, motionStatus, nextMotionPref } from './motion-setting';

describe('motionStatus — the line that says what is in force and why', () => {
  it('names the device when it is the device deciding', () => {
    expect(motionStatus('system', true)).toMatch(/device asks for reduced motion/i);
    expect(motionStatus('system', false)).toMatch(/no motion preference.*full/i);
  });
  it('names the override when the app is deciding, whatever the device says', () => {
    expect(motionStatus('reduce', false)).toMatch(/^Reduced, whatever your device says/);
    expect(motionStatus('full', true)).toMatch(/^Full, whatever your device says/);
  });
});

describe('MotionSetting, first paint', () => {
  it('Profile: three real buttons, "Match device" pressed, and the promise that timing does not change', () => {
    const m = renderToStaticMarkup(createElement(MotionSetting));
    expect(m.match(/<button/g)).toHaveLength(3);
    expect(m).toMatch(/aria-pressed="true"[^>]*>Match device</);
    expect(m).toMatch(/aria-pressed="false"[^>]*>Reduced</);
    expect(m).toMatch(/aria-pressed="false"[^>]*>Full</);
    expect(m).toContain('every window, timer and score is the same');
    expect(m).toContain('aria-labelledby="motion-setting-heading"');
    expect(m).toContain('id="motion-setting-heading"');
  });

  it('splash: ONE chip that says the current setting and what a tap changes it to', () => {
    const m = renderToStaticMarkup(createElement(MotionSetting, { compact: true, className: 'absolute left-3 top-3' }));
    expect(m.match(/<button/g)).toHaveLength(1);
    expect(m).toContain('>MOTION: AUTO · FULL<');
    expect(m).toContain('Change to Reduced.');
    expect(m).toContain('absolute left-3 top-3');
  });
});

describe('the splash chip, stepped (HOTFIX 2026-09-24)', () => {
  it('steps AUTO → REDUCED → FULL → AUTO', () => {
    expect(nextMotionPref('system')).toBe('reduce');
    expect(nextMotionPref('reduce')).toBe('full');
    expect(nextMotionPref('full')).toBe('system');
    const seen = [motionChip('system', false).text];
    let p = nextMotionPref('system');
    for (let i = 0; i < 3; i++) { seen.push(motionChip(p, false).text); p = nextMotionPref(p); }
    expect(seen).toEqual(['MOTION: AUTO · FULL', 'MOTION: REDUCED', 'MOTION: FULL', 'MOTION: AUTO · FULL']);
    expect(motionChip('system', true).text).toBe('MOTION: AUTO · REDUCED');
  });

  it('a ?motion= link in force: the chip shows what the LINK holds and offers no step, instead of a choice the games ignore', () => {
    const c = motionChip('full', false, 'reduce');
    expect(c.text).toBe('MOTION: LINK · REDUCED');
    expect(c.reduced).toBe(true);
    expect(c.next).toBeNull();
    expect(c.ariaLabel).toMatch(/set by this page's link/);
    expect(motionStatus('full', false, 'reduce')).toMatch(/link \(\?motion=reduce\) is holding reduced motion.*applies once you leave/);
    // no link: exactly the old wording
    expect(motionStatus('full', true, null)).toBe(motionStatus('full', true));
  });

  it('the chip lets go of focus after a click (Enter or Space would otherwise step it again), like the start pill', () => {
    // a mounted click needs a DOM this runner does not have (environment: node); pinned by source beside the behaviour above
    const src = fs.readFileSync(path.join(__dirname, 'motion-setting.tsx'), 'utf8');
    expect(src).toMatch(/onClick=\{\(e\) => \{ e\.currentTarget\.blur\(\); if \(chip\.next\) pick\(chip\.next\); \}\}/);
    expect(src).toMatch(/disabled=\{chip\.next === null\}/);
  });
});
