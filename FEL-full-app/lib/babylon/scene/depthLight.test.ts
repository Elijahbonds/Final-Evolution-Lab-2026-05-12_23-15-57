// DEPTH PASS, lane depth-light (phases 1–4, docs/DEPTH-PASS-AUDIT.md lane L): each switch's OFF value is today's look on the real rig
// (NullEngine), and each tier-gated switch stays off the tier it does not belong to.
// (Outdoor moods on desktop/high mount a CascadedShadowGenerator, which NullEngine refuses — the cascade's PCSS is pinned on the source.)
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import { mountLightRig, DESKTOP_PCSS } from './LightRig';
import { VENUE_PROBE_TIERS, venueProbeSize, tierRigSettings } from './QualityTier';
import { PROBE_SIZE, PHONE_PROBE_SIZE } from './VenueReflection';
import { GLOSSY_COURT_ONES, glossyFloorMeshes, glossyFloorWanted } from './GlossyFloor';
import { PHONE_SKY_SOFT, mountSkyDome, skyDomeWanted } from './SkyDome';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';

const scene = () => new Scene(new NullEngine());
const knobs = (o: Record<string, number>) => { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(o)) setFeelOverride(k, v); };
afterEach(() => { resetFeelForTests(); vi.unstubAllGlobals(); });

describe('phase 1: the phone shadow map fitted to the play area (look.phoneShadowFit, look.phoneShadowDepth)', () => {
  const venue = (s: Scene) => {
    const near = MeshBuilder.CreateBox('lamp_near', { size: 1 }, s); near.position.set(3, 1, 2);
    const far = MeshBuilder.CreateBox('lamp_far', { size: 1 }, s); far.position.set(40, 1, 0);
    near.computeWorldMatrix(true); far.computeWorldMatrix(true);   // placed, as by the frames a game draws before captureVenue
    return { near, far };
  };
  it('OFF (today): every caster stays in the phone map and the depth range is the camera\'s', () => {
    const s = scene(); const { near, far } = venue(s);
    const rig = mountLightRig(s, 'dojoWarm', 'mobile');
    rig.captureVenue(Vector3.Zero());
    const list = rig.shadows.getShadowMap()!.renderList!;
    expect(list).toContain(near); expect(list).toContain(far);
    expect(rig.sun.autoCalcShadowZBounds).toBe(false);
  });
  it('ON, mobile: the far caster leaves the map at captureVenue (the near one stays), and the depth range is the casters\'', () => {
    knobs({ 'look.phoneShadowFit': 18, 'look.phoneShadowDepth': 1 });
    const s = scene(); const { near, far } = venue(s);
    const rig = mountLightRig(s, 'dojoWarm', 'mobile');
    rig.captureVenue(Vector3.Zero());
    const list = rig.shadows.getShadowMap()!.renderList!;
    expect(list).toContain(near); expect(list).not.toContain(far);
    expect(rig.sun.autoCalcShadowZBounds).toBe(true);
  });
  it('?look.phoneShadowFit=18 does the same for one load, with no panel (the probes\' A/B and the owner\'s phone check)', async () => {
    vi.stubGlobal('window', { location: { search: '?look.phoneShadowFit=18&look.phoneShadowDepth=1' } });
    const { urlLook } = await import('./QualityTier');
    expect(urlLook('look.phoneShadowFit')).toBe(18); expect(urlLook('look.bodyFormLight')).toBeNull();
    const s = scene(); const { far } = venue(s);
    const rig = mountLightRig(s, 'dojoWarm', 'mobile');
    rig.captureVenue(Vector3.Zero());
    expect(rig.shadows.getShadowMap()!.renderList!).not.toContain(far);
    expect(rig.sun.autoCalcShadowZBounds).toBe(true);
  });
  it('ON, desktop and high: untouched (every caster, the camera\'s range)', () => {
    knobs({ 'look.phoneShadowFit': 18, 'look.phoneShadowDepth': 1 });
    for (const tier of ['desktop', 'high'] as const) {
      const s = scene(); const { far } = venue(s);
      const rig = mountLightRig(s, 'dojoWarm', tier);
      rig.captureVenue(Vector3.Zero());
      expect(rig.shadows.getShadowMap()!.renderList!, tier).toContain(far);
      expect(rig.sun.autoCalcShadowZBounds, tier).toBe(false);
    }
  });
});

describe('phase 2: the body fill is mounted only with look.bodyFormLight on', () => {
  it('OFF: no body light, the hemisphere excludes nothing; ON: the copy is there', () => {
    const off = mountLightRig(scene(), 'dojoWarm', 'mobile');
    expect(off.bodyFill).toBeNull();
    expect(off.hemi.excludedMeshes.length).toBe(0);
    knobs({ 'look.bodyFormLight': 0.6 });
    const on = mountLightRig(scene(), 'dojoWarm', 'desktop');
    expect(on.bodyFill).not.toBeNull();
    expect(on.bodyFill!.light.name).toBe('fel_body_hemi');
  });
});

describe('phase 3: the venue capture by tier (look.venueProbeTiers) and the 1v1 / 3v3 mirror (look.glossyCourtOnes)', () => {
  it('the capture size: 0 is today (high only), 1 adds desktop, 2 adds phones at 128 px; legacy never', () => {
    expect(VENUE_PROBE_TIERS).toBe(0);
    for (const v of [0, 1, 2]) expect(venueProbeSize('high', true, v), `high ${v}`).toBe(PROBE_SIZE);
    expect(venueProbeSize('desktop', false, 0)).toBe(0); expect(venueProbeSize('mobile', false, 0)).toBe(0);
    expect(venueProbeSize('desktop', false, 1)).toBe(PROBE_SIZE); expect(venueProbeSize('mobile', false, 1)).toBe(0);
    expect(venueProbeSize('desktop', false, 2)).toBe(PROBE_SIZE); expect(venueProbeSize('mobile', false, 2)).toBe(PHONE_PROBE_SIZE);
    expect(venueProbeSize('mobile', false, 7)).toBe(0);
    expect(tierRigSettings('desktop', 'goldenHour').venueProbe).toBe(false);   // the tier table itself is unchanged
  });
  it('the rig captures on desktop only with the knob (OFF: captureVenue says no capture)', () => {
    const s = scene(); MeshBuilder.CreateBox('b', {}, s);
    expect(mountLightRig(s, 'dojoWarm', 'desktop').captureVenue(Vector3.Zero())).toBe(false);
    knobs({ 'look.venueProbeTiers': 1 });
    const s2 = scene(); MeshBuilder.CreateBox('b', {}, s2);
    expect(mountLightRig(s2, 'dojoWarm', 'desktop').captureVenue(Vector3.Zero())).toBe(true);
    const s3 = scene(); MeshBuilder.CreateBox('b', {}, s3);
    expect(mountLightRig(s3, 'dojoWarm', 'mobile').captureVenue(Vector3.Zero())).toBe(false);
  });
  it('the mirror: OFF is today; ON adds 1v1 and 3v3 on desktop/high, the painted plane first, never on phones', () => {
    expect(GLOSSY_COURT_ONES).toBe(0);
    expect(glossyFloorWanted('desktop', 'onevone', 'sand')).toBe(false);
    expect(glossyFloorWanted('desktop', 'onevone', 'sand', false, 1)).toBe(true);
    expect(glossyFloorWanted('high', 'threevthree', undefined, false, 1)).toBe(true);
    expect(glossyFloorWanted('mobile', 'onevone', 'sand', false, 1)).toBe(false);
    expect(glossyFloorWanted('desktop', 'tennis', 'sand', false, 1)).toBe(false);
    expect(glossyFloorMeshes('onevone', 0)).toEqual(['venue_ground']);                 // today
    expect(glossyFloorMeshes('onevone', 1)).toEqual(['vb_court_paint', 'venue_ground']); // a wooden-court place still finds its ground
    expect(glossyFloorMeshes('dunk', 1)).toEqual(['vb_court_paint']);
  });
  it('the mirror mounts on the 1v1 painted court with the knob on, on desktop', () => {
    knobs({ 'look.glossyCourtOnes': 1 });
    const s = scene(); (s.metadata ??= {}).felModeId = 'onevone';
    const court = MeshBuilder.CreateGround('vb_court_paint', { width: 10, height: 10 }, s);
    court.material = new PBRMaterial('court_m', s);
    const rig = mountLightRig(s, 'dojoWarm', 'desktop');
    rig.captureVenue(Vector3.Zero());
    expect(rig.glossyFloor?.floor).toBe(court);
  });
});

describe('phase 4: the phone sky (look.phoneSkySoft) and the desktop contact-hardening (look.desktopPcss)', () => {
  const dome = (s: Scene) => {
    const d = MeshBuilder.CreateSphere('bk_dome', { diameter: 40 }, s);
    const m = new StandardMaterial('bk_dome_m', s); m.emissiveTexture = new Texture('/backdrops/baked/beach.jpg', s); m.disableLighting = true;
    d.material = m; return d;
  };
  it('OFF: phones keep the photograph; ON: phones get the plugin with no clouds, no disc, no glow', () => {
    expect(PHONE_SKY_SOFT).toBe(0);
    expect(skyDomeWanted('mobile', 'onevone')).toBe(false);
    expect(skyDomeWanted('mobile', 'onevone', false, 1)).toBe(true);
    const s = scene(); dome(s);
    expect(mountSkyDome(s, 'goldenHour', 'mobile')).toBeNull();
    knobs({ 'look.phoneSkySoft': 1 });
    const s2 = scene(); const d = dome(s2);
    const h = mountSkyDome(s2, 'goldenHour', 'mobile')!;
    expect(h).not.toBeNull();
    const p = d.material!.pluginManager!.getPlugin('FELSky') as unknown as { cover: number; disc: number; glow: number; soften: number; clouds: boolean; hazeAmt: number; blur: number };
    expect(p.cover).toBe(0); expect(p.disc).toBe(0); expect(p.glow).toBe(0); expect(p.clouds).toBe(false);
    expect(p.blur).toBeLessThan(1);   // a narrower soften: the bake's own cloud streaks stay
    expect(p.soften).toBeGreaterThan(0); expect(p.hazeAmt).toBeGreaterThan(0);
  });
  it('the desktop sky is unchanged by the phone knob (clouds compiled in, the bake\'s cover)', () => {
    knobs({ 'look.phoneSkySoft': 1 });
    const s = scene(); const d = dome(s);
    mountSkyDome(s, 'goldenHour', 'desktop');
    const p = d.material!.pluginManager!.getPlugin('FELSky') as unknown as { cover: number; clouds: boolean; glow: number; blur: number };
    expect(p.clouds).toBe(true); expect(p.cover).toBeGreaterThan(0); expect(p.glow).toBeGreaterThan(0); expect(p.blur).toBe(1);
  });
  it('the clouds are compiled out behind FEL_SKY_CLOUDS, and PCSS is the cascades\' alone, off by default', () => {
    const sky = readFileSync(join(__dirname, 'SkyDome.ts'), 'utf8');
    expect(sky).toMatch(/#ifdef FEL_SKY_CLOUDS\s+float felSkyHash/);
    expect(sky).toMatch(/#ifdef FEL_SKY_CLOUDS\s+if \(felSkyCloud\.x > 0\.0/);
    expect(DESKTOP_PCSS).toBe(0);
    const rig = readFileSync(join(__dirname, 'LightRig.ts'), 'utf8');
    const csm = rig.slice(rig.indexOf('if (T.cascaded) {'), rig.indexOf('} else {', rig.indexOf('if (T.cascaded) {')));
    expect(csm).toMatch(/if \(pcss > 0\) \{ csm\.useContactHardeningShadow = true; csm\.contactHardeningLightSizeUVRatio = pcss; \}/);
    expect(rig.split('useContactHardeningShadow').length - 1).toBe(1);   // nowhere else (the phones' single map never)
  });
});
