// The bonded partner in the BR (ADVENTURE PLAN: "it appears when summoned (one assist of about 8 s on a cooldown, at
// most 4 summoned in the match at once …) and otherwise lives in your fusion and your element"; shards: "a ground mount
// becomes a flyer for the match"; the drop glides in fused).
import { describe, expect, it } from 'vitest';
import { fusionTierFor, neutralInput, type MoveInput } from '../contracts';
import { FUSION_ENERGY_COST, fusionDurationSec } from '../partner/fusion';
import { createCharacterPartner } from '../partner/defs';
import { BRMatch } from './match';
import { ABILITY, BR_BOND, BR_MAX_SUMMONED, SUMMON } from './tuning';
import { landedMatch, put, run } from './testkit';
import { lootById } from './loot';
import { takeLoot } from './kit';

/** A human seat whose next step presses `edge` once (and holds nothing). */
function pressOnce(m: BRMatch, edge: 'partner' | 'fuse'): void {
  let pressed = false;
  m.setInputSource('player', (out: MoveInput) => {
    out.move.x = 0; out.move.y = 0;
    if (!pressed) { out[edge] = true; pressed = true; }
  });
}

describe('the drop', () => {
  it('every fighter glides in fused (free: the energy stays full), and the drop fusion ends on landing', () => {
    const m = new BRMatch({ seed: 51, humans: 0, fighters: 3 });
    m.step();
    for (const a of m.world.actors.values()) {
      expect(a.fusion.active).toBe(true);
      expect(a.state).toBe('flight');
      expect(a.pos.y).toBeGreaterThan(40);
    }
    run(m, 3);
    // topped up every step (one step's flight drain is all it ever shows)
    for (const a of m.world.actors.values()) expect(a.stats.energy.cur).toBeGreaterThan(a.stats.energy.max - 0.1);
    run(m, 20, () => m.phase === 'play');
    expect(m.phase).toBe('play');
    m.step();   // the bond ends the drop's fusion on its next step
    for (const f of m.fighters) {
      const a = m.world.actors.get(f.id)!;
      expect(f.dropFused).toBe(false);
      expect(a.fusion.active).toBe(false);
      expect(f.landedAtSec).toBeGreaterThan(3);
    }
  });
});

describe('the summon', () => {
  it('the partner button puts the partner beside you for its assist, then it leaves and a cooldown runs', () => {
    const m = landedMatch({ seed: 52, humans: 1, fighters: 2 });
    put(m, 'player', -100, 100); put(m, 'bot.1', 120, -120);
    pressOnce(m, 'partner');
    run(m, 0.1);
    const f = m.fighter('player')!;
    const s = m.world.actors.get('player:summon')!;
    expect(s).toBeTruthy();
    expect(s.kind).toBe('partner');
    expect(s.team).toBe(f.team);
    expect(m.player!.partnerId).toBe('player:summon');
    expect(Math.hypot(s.pos.x - m.player!.pos.x, s.pos.z - m.player!.pos.z)).toBeLessThan(2.5);
    run(m, SUMMON.sec - 0.5);
    expect(m.world.actors.has('player:summon')).toBe(true);
    run(m, 0.7);
    expect(m.world.actors.has('player:summon')).toBe(false);
    expect(f.summonCooldownSec).toBeGreaterThan(SUMMON.cooldownSec - 1);
    pressOnce(m, 'partner');
    run(m, 0.1);
    expect(m.bond.lastSummonRefusal('player')).toBe('cooldown');
    expect(m.world.actors.has('player:summon')).toBe(false);
  });

  it('never more than four summoned partners in the whole match at once', () => {
    const m = landedMatch({ seed: 53, humans: 0, fighters: 8 });
    for (const f of m.fighters) { m.bots.delete(f.id); m.inputs.set(f.id, neutralInput()); }
    for (const f of m.fighters) m.inputs.get(f.id)!.partner = true;
    m.step();
    for (const f of m.fighters) m.inputs.get(f.id)!.partner = false;
    expect(m.bond.summoned()).toBe(BR_MAX_SUMMONED);
    expect([...m.world.actors.values()].filter((a) => a.kind === 'partner')).toHaveLength(BR_MAX_SUMMONED);
    expect(m.fighters.filter((f) => m.bond.lastSummonRefusal(f.id) === 'cap')).toHaveLength(8 - BR_MAX_SUMMONED);
    expect(m.world.actors.size).toBeLessThanOrEqual(16);
  });

  it('a summoned creature at its riding stage can be ridden; a shard makes it a flyer for the match', () => {
    const m = landedMatch({ seed: 54, humans: 1, fighters: 2 });
    put(m, 'player', -100, 100); put(m, 'bot.1', 120, -120);
    const f = m.fighter('player')!;
    expect(f.partner.kind).toBe('creature');
    pressOnce(m, 'partner');
    run(m, 0.1);
    expect(m.bond.mountCanFly('player:summon')).toBe(false);
    pressOnce(m, 'fuse');   // beside a rideable partner with the meter short: A1 mounts
    run(m, 0.1);
    expect(m.player!.ridingId).toBe('player:summon');
    takeLoot(f.kit, lootById('shard.evolve')!);
    run(m, 0.1);
    expect(f.partner.creature!.stage).toBe(f.partner.creature!.flyableAtStage);
    expect(m.bond.mountCanFly('player:summon')).toBe(true);
  });

  it('a built character never carries; its shard deepens the bond a fusion tier instead', () => {
    const def = createCharacterPartner({ id: 'c', creatorSlotId: 'slot-0', element: 'light' });
    const m = landedMatch({ seed: 55, humans: 1, fighters: 2, player: { partner: def } });
    const f = m.fighter('player')!;
    expect(f.partner.bond).toBe(BR_BOND);
    takeLoot(f.kit, lootById('shard.evolve')!);
    run(m, 0.1);
    expect(fusionTierFor(f.partner.bond)).toBe(fusionTierFor(BR_BOND) + 1);
  });
});

describe('fusion in the BR', () => {
  it('the meter fills from damage dealt; full, the fuse button fuses (flight, the energy cost, the tier\'s time)', () => {
    const m = landedMatch({ seed: 56, humans: 1, fighters: 2 });
    put(m, 'player', -100, 100); put(m, 'bot.1', 120, -120);
    const p = m.player!;
    p.fusion.meter = 0.95;
    m.bus.emit('damage', { tSec: m.tSec, sourceId: 'player', targetId: 'bot.1', amount: 30, source: 'strike', element: null, outcome: 'hit', staminaDamage: 0, poiseDamage: 0, staggerSec: 0, launch: false, knockback: null });
    expect(p.fusion.meter).toBe(1);
    const en = p.stats.energy.cur;
    pressOnce(m, 'fuse');
    run(m, 1 / 60);
    expect(p.fusion.active).toBe(true);
    expect(p.fusion.grantsFlight).toBe(true);
    expect(p.stats.energy.cur).toBeLessThanOrEqual(en - FUSION_ENERGY_COST + 1);
    expect(p.fusion.remainingSec).toBeCloseTo(fusionDurationSec(p.fusion.tier), 0);
  });

  it('Long Wings makes the fusion last longer', () => {
    const m = landedMatch({ seed: 56, humans: 1, fighters: 2 });
    put(m, 'player', -100, 100); put(m, 'bot.1', 120, -120);
    takeLoot(m.fighter('player')!.kit, lootById('ability.longWings')!);
    const p = m.player!;
    p.fusion.meter = 1;
    pressOnce(m, 'fuse');
    run(m, 1 / 60);
    expect(p.fusion.active).toBe(true);
    expect(p.fusion.remainingSec).toBeCloseTo(fusionDurationSec(p.fusion.tier) * ABILITY.cruiseFusionMult, 0);
  });
});
