// The hub's gates and quests on core/StoryHub (Phase B): World 1 open, World 2 sealed by StoryHub's flight rule (and
// with nowhere to go yet), World 3 sealed; the quest manifest validates through StoryHub's validateQuestManifest.
import { describe, expect, it } from 'vitest';
import { buildStoryMap } from '../world/story/storyMap';
import { HubGates, storyQuests, validateStoryQuests } from './gates';
import { STORY_INDEX, chapterById } from './data';

const map = buildStoryMap();
const gates = new HubGates(map);
const all = () => true;

describe('HubGates (StoryHub GateSystem)', () => {
  it('World 1\'s gate opens to its start; standing outside every gate is null', () => {
    expect(gates.at({ x: -22, y: 0, z: 4 }, { flight: false, reached: all })).toMatchObject({ gate: { id: 'gate.w1', to: { worldId: 'w1', spawnId: 'w1.start' } }, open: true, shut: null });
    expect(gates.at({ x: 0, y: 0, z: -8 }, { flight: false, reached: all })).toBeNull();
  });

  it('World 2 (the upper level) is sealed by the flight rule before flight, and leads nowhere after it', () => {
    expect(gates.at({ x: 0, y: 8, z: 30 }, { flight: false, reached: all })).toMatchObject({ open: false, shut: 'flight' });
    expect(gates.at({ x: 0, y: 8, z: 30 }, { flight: true, reached: all })).toMatchObject({ open: false, shut: 'nowhere' });
  });

  it('World 3 is sealed (no chapter yet); a gate whose chapter is not reached stays shut', () => {
    expect(gates.stateOf('gate.w3', { flight: true, reached: all })).toEqual({ open: false, shut: 'nowhere' });
    const g = new HubGates(map);
    g.spec('gate.w1')!.opensWith = 'ch09';
    expect(g.stateOf('gate.w1', { flight: true, reached: (id) => id === 'ch01' })).toEqual({ open: false, shut: 'unreached' });
    delete g.spec('gate.w1')!.opensWith;
  });
});

describe('the quests', () => {
  const quests = storyQuests(STORY_INDEX, map, (id) => chapterById(id)?.beats[0]?.id ?? null);

  it('one QuestDef per chapter, through its hub gate, from its first beat; StoryHub\'s manifest check passes', () => {
    expect(quests).toEqual([expect.objectContaining({ id: 'quest.ch01', sectorId: 'hub', gateId: 'gate.w1', beatId: 'b01-home', goal: { type: 'playMode', modeId: 'adventure' } })]);
    expect(validateStoryQuests(quests, map)).toEqual([]);
  });

  it('still catches a duplicate, an unknown gate and a missing beat', () => {
    const bad = [...quests, { ...quests[0] }, { ...quests[0], id: 'quest.x', gateId: 'gate.nope', beatId: '' }];
    const errs = validateStoryQuests(bad, map).join('\n');
    expect(errs).toMatch(/quest.ch01: duplicate id/);
    expect(errs).toMatch(/quest.x: unknown gate gate.nope/);
    expect(errs).toMatch(/quest.x: no first beat/);
  });
});
