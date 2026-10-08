// The cutscene runner (Phase B): CinematicPlayer's track and beats drive the dialogue; the playhead never runs ahead of
// the words; a skip still fires every effect, once; the camera is always finite.
import { describe, expect, it } from 'vitest';
import { CutsceneRunner, buildCinematic, CUTSCENE_LEAD_SEC, type CutsceneEffect } from './cutscene';
import { DialoguePlayer, lineSec, type DialogueLine } from './dialogue';

const L = (id: string, text: string): DialogueLine => ({ id, speaker: 'guide', speakerName: 'Guide', text, placeholder: true });
const lines = [L('l1', 'The first gate has woken.'), L('l2', 'Step through it when you are ready to go.'), L('l3', 'Go.')];
const spec = { id: 'cs', lines, shot: 'push' as const, focus: { x: 1, y: 1, z: 2 }, facingYaw: 0.3, effects: ['fuse'] as CutsceneEffect[] };

function rig() {
  const shown: string[] = [];
  const effects: CutsceneEffect[] = [];
  const ends: boolean[] = [];
  const dialogue = new DialoguePlayer({ onLine: (l) => shown.push(l.id) });
  const cs = new CutsceneRunner(dialogue, { onEffect: (e) => effects.push(e), onEnd: (s) => ends.push(s) });
  const step = (sec: number, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) { dialogue.update(dt); cs.update(dt); } };
  return { shown, effects, ends, dialogue, cs, step };
}

describe('buildCinematic', () => {
  it('one line beat per line at the reading pace, the effects on the last line, the end after it; a two-key camera track', () => {
    const c = buildCinematic(spec);
    const lb = c.beats.filter((b) => b.id === 'line');
    expect(lb.map((b) => b.payload)).toEqual(['l1', 'l2', 'l3']);
    expect(lb[0].t).toBeCloseTo(CUTSCENE_LEAD_SEC, 6);
    expect(lb[1].t - lb[0].t).toBeCloseTo(lineSec(lines[0].text), 6);
    expect(c.beats.find((b) => b.id === 'fuse')!.t).toBeCloseTo(lb[2].t, 6);
    expect(c.beats.at(-1)!.id).toBe('end');
    expect(c.beats.at(-1)!.t).toBe(c.duration);
    expect(c.track).toHaveLength(2);
    for (const k of c.track) for (const v of [k.frame.position.x, k.frame.position.y, k.frame.position.z, k.frame.fov]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('the runner', () => {
  it('plays every line once, in order, fires the effect once and ends once (played out)', () => {
    const r = rig();
    r.cs.start(spec);
    expect(r.cs.active).toBe(true);
    r.step(30);
    expect(r.shown).toEqual(['l1', 'l2', 'l3']);
    expect(r.effects).toEqual(['fuse']);
    expect(r.ends).toEqual([false]);
    expect(r.cs.active).toBe(false);
    expect(r.cs.camera()).toBeNull();
  });

  it('the playhead holds short of the next line while one is still up (no line is cut by the timeline)', () => {
    const r = rig();
    r.cs.start(spec);
    // the dialogue is never updated here, so the first line stays up however long the timeline runs
    for (let i = 0; i < 600; i++) r.cs.update(1 / 60);
    expect(r.shown).toEqual(['l1']);
    const c = buildCinematic(spec);
    const t = r.cs.progress * c.duration;
    expect(t).toBeLessThan(c.beats.find((b) => b.payload === 'l2')!.t);
    expect(t).toBeGreaterThan(c.beats.find((b) => b.payload === 'l2')!.t - 0.01);   // the camera eased right up to it
  });

  it('a tap that finishes a line early lets the timeline catch up (the next line comes sooner than its beat)', () => {
    const slow = rig(), fast = rig();
    slow.cs.start(spec); fast.cs.start(spec);
    slow.step(CUTSCENE_LEAD_SEC + 0.6); fast.step(CUTSCENE_LEAD_SEC + 0.6);
    fast.dialogue.tap(); fast.dialogue.tap();   // reveal whole, then move on
    let tFast = 0, tSlow = 0;
    while (fast.shown.length < 2 && tFast < 20) { fast.step(1 / 60); tFast += 1 / 60; }
    while (slow.shown.length < 2 && tSlow < 20) { slow.step(1 / 60); tSlow += 1 / 60; }
    expect(tFast).toBeLessThan(tSlow);
  });

  it('a skip clears the words, fires every effect not yet fired (once), and ends once as skipped', () => {
    const r = rig();
    r.cs.start(spec);
    r.step(1);
    r.cs.skip();
    r.cs.skip();
    expect(r.effects).toEqual(['fuse']);
    expect(r.ends).toEqual([true]);
    expect(r.dialogue.active).toBe(false);
    r.step(5);
    expect(r.effects).toEqual(['fuse']);
  });

  it('the camera frame is finite every frame and moves along the track', () => {
    const r = rig();
    r.cs.start(spec);
    const first = { ...r.cs.camera()!.position };
    let moved = false;
    for (let i = 0; i < 300; i++) {
      r.step(1 / 60);
      const c = r.cs.camera();
      if (!c) break;
      for (const v of [c.position.x, c.position.y, c.position.z, c.target.x, c.fov]) expect(Number.isFinite(v)).toBe(true);
      if (Math.hypot(c.position.x - first.x, c.position.z - first.z) > 0.1) moved = true;
    }
    expect(moved).toBe(true);
  });
});
