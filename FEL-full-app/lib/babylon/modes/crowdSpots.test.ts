// QA P1-05 (2026-09-27): "4 keepers in soccer, 3 tennis opponents, extras in volleyball". Each mode spawns exactly one
// rival body (PenaltyMode's keeper, NetSportMode's foe; neither respawns per round), and the venue's capsule stand-ins are
// built hidden. The extras were the ONLOOKERS: full athlete bodies idling on spots that stood where players stand — three
// in the goal mouth behind the keeper, three along each sideline 1.8 m outside the tennis glass, a bank 4.2 m past each
// volleyball baseline. The spots are pure now; these hold them off the playing surface and out of the players' places.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GALLERY_CLEAR_M, GALLERY_PER_SIDE, penaltyGallerySpots } from './precisionModes';
import { CROWD_CLEAR_M, CROWD_END_M, CROWD_SIDE_M, netCrowdSpots } from './NetSportMode';
import { GOAL } from '../core/PenaltyKick';
import { TENNIS, VOLLEYBALL } from '../core/RallyCore';
import { glassX } from '../core/ParkourTennis';
import { MAX_BODIES } from '../visual/Onlookers';

describe('the shootout crowd flanks the goal, never stands in its mouth', () => {
  const spots = penaltyGallerySpots();
  it('every spectator is outside the posts by the clearance, and behind the keeper camera', () => {
    for (const p of spots) {
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(GOAL.halfW + GALLERY_CLEAR_M);
      expect(p.z).toBeGreaterThanOrEqual(15.4);   // the keeper round's camera is at z 13.4
    }
  });
  it('both banks are drawn: no more spots than Onlookers keeps, half each side', () => {
    expect(spots.length).toBeLessThanOrEqual(MAX_BODIES);
    expect(spots.filter((p) => p.x < 0)).toHaveLength(spots.length / 2);
  });
  it('the mode mounts GALLERY_PER_SIDE a side (under IMPROVE Penalty #18\'s five bodies), flanking, parked off-camera', () => {
    const live = penaltyGallerySpots(GALLERY_PER_SIDE);
    expect(live).toHaveLength(2 * GALLERY_PER_SIDE);
    expect(live.length).toBeLessThanOrEqual(5);
    for (const p of live) expect(Math.abs(p.x)).toBeGreaterThanOrEqual(GOAL.halfW + GALLERY_CLEAR_M);
    expect(readFileSync(path.resolve(__dirname, 'precisionModes.ts'), 'utf8'))
      .toContain('gallery = new Onlookers(ctx.scene, penaltyGallerySpots(GALLERY_PER_SIDE), undefined, undefined, { pauseOffscreen: true });');
  });
});

describe('the net courts\' crowd stands off the court and out of the cage', () => {
  it('tennis: every sideline spectator is ≥ 3 m outside the glass and ≥ 5 m outside the sideline', () => {
    const { sides, ends } = netCrowdSpots(TENNIS, { cage: true });
    for (const p of sides) {
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(glassX(TENNIS) + CROWD_CLEAR_M);
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(TENNIS.halfWidth + CROWD_SIDE_M);
    }
    expect(ends).toHaveLength(0);
  });
  it('volleyball (the beach): sidelines ≥ 5 m out, the end banks ≥ 8 m past each baseline', () => {
    const { sides, ends } = netCrowdSpots(VOLLEYBALL, { beach: true });
    for (const p of sides) expect(Math.abs(p.x)).toBeGreaterThanOrEqual(VOLLEYBALL.halfWidth + CROWD_SIDE_M);
    expect(ends.length).toBeGreaterThan(0);
    for (const p of ends) expect(Math.abs(p.z)).toBeGreaterThanOrEqual(VOLLEYBALL.halfLength + CROWD_END_M);
  });
});

describe('one rival body per mode', () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8');
  it('the shootout spawns one keeper and the net sports one foe, both in load() only', () => {
    const pen = src('precisionModes.ts');
    const penLoad = pen.slice(pen.indexOf("modeId: 'soccer'"));
    expect(penLoad.match(/keeper = await spawnFoe\(/g)).toHaveLength(1);
    const net = src('NetSportMode.ts');
    expect(net.match(/foe = await CharacterLibrary\.spawn\(/g)).toHaveLength(1);
    // the net sports' only other bodies are the onlookers, at netCrowdSpots
    expect(net).toContain('const spots = netCrowdSpots(o.cfg, { cage: o.cage, beach: o.beach });');
  });
});
