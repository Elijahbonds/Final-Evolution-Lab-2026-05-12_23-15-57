import { describe, expect, it, vi } from 'vitest';
import { createAdventureBus, type AdventureActor, type DamageEvent } from '../contracts';
import { HEAR, STEP, STORY_SFX_ON, StorySfx, hearGain, panOf, type StoryCue, type StoryCueOpts } from './storySfx';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { SoundKit } from '../../audio/SoundKit';
import { playNature } from '../../audio/natureSfx';

function actor(id: string, kind: AdventureActor['kind'], x = 0, z = 0): AdventureActor {
  return { id, kind, pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 }, grounded: true, state: 'ground', facingYaw: 0 } as unknown as AdventureActor;
}

function rig(opts: { ambient?: boolean } = {}) {
  const bus = createAdventureBus();
  const actors = new Map<string, AdventureActor>([['p', actor('p', 'player')], ['q', actor('q', 'partner', 1, 0)]]);
  let lock = 0;
  const played: Array<[StoryCue, StoryCueOpts]> = [];
  const sfx = new StorySfx(bus, { playerId: 'p', partnerId: 'q', actor: (id) => actors.get(id), swingLock: () => lock }, (n, o) => played.push([n, o]), () => 0.5, opts.ambient ?? false);
  return { bus, actors, sfx, played, setLock: (v: number) => { lock = v; }, tags: () => played.map(([, o]) => o.tag) };
}

const hit = (target: string, outcome: DamageEvent['outcome'], amount = 10): DamageEvent => ({
  tSec: 0, sourceId: 'p', targetId: target, amount, source: 'strike', element: null, outcome, staminaDamage: 0, poiseDamage: 0, staggerSec: 0, launch: false, knockback: null,
} as unknown as DamageEvent);

describe('story sound (improve pass phase 5)', () => {
  it('the knob ships on and its 0 is the old silence', () => {
    const k = FEEL_KNOB_BY_ID.get('story.sfxOn')!;
    expect(k.def).toBe(STORY_SFX_ON);
    expect(k.min).toBe(0);
  });

  it('steps once per 0.8 m on the ground, none standing, none in the air', () => {
    const r = rig();
    const me = r.actors.get('p')!;
    me.vel.x = 4;   // 4 m/s for 70 frames = 4.67 m = five steps (off the 0.8 m boundaries)
    for (let i = 0; i < 70; i++) r.sfx.update(1 / 60, 0);
    expect(r.tags().filter((t) => t === 'story.step').length).toBe(Math.floor((4 * 70) / 60 / STEP.every));
    r.played.length = 0;
    me.vel.x = 0;
    for (let i = 0; i < 60; i++) r.sfx.update(1 / 60, 0);
    expect(r.tags().filter((t) => t === 'story.step')).toHaveLength(0);
    me.vel.x = 4; me.state = 'air'; me.grounded = false;
    for (let i = 0; i < 60; i++) r.sfx.update(1 / 60, 0);
    expect(r.tags().filter((t) => t.startsWith('story.step'))).toHaveLength(0);
  });

  it('a jump, a landing louder the harder you fall, a wall run, the rail', () => {
    const r = rig();
    const me = r.actors.get('p')!;
    me.vel.y = 6;
    r.bus.emit('state', { actorId: 'p', from: 'ground', to: 'air' });
    me.vel.y = -3; r.sfx.update(1 / 60, 0);
    r.bus.emit('state', { actorId: 'p', from: 'air', to: 'ground' });
    me.vel.y = -12; r.sfx.update(1 / 60, 0);
    r.bus.emit('state', { actorId: 'p', from: 'air', to: 'ground' });
    r.bus.emit('state', { actorId: 'p', from: 'ground', to: 'wallrun' });
    r.bus.emit('rail:enter', { actorId: 'p', segmentId: 's', speed: 10 });
    me.state = 'grind';
    for (let i = 0; i < 30; i++) r.sfx.update(1 / 60, 0);
    r.bus.emit('rail:exit', { actorId: 'p', segmentId: 's', reason: 'end' });
    const lands = r.played.filter(([, o]) => o.tag === 'story.land');
    expect(lands).toHaveLength(2);
    expect(lands[1][1].volume).toBeGreaterThan(lands[0][1].volume);
    expect(r.tags()).toEqual(expect.arrayContaining(['story.jump', 'story.wallrun', 'story.rail.on', 'story.rail.grind', 'story.rail.off']));
    // someone else's state changes are not yours
    r.played.length = 0;
    r.bus.emit('state', { actorId: 'q', from: 'ground', to: 'wallrun' });
    expect(r.played).toHaveLength(0);
  });

  it('each hit outcome has its own sound; a far fight is not heard', () => {
    const r = rig();
    r.actors.set('m', actor('m', 'monster', 3, 0));
    for (const o of ['hit', 'blocked', 'parried', 'guardBreak', 'dodged', 'iframe'] as const) r.bus.emit('damage', hit('m', o));
    expect(r.played.map(([n]) => n)).toEqual(['impact', 'clang', 'clang', 'impact', 'whoosh']);
    expect(r.played[2][1].pitch).toBeGreaterThan(r.played[1][1].pitch);   // a parry rings higher than a block
    r.played.length = 0;
    r.actors.set('far', actor('far', 'monster', HEAR.far + 5, 0));
    r.bus.emit('damage', hit('far', 'hit'));
    expect(r.played).toHaveLength(0);
  });

  it('a foe down, a boss down, tells, spells by element, the partner, the swing', () => {
    const r = rig();
    r.actors.set('m', actor('m', 'monster', 2, 0));
    r.actors.set('b', actor('b', 'boss', 5, 0));
    r.bus.emit('ko', { actorId: 'm', byId: 'p' });
    r.bus.emit('ko', { actorId: 'b', byId: 'p' });
    r.bus.emit('telegraph', { actorId: 'm', attackId: 'a', tellSec: 0.5 });
    r.bus.emit('telegraph', { actorId: 'b', attackId: 'a', tellSec: 0.8 });
    r.bus.emit('spell:cast', { actorId: 'p', spellId: 'x', element: 'fire' });
    r.bus.emit('spell:cast', { actorId: 'p', spellId: 'y', element: 'lightning' });
    r.bus.emit('spell:cast', { actorId: 'q', spellId: 'z', element: 'water' });
    r.bus.emit('revive', { actorId: 'q', byId: 'p', hpRatio: 0.5 });
    r.bus.emit('fusion', { actorId: 'p', partnerId: 'q', active: true, tier: 1 });
    r.setLock(0.3); r.sfx.update(1 / 60, 0);
    r.sfx.update(1 / 60, 0);   // still held: one swing
    const tags = r.tags();
    expect(tags).toEqual(expect.arrayContaining(['story.ko.foe', 'story.ko.boss', 'story.tell', 'story.tell.boss', 'story.spell', 'story.spell.partner', 'story.revive', 'story.fusion.on', 'story.swing']));
    expect(tags.filter((t) => t === 'story.swing')).toHaveLength(1);
    const spells = r.played.filter(([, o]) => o.tag === 'story.spell');
    expect(spells[1][1].pitch).toBeGreaterThan(spells[0][1].pitch);
    const tells = r.played.filter(([, o]) => o.tag.startsWith('story.tell'));
    expect(tells[1][1].volume).toBeGreaterThan(tells[0][1].volume);   // the boss's tell is the louder
  });

  it('the camp drum (two beats), the boss sting, a cleared camp, a gate, a new line', () => {
    const r = rig();
    r.sfx.runner({ kind: 'beat', beatId: 'camp1', beatKind: 'fight' });
    expect(r.tags().filter((t) => t === 'story.camp')).toHaveLength(1);
    for (let i = 0; i < 30; i++) r.sfx.update(1 / 60, 0);
    expect(r.tags().filter((t) => t === 'story.camp')).toHaveLength(2);
    r.sfx.runner({ kind: 'complete', beatId: 'camp1' });
    r.sfx.runner({ kind: 'beat', beatId: 'talk', beatKind: 'dialogue' });
    r.sfx.runner({ kind: 'complete', beatId: 'talk' });
    r.sfx.runner({ kind: 'beat', beatId: 'boss1', beatKind: 'boss' });
    r.sfx.warp();
    r.sfx.line('guide|hello'); r.sfx.line('guide|hello'); r.sfx.line(null); r.sfx.line('guide|next');
    const tags = r.tags();
    expect(tags.filter((t) => t === 'story.camp.cleared')).toHaveLength(1);   // a dialogue beat's end is not a cleared camp
    expect(tags).toEqual(expect.arrayContaining(['story.boss', 'story.gate']));
    expect(tags.filter((t) => t === 'story.line')).toHaveLength(2);
  });

  it('birds and gusts only with the ambience on; nothing after dispose', () => {
    const quiet = rig({ ambient: false });
    for (let i = 0; i < 60 * 30; i++) quiet.sfx.update(1 / 60, 0);
    expect(quiet.tags().filter((t) => t.startsWith('story.amb'))).toHaveLength(0);
    const r = rig({ ambient: true });
    for (let i = 0; i < 60 * 30; i++) r.sfx.update(1 / 60, 0);
    expect(r.tags().filter((t) => t === 'story.amb.bird').length).toBeGreaterThanOrEqual(3);
    expect(r.tags().filter((t) => t === 'story.amb.gust').length).toBeGreaterThanOrEqual(1);
    r.sfx.dispose(); r.played.length = 0;
    r.bus.emit('damage', hit('q', 'hit'));
    r.bus.emit('rail:enter', { actorId: 'p', segmentId: 's', speed: 10 });
    expect(r.played).toHaveLength(0);
  });

  it('hearing and pan', () => {
    expect(hearGain(0)).toBe(1);
    expect(hearGain(12)).toBeCloseTo(0.5);
    expect(hearGain(HEAR.far)).toBe(0);
    expect(panOf(0, 0, 0, 5, 0)).toBeCloseTo(1);    // facing +z, +x is to the right
    expect(panOf(0, 0, 0, -5, 0)).toBeCloseTo(-1);
    expect(panOf(0, 0, 0, 0, 0)).toBe(0);
  });

  it('the mute silences the made-in-code sounds (SoundKit plays nothing muted already)', () => {
    const graph = vi.spyOn(SoundKit, 'graph');
    SoundKit.setEnabled(false, false);
    try {
      playNature('chirp'); playNature('wave'); playNature('gull');
      expect(graph).not.toHaveBeenCalled();
    } finally { SoundKit.setEnabled(true, true); graph.mockRestore(); }
  });
});
