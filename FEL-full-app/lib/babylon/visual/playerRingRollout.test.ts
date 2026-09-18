// PLAYER RING (all modes, 2026-09-17): "a player indicator with their icon in all modes like we did for 1v1 … the icon
// correlates to the user's creator card". The harness rides every mode's hero reference; a mode's own ring keeps it out.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readPlayerIcon, iconForDiscipline } from './playerIcon';

const src = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

describe('player ring rollout', () => {
  it('the equipped creator card decides the glyph, ahead of the record', () => {
    expect(readPlayerIcon({ id: 'c1', name: 'x', accent: '#fff', mode: 'dance' })).toBe('dance');
    expect(readPlayerIcon({ id: 'c1', name: 'x', accent: '#fff', mode: 'dunk' })).toBe('basketball');
    expect(readPlayerIcon({ id: 'c1', name: 'x', accent: '#fff', mode: 'studio' })).toBe('music');
    expect(readPlayerIcon(null)).toBe('controller');   // no card, no record, no window
    expect(iconForDiscipline('velocitykart')).toBe('controller');
  });
  it('the harness mounts the ring on the hero reference and yields to a mode that owns one', () => {
    const h = src('lib/babylon/core/ModeHarness.ts');
    expect(h).toMatch(/mountPlayerRing\(scene, root, \{ color: card\?\.accent \?\? '#22d3ee', icon: readPlayerIcon\(\), harness: true, radius, y \}\)/);
    expect(h).toContain('|| m.skeleton) continue;');   // the footprint is the unskinned part (a kart's driver is not its chassis)
    expect(h).toContain('new Ray(new Vector3(at.x, at.y + 0.3, at.z), Vector3.Down(), 6)');   // the ring sits on the surface under the root
    expect(h).toContain('modeOwnsPlayerRing(scene)');
    expect(h).toContain('ring?.dispose(); ring = null; ringRoot = null;');
    expect(h).toContain('stamina(v01) { ring?.set(v01); }');
  });
  it('a mode-owned ring marks the scene; the harness ring does not', () => {
    const r = src('lib/babylon/visual/PlayerRing.ts');
    expect(r).toContain('if (!opts.harness) ((scene.metadata ??= {}) as { felPlayerRingMode?: boolean }).felPlayerRingMode = true;');
  });
  it('the boost modes report their tank to the ring', () => {
    for (const m of ['VelocityKartMode', 'AeroAcesMode', 'SkateRunMode']) expect(src(`lib/babylon/modes/${m}.ts`)).toContain('ctx.stamina?.(boost.meter)');
  });
  it('the closet serves the card\'s signature mode, which the identity carries', () => {
    expect(src('app/api/v1/closet/route.ts')).toContain('rarity: true, mode: true }');
    expect(src('lib/babylon/core/playerIdentity.ts')).toContain('export function cachedIdentity()');
  });
});
