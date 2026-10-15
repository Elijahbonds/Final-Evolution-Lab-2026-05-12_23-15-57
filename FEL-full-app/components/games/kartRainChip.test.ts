// THE KART'S RAIN CHIP, on the start screen (w3-followups, owner 2026-10-14 "Add a Rain chip"). BootSplash is the card every mode's
// READY screen is, and a render in node runs no effect (the chip waits for the saved pick), so the chip is held in the source the way
// the neighbouring kart options are (VelocityKartMode.improve.test): same element, same gates, same reload. What it must be:
//   - FOCUSABLE by pad and keyboard: a native <button type="button"> (the pad's focus walks real buttons, as it does for MIRROR and the
//     laps), not disabled, no tabIndex={-1}, with aria-pressed and a name that says what it does;
//   - OUTSIDE THE PLAY AREA: it is in the card, drawn only while the phase is ready or loading - never while playing;
//   - the same shape as its neighbours: remembered per device, reloads with the pick in the URL (weather dresses the world at load);
//   - on the TV HUD palette (hudColor), no raw hex; and the URL param still turns it on.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const SPLASH = stripComments(readFileSync(path.resolve(__dirname, 'boot-splash.tsx'), 'utf8'));
const chip = (() => {
  const at = SPLASH.indexOf("race === 'kart' && kartRain !== null");
  expect(at, 'the chip block is on the splash').toBeGreaterThan(0);
  return SPLASH.slice(at, SPLASH.indexOf('readyVehicles(race).length > 1', at));
})();

describe('the kart Rain chip on the start screen', () => {
  it('is a native, enabled, focusable button with a pressed state and a name (as MIRROR is)', () => {
    expect(SPLASH).toMatch(/<button type="button" onClick=\{\(\) => pickKartRace\(\{ \.\.\.kartRace, mirror: !kartRace\.mirror \}\)\} aria-pressed=/);   // control: the existing option is the same element
    expect(chip).toMatch(/<button type="button" onClick=\{toggleKartRain\} aria-pressed=\{kartRain\}/);
    expect(chip).toMatch(/aria-label=\{`Rain \$\{kartRain \? 'on' : 'off'\}/);
    expect(chip).not.toMatch(/tabIndex|disabled|pointer-events-none|aria-hidden/);
  });
  it('sits in the card, only while the card is up (ready or loading), never over play', () => {
    expect(chip).toMatch(/props\.phase === 'ready' \|\| props\.phase === 'loading'/);
    expect(chip).not.toMatch(/absolute|fixed|z-\d/);   // in the column's flow with the other picks, not floated over the canvas
    expect(SPLASH.indexOf("race === 'kart' && kartRain !== null")).toBeGreaterThan(SPLASH.indexOf("race === 'kart' && kartRace"));
  });
  it('is remembered per device and reloads with the pick in the URL, like the laps and the mirror', () => {
    expect(SPLASH).toMatch(/const toggleKartRain = \(\) => \{[\s\S]*writeKartRain\(on\)[\s\S]*searchParams\.set\('weather', 'rain'\)[\s\S]*searchParams\.delete\('weather'\)[\s\S]*window\.location\.assign\(u\.toString\(\)\)/);
    expect(SPLASH).toMatch(/useEffect\(\(\) => \{ if \(race === 'kart'\) setKartRain\(readKartWeather\(\) === 'rain'\); \}, \[race\]\);/);   // reads the URL param and the saved pick alike
  });
  it('lights in the TV HUD palette, with no raw colour of its own', () => {
    expect(chip).toMatch(/hudColor\('info'\)/);
    expect(chip).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SPLASH).toMatch(/import \{ hudColor \} from '\.\/tv-hud\/tokens'/);
  });
  it('says it is looks only, in its label', () => { expect(chip).toMatch(/looks only/); });
});
