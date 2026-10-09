// THE FLIGHT GATE (owner, 2026-10-06 round 2: "Flight first unlocks after Chapter 1's boss (first fusion is the Ch1
// finale)"; A4's handoff: "a flightUnlocked gate from save.story.flags; A3's beginFusion sets grantsFlight only when
// true, and partner.mountCanFly checks it too"). Played on a real host with all five systems.
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, type AdventureSave, type MoveInput } from '../contracts';
import { AdventureHost } from '../host/AdventureHost';
import { buildSandbox, sandboxWorldSource } from '../world/sandbox';
import { sandboxPartner } from '../world/sandboxSetup';
import { FLAG_FLIGHT_UNLOCKED, FLAG_FUSION_UNLOCKED, flightUnlockedIn, storyGates } from './flags';

function party(o: { flags?: Record<string, boolean>; gated?: boolean } = {}) {
  const save: AdventureSave = emptyAdventureSave(0);
  save.partner = sandboxPartner('creature');      // a flyable creature at bond 40 (tier 2): only the gate can say no
  Object.assign(save.story.flags, o.flags ?? {});
  const spec = buildSandbox();
  const host = new AdventureHost({
    world: sandboxWorldSource(spec), save, playerSpawn: spec.player, partnerSpawn: spec.partner, seed: 3,
    ...(o.gated === false ? {} : storyGates(save)),
  });
  let press: Partial<MoveInput> = {};
  host.setInputSource(host.playerId, (out) => { Object.assign(out, press); press = {}; });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) host.tick(); };
  const ready = () => { host.player.fusion.meter = 1; host.player.stats.energy.cur = host.player.stats.energy.max; };
  const fuse = () => { ready(); press = { fuse: true }; tick(2); };
  const tryFly = () => { press = { jump: true, jumpHeld: true }; tick(10); press = { jump: true, jumpHeld: true }; tick(30); };
  return { save, host, tick, fuse, tryFly, set: (p: Partial<MoveInput>) => { press = p; } };
}

describe('the story locks fusion and flight until the Chapter 1 finale', () => {
  it('before the finale (no flags): the fuse button never fuses (refusal "locked"), a flying mount may not fly', () => {
    const { host, fuse } = party();
    tick0(host);
    fuse();
    expect(host.player.fusion.active).toBe(false);
    expect(host.partner!.lastFuseRefusal()).toBe('locked');
    expect(host.partner!.mountCanFly(host.partnerId!)).toBe(false);
  });

  it('fusion unlocked but flight not: the party fuses, the fusion does NOT grant flight, and the body never takes off', () => {
    const { host, fuse, tryFly } = party({ flags: { [FLAG_FUSION_UNLOCKED]: true } });
    tick0(host);
    fuse();
    expect(host.player.fusion.active).toBe(true);
    expect(host.player.fusion.grantsFlight).toBe(false);
    tryFly();
    expect(host.player.state).not.toBe('flight');
  });

  it('after the finale (both flags): the fusion grants flight and the body flies; the mount may fly', () => {
    const { host, fuse, tryFly } = party({ flags: { [FLAG_FUSION_UNLOCKED]: true, [FLAG_FLIGHT_UNLOCKED]: true } });
    tick0(host);
    expect(host.partner!.mountCanFly(host.partnerId!)).toBe(true);
    fuse();
    expect(host.player.fusion.grantsFlight).toBe(true);
    tryFly();
    expect(host.player.state).toBe('flight');
  });

  it('the gate reads the save LIVE: a flag set mid-play counts on the next fusion', () => {
    const { host, save, fuse } = party({ flags: { [FLAG_FUSION_UNLOCKED]: true } });
    tick0(host);
    fuse();
    expect(host.player.fusion.grantsFlight).toBe(false);
    host.partner!.storyFuse();   // pending, but already fused: a no-op
    host.tick();
    expect(host.partner!.storyFusePending()).toBe(false);
    save.story.flags[FLAG_FLIGHT_UNLOCKED] = true;
    expect(flightUnlockedIn(save.story.flags)).toBe(true);
    expect(host.partner!.mountCanFly(host.partnerId!)).toBe(true);
  });

  it('the yard and the BR pass no gate: the toolkit is whole (A3\'s defaults unchanged)', () => {
    const { host, fuse, tryFly } = party({ gated: false });
    tick0(host);
    fuse();
    expect(host.player.fusion.grantsFlight).toBe(true);
    tryFly();
    expect(host.player.state).toBe('flight');
  });
});

describe('the story fusion (the first fusion is a scene, not a meter)', () => {
  it('fuses whatever the meter, the bond and the energy say, with the flight gate as it stands, and stands a downed partner up first', () => {
    const { host, save } = party();
    tick0(host);
    const q = host.partnerActor!;
    host.partner!.def().bond = 0;
    host.player.stats.energy.cur = 0;
    q.stats.hp.cur = 0;                                           // the partner is down when the scene asks
    save.story.flags[FLAG_FUSION_UNLOCKED] = true; save.story.flags[FLAG_FLIGHT_UNLOCKED] = true;
    host.partner!.storyFuse();
    for (let i = 0; i < 10 && !host.player.fusion.active; i++) host.tick();
    expect(q.stats.hp.cur).toBeGreaterThan(0);
    expect(host.player.fusion.active).toBe(true);
    expect(host.player.fusion.grantsFlight).toBe(true);
    expect(host.player.fusion.tier).toBeGreaterThanOrEqual(1);
    // the flight home starts full (the fused max then grows by the tier's bonus, A3's stats system)
    expect(host.player.stats.energy.cur).toBeGreaterThanOrEqual(host.player.stats.energy.max - 10 * host.player.fusion.tier - 1e-6);
    expect(host.partner!.storyFusePending()).toBe(false);
  });
});

/** Let the systems link the party (A3 links on its first step). */
function tick0(host: AdventureHost): void { host.tick(); host.tick(); }
