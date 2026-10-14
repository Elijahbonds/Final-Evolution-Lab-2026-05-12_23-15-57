import { describe, expect, it } from 'vitest';
import { SEAT_DROP, crowdClipKeys } from './crowdClips';
import { CROWD_CLIPS } from './crowdVat';

const postureOf = (hipsY: number | undefined): 'seated' | 'standing' => ((hipsY ?? 0) < -SEAT_DROP / 2 ? 'seated' : 'standing');

describe('the crowd vocabulary', () => {
  for (const c of CROWD_CLIPS) {
    it(`${c.name}: runs its spec's length, starts in "${c.from}" and ends in "${c.to}"`, () => {
      const ks = crowdClipKeys(c.name);
      expect(ks[0].t).toBe(0);
      expect(ks.at(-1)!.t).toBeCloseTo(c.seconds, 9);
      expect(postureOf(ks[0].hipsY)).toBe(c.from);
      expect(postureOf(ks.at(-1)!.hipsY)).toBe(c.to);
      for (let i = 1; i < ks.length; i++) expect(ks[i].t).toBeGreaterThan(ks[i - 1].t);
    });
  }
  it('the arms are never keyed (the bodies\' arms are skinned to the torso: an arm key tears the shoulder)', () => {
    for (const c of CROWD_CLIPS) for (const k of crowdClipKeys(c.name)) {
      expect(k.hands, c.name).toBeUndefined();
      expect(k.handsRel, c.name).toBeUndefined();
      for (const b of Object.keys(k.bones ?? {})) expect(b, c.name).not.toMatch(/Arm|Hand|Shoulder/);
    }
  });
  it('every clip of a posture starts and ends on that posture\'s rest, so any may follow any', () => {
    const rest = (name: (typeof CROWD_CLIPS)[number]['name'], end: boolean) => { const ks = crowdClipKeys(name); return JSON.stringify((end ? ks.at(-1)! : ks[0]).bones) + (end ? ks.at(-1)! : ks[0]).hipsY; };
    for (const c of CROWD_CLIPS) {
      const home = c.from === 'seated' ? 'sit_idle' : 'stand_idle';
      expect(rest(c.name, false), c.name).toBe(rest(home, false));
      const back = c.to === 'seated' ? 'sit_idle' : 'stand_idle';
      expect(rest(c.name, true), c.name).toBe(rest(back, false));
    }
  });
});
