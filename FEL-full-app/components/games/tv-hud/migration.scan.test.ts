// THE HOST MIGRATION GUARD (A9.13, lane/tv-hud). A host moved onto the shared TV HUD must keep its information,
// controls and behaviour — presentation only — and must actually be on the system, not half on it.
//
//   - INFORMATION: every HUD key the host read before the migration (frozen below from the base, 8ee1b5be) is still
//     read. A key that stops being read is a readout that silently left the screen.
//   - CONTROLS: the READY / pause card and the one touch overlay are still the host's, for the same mode.
//   - THE SYSTEM: the HUD sits in <HudFrame>, and the host draws no sub-floor text (text-[9px]/[10px]/[11px]), no raw
//     hex colour and no mono face of its own — those are what the 10-foot scale and the one palette replaced.
//
// Add a host here when it migrates; the list below is also the report of which hosts have.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');

/** host file → the HUD keys it read at the base, and the modeId attribute its splash and touch overlay are bound with. */
export const MIGRATED: Record<string, { keys: string[]; modeId: string }> = {
  'board-babylon.tsx': {
    modeId: '{modeKey}',
    keys: 'airLeft airMax balance balanceKind banner chainLink coach coins combo comboLine flow gates goal goalList goals heat hint momentum par pocket pocketHi pocketLo pot score speed split swell target time tube tubeMark tubeOk wallCue waves'.split(' '),
  },
  'football-babylon.tsx': {
    modeId: '"football"',
    keys: 'ballOn banner board boardTitle breakaway breakawayFill breakawayTicks down drive evades fieldLen firstDown hint lane los par prompts score slingshot target toGo truckCool truckReady weather yards'.split(' '),
  },
  'timing-babylon.tsx': {
    modeId: '{modeKey}',
    keys: 'aerial aimCarry banner beatPulse blockReady board boardTitle call card clock club combo cues distance dive energy energyLabel feints flicks flow foeRackets foeScore goals hole holes homers instruments kickPower kickShape kickZones kicksThem kicksYou kinetic longest meterCarry meterT meterTicks mic micWho mult outs outsCap pad par pin pitch powerLock rackets rings rivalHomers round score shotMeterBands shotMeterT streak strokes style swingPhase targets them themGoals weather wind windDeg windWord you'.split(' '),
  },
};

/** Shared HUD pieces a migrated host draws through, held to the same rules. */
const PIECES = ['timing-prompt.tsx'];

const keyRead = (src: string, k: string) => new RegExp(`hud\\.${k}\\b|hud\\[['"]${k}['"]\\]`).test(src);

describe.each(Object.entries(MIGRATED))('%s on the TV HUD', (file, spec) => {
  const src = read(file);

  it('still reads every HUD key it read before (no readout left the screen)', () => {
    const lost = spec.keys.filter((k) => !keyRead(src, k));
    expect(lost).toEqual([]);
  });

  it('keeps its READY / pause card and its touch overlay, for the same mode', () => {
    expect(src).toMatch(/<BootSplash\b/);
    expect(src).toMatch(/<TouchOverlay\b/);
    const binds = [...src.matchAll(/<(?:BootSplash|TouchOverlay)\b[^>]*?\bmodeId=(\{[\w.]+\}|"[\w-]+")/g)].map((m) => m[1]);
    expect(binds.length).toBeGreaterThanOrEqual(2);
    for (const b of binds) expect(b).toBe(spec.modeId);
  });

  it('draws its HUD inside the frame, and the splash, pause and touch deck outside it', () => {
    expect(src).toMatch(/from '\.\/tv-hud'/);
    const open = src.indexOf('<HudFrame>'), close = src.indexOf('</HudFrame>');
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    for (const tag of ['<BootSplash', '<TouchOverlay']) {
      const at = src.indexOf(tag);
      expect(at < open || at > close, `${tag} must stay the host's direct child`).toBe(true);
    }
  });

  it('no sub-floor text, no raw hex colour, no mono face: the scale and the palette replaced them', () => {
    expect(src).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\bfont-mono\b/);
  });
});

describe.each(PIECES)('%s (a piece a migrated host draws through)', (file) => {
  it('is on the system too', () => {
    const src = read(file);
    expect(src).toMatch(/from '\.\/tv-hud'/);
    expect(src).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\bfont-mono\b/);
  });
});
