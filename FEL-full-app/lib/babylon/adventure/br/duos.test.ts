// Downs, revives and eliminations (ADVENTURE PLAN: "Duos … Downed duo members bleed out and can be revived
// (DownRevive)"; solos are out at zero). The revive is the contract's `revive` event, and A2's combat puts the hp back.
import { describe, expect, it } from 'vitest';
import { REVIVE_CHANNEL_SEC, REVIVED_HP_RATIO, BLEED_OUT_SEC } from '@/lib/babylon/core/OnslaughtCore';
import { neutralInput } from '../contracts';
import { DOWNS } from './tuning';
import { landedMatch, put, run } from './testkit';
import type { BRMatch } from './match';

/** A bot turned into a statue (its brain off, a neutral input): the test decides where it stands. */
const statue = (m: BRMatch, id: string) => { m.bots.delete(id); m.inputs.set(id, neutralInput()); };

/** A god-hand KO for a test (the hp a fight would have taken). */
const zero = (m: BRMatch, id: string) => { m.world.actors.get(id)!.stats.hp.cur = 0; };

function duo(humans: 0 | 1, seed = 41) {
  const m = landedMatch({ seed, humans, mode: 'duo', fighters: 4, duoSeat: 'bot' });
  const a = humans ? 'player' : 'bot.0';
  put(m, a, -100, 100); put(m, 'bot.1', -98.8, 100);   // inside DownRevive's 1.8 m
  put(m, 'bot.2', 120, -120); put(m, 'bot.3', 122, -120);
  return { m, a };
}

describe('duos: down, revive, bleed out', () => {
  it('a downed teammate is revived by a human standing still beside them, back to DownRevive\'s share of hp', () => {
    const { m } = duo(1);
    const still = neutralInput();
    m.setInputSource('player', (out) => { Object.assign(out, still, { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } }); });
    const revives: string[] = [];
    m.bus.on('revive', (e) => revives.push(e.actorId));
    zero(m, 'bot.1');
    run(m, 0.1);
    expect(m.fighter('bot.1')!.status).toBe('downed');
    expect(m.hud('bot.1').downed).toBe(true);
    const sec = run(m, REVIVE_CHANNEL_SEC + 1, () => revives.length > 0);
    expect(sec).toBeGreaterThanOrEqual(REVIVE_CHANNEL_SEC - 0.1);
    run(m, 0.1);
    const b = m.world.actors.get('bot.1')!;
    expect(revives).toEqual(['bot.1']);
    expect(m.fighter('bot.1')!.status).toBe('alive');
    expect(b.stats.hp.cur).toBe(Math.max(1, Math.round(b.stats.hp.max * REVIVED_HP_RATIO)));
  });

  it('with nobody reviving, a downed fighter bleeds out (faster than DownRevive\'s clock: the BR\'s rate), and the team is placed when its last member goes', () => {
    const { m } = duo(1);
    m.setInputSource('player', (out) => { out.move.x = 0; out.move.y = 0; });
    put(m, 'player', -60, 100);   // 40 m away: no revive
    zero(m, 'bot.1');
    run(m, 0.1);
    const bleed = BLEED_OUT_SEC / DOWNS.bleedRate;
    const sec = run(m, bleed + 2, () => m.fighter('bot.1')!.status === 'out');
    expect(sec).toBeGreaterThan(bleed - 1);
    expect(sec).toBeLessThan(bleed + 1);
    expect(m.fighter('bot.1')!.place).toBeNull();   // the team still stands
    zero(m, 'player');
    run(m, 0.2);
    expect(m.fighter('player')!.status).toBe('out');
    expect(m.fighter('player')!.place).toBe(2);
    expect(m.fighter('bot.1')!.place).toBe(2);
    expect(m.phase).toBe('over');
    expect(m.result()!.won).toBe(false);
  });

  it('an enemy standing over a downed body finishes it faster', () => {
    const { m } = duo(1);
    m.setInputSource('player', (out) => { out.move.x = 0; out.move.y = 0; });
    put(m, 'player', -60, 100);
    statue(m, 'bot.2');
    put(m, 'bot.2', -97, 101);   // an enemy right beside the downed body
    zero(m, 'bot.1');
    run(m, 0.1);
    const sec = run(m, 30, () => m.fighter('bot.1')!.status === 'out');
    expect(sec).toBeLessThan(BLEED_OUT_SEC / (DOWNS.bleedRate * DOWNS.finishRate) + 1);
  });

  it('a bot teammate goes to a downed mate and revives them', () => {
    const { m } = duo(0, 43);
    put(m, 'bot.0', -100, 92);   // 8 m off
    const revives: string[] = [];
    m.bus.on('revive', (e) => revives.push(`${e.byId}→${e.actorId}`));
    zero(m, 'bot.1');
    run(m, 10, () => revives.length > 0);
    expect(revives).toEqual(['bot.0→bot.1']);
  });

  it('the whole team down at once: both are out, placed together', () => {
    const { m } = duo(0, 44);
    zero(m, 'bot.0');
    run(m, 0.1);
    expect(m.fighter('bot.0')!.status).toBe('downed');
    zero(m, 'bot.1');
    run(m, 0.1);
    expect(m.fighter('bot.0')!.status).toBe('out');
    expect(m.fighter('bot.1')!.status).toBe('out');
    expect(m.fighter('bot.0')!.place).toBe(2);
    expect(m.winnerTeam).toBe(2);
  });

  it('the second seat can be your own partner as a full fighter, with your partner\'s element', () => {
    const m = landedMatch({ seed: 45, humans: 1, mode: 'duo', fighters: 4, duoSeat: 'partner' });
    const p = m.fighter('partner.fighter')!;
    expect(p.partnerSeat).toBe(true);
    expect(p.team).toBe(m.fighter('player')!.team);
    expect(p.partner.element).toBe(m.fighter('player')!.partner.element);
    expect(m.bots.has('partner.fighter')).toBe(true);   // it fights on its own brain
  });
});

describe('solos: out at zero', () => {
  it('a fighter at zero lies a beat, then is out, its team placed and its kit spilled', () => {
    const m = landedMatch({ seed: 46, humans: 0, fighters: 4 });
    for (const id of ['bot.0', 'bot.1', 'bot.2', 'bot.3']) statue(m, id);
    const f = m.fighter('bot.2')!;
    f.kit.armour = 'armour.mid';
    const before = m.loot.items.length;
    const at = { ...m.world.actors.get('bot.2')!.pos };
    zero(m, 'bot.2');
    run(m, DOWNS.soloLieSec - 0.2);
    expect(f.status).toBe('alive');
    run(m, 0.4);
    expect(f.status).toBe('out');
    expect(f.place).toBe(4);
    expect(m.loot.items.length).toBe(before + 1);
    const spilled = m.loot.items.at(-1)!;
    expect(spilled.lootId).toBe('armour.mid');
    expect(Math.hypot(spilled.pos.x - at.x, spilled.pos.z - at.z)).toBeLessThan(3);
    run(m, DOWNS.corpseSec + 0.1);
    expect(m.world.actors.has('bot.2')).toBe(false);
  });
});
