// NEX-04: the publish gate. A venue with an object on the playing area or in the play camera's corridor, over the phone budget,
// unmeasured on the phone, or less readable than anything the game ships, is refused — with every reason listed. The zones and the
// readability envelope are held to the game's own data here, so they refuse nothing the owner already ships.
import { describe, expect, it } from 'vitest';
import mobileBudget from '../babylon/config/mobileBudget.json';
import { VENUE_SPECS } from '../babylon/nexus/venueSpecs';
import { PLACE_LOOKS } from '../babylon/nexus/placeLooks';
import { crowdVenue } from '../babylon/visual/crowd/crowdVenues';
import { MOBILE_BUDGET } from '../babylon/core/PerfMonitor';
import {
  CORRIDOR_HALF_M, PHONE_GATE, READABLE, cameraCorridor, contrast, insidePolygon, publishGate, standFootprint, touchesArea, touchesPolygon,
  type PhoneSample,
} from './publishGate';
import { PLAYTEST_TARGETS } from './targets';
import { exportVenue } from './exportVenue';
import { newVenue } from './doc';
import { everyKindVenue, placed } from '@/tests/helpers/nexusStudio';

const PHONE_OK: PhoneSample = { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 };   // the demo venue's phone column (§9)

/** The ground distance from p to the segment a–b. */
function segDist(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0], dz = b[1] - a[1]; const l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

describe('the keep-out zones are the modes’ own geometry', () => {
  for (const [key, t] of Object.entries(PLAYTEST_TARGETS)) {
    it(`${key}: the hero's spot and the objective are inside the playing area`, () => {
      expect(touchesArea([t.subject[0], t.subject[2]], 0, t.playArea), 'subject').toBe(true);
      expect(touchesArea([t.objective[0], t.objective[2]], 0, t.playArea), 'objective').toBe(true);
    });
    it(`${key}: every stand the mode's own crowd lays is outside the playing area and the camera corridor`, () => {
      const cv = crowdVenue((key === 'tiebreak' ? 'tennis' : key) as Parameters<typeof crowdVenue>[0])!;   // Tiebreak plays the tennis venue
      expect(cv).toBeTruthy();
      const [cam, focus] = cameraCorridor(t);
      for (const s of cv.stands) {
        for (const p of standFootprint(s)) {
          expect(touchesArea(p, 0, t.playArea), `${s.id} at ${p.map((v) => v.toFixed(1))}`).toBe(false);
          expect(segDist(p, cam, focus), `${s.id} corridor`).toBeGreaterThanOrEqual(CORRIDOR_HALF_M);
        }
      }
    });
    it(`${key}: every prop of every place the owner ships for it is outside the zones`, () => {
      const [cam, focus] = cameraCorridor(t);
      for (const look of PLACE_LOOKS[key] ?? []) {
        for (const p of look.props ?? []) {
          const at: [number, number] = [p.position[0], p.position[2]];
          expect(touchesArea(at, 0.6, t.playArea), `${look.id} ${p.kind}`).toBe(false);
          expect(segDist(at, cam, focus), `${look.id} ${p.kind} corridor`).toBeGreaterThan(CORRIDOR_HALF_M + 0.6);
        }
      }
    });
  }
  it('the court modes’ areas are their venue specs’ grounds', () => {
    const rect = (w: number, d: number) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    const g = (spec: string) => (VENUE_SPECS as Record<string, { ground: { size: [number, number] } }>)[spec].ground.size;
    expect(PLAYTEST_TARGETS.tiebreak.playArea).toEqual([rect(...g('tennis'))]);
    expect(PLAYTEST_TARGETS.volleyball.playArea).toEqual([rect(...g('volleyball'))]);
  });
  it('every polygon is convex (the inside test assumes it)', () => {
    for (const [key, t] of Object.entries(PLAYTEST_TARGETS)) for (const poly of t.playArea) {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        const s = Math.sign(cross);
        if (s && sign && s !== sign) expect.fail(`${key} is not convex at ${b}`);
        sign = sign || s;
      }
    }
  });
  it('geometry: inside either winding, an edge counts, a disc that reaches in counts', () => {
    const sq: Array<[number, number]> = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(insidePolygon([1, 1], sq)).toBe(true);
    expect(insidePolygon([1, 1], [...sq].reverse())).toBe(true);
    expect(insidePolygon([2, 1], sq)).toBe(true);
    expect(insidePolygon([3, 1], sq)).toBe(false);
    expect(touchesPolygon([2.5, 1], 0.6, sq)).toBe(true);
    expect(touchesPolygon([2.7, 1], 0.6, sq)).toBe(false);
  });
});

describe('readability: no worse than what the game ships', () => {
  it('READABLE is the envelope of every shipped venue spec and place look', () => {
    let maxFog = 0, minAmb = Infinity, minCr = Infinity;
    for (const s of Object.values(VENUE_SPECS) as Array<{ environment?: { fogDensity: number; ambient: number }; ground?: { color?: string; lineColor?: string; markings?: string } }>) {
      if (s.environment) { maxFog = Math.max(maxFog, s.environment.fogDensity); minAmb = Math.min(minAmb, s.environment.ambient); }
      if (s.ground?.color && s.ground.lineColor && s.ground.markings !== 'none') minCr = Math.min(minCr, contrast(s.ground.color, s.ground.lineColor));
    }
    for (const list of Object.values(PLACE_LOOKS)) for (const l of list) {
      if (l.sky?.fogDensity !== undefined) maxFog = Math.max(maxFog, l.sky.fogDensity);
      if (l.sky?.ambient !== undefined) minAmb = Math.min(minAmb, l.sky.ambient);
      if (l.ground?.color && l.ground.line) minCr = Math.min(minCr, contrast(l.ground.color, l.ground.line));
    }
    expect(READABLE.maxFogDensity).toBe(maxFog);
    expect(READABLE.minAmbient).toBe(minAmb);
    expect(READABLE.minLineContrast).toBe(Math.floor(minCr * 100) / 100);
  });
  it('contrast is WCAG’s', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe('the gate', () => {
  const clean = () => {
    const v = everyKindVenue();
    v.objects = v.objects.filter((o) => o.type !== 'decal');   // the scuff sits on the near baseline
    v.objects.push(placed('decal:scuff', [-12, 0, 12]));
    return v;
  };
  it('a venue with everything off the court and the lens, measured on the phone under the ceiling, passes', () => {
    expect(publishGate(exportVenue(clean()), PHONE_OK)).toEqual({ ok: true, problems: [] });
  });
  it('the phone ceiling is mobileBudget.json’s (PerfMonitor’s mobile budget), bodies included', () => {
    const c = (mobileBudget as { ceiling: Record<string, number> }).ceiling;
    expect(PHONE_GATE).toEqual({ drawCalls: c.drawCalls, activeMeshes: c.activeMeshes, textureMb: c.textureMb, skinnedBodies: c.skinnedBodies });
    expect(PHONE_GATE.drawCalls).toBe(MOBILE_BUDGET.drawCalls);
  });
  it('an object on the playing area is refused, by name and spot', () => {
    const r = publishGate(exportVenue(everyKindVenue()), PHONE_OK);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.objectContaining({ kind: 'keepOut', zone: 'play', what: 'scuff mark', at: [0.6, 11.4] })]);
    expect(r.problems[0].message).toMatch(/scuff mark at \(0\.6, 11\.4\) is on Tiebreak’s playing area/);
  });
  it('every kind of object is caught on the court: spec prop, kit, scan, fixture, decal, a stand reaching in', () => {
    const v = newVenue('Busy court', { spec: 'tennis', target: 'tiebreak' });
    v.objects = [
      placed('spec:banner', [0, 0, 0]), placed('kit:nature/tree_palmDetailedTall', [3, 0, 5]), placed('meshy:hoopbus', [-3, 0, -5]),
      placed('fixture:lamp', [7, 0, -10]), placed('decal:tyre', [-2, 0, 2]), placed('crowd:bleacher', [-6, 0, -3], Math.PI / 2),
    ];
    const r = publishGate(exportVenue(v), PHONE_OK);
    expect(r.problems.filter((p) => p.kind === 'keepOut').map((p) => (p as { what: string }).what).sort())
      .toEqual(['crowd stand', 'hoopbus', 'lamp light', 'nature tree_palmDetailedTall', 'banner', 'tyre mark'].sort());
  });
  it('an object in front of the play camera (off the field, in the view line) is refused as the camera zone', () => {
    // Football Rush's runner-cam stands 18 m behind the start line (crowdVenues FOOTBALL): a palm between it and the field
    const v = newVenue('Lens', { spec: 'football_rush', target: 'football' });
    v.objects = [placed('kit:nature/tree_palmDetailedTall', [1, 0, -10])];
    const r = publishGate(exportVenue(v), PHONE_OK);
    expect(r.problems).toEqual([expect.objectContaining({ kind: 'keepOut', zone: 'camera' })]);
  });
  it('each target has its own zone: a palm at mid-field is fine beside a tennis court, not on a football field', () => {
    const at: [number, number, number] = [12, 0, 20];
    const tb = newVenue('t', { spec: 'tennis', target: 'tiebreak' }); tb.objects = [placed('kit:nature/tree_palmDetailedTall', at)];
    const fb = newVenue('f', { spec: 'football_rush', target: 'football' }); fb.objects = [placed('kit:nature/tree_palmDetailedTall', at)];
    expect(publishGate(exportVenue(tb), PHONE_OK).ok).toBe(true);
    expect(publishGate(exportVenue(fb), PHONE_OK).problems).toEqual([expect.objectContaining({ kind: 'keepOut', zone: 'play' })]);
  });
  it('the phone budget: unmeasured is refused; each column over the ceiling is refused; at the ceiling passes', () => {
    const exp = exportVenue(clean());
    expect(publishGate(exp, null).problems).toEqual([expect.objectContaining({ kind: 'budgetMissing' })]);
    expect(publishGate(exp, { ...PHONE_GATE }).ok).toBe(true);
    for (const key of ['drawCalls', 'activeMeshes', 'textureMb', 'skinnedBodies'] as const) {
      const r = publishGate(exp, { ...PHONE_OK, [key]: PHONE_GATE[key] + 1 });
      expect(r.problems, key).toEqual([expect.objectContaining({ kind: 'budget', key, ceiling: PHONE_GATE[key] })]);
    }
    expect(publishGate(exp, { ...PHONE_OK, drawCalls: Number.NaN }).ok).toBe(false);
  });
  it('readability: thicker haze, darker light, or lines that vanish into the floor are refused; the shipped extremes pass', () => {
    const at = (over: Partial<ReturnType<typeof clean>>) => publishGate(exportVenue({ ...clean(), ...over }), PHONE_OK);
    const sky = { top: '#0b0f1e', bottom: '#1e1035', fog: '#140c24', sun: '#9ad7ff' };
    expect(at({ sky: { ...sky, fogDensity: READABLE.maxFogDensity, ambient: READABLE.minAmbient } }).ok).toBe(true);
    expect(at({ sky: { ...sky, fogDensity: 0.03 } }).problems).toEqual([expect.objectContaining({ kind: 'readability', what: 'fog' })]);
    expect(at({ sky: { ...sky, ambient: 0.2 } }).problems).toEqual([expect.objectContaining({ kind: 'readability', what: 'ambient' })]);
    expect(at({ ground: { color: '#2b6cb0', line: '#2f70b4' } }).problems).toEqual([expect.objectContaining({ kind: 'readability', what: 'lines' })]);
    // only the line colour set: read against the spec's own floor (tennis #2B6CB0)
    expect(at({ ground: { line: '#2c6db1' } }).problems).toEqual([expect.objectContaining({ kind: 'readability', what: 'lines' })]);
    expect(at({ ground: { color: '#1d3b6e', line: '#bfe9ff' } }).ok).toBe(true);
  });
  it('a venue for no target, or laid over another spec, is refused', () => {
    const exp = exportVenue(clean());
    expect(publishGate({ ...exp, target: 'dunk' }, PHONE_OK).problems).toEqual([expect.objectContaining({ kind: 'target' })]);
    expect(publishGate({ ...exp, spec: 'volleyball' }, PHONE_OK).problems).toEqual([expect.objectContaining({ kind: 'target' })]);
  });
  it('every problem is listed at once', () => {
    const v = everyKindVenue();
    v.sky = { top: '#000000', bottom: '#000000', fog: '#000000', sun: '#ffffff', ambient: 0.1, fogDensity: 0.05 };
    const r = publishGate(exportVenue(v), { ...PHONE_OK, drawCalls: 9999 });
    expect(r.problems.map((p) => p.kind).sort()).toEqual(['budget', 'keepOut', 'readability', 'readability']);
  });
});
