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

// ── studio-4b ─────────────────────────────────────────────────────────────────────────────────────────────────────────
import { RALLY_PROMPT, SCRIPT_CAST_ANSWER, HOSTILE_SCRIPT_ANSWER, EXPLAIN_ANSWER } from '@/tests/helpers/aiVenue';
import { aiExplainSystem, aiExplainUser, resolveCastName, reviewAiEdits, sanitizeSummary, venueForAi } from './aiEdits';
import { NODE_KINDS, groupOf } from './scripts';
import { createInterpreter } from './interpreter';

function withCharacters() {
  const p = fresh();
  p.characters = [{ id: 'c_nova', name: 'Nova', lookCode: 'FEL2.secretlook.abcdefg' }, { id: 'c_ace', name: 'Ace', lookCode: 'FEL2.secretace.abcdefg' }];
  return p;
}

describe('studio-4b: CELL proposes scripts and casts', () => {
  const { edits, dropped } = sanitizeAiEdits(SCRIPT_CAST_ANSWER);
  it('a script and three casts survive; the script is the vocabulary\'s own graph, laid out by the Studio', () => {
    expect(dropped).toBe(0);
    expect(edits.map((e) => e.op)).toEqual(['script', 'cast', 'cast', 'cast']);
    const sc = edits[0] as Extract<typeof edits[number], { op: 'script' }>;
    expect(sc.graph.nodes.map((n) => n.kind)).toEqual(['onRally', 'cooldown', 'crowd', 'banner']);
    expect(sc.graph.edges).toHaveLength(3);
    expect(sc.graph.nodes.map((n) => n.x)).toEqual([40, 280, 520, 520]);   // the model's 9999 is not used
    expect(new Set(sc.graph.nodes.map((n) => n.id)).size).toBe(4);
    for (const n of sc.graph.nodes) expect(['e', 'c', 'a1', 'a2']).not.toContain(n.id);   // minted, not the model's
  });
  it('apply is ONE step: the script (scoped to this venue), the player and the fans; a name nobody has is left out; Undo takes it all', () => {
    const p = withCharacters();
    const v = p.venues[0];
    const c = compileAiEdits(v, edits, RALLY_PROMPT, p)!;
    expect(c).toMatchObject({ scripts: 1, cast: 2 });
    let s = execute(createStack(p), c.cmd);
    expect(s.past).toHaveLength(1);
    const built = s.doc;
    expect(built.scripts).toHaveLength(1);
    expect(built.scripts[0]).toMatchObject({ name: 'Rally cheer', enabled: true, venues: [v.id] });
    expect(built.venues[0].cast).toEqual({ player: 'c_nova', crowd: ['c_ace'] });
    // the script it adds runs: the rally reaches 5 → the crowd cheers and the banner
    const fired: string[] = [];
    const it2 = createInterpreter([{ id: 's', graph: built.scripts[0] }], (a) => fired.push(a.kind));
    it2.emit({ type: 'rally', length: 5, prev: 4 }, { myScore: 0, theirScore: 0, momentum: 0, elapsed: 0, hero: null, rally: 5 });
    expect(fired).toEqual(['crowd', 'banner']);
    expect(sanitizeProject(JSON.parse(JSON.stringify(built)))).toMatchObject({ ok: true, dropped: 0 });
    s = undo(s);
    expect([s.doc.venues, s.doc.scripts, s.doc.characters]).toEqual([p.venues, p.scripts, p.characters]);   // (updatedAt is the stack's)
  });
  it('the review says which cast is left out, and why', () => {
    const p = withCharacters();
    const r = reviewAiEdits(edits, p);
    expect(r[0].line).toMatch(/^Script “Rally cheer” \(this venue\): when Rally length, if … → Crowd reaction, HUD banner$/);
    expect(r[1]).toEqual({ line: 'Cast “Nova” as the player' });
    expect(r[2]).toEqual({ line: 'Seat “ace” among the fans → Ace' });
    expect(r[3].skipped).toMatch(/no single character called “Zed”/);
  });
  it('without the project, scripts and casts are left out (never half-applied)', () => {
    expect(compileAiEdits(fresh().venues[0], edits, 'x')).toBeNull();
  });
  it('names resolve exactly, then by a unique partial match; ambiguous or unknown is null', () => {
    const cs = [{ id: '1', name: 'Nova' }, { id: '2', name: 'Nova Prime' }, { id: '3', name: 'Ace' }];
    expect(resolveCastName(cs, '  nova ')?.id).toBe('1');
    expect(resolveCastName(cs, 'prime')?.id).toBe('2');
    expect(resolveCastName(cs, 'Aces')?.id).toBe('3');
    expect(resolveCastName([...cs, { id: '4', name: 'nova' }], 'Nova')).toBeNull();
    expect(resolveCastName(cs, 'Zed')).toBeNull();
    expect(resolveCastName(cs, '')).toBeNull();
  });
  it('the crowd is capped; the player can be given their own look back', () => {
    const p = withCharacters();
    p.characters.push(...['B', 'C', 'D', 'E'].map((n) => ({ id: `c_${n}`, name: n })));
    const many = ['Ace', 'B', 'C', 'D', 'E'].map((character) => ({ op: 'cast' as const, slot: 'crowd' as const, character }));
    const c = compileAiEdits(p.venues[0], many, 'x', p)!;
    expect(execute(createStack(p), c.cmd).doc.venues[0].cast?.crowd).toHaveLength(LIMITS.crowdCast);
    const cast = { ...p, venues: [{ ...p.venues[0], cast: { player: 'c_nova' } }] };
    const back = compileAiEdits(cast.venues[0], [{ op: 'cast', slot: 'player', character: null }], 'x', cast)!;
    expect(execute(createStack(cast), back.cmd).doc.venues[0]).not.toHaveProperty('cast');
  });
  it('a hostile answer: no code, no unknown kind, no score node, no loop, no rival slot, no injected look', () => {
    const r = sanitizeAiEdits(HOSTILE_SCRIPT_ANSWER);
    expect(r.edits.map((e) => e.op)).toEqual(['script']);
    expect(r.dropped).toBe(5);   // no action, a loop (no event), the rival, the injected look, a crowd with no name
    const sc = r.edits[0] as Extract<typeof r.edits[number], { op: 'script' }>;
    expect(sc.graph.nodes.map((n) => n.kind)).toEqual(['onScore', 'banner']);
    expect(sc.graph.edges).toHaveLength(1);   // a → e (into an event) refused
    const text = JSON.stringify(r.edits);
    for (const bad of ['fetch', 'exec', 'process', 'setScore', 'javascript:', 'FEL2.injected', 'rival']) expect(text, bad).not.toContain(bad);
    expect(sc.name).toBe('<script>alert(1)</script>');   // a name is a label the editor prints as text (as an object's name is)
    expect(sc.graph.nodes[1].params).toMatchObject({ tone: 'score' });
    expect(String(sc.graph.nodes[1].params.text)).toHaveLength(40);
    // every kind a proposal can carry is one the vocabulary has
    for (const n of sc.graph.nodes) expect(NODE_KINDS).toContain(n.kind);
    expect(groupOf(sc.graph.nodes[1].kind)).toBe('action');
  });
  it('a flood of scripts is capped per answer', () => {
    const one = JSON.parse(SCRIPT_CAST_ANSWER).edits[0];
    const r = sanitizeAiEdits({ edits: Array.from({ length: 10 }, () => one) });
    expect(r.edits).toHaveLength(AI_LIMITS.scripts);
    expect(r.dropped).toBe(10 - AI_LIMITS.scripts);
  });
});

describe('studio-4b: privacy — what a request carries', () => {
  it('the browser sends the venue without its cast; the brief, the prompt and the explain pass carry no character, name or look', () => {
    const p = withCharacters();
    const v = { ...p.venues[0], cast: { player: 'c_nova', crowd: ['c_ace'] } };
    expect(venueForAi(v)).not.toHaveProperty('cast');
    expect(venueForAi(v)).toEqual(p.venues[0]);
    for (const words of [aiVenueUser('make it a night court', v), aiExplainUser(v), aiVenueSystem(), aiExplainSystem()]) {
      for (const secret of ['c_nova', 'c_ace', 'Nova', 'Ace', 'FEL2', 'secretlook']) expect(words, secret).not.toContain(secret);
    }
  });
  it('the system words teach the script vocabulary and name-only casting', () => {
    const sys = aiVenueSystem();
    for (const s of ['"op":"script"', 'onRally(event; length:1..99)', 'onReplay(event; when:ends|starts)', 'banner(action;', '"op":"cast"', 'You are not told which characters exist']) expect(sys).toContain(s);
  });
});

describe('studio-4b: the explain pass', () => {
  it('a summary is text: no markup, no markdown, no control characters, no fenced block, capped', () => {
    const s = sanitizeSummary(EXPLAIN_ANSWER);
    expect(s).toBe('Night Court A night court under four floods. The far stand is packed.img src=x onerror=alert(1) Add palms on the left.');
    expect(s).not.toMatch(/[<>*#`\u0007]/);
    expect(sanitizeSummary('word. '.repeat(1000)).length).toBeLessThanOrEqual(AI_LIMITS.summary + 1);
    expect(sanitizeSummary(42)).toBe('');
    expect(sanitizeSummary('```json\n{}\n```')).toBe('');
  });
});
