// AF-11 PM add (ANIM-FEEL-SPEC §AF-5 item 4): every shipped capture from CMU or Quaternius is credited to its source — the 29
// bball_mc_* clips the player and the rivals play are CMU (not the owner's), the 12 CMU karate strikes and the 4 Quaternius
// reactions are named on their entries, and CMU's acknowledgement is on the CMU entry word for word.
import { describe, expect, it } from 'vitest';
import { CMU_ACKNOWLEDGEMENT, CREDITS, creditForManifestLicence } from './credits';
import { MOCAP_OPPONENT_CLIPS } from '../babylon/anim/authored/mocapOpponents';

const byId = (id: string) => CREDITS.find((c) => c.id === id)!;
const CMU_KARATE = ['jab', 'hook', 'roundhouse', 'high_kick', 'cross', 'uppercut', 'whirl', 'backspin', 'typhoon', 'hammer', 'heavy', 'rush']
  .map((n) => `karate_mc_${n}`);
const UAL_KARATE = ['hit_react', 'knockdown', 'get_up', 'stagger'].map((n) => `karate_mc_${n}`);
const kind = (source: string) => source.split(':')[0];

describe('the shipped captures are credited to their source', () => {
  it('ATT-1: the 29 bball_mc_* clips are all CMU, and credited to the CMU entry', () => {
    const hoops = MOCAP_OPPONENT_CLIPS.filter((c) => c.name.startsWith('bball_mc_'));
    expect(hoops).toHaveLength(29);
    for (const c of hoops) {
      expect(kind(c.source), c.name).toBe('cmu');
      expect(creditForManifestLicence(c.license)?.id, c.name).toBe('cmu');
    }
  });
  it('ATT-2: the karate_mc_* clips: exactly 12 from CMU and 4 from Quaternius, each credited to its own entry', () => {
    const karate = MOCAP_OPPONENT_CLIPS.filter((c) => c.name.startsWith('karate_mc_'));
    expect(karate.filter((c) => kind(c.source) === 'cmu').map((c) => c.name).sort()).toEqual([...CMU_KARATE].sort());
    expect(karate.filter((c) => kind(c.source) === 'ual').map((c) => c.name).sort()).toEqual([...UAL_KARATE].sort());
    for (const c of karate) {
      expect(creditForManifestLicence(c.license)?.id, c.name).toBe(kind(c.source) === 'cmu' ? 'cmu' : 'quaternius-ual');
    }
    for (const c of MOCAP_OPPONENT_CLIPS.filter((x) => kind(x.source) === 'cmu' || kind(x.source) === 'ual')) {
      expect(creditForManifestLicence(c.license)?.id, c.name).toBe(kind(c.source) === 'cmu' ? 'cmu' : 'quaternius-ual');
    }
  });
  it('ATT-3: the CMU entry carries the acknowledgement and names the hoops and the 12 strikes; Quaternius names its 4', () => {
    const cmu = byId('cmu');
    expect(cmu.notice).toBe(CMU_ACKNOWLEDGEMENT);
    expect(cmu.used).toMatch(/basketball/i); expect(cmu.used).toMatch(/player/i); expect(cmu.used).toContain('bball_mc_');
    for (const n of CMU_KARATE) expect(cmu.used, n).toContain(n);
    const ual = byId('quaternius-ual');
    for (const n of UAL_KARATE) expect(ual.used, n).toContain(n);
  });
  it('ATT-4: no bball_mc_* clip is credited to the owner, and the owner entry no longer claims shots', () => {
    for (const c of MOCAP_OPPONENT_CLIPS.filter((x) => x.name.startsWith('bball_mc_'))) {
      expect(creditForManifestLicence(c.license)?.id, c.name).not.toBe('owner-captures');
    }
    expect(byId('owner-captures').used).not.toMatch(/\bshots?\b/i);
  });
});
