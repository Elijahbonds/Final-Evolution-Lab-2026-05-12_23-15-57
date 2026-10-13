// vis-foundation-2 A9.11 — the live sky on the photograph domes, and the haze over the procedural worlds.
import { describe, expect, it } from 'vitest';
import { Color3, MeshBuilder, NullEngine, Scene, StandardMaterial, Texture } from '@babylonjs/core';
import { BAKE_HORIZON_Y, SKY_LOOKS, SUN_GLOW, bakeKeyOf, mountSkyDome, skyDomeWanted, towardSun } from './SkyDome';
import { HAZE, HAZE_DENSITY, atmosphereWanted, hazeAt, mountAtmosphere } from './Atmosphere';
import { MOODS, type VenueMood } from './moods';

describe('the sky looks', () => {
  it('reads which photograph a dome shows, through the washed and recomposed copies', () => {
    expect(bakeKeyOf({ url: '/backdrops/baked/ocean.jpg' })).toBe('ocean');
    expect(bakeKeyOf({ name: 'bk_dome_goldenHour' }, 'beach')).toBe('beach');   // a washed copy: the dome's own note says which
    expect(bakeKeyOf({ name: 'bk_dome_alpine' })).toBe('mountains');           // AlpineSky's 4096 recompose
    expect(bakeKeyOf({ name: 'skyTex' })).toBe('painted');
    expect(bakeKeyOf(null)).toBe('painted');
  });
  it('never blurs a bake whose silhouettes reach the top of the frame, nor clouds over them', () => {
    for (const k of ['mountains', 'neon', 'dojo']) expect(SKY_LOOKS[k].soften, k).toBe(0);
    expect(SKY_LOOKS.mountains.cloudFrom).toBeGreaterThan(0.5);
    expect(SKY_LOOKS.dojo.clouds).toBe(0);
  });
  it('the sun in the sky is where the light comes from', () => {
    for (const m of Object.keys(MOODS) as VenueMood[]) {
      const s = towardSun(m), d = MOODS[m].sunDir;
      expect(s.y, m).toBeGreaterThan(0);                                  // above the horizon
      expect(s.x * d[0] + s.y * d[1] + s.z * d[2], m).toBeLessThan(0);   // opposite the direction the light travels
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 9);
      expect(SUN_GLOW[m], m).toBeGreaterThanOrEqual(0);
    }
    expect(SUN_GLOW.nightGame).toBe(0);   // the night's key light is no sun
  });
  it('the bakes\' horizon sits below eye level (v = 0.6 on the dome)', () => {
    expect(BAKE_HORIZON_Y).toBeCloseTo(-0.309, 3);
  });
});

describe('mountSkyDome', () => {
  const dome = (s: Scene, name = 'bk_dome') => {
    const d = MeshBuilder.CreateSphere(name, { diameter: 40 }, s);
    const m = new StandardMaterial(`${name}_m`, s); m.emissiveTexture = new Texture('/backdrops/baked/beach.jpg', s); m.disableLighting = true;
    d.material = m; return d;
  };
  it('goes on desktop and high for a mode the look reaches; never on phones or a held hoops mode', () => {
    expect(skyDomeWanted('desktop', 'sprint')).toBe(true);
    expect(skyDomeWanted('high', null)).toBe(true);
    expect(skyDomeWanted('mobile', 'sprint')).toBe(false);
    expect(skyDomeWanted('high', 'dunk')).toBe(false);
    expect(skyDomeWanted('high', 'sprint', true)).toBe(false);
  });
  it('plugs into the domes\' own materials (both skies) and comes off again', () => {
    const s = new Scene(new NullEngine());
    const a = dome(s), b = dome(s, 'nexus_sky');
    const h = mountSkyDome(s, 'goldenHour', 'desktop')!;
    expect(h.meshes).toEqual([b, a]);
    expect(h.keys).toEqual(['beach', 'beach']);
    expect(a.material!.pluginManager?.getPlugin('FELSky')).toBeTruthy();
    expect(a.material!.getClassName()).toBe('StandardMaterial');   // the material object stays: AlpineSky and WeatherFx still find it
    h.dispose();
    expect((a.material!.pluginManager?.getPlugin('FELSky') as unknown as { isEnabled: boolean } | null)?.isEnabled ?? false).toBe(false);
  });
  it('nothing to do without a dome; nothing on mobile', () => {
    const s = new Scene(new NullEngine());
    expect(mountSkyDome(s, 'daylight', 'high')).toBeNull();
    dome(s);
    expect(mountSkyDome(s, 'daylight', 'mobile')).toBeNull();
  });
});

describe('the haze (aerial perspective)', () => {
  it('leaves the play area alone and hazes the far world', () => {
    for (const m of Object.keys(MOODS) as VenueMood[]) {
      if (!HAZE_DENSITY[m]) continue;
      expect(hazeAt(m, 30), m).toBeLessThan(0.02);
      expect(hazeAt(m, 50), m).toBeLessThan(0.05);
      expect(hazeAt(m, 250), m).toBeGreaterThan(0.3);
    }
    expect(HAZE_DENSITY.indoorArena).toBe(0);
  });
  it('is never dark by day (the old fog blacked out high cameras)', () => {
    for (const m of ['goldenHour', 'daylight', 'alpine', 'overcast'] as VenueMood[]) {
      const c = Color3.FromHexString(HAZE[m]);
      expect(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, m).toBeGreaterThan(0.45);
    }
  });
  it('only where nobody else owns the fog: no venue sky, fog still off, not a held mode', () => {
    const base = { fogMode: Scene.FOGMODE_NONE, hasVenueSky: false, modeId: 'sprint', mood: 'daylight' as VenueMood };
    expect(atmosphereWanted(base)).toBe(true);
    expect(atmosphereWanted({ ...base, fogMode: Scene.FOGMODE_EXP2 })).toBe(false);   // a weather's fog, a spec venue's
    expect(atmosphereWanted({ ...base, hasVenueSky: true })).toBe(false);
    expect(atmosphereWanted({ ...base, modeId: 'threepoint' })).toBe(false);
    expect(atmosphereWanted({ ...base, mood: 'indoorArena' })).toBe(false);
    expect(atmosphereWanted({ ...base, off: true })).toBe(false);
  });
  it('mounts the EXP2 haze and puts the fog back as it was on dispose', () => {
    const s = new Scene(new NullEngine());
    const h = mountAtmosphere(s, 'goldenHour')!;
    expect(s.fogMode).toBe(Scene.FOGMODE_EXP2);
    expect(s.fogDensity).toBe(HAZE_DENSITY.goldenHour);
    expect(s.fogColor.toHexString().toLowerCase()).toBe(HAZE.goldenHour.toLowerCase());
    h.dispose();
    expect(s.fogMode).toBe(Scene.FOGMODE_NONE);
  });
});
