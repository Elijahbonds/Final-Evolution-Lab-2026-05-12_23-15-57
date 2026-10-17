// studio-5 (§13.2): CELL proposes STAMPS — one more op in the closed vocabulary, through the same review-then-apply step and the
// same ONE command. The model is told the built-in stamps only; a project stamp is named by the creator in the typed request and
// resolved in the browser against the project's own shelf (the request never carries the project's stamps).
import { describe, expect, it } from 'vitest';
import { AI_LIMITS, aiExplainUser, aiVenueSystem, aiVenueUser, compileAiEdits, reviewAiEdits, resolveStamp, sanitizeAiEdits, venueForAi, type AiEdit } from './aiEdits';
import { createStack, execute, undo, undoLabel } from './commands';
import { LIMITS, newProject, newVenue, sanitizeProject, type StudioProject, type StudioStamp } from './doc';
import { builtInStamps, placeStamp, stampCopies, stampFromSelection } from './stamps';
import { applyDelta } from './group';
import { placed } from '@/tests/helpers/nexusStudio';
import { HOSTILE_STAMP_ANSWER, STAMP_ANSWER, STAMP_PROMPT } from '@/tests/helpers/aiVenue';
import { aiRequestBody } from '@/components/nexus-studio/ai-venue-panel';

/** A project with one stamp of its own, "Bench Gang" (two bleachers and a lamp, saved from a selection). */
function withOwnStamp(): StudioProject {
  let p = newProject('P', newVenue('Court', { spec: 'tennis', target: 'tiebreak' }), new Date('2026-10-17T12:00:00Z'));
  const v = p.venues[0];
  const pieces = [placed('crowd:bleacher', [-4, 0, 0]), placed('crowd:bleacher', [4, 0, 0]), placed('fixture:lamp', [0, 0, 2])];
  pieces.forEach((o, i) => { o.name = `Gang piece ${i}`; });
  p = { ...p, venues: [{ ...v, objects: pieces }] };
  const saved = stampFromSelection(p.venues[0], pieces.map((o) => o.id), 'Bench Gang', p)!;
  let s = execute(createStack(p), saved.cmd);
  // the pieces were only there to be saved: the venue starts empty, the stamp stays on the shelf
  s = execute(s, { label: 'clear', ops: pieces.map((o) => ({ op: 'removeObject' as const, venueId: v.id, id: o.id })) });
  return s.doc;
}
const ctxOf = (p: StudioProject) => ({ characters: p.characters, scripts: p.scripts, stamps: p.stamps ?? [] });
const stampEdits = (edits: AiEdit[]) => edits.filter((e): e is Extract<AiEdit, { op: 'stamp' }> => e.op === 'stamp');

describe('the stamp op: sanitised like every other', () => {
  it('a good answer: five stamp edits, the spot on the ground, degrees in and radians in the document', () => {
    const { edits, dropped } = sanitizeAiEdits(STAMP_ANSWER);
    expect(dropped).toBe(0);
    const st = stampEdits(edits);
    expect(st.map((e) => e.stamp)).toEqual(['stamp:lampRow', 'Lamp row', 'stamp:floodCorners', 'Bench Gang', 'Disco Ball Tower']);
    expect(st[0].at).toEqual([-9, 0, 0]);
    expect(st[0].yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(st[2].yaw).toBe(0);
  });
  it('a hostile answer: no spot, no name, a stamp that is an object, past the cap — dropped; the rest clamped; nothing else read', () => {
    const { edits, dropped } = sanitizeAiEdits(HOSTILE_STAMP_ANSWER);
    const st = stampEdits(edits);
    expect(st).toHaveLength(AI_LIMITS.stamps);
    expect(dropped).toBe(3 + 3);   // three malformed, three past the cap
    expect(st[0]).toEqual({ op: 'stamp', stamp: 'stamp:lampRow', at: [AI_LIMITS.reach, 0, -AI_LIMITS.reach], yaw: 0 });
    for (const e of st) expect(Object.keys(e).sort()).toEqual(['at', 'op', 'stamp', 'yaw']);
    expect(JSON.stringify(edits)).not.toMatch(/hoop|evil|objects/);
  });
});

describe('the shelf: a stamp is found by id, or by name among the built-ins and the project\'s own', () => {
  const own = withOwnStamp().stamps!;
  it('a built-in by id or by name (case and spacing aside); the project\'s by name, exactly or by one unique partial match', () => {
    expect(resolveStamp('stamp:palmAvenue')?.name).toBe('Palm avenue');
    expect(resolveStamp('  LAMP   row ')?.id).toBe('stamp:lampRow');
    expect(resolveStamp('Bench Gang', own)?.id).toBe(own[0].id);
    expect(resolveStamp('bench', own)?.id).toBe(own[0].id);
    expect(resolveStamp('Bench Gang')).toBeNull();                                         // no project, no project stamp
    expect(resolveStamp('Disco Ball Tower', own)).toBeNull();
    expect(resolveStamp('', own)).toBeNull();
    // two project stamps that both match: ambiguous, never a guess
    const two: StudioStamp[] = [own[0], { ...own[0], id: 'stamp_x', name: 'Bench Gang II' }];
    expect(resolveStamp('bench', two)).toBeNull();
    // a project stamp can never take a built-in's id
    expect(resolveStamp('stamp:lampRow', [{ ...own[0], id: 'stamp:lampRow', name: 'Impostor' }])?.name).toBe('Lamp row');
  });
});

describe('apply: one command, the same undo stack', () => {
  it('the built-ins and the project\'s stamp placed whole, turned as asked, in ONE step; a stamp nobody has is left out; Undo takes it all', () => {
    const p = withOwnStamp();
    const v = p.venues[0];
    const { edits } = sanitizeAiEdits(STAMP_ANSWER);
    const c = compileAiEdits(v, edits, STAMP_PROMPT, ctxOf(p))!;
    const sizes = { lamp: 5, flood: 4, gang: 3 };
    expect(c.stamps).toBe(4);
    expect(c.placed).toBe(sizes.lamp * 2 + sizes.flood + sizes.gang);
    let s = execute(createStack(p), c.cmd);
    expect(s.past).toHaveLength(1);
    expect(undoLabel(s)).toMatch(/^AI: a lamp row down each side/);
    const objs = s.doc.venues[0].objects;
    expect(objs).toHaveLength(c.placed);
    // the lamp row turned 90° about its centre at (−9, 0): five lamps down the left side, x −9, z from +8 to −8
    const lamps = objs.filter((o) => o.type === 'fixture' && o.role === 'lamp' && o.t.p[0] < -5);
    expect(lamps.map((o) => [o.t.p[0], Math.round(o.t.p[2])])).toEqual([[-9, 8], [-9, 4], [-9, 0], [-9, -4], [-9, -8]].map(([x, z]) => [expect.closeTo(x, 6), z]));
    // the project's own stamp: its pieces (its names), behind the far line
    const gang = objs.filter((o) => /^Gang piece/.test(o.name));
    expect(gang).toHaveLength(sizes.gang);
    for (const o of gang) expect(o.t.p[2]).toBeLessThan(-18);
    // fresh ids everywhere, a document the import path accepts unchanged
    expect(new Set(objs.map((o) => o.id)).size).toBe(objs.length);
    for (const o of objs) expect(o.id.startsWith('stamp')).toBe(false);
    expect(sanitizeProject(JSON.parse(JSON.stringify(s.doc))).ok).toBe(true);
    s = undo(s);
    expect(s.doc.venues[0].objects).toEqual([]);
    expect(s.doc.stamps).toEqual(p.stamps);   // placing never touches the shelf
  });

  it('without the project, a built-in still places; the project\'s stamp is left out (never half-applied)', () => {
    const p = withOwnStamp();
    const c = compileAiEdits(p.venues[0], sanitizeAiEdits(STAMP_ANSWER).edits, STAMP_PROMPT)!;
    expect(c.stamps).toBe(3);
    expect(c.placed).toBe(5 * 2 + 4);
  });

  it('a stamp is placed whole or not at all: the venue\'s object cap and the answer\'s placement cap', () => {
    const p = withOwnStamp();
    const v = p.venues[0];
    const lampRow: AiEdit = { op: 'stamp', stamp: 'stamp:lampRow', at: [0, 0, 0], yaw: 0 };
    const nearlyFull = { ...v, objects: Array.from({ length: LIMITS.objects - 3 }, (_, i) => placed('fixture:lamp', [i % 40, 0, Math.floor(i / 40)])) };
    expect(compileAiEdits(nearlyFull, [lampRow], 'x', ctxOf(p))).toBeNull();   // five lamps, room for three: none
    const flood = Array.from({ length: AI_LIMITS.placed / 5 + 2 }, (): AiEdit => lampRow);
    const c = compileAiEdits(v, flood, 'x', ctxOf(p))!;
    expect(c.placed).toBe(AI_LIMITS.placed);
    expect(c.stamps).toBe(AI_LIMITS.placed / 5);
  });

  it('a turned stamp lands exactly where the group gizmo would turn it (group.ts applyDelta about the stamp\'s centre)', () => {
    for (const st of builtInStamps()) {
      for (const deg of [0, 37, 90, -135]) {
        const yaw = (deg * Math.PI) / 180, at: [number, number, number] = [3, 0, -7];
        const got = stampCopies(st, at, yaw, new Set());
        st.objects.forEach((src, i) => {
          const want = applyDelta(src, [0, 0, 0], { move: at, turn: yaw, scale: 1 });
          got[i].t.p.forEach((x, k) => expect(x, `${st.name} ${deg}° ${i}`).toBeCloseTo(want.p[k], 5));
          expect(Math.cos(got[i].t.ry - want.ry)).toBeCloseTo(1, 9);
        });
      }
      // unturned: exactly the hand placement (placeStamp, no snap)
      const hand = placeStamp({ ...withOwnStamp().venues[0] }, st, [3, 0, -7])!;
      const ai = stampCopies(st, [3, 0, -7], 0, new Set());
      const objs = hand.cmd.ops.map((o) => (o as { object: { t: unknown } }).object.t);
      expect(ai.map((o) => o.t)).toEqual(objs);
    }
  });
});

describe('the review', () => {
  it('each stamp line names the stamp and its pieces, marks the project\'s own, and strikes out a name nobody has', () => {
    const p = withOwnStamp();
    const edits = sanitizeAiEdits(STAMP_ANSWER).edits;
    edits.splice(3, 0, { op: 'stamp', stamp: 'Bench', at: [1, 0, 2], yaw: 0 });   // a partial name: the review says which stamp it found
    const r = reviewAiEdits(edits, ctxOf(p));
    expect(r.map((x) => x.line)).toEqual([
      'Stamp “Lamp row” at (-9.0, 0.0), turned 90° (5 pieces)',
      'Stamp “Lamp row” at (9.0, 0.0), turned 90° (5 pieces)',
      'Stamp “Flood corner set” at (0.0, 0.0) (4 pieces)',
      'Stamp “Bench” at (1.0, 2.0) → Bench Gang (3 pieces, this project’s stamp)',
      'Stamp “Bench Gang” at (0.0, -22.0) (3 pieces, this project’s stamp)',
      'Stamp “Disco Ball Tower” at (0.0, -30.0)',
    ]);
    expect(r.map((x) => !!x.skipped)).toEqual([false, false, false, false, false, true]);
    expect(r[5].skipped).toMatch(/no single stamp called “Disco Ball Tower”/);
  });
});

describe('privacy: the request carries the typed request and the venue, never the project\'s stamps', () => {
  it('the system words list the built-in stamps; nothing the model hears names a project stamp or its pieces', () => {
    const p = withOwnStamp();
    const sys = aiVenueSystem();
    for (const b of builtInStamps()) { expect(sys).toContain(b.id); expect(sys).toContain(b.name); }
    expect(sys).toMatch(/You are not told which they have/);
    // even a venue object that carries the project's stamps (a careless caller) puts none of them in front of the model
    const v = { ...p.venues[0], stamps: p.stamps } as typeof p.venues[0];
    const heard = [sys, aiVenueUser('make it pop', v), aiExplainUser(v), aiRequestBody(p.venues[0], { prompt: 'make it pop' }), aiRequestBody(p.venues[0], { explain: true })].join('\n');
    expect(heard).not.toContain('Bench Gang');
    expect(heard).not.toContain('Gang piece');
    expect(heard).not.toContain(p.stamps![0].id);
    const plain = p.venues[0];
    expect(JSON.parse(aiRequestBody(plain, { prompt: 'x' })).venue).toEqual(venueForAi(plain));
    expect(JSON.parse(aiRequestBody(plain, { prompt: 'x' }))).not.toHaveProperty('stamps');
    expect(JSON.stringify(JSON.parse(aiRequestBody(plain, { prompt: 'x' })))).not.toContain('Bench Gang');
  });
});
