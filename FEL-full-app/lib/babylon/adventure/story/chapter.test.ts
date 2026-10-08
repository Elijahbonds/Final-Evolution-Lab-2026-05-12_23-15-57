// The chapter runner (Phase B) against a fake world: each beat kind, what it writes into the save, the sim pause, the
// hold-skip, the choice, the resume, and THE FIRST FUSION's order (flags first, so the fusion grants flight).
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, type AdventureSave, type Vec3 } from '../contracts';
import { ChapterRunner, PARTNER_BOLT, type RunnerEvent, type StoryPort } from './chapter';
import { SKIP_HOLD_SEC } from './dialogue';
import { chapterDoneFlag, FLAG_FLIGHT_UNLOCKED } from './flags';
import type { StoryChapter } from './format';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function fakePort(save: AdventureSave) {
  const spawns: Record<string, Record<string, Vec3>> = { hub: { 'hub.home': v(0, 0, 0), 'hub.landing': v(0, 0, -20) }, w: { 'w.start': v(0, 0, -100), 'w.goal': v(0, 0, -50) } };
  const st = {
    pos: v(0, 0, 0), grounded: true, gate: null as { id: string; open: boolean } | null, cleared: new Set<string>(), started: [] as string[],
    fused: false, fuseCalls: 0, flightFlagAtFuse: null as unknown, xp: 0, saves: [] as string[], warps: [] as string[],
  };
  const port: StoryPort = {
    playerPos: () => st.pos, playerGrounded: () => st.grounded,
    focusOf: () => ({ pos: { ...st.pos }, yaw: 0 }),
    spawnPos: (w, s) => spawns[w]?.[s] ?? null,
    warpParty: (w, s) => { st.warps.push(`${w}/${s}`); st.pos = { ...spawns[w][s] }; },
    gateAt: () => st.gate,
    startEncounter: (id) => st.started.push(id),
    encounterCleared: (id) => st.cleared.has(id),
    bossOf: (id) => (id === 'boss.enc' ? 'the.boss' : null),
    storyFuse: () => { st.fuseCalls++; st.flightFlagAtFuse = save.story.flags[FLAG_FLIGHT_UNLOCKED]; st.fused = true; },
    fused: () => st.fused,
    partnerName: () => 'BUDDY', partnerElement: () => 'wind',
    grantXp: (n) => { st.xp += n; },
    save: (r) => st.saves.push(r),
  };
  return { port, st };
}

const CH: StoryChapter = {
  formatVersion: 1, id: 'chx', number: 1, title: '[PLACEHOLDER] Test', placeholder: true, worldId: 'w',
  beats: [
    { id: 'intro', kind: 'cutscene', checkpoint: { worldId: 'hub', spawnId: 'hub.home' }, lines: [{ id: 'a', speaker: 'guide', text: 'Hello.' }, { id: 'b', speaker: 'partner', text: 'Hi.' }] },
    { id: 'gate', kind: 'objective', text: 'Go to the gate', goal: { type: 'gate', gateId: 'g1' } },
    { id: 'warp', kind: 'travel', text: 'Through', via: 'gate', to: { worldId: 'w', spawnId: 'w.start' }, checkpoint: { worldId: 'w', spawnId: 'w.start' } },
    { id: 'talk', kind: 'dialogue', lines: [{ id: 'c', speaker: 'guide', text: 'Onward.' }] },
    { id: 'reach', kind: 'objective', text: 'Reach it', goal: { type: 'reach', spawnId: 'w.goal', radiusM: 5 } },
    { id: 'fight', kind: 'fight', text: 'Fight', encounterId: 'camp', xp: 40, learnSpell: PARTNER_BOLT },
    { id: 'pick', kind: 'choice', lines: [{ id: 'd', speaker: 'guide', text: 'Which?' }], choices: [{ id: 'one', text: 'One', flag: 'pick' }, { id: 'two', text: 'Two', flag: 'pick' }], defaultChoice: 'one' },
    { id: 'boss', kind: 'boss', text: 'Boss', encounterId: 'boss.enc' },
    { id: 'fuse', kind: 'cutscene', fuse: true, setFlags: { fusionUnlocked: true, flightUnlocked: true }, lines: [{ id: 'e', speaker: 'partner', text: 'Together.' }] },
    { id: 'home', kind: 'travel', text: 'Fly home', via: 'flight', radiusM: 6, to: { worldId: 'hub', spawnId: 'hub.landing' } },
  ],
};

function setup() {
  const save = emptyAdventureSave(0);
  const { port, st } = fakePort(save);
  const events: RunnerEvent[] = [];
  const r = new ChapterRunner({ save, port, cast: { guide: { name: '[PLACEHOLDER] Guide' } }, onEvent: (e) => events.push(e) });
  const step = (sec: number) => { for (let t = 0; t < sec - 1e-9; t += 1 / 60) r.update(1 / 60); };
  return { save, st, r, events, step };
}

describe('the chapter runner', () => {
  it('plays a whole chapter: each beat kind, in order, writing the story into the save', () => {
    const { save, st, r, events, step } = setup();
    r.start(CH);
    expect(save.story.chapterId).toBe('chx');
    expect(save.story.beatId).toBe('intro');
    expect(save.story.checkpoint).toEqual({ worldId: 'hub', spawnId: 'hub.home' });
    expect(r.blocking).toBe(true);                    // a cutscene pauses the sim
    expect(r.objective()).toBeNull();
    step(10);
    expect(r.beat?.id).toBe('gate');
    expect(r.blocking).toBe(false);
    expect(r.objective()).toBe('Go to the gate');
    step(1);
    st.gate = { id: 'g1', open: false };              // a shut gate does nothing
    step(1);
    expect(r.beat?.id).toBe('gate');
    st.gate = { id: 'g1', open: true };
    step(1 / 60 * 2);
    expect(st.warps).toEqual(['w/w.start']);           // the travel beat warped through it
    expect(save.story.worldsVisited).toEqual(['w']);
    expect(save.story.checkpoint).toEqual({ worldId: 'w', spawnId: 'w.start' });
    expect(r.beat?.id).toBe('talk');
    step(5);
    expect(r.beat?.id).toBe('reach');
    st.pos = v(0, 0, -52); st.grounded = false;        // over the goal but not standing on it
    step(0.5);
    expect(r.beat?.id).toBe('reach');
    st.grounded = true;
    step(0.1);
    expect(r.beat?.id).toBe('fight');
    expect(st.started).toEqual(['camp']);
    step(2);
    st.cleared.add('camp');
    step(0.1);
    expect(st.xp).toBe(40);
    expect(save.player.spells.known).toEqual(['bolt.wind']);    // partner.bolt is the partner's element bolt
    expect(save.player.spells.equipped[0]).toBe('bolt.wind');
    expect(r.beat?.id).toBe('pick');
    r.move(1); step(1); r.press(); r.release(); r.press(); r.release();
    step(0.1);
    expect(save.story.flags.pick).toBe('two');
    expect(r.beat?.id).toBe('boss');
    st.cleared.add('boss.enc');
    step(0.1);
    expect(save.story.clearedBosses).toEqual(['the.boss']);
    expect(r.beat?.id).toBe('fuse');
    step(8);
    // THE ORDER: the flight flag was already set when the fusion was asked for
    expect(st.fuseCalls).toBe(1);
    expect(st.flightFlagAtFuse).toBe(true);
    expect(r.beat?.id).toBe('home');
    st.pos = v(0, 0, -21);
    step(0.1);
    expect(r.done).toBe(true);
    expect(save.story.flags[chapterDoneFlag('chx')]).toBe(true);
    expect(save.story.beatId).toBeNull();
    expect(save.story.worldsVisited).toEqual(['w', 'hub']);
    expect(events.filter((e) => e.kind === 'beat').map((e) => (e as { beatId: string }).beatId)).toEqual(CH.beats.map((b) => b.id));
    expect(events.at(-1)).toEqual({ kind: 'chapter', chapterId: 'chx' });
    expect(st.saves).toContain('checkpoint');
    expect(st.saves.at(-1)).toBe('chapter');
  });

  it('a hold skips a cutscene, and its effects still happen (a skipped first fusion still fuses, flags first)', () => {
    const { st, r, step, events } = setup();
    r.start(CH, 'fuse');
    r.press();
    step(SKIP_HOLD_SEC + 0.05);
    expect(events.some((e) => e.kind === 'skip' && e.beatId === 'fuse')).toBe(true);
    expect(st.fuseCalls).toBe(1);
    expect(st.flightFlagAtFuse).toBe(true);
    expect(r.beat?.id).toBe('home');
  });

  it('a skipped choice takes its default', () => {
    const { save, r, step } = setup();
    r.start(CH, 'pick');
    r.skipScene();
    step(0.05);
    expect(save.story.flags.pick).toBe('one');
  });

  it('resumes at a saved beat; a flight home re-fuses after a respawn', () => {
    const { st, r, step } = setup();
    r.start(CH, 'home');
    expect(st.fuseCalls).toBe(1);                      // the flight beat makes sure the party is fused
    st.fused = false;                                  // the fusion ran out over the void, the party fell, respawned
    r.respawned();
    expect(st.fuseCalls).toBe(2);
    step(0.1);
    expect(r.beat?.id).toBe('home');
  });

  it('placeholder lines carry the tag and the speaker without its [PLACEHOLDER] prefix; the partner speaks under its name', () => {
    const { r, step } = setup();
    r.start(CH);
    step(0.6);
    expect(r.view()).toMatchObject({ active: true, speaker: 'Guide', placeholder: true });
    r.press(); r.release(); r.press(); r.release();
    step(0.5);
    expect(r.view()).toMatchObject({ active: true, speaker: 'BUDDY', placeholder: true });
  });
});
