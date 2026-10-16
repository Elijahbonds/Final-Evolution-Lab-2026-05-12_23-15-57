// Track 2: a CELL answer → validated edits → ONE command on the Studio's undo stack. The model is stubbed (tests/helpers/
// aiVenue.ts): a good answer, a hostile one, prose, and a flood past every cap.
import { describe, expect, it } from 'vitest';
import { AI_LIMITS, aiVenueSystem, aiVenueUser, compileAiEdits, describeEdit, parseAnswer, sanitizeAiEdits, venueBrief } from './aiEdits';
import { createStack, execute, undo, redo, undoLabel } from './commands';
import { LIMITS, newProject, newVenue, sanitizeProject } from './doc';
import { everyKindProject } from '@/tests/helpers/nexusStudio';
import { GOOD_ANSWER, HOSTILE_ANSWER, NIGHT_BEACH_PROMPT, PROSE_ANSWER, floodAnswer } from '@/tests/helpers/aiVenue';

const fresh = () => newProject('P', newVenue('Court', { spec: 'tennis', target: 'tiebreak' }), new Date('2026-10-14T12:00:00Z'));

describe('a good answer', () => {
  const { edits, dropped } = sanitizeAiEdits(GOOD_ANSWER);
  it('reads the fenced JSON; the rows expand; nothing is dropped', () => {
    expect(dropped).toBe(0);
    expect(edits.filter((e) => e.op === 'place')).toHaveLength(8);   // 3 + 3 floods, a stand, a palm
    expect(edits[0]).toMatchObject({ op: 'venue', set: { mood: 'nightGame', backdrop: 'beach', paintedSky: true, ground: { kind: 'sand' } } });
  });
  it('compiles to ONE undoable step that builds the venue, and Undo takes it all back', () => {
    const p = fresh();
    const v = p.venues[0];
    const c = compileAiEdits(v, edits, NIGHT_BEACH_PROMPT)!;
    expect(c.placed).toBe(8);
    expect(c.settings.sort()).toEqual(['backdrop', 'ground', 'mood', 'name', 'paintedSky', 'sky']);
    let s = execute(createStack(p), c.cmd);
    expect(s.past).toHaveLength(1);
    expect(undoLabel(s)).toBe(`AI: ${NIGHT_BEACH_PROMPT.slice(0, 48)}…`);
    const built = s.doc.venues[0];
    expect(built.mood).toBe('nightGame');
    expect(built.objects.filter((o) => o.type === 'fixture')).toHaveLength(6);
    const stand = built.objects.find((o) => o.type === 'crowdStand')!;
    expect(stand).toMatchObject({ width: 30, rows: 8, gaps: 0 });
    expect(stand.t.p).toEqual([0, 0, -20]);
    const flood = built.objects.find((o) => o.type === 'fixture')!;
    expect(flood).toMatchObject({ role: 'flood', height: 16 });
    expect(flood.t.ry).toBeCloseTo(Math.PI / 2, 6);   // degrees in, radians in the document
    // the result is a document the import path accepts unchanged
    expect(sanitizeProject(JSON.parse(JSON.stringify(s.doc))).ok).toBe(true);
    s = undo(s);
    expect(s.doc.venues[0]).toEqual(v);
    s = redo(s);
    expect(s.doc.venues[0].objects).toHaveLength(8);
  });
  it('ids are minted by the Studio, never taken from the answer, and never collide with the venue\'s', () => {
    const p = everyKindProject();
    const v = p.venues[0];
    const c = compileAiEdits(v, edits, 'x')!;
    const ids = c.cmd.ops.flatMap((o) => (o.op === 'addObject' ? [o.object.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(v.objects.some((o) => o.id === id)).toBe(false);
  });
});

describe('a hostile answer', () => {
  const { edits, dropped } = sanitizeAiEdits(HOSTILE_ANSWER);
  it('keeps only what the vocabulary says, clamped; everything else is dropped and counted', () => {
    // the flood, the stand, a row of scuffs (a count of 1e9 clamped to one row's length), a venue edit
    expect(edits.map((e) => e.op)).toEqual(['place', 'place', ...Array(AI_LIMITS.row).fill('place'), 'venue']);
    expect(dropped).toBe(9);   // replaceProject, eval, the hoop, the path, the id-only venue edit, a string, null, 42, clear "everything"
    const ops = JSON.stringify(edits);
    for (const bad of ['replaceProject', 'eval', 'fetch(', 'hoop', 'passwd', 'javascript:', 'onload', 'polluted', 'stolen', 'apocalypse', 'hail', 'dunk']) expect(ops, bad).not.toContain(bad);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('the venue edit keeps nothing that names the base, the objects or an id; only valid settings', () => {
    const v = edits.find((e) => e.op === 'venue');
    expect(v).toEqual({ op: 'venue', set: { glossyFloor: false } });   // 'yes' is not true; a bad mood / weather / sky are not kept
  });
  it('compiles to objects the import sanitiser would keep: inside the limits, the name is text, no foreign keys', () => {
    const p = fresh();
    const c = compileAiEdits(p.venues[0], edits, 'hostile')!;
    const s = execute(createStack(p), c.cmd);
    const objs = s.doc.venues[0].objects;
    const flood = objs.find((o) => o.type === 'fixture')!;
    expect(flood.t.p[0]).toBe(AI_LIMITS.reach);
    expect(flood.t.p[2]).toBe(-AI_LIMITS.reach);
    expect(flood.t.ry).toBe(0);
    expect(flood.t.s).toBe(4);
    expect(flood).toMatchObject({ height: LIMITS.fixtureHeight[1], color: '#f4f7ff' });   // the catalog's colour: the bad one is not a colour
    expect(flood.name).toBe('<img src=x onerror=alert(1)>');   // control characters gone; the rest is a label React prints as text
    expect(flood).not.toHaveProperty('onload');
    const stand = objs.find((o) => o.type === 'crowdStand')!;
    expect(stand).toMatchObject({ width: LIMITS.standWidth[0], rows: LIMITS.standRows[1], gaps: 0.9, posture: 'seated' });
    expect(stand.id).not.toBe('venue_0');
    expect(s.doc.venues[0].base).toEqual({ spec: 'tennis', target: 'tiebreak' });
    expect(sanitizeProject(JSON.parse(JSON.stringify(s.doc)))).toMatchObject({ ok: true, dropped: 0 });
  });
});

describe('answers that are not answers', () => {
  it('prose, an empty object, a number: no edits, and no command', () => {
    for (const a of [PROSE_ANSWER, '{}', '42', '', null, undefined, { edits: 'all of them' }]) {
      const r = sanitizeAiEdits(a);
      expect(r.edits).toEqual([]);
      expect(compileAiEdits(fresh().venues[0], r.edits, 'x')).toBeNull();
    }
    expect(parseAnswer(PROSE_ANSWER)).toBeNull();
  });
  it('a flood is capped: edits per answer and placements per answer', () => {
    const r = sanitizeAiEdits(floodAnswer(500));
    expect(r.edits.length).toBe(AI_LIMITS.edits);
    expect(r.dropped).toBe(500 - AI_LIMITS.edits);
  });
  it('clear removes unlocked objects of a type, never a locked one, inside the same step', () => {
    const p = everyKindProject();
    const v = p.venues[0];
    v.objects[0].locked = true;
    const c = compileAiEdits(v, [{ op: 'clear', type: 'all' }], 'clear')!;
    expect(c.removed).toBe(v.objects.length - 1);
    expect(execute(createStack(p), c.cmd).doc.venues[0].objects.map((o) => o.id)).toEqual([v.objects[0].id]);
  });
});

describe('what the model is told', () => {
  it('the closed vocabulary and the catalog; the brief carries the venue and nothing about the creator', () => {
    const sys = aiVenueSystem();
    for (const s of ['"op":"venue"', '"op":"place"', '"op":"row"', '"op":"clear"', 'fixture:flood', 'crowd:bleacher', 'JSON ONLY']) expect(sys).toContain(s);
    const p = everyKindProject();
    p.characters.push({ id: 'c1', name: 'Me', lookCode: 'FEL1.secret.abc' });
    const user = aiVenueUser('x'.repeat(5000), p.venues[0]);
    expect(user.length).toBeLessThan(6000);
    expect(user).not.toContain('FEL1');
    expect(Object.keys(venueBrief(p.venues[0]))).not.toContain('characters');
  });
  it('the review list says what each edit does', () => {
    const { edits } = sanitizeAiEdits(GOOD_ANSWER);
    const lines = edits.map(describeEdit);
    expect(lines[0]).toMatch(/^Venue: name Night Beach Court · mood nightGame/);
    expect(lines).toContain('Place Floodlight at (-9.0, -14.0)');
  });
});
