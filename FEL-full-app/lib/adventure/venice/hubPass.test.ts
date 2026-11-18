// venice-v1 improvement pass (2026-11-17): the pure parts of phases 5–8 — the park furniture's layout, the life's paths and the
// soundscape's clock.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { benchSpots, FENCE, fenceRuns, postsAlong, RING, VENICE_LOOK_V2 } from './courtsDressing';
import { hoopAt, hubSolids, inCourtPlace, probeRoute, v1Hit, VENICE_SOLIDS, Walkup, WALKUP_DWELL, WALKUP_V2 } from './hubSolids';
import { gullAt, GULLS, VENICE_LIFE, watchersVenue } from './hubLife';
import { distanceGain, farGames, HubSoundscape, panFor, STEP, surfaceUnder, VENICE_SOUND, type HubCue } from './hubSound';
import { buildHubWorld, courtsRect, returnSpawnFor, v1Area, v1Spots } from './hubWorld';
import { COURT_HALF } from './courtsView';
import { hubPos, VENICE_WAYFINDING, wayfindingOn } from './hubUi';
import { FirstVisitHint, toMap } from '@/app/play/venice/wayfinding';
import { CARD_BEYOND_M, layoutSeats, pastLine } from '@/lib/babylon/visual/crowd/crowdLayout';

describe('phase 5: the fences leave the walk-up side open', () => {
  it('each court is fenced west, north and south, round the court with room to spare', () => {
    for (const s of v1Spots()) {
      const runs = fenceRuns(s.at[0], s.at[1]);
      expect(runs).toHaveLength(3);
      for (const [x0, , x1] of runs) expect(Math.max(x0, x1)).toBeLessThanOrEqual(s.at[0] + FENCE.halfW);
      expect(FENCE.halfW).toBeGreaterThan(COURT_HALF.w);
      expect(FENCE.halfL).toBeGreaterThan(COURT_HALF.l);
      // the walk-up ring (the east sideline, VeniceHubMode's walkTo) is outside every fence run
      const ringX = s.at[0] + COURT_HALF.w + 3;
      expect(ringX).toBeGreaterThan(s.at[0] + FENCE.halfW);
    }
  });
  it('posts run the whole length at about the post spacing, ends included', () => {
    const run = fenceRuns(0, 0)[0];
    const p = postsAlong(run);
    expect(p[0]).toEqual([run[0], run[1]]);
    expect(p.at(-1)).toEqual([run[2], run[3]]);
    expect((2 * FENCE.halfL) / (p.length - 1)).toBeLessThan(FENCE.postEvery * 1.3);
  });
  it('ships on (1) and its off value is V1', () => { expect(VENICE_LOOK_V2).toBe(1); });
});

describe('phase 6: life', () => {
  it('the gulls fly over the sand and the water, on the west side of the courts, at gull height', () => {
    const seaX = v1Area().minX, c = courtsRect();
    for (let i = 0; i < GULLS.desktop; i++) for (const t of [0, 7, 31, 120]) {
      const [x, y] = gullAt(i, t, seaX);
      expect(x).toBeLessThan((c.minX + c.maxX) / 2);
      expect(y).toBeGreaterThan(12);
      expect(y).toBeLessThan(25);
    }
    expect(GULLS.phone).toBeLessThanOrEqual(GULLS.desktop / 2);
  });
  it('the watchers stand off the courts (outside every fence) and the run has the most', () => {
    const seats = layoutSeats(watchersVenue(), 23);
    expect(seats.length).toBeGreaterThan(10);
    for (const seat of seats) {
      for (const s of v1Spots()) {
        const inside = Math.abs(seat.pos[0] - s.at[0]) < FENCE.halfW && Math.abs(seat.pos[2] - s.at[1]) < FENCE.halfL;
        expect(inside).toBe(false);
      }
      expect(pastLine(seat.pos, watchersVenue().camera)).toBeGreaterThan(watchersVenue().camera.margin);
    }
    // every watcher is near enough the eye to be a body on desktop, never a card
    for (const seat of seats) expect(seat.dist).toBeLessThan(CARD_BEYOND_M);
    const run = seats.filter((x) => x.stand === 'venice_run_line').length;
    expect(run).toBeGreaterThan(seats.length / 2);
  });
  it('ships on (1)', () => { expect(VENICE_LIFE).toBe(1); });
});

describe('phase 7: the soundscape', () => {
  it('the courts slab and the bike path are hard, the margins are sand', () => {
    const c = courtsRect(), a = v1Area();
    expect(surfaceUnder((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2)).toBe('concrete');
    expect(surfaceUnder(c.maxX + 6, (c.minZ + c.maxZ) / 2)).toBe('concrete');
    expect(surfaceUnder(a.minX + 2, (a.minZ + a.maxZ) / 2)).toBe('sand');
  });
  it('distance and pan behave', () => {
    expect(distanceGain(2)).toBe(1);
    expect(distanceGain(80)).toBeLessThan(distanceGain(20));
    expect(distanceGain(500)).toBe(0);
    expect(panFor(0, 0, 0, 10, 0)).toBeCloseTo(1);    // facing +z, a source at +x is to the right
    expect(panFor(0, 0, 0, -10, 0)).toBeCloseTo(-1);
    expect(Math.abs(panFor(0, 0, 0, 0, 10))).toBeLessThan(1e-9);
  });
  it('the far games are outside the walkable park', () => {
    const a = v1Area();
    for (const [x, z] of farGames()) expect(x < a.minX || x > a.maxX || z < a.minZ || z > a.maxZ).toBe(true);
  });
  it('a step every 0.8 m on the ground, louder on concrete, none standing still or in the air', () => {
    const cues: Array<{ n: HubCue; v: number; tag: string }> = [];
    const s = new HubSoundscape((n, o) => cues.push({ n, v: o.volume, tag: o.tag }), () => 0.5);
    const c = courtsRect(), mid = { x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2 };
    for (let i = 0; i < 60; i++) s.update(1 / 60, { ...mid, speed: 4, grounded: true }, 0);   // 1 s at 4 m/s on concrete
    const hard = cues.filter((x) => x.tag === 'venice.step');
    expect(hard.length).toBeGreaterThanOrEqual(Math.floor(4 / STEP.every) - 1);
    expect(hard.every((x) => x.v === STEP.concrete.volume)).toBe(true);
    cues.length = 0;
    for (let i = 0; i < 60; i++) s.update(1 / 60, { ...mid, speed: 0, grounded: true }, 0);
    for (let i = 0; i < 60; i++) s.update(1 / 60, { ...mid, speed: 5, grounded: false }, 0);
    expect(cues.filter((x) => x.tag === 'venice.step')).toHaveLength(0);
    const a = v1Area();
    for (let i = 0; i < 60; i++) s.update(1 / 60, { x: a.minX + 2, z: mid.z, speed: 4, grounded: true }, 0);
    const soft = cues.filter((x) => x.tag === 'venice.step');
    expect(soft.length).toBeGreaterThan(0);
    expect(soft.every((x) => x.v === STEP.sand.volume && x.v < STEP.concrete.volume)).toBe(true);
  });
  it('the far games dribble then shoot; the run reacts; all quiet with distance', () => {
    const cues: Array<{ n: HubCue; v: number; tag: string }> = [];
    const s = new HubSoundscape((n, o) => cues.push({ n, v: o.volume, tag: o.tag }), () => 0.5);
    const c = courtsRect();
    for (let i = 0; i < 60 * 40; i++) s.update(1 / 60, { x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2, speed: 0, grounded: true }, 0);
    const games = cues.filter((x) => x.tag === 'venice.game');
    expect(games.some((x) => x.n === 'bounce')).toBe(true);
    expect(games.some((x) => x.n === 'swish' || x.n === 'rattle' || x.n === 'clang')).toBe(true);
    expect(games.every((x) => x.v < 0.5)).toBe(true);   // distant: under the cue's own level
    expect(cues.some((x) => x.tag === 'venice.run' && x.n === 'crowdCheer')).toBe(true);
  });
  it('ships on (1)', () => { expect(VENICE_SOUND).toBe(1); });
});

describe('phase 8: solids and the walk-up', () => {
  const spots = v1Spots();
  const inside = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, pad = 0.5) =>
    x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
  it('nothing solid stands on a ring, on a return spawn, or on the cold-start spawn', () => {
    const solids = hubSolids(spots, true);
    const w = buildHubWorld();
    for (const s of spots) {
      const ring: [number, number] = [s.at[0] + COURT_HALF.w + RING.out, s.at[1]];
      const back = returnSpawnFor(s.id)!.pos;
      for (const b of solids) {
        expect(inside(b, ring[0], ring[1], RING.r)).toBe(false);
        expect(inside(b, back.x, back.z)).toBe(false);
        expect(inside(b, w.spawn.pos.x, w.spawn.pos.z)).toBe(false);
      }
    }
  });
  it('the fences are walls (above the step) and leave the walk-up side open; the hoop is solid with or without the furniture', () => {
    const solids = hubSolids(spots, true);
    for (const s of spots) {
      const fence = solids.filter((b) => b.id.startsWith(`venice.fence.${s.id}`));
      expect(fence).toHaveLength(3);
      for (const f of fence) expect(f.top).toBeGreaterThan(1);
      // walking in from the ring to the court centre crosses no solid
      const from: [number, number] = [s.at[0] + COURT_HALF.w + RING.out, s.at[1]];
      for (let k = 0; k <= 20; k++) {
        const x = from[0] + (s.at[0] - from[0]) * (k / 20);
        for (const b of solids) expect(inside(b, x, s.at[1], 0.3)).toBe(false);
      }
      expect(hubSolids(spots, false).some((b) => b.id === `venice.hoop.${s.id}`)).toBe(true);
      const [hx, hz] = hoopAt(s);
      expect(Math.abs(hz - s.at[1])).toBeLessThan(COURT_HALF.l);
      expect(hx).toBe(s.at[0]);
    }
    expect(hubSolids(spots, false).some((b) => b.id.startsWith('venice.fence'))).toBe(false);
  });
  it('benches stand clear of the ring on the open sideline', () => {
    for (const s of spots) for (const [x, z] of benchSpots(s)) {
      expect(x).toBeGreaterThan(s.at[0] + FENCE.halfW);
      expect(Math.abs(z - s.at[1])).toBeGreaterThan(RING.r + 1);
    }
    expect(benchSpots(spots.find((s) => s.id === 'court.run')!)).toHaveLength(4);
  });
  it('V2 walk-up: not behind the fence; on the court or in the ring after the dwell; held a metre past', () => {
    const s = spots[0];
    // V1 offered the game behind the west fence; V2 does not
    expect(v1Hit(spots, s.at[0] - FENCE.halfW - 2, s.at[1])?.id).toBe(s.id);
    expect(inCourtPlace(s, s.at[0] - FENCE.halfW - 2, s.at[1])).toBe(false);
    const w = new Walkup(spots);
    const ringX = s.at[0] + COURT_HALF.w + RING.out;
    expect(w.step(0.1, ringX, s.at[1])).toBeNull();                   // arrived: dwelling
    let shown = null;
    for (let t = 0; t < WALKUP_DWELL + 0.1; t += 0.1) shown = w.step(0.1, ringX, s.at[1]);
    expect(shown?.id).toBe(s.id);
    expect(w.step(0.1, ringX + RING.r + 1.6, s.at[1])?.id).toBe(s.id); // just past the ring: held
    expect(w.step(0.1, ringX + RING.r + 3, s.at[1])).toBeNull();        // well past: gone
  });
  it('the probes\' route to each ring, from the gate and from every other ring, crosses no solid', () => {
    const solids = hubSolids(spots, true), w = buildHubWorld();
    const starts = [{ x: w.spawn.pos.x, z: w.spawn.pos.z }, ...spots.map((s) => ({ x: s.at[0] + COURT_HALF.w + RING.out, z: s.at[1] }))];
    for (const from of starts) for (const to of spots) {
      const legs = [from, ...probeRoute(spots, from, to)];
      for (let i = 1; i < legs.length; i++) for (let k = 0; k <= 60; k++) {
        const x = legs[i - 1].x + (legs[i].x - legs[i - 1].x) * (k / 60), z = legs[i - 1].z + (legs[i].z - legs[i - 1].z) * (k / 60);
        for (const b of solids) expect(inside(b, x, z, 0.45), `${to.id} via (${x.toFixed(1)}, ${z.toFixed(1)}) hits ${b.id}`).toBe(false);
      }
    }
  });
  it('ship on (1)', () => { expect(VENICE_SOLIDS).toBe(1); expect(WALKUP_V2).toBe(1); });
});

describe('V2 phase 1: a phone\'s watchers are a few real people', () => {
  it('six seats, every one a fan at the crowd\'s desktop tier (none a card), off every fence', async () => {
    const { phoneWatchersVenue, PHONE_WATCHERS, VENICE_PHONE_WATCHERS } = await import('./hubLife');
    const { splitSeats } = await import('@/lib/babylon/visual/crowd/crowdLayout');
    const seats = layoutSeats(phoneWatchersVenue(), 23);
    expect(seats).toHaveLength(PHONE_WATCHERS.run + PHONE_WATCHERS.ones);
    expect(seats.length).toBeGreaterThanOrEqual(4);
    expect(seats.length).toBeLessThanOrEqual(6);
    const { fans, cards } = splitSeats(seats, 'desktop');
    expect(fans).toHaveLength(seats.length);
    expect(cards).toHaveLength(0);
    for (const seat of seats) for (const s of v1Spots()) {
      expect(Math.abs(seat.pos[0] - s.at[0]) < FENCE.halfW && Math.abs(seat.pos[2] - s.at[1]) < FENCE.halfL).toBe(false);
    }
    expect(VENICE_PHONE_WATCHERS).toBe(1);
  });
});

describe('V2 phase 2: the shootaround', () => {
  it('dribble → jump shot → the ball reaches the rim → follow-through → back out → next spot, on loop', async () => {
    const { CourtShootaround, rimOf, BEAT, COURT_LIFE, VENICE_COURT_LIFE, joggerPath } = await import('./courtLife');
    const court = v1Spots().find((s) => s.id === 'court.arc')!;
    const run = new CourtShootaround(court, true, 3);
    const clips: string[] = [], cues: string[] = [];
    let atRim = false;
    const rim = rimOf(court);
    const cycle = BEAT.dribble + BEAT.rise + BEAT.flight + BEAT.drop + BEAT.toRebounder + BEAT.pass + BEAT.settle;
    for (let i = 0; i < Math.ceil((cycle * 3) / (1 / 60)); i++) {
      const f = run.step(1 / 60);
      if (f.shooterClip) clips.push(f.shooterClip);
      if (f.cue) cues.push(f.cue.name);
      if (f.phase === 'drop' && Math.hypot(f.ball[0] - rim[0], f.ball[2] - rim[2]) < 0.3 && Math.abs(f.ball[1] - rim[1]) < 0.4) atRim = true;
      expect(f.ball[1]).toBeGreaterThan(0);
      // the shooter stays on the court
      expect(Math.abs(f.shooter[0] - court.at[0])).toBeLessThan(COURT_HALF.w);
      expect(Math.abs(f.shooter[1] - court.at[1])).toBeLessThan(COURT_HALF.l);
    }
    expect(atRim).toBe(true);
    expect(clips.slice(0, 4)).toEqual(['jumpshot', 'bball_follow_through', 'catch_pass', 'bball_dribble_idle']);
    expect(cues).toContain('bounce');
    expect(cues.some((c) => c === 'swish' || c === 'rattle' || c === 'clang')).toBe(true);
    // a phone: none (measured over the row's draw budget; desktop keeps the shootaround)
    expect(COURT_LIFE.phone.courts.length).toBe(0);
    expect(COURT_LIFE.desktop.courts.length).toBeGreaterThan(0);
    expect(COURT_LIFE.phone.rebounders).toBe(false);
    expect(COURT_LIFE.phone.joggers).toBe(0);
    const p = joggerPath();
    expect(p.z1).toBeGreaterThan(p.z0);
    expect(VENICE_COURT_LIFE).toBe(1);
  });
  it('every clip the court life plays is allowed by the hub\'s clip scope', async () => {
    const { scopeAllows, scopeForMode } = await import('@/lib/babylon/anim/clipScope');
    const scope = scopeForMode('venice_hub');
    for (const c of ['jumpshot', 'bball_follow_through', 'catch_pass', 'bball_dribble_idle', 'bball_hand_up', 'bball_idle_stand', 'run']) expect(scopeAllows(scope, c), c).toBe(true);
  });
});

describe('V2 phase 3: the camera blockers', () => {
  it('cover every fence, pole and board post, the four boards and the boardwalk row; leave the benches to the camera', async () => {
    const { camBlockPieces, VENICE_CAM_COLLIDE } = await import('./courtsDressing');
    const solids = hubSolids(v1Spots(), true);
    const withFences = camBlockPieces(solids, true, true), pieces = camBlockPieces(solids);
    const covered = (set: typeof pieces, b: { minX: number; maxX: number; minZ: number; maxZ: number }) => set.some((p) => p.minX <= b.minX && p.maxX >= b.maxX && p.minZ <= b.minZ && p.maxZ >= b.maxZ);
    for (const b of solids) {
      if (/bench/.test(b.id)) expect(covered(withFences, b)).toBe(false);
      else expect(covered(withFences, b), b.id).toBe(true);
      // the shipped level leaves the see-through fences to the camera
      if (/fence/.test(b.id)) expect(pieces.some((p) => p.id === b.id)).toBe(false);
      else if (!/bench/.test(b.id)) expect(covered(pieces, b), b.id).toBe(true);
    }
    expect(withFences.length).toBe(solids.filter((b) => !/bench/.test(b.id)).length + v1Spots().length);
    // nothing in the camera's way where a player stands at a ring
    for (const s of v1Spots()) {
      const rx = s.at[0] + COURT_HALF.w + RING.out;
      for (const p of pieces) expect(rx > p.minX - 0.5 && rx < p.maxX + 0.5 && s.at[1] > p.minZ - 0.5 && s.at[1] < p.maxZ + 0.5).toBe(false);
    }
    expect(VENICE_CAM_COLLIDE).toBe(1);
  });
});

describe('phase 9: finding your way', () => {
  it('ships the wayfinding layer on by default', () => {
    expect(VENICE_WAYFINDING).toBe(1);
    expect(wayfindingOn()).toBe(true);
  });

  it('maps Venice north-up with the sea on the left', () => {
    const a = v1Area();
    const nw = toMap(a.minX, a.minZ);
    const sw = toMap(a.minX, a.maxZ);
    const ne = toMap(a.maxX, a.minZ);
    expect(nw[0]).toBeLessThan(ne[0]);
    expect(nw[1]).toBeLessThan(sw[1]);
    expect(nw[0]).toBe(0);
    expect(nw[1]).toBe(0);
  });

  it('publishes the player marker only when it has really moved, and resets on dispose', () => {
    hubPos.reset();
    let heard = 0;
    const off = hubPos.subscribe(() => { heard += 1; });
    hubPos.set(10, 20, 0.1);
    expect(hubPos.getSnapshot()).toEqual({ x: 10, z: 20, yaw: 0.1 });
    expect(heard).toBe(1);
    hubPos.set(10.1, 20.1, 0.12);
    expect(heard).toBe(1);
    hubPos.set(10.4, 20.1, 0.12);
    expect(hubPos.getSnapshot()).toEqual({ x: 10.4, z: 20.1, yaw: 0.12 });
    expect(heard).toBe(2);
    hubPos.reset();
    expect(hubPos.getSnapshot()).toBeNull();
    expect(heard).toBe(3);
    off();
    hubPos.set(0, 0, 0);
    expect(heard).toBe(3);
    hubPos.reset();
  });

  it('tells desktop and touch players how to reach a court ring', () => {
    const desktop = renderToStaticMarkup(createElement(FirstVisitHint, { onDismiss: () => {}, touch: false }));
    const touch = renderToStaticMarkup(createElement(FirstVisitHint, { onDismiss: () => {}, touch: true }));
    expect(desktop).toContain('Walk with WASD, the arrows or a stick.');
    expect(touch).toContain('Drag anywhere to walk.');
    expect(desktop).toContain('gold ring');
    expect(touch).toContain('gold ring');
    expect(desktop).toContain('Got it');
  });
});
