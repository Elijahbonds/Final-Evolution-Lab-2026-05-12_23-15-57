// EXERCISE-LIBRARY (2026-10-25): Ask — the deterministic parser on realistic questions, the AI layer's grounding, and
// the injury guard. The relevance table is printed (precision of the top 5, judged by the predicate written next to
// each question) so the report can quote it.
import { describe, expect, it } from 'vitest';
import { AI_COACH_DISCLOSURE } from '@/lib/coach/aiSystemPrompt';
import { PAIN_DECISION_COPY } from '@/lib/health/painRule';
import { loadLibraryFiles } from '../files';
import { buildIndex } from '../search/engine';
import type { LibraryExercise } from '../types';
import { PREHAB_NOTE } from '../vocab';
import { cleanWhy, parseAiReply } from './ai';
import { answerAsk } from './answer';
import { parseAsk } from './parse';

const ALL = loadLibraryFiles();
const index = buildIndex(ALL);
const OPTS = { drafts: true, limit: 5 } as const;

const AMBIENT = ['wall', 'mat', 'towel'];
const bodyweight = (e: LibraryExercise) => e.equipment.every((x) => AMBIENT.includes(x));
const muscles = (e: LibraryExercise) => [...e.primaryMuscles, ...e.secondaryMuscles];
const has = (re: RegExp) => (e: LibraryExercise) => re.test(e.name);

/** [question, what a relevant top-5 result is] — the predicate is the judgement, written down. */
const CASES: [string, (e: LibraryExercise) => boolean][] = [
  ['knee-friendly exercises for vertical jump with no equipment', (e) => bodyweight(e) && e.lowLoad.includes('knee') && e.goals.includes('vertical')],
  ['something easier than a pistol squat', (e) => ['squat', 'lunge'].includes(e.pattern) && e.laterality !== 'bilateral' && e.level !== 'advanced'],
  ['warm-up for basketball, 10 minutes', (e) => ['mobility', 'prehab', 'speed-agility', 'plyometric', 'sport-skill', 'recovery'].includes(e.category) && e.level === 'beginner'],
  ['harder than a push-up', (e) => e.pattern === 'push' && e.level !== 'beginner'],
  ['dumbbell hamstring exercises', (e) => e.equipment.includes('dumbbell') && muscles(e).includes('hamstrings')],
  ['kettlebell swing alternatives', (e) => e.pattern === 'hinge' && muscles(e).some((m) => ['glutes', 'hamstrings'].includes(m))],
  ['ankle stability drills', (e) => e.goals.includes('ankle') || e.goals.includes('balance')],
  ['core exercises without equipment', (e) => bodyweight(e) && (e.goals.includes('trunk') || e.category === 'core')],
  ['beginner lunges', (e) => e.pattern === 'lunge' && e.level === 'beginner'],
  ['plyometrics for volleyball', (e) => e.category === 'plyometric' && e.sportTags.includes('volleyball')],
  ['ball handling drills', (e) => e.goals.includes('handles')],
  ['defensive footwork for basketball', (e) => e.sportTags.includes('basketball') && (e.goals.includes('defense') || e.goals.includes('footwork') || e.goals.includes('agility'))],
  ['shoulder prehab with bands', (e) => e.equipment.includes('band') && (e.goals.includes('shoulder') || e.category === 'prehab')],
  ['speed drills for soccer', (e) => e.goals.includes('speed') && e.sportTags.includes('soccer')],
  ['easy on my back strength exercises', (e) => e.lowLoad.includes('back')],
  ['glute exercises at home with no weights', (e) => bodyweight(e) && e.primaryMuscles.includes('glutes')],
  ['cool down after practice', (e) => ['recovery', 'mobility'].includes(e.category)],
  ['jump rope workout', (e) => e.equipment.includes('jump-rope')],
  ['finishing drills around the rim', (e) => e.goals.includes('finishing')],
  ['how do i improve my first step', (e) => e.goals.includes('speed')],
  ['landing mechanics for jumpers', (e) => e.goals.includes('landing')],
  ['advanced kettlebell exercises', (e) => e.equipment.includes('kettlebell') && e.level !== 'beginner'],
  ['single leg balance', (e) => e.laterality === 'unilateral' && (e.goals.includes('balance') || /single-leg|one leg|single leg/i.test(e.name))],
  ['low impact conditioning', (e) => e.goals.includes('conditioning') && e.category !== 'plyometric'],
  ['tibialis raises', (e) => muscles(e).includes('tibialis')],
  ['pull up progressions', has(/pull[- ]?ups?|chin|hang|pullup/i)],
  ['something like a goblet squat but with dumbbells', (e) => e.pattern === 'squat' && e.equipment.includes('dumbbell')],
  ['rotational power with a med ball', (e) => e.equipment.includes('medicine-ball') && (e.goals.includes('power') || e.pattern === 'rotation')],
  ['mobility for tight hips', (e) => e.goals.includes('mobility') || e.category === 'mobility'],
  ['hamstring curls without a machine', (e) => !e.equipment.includes('machine') && muscles(e).includes('hamstrings') && /curl/i.test(e.name)],
  ['box jump progression', (e) => e.equipment.includes('box') && e.category === 'plyometric'],
  ['trap bar deadlift', has(/trap bar/i)],
  ['triceps with cable', (e) => e.equipment.includes('cable') && muscles(e).includes('triceps')],
  ['posture exercises for desk workers', (e) => e.goals.includes('posture')],
  ['grip strength', (e) => e.goals.includes('grip')],
  ['easier version of nordic curl', (e) => e.pattern === 'hinge' && muscles(e).includes('hamstrings') && e.level !== 'advanced'],
  ['harder pogo', (e) => /pogo|hop/i.test(e.name) && e.level !== 'beginner'],
  ['10 minute warm-up before lifting', (e) => ['mobility', 'prehab', 'speed-agility', 'plyometric', 'recovery'].includes(e.category)],
  ['vertical jump training for beginners', (e) => e.goals.includes('vertical') && e.level === 'beginner'],
  ['sprint mechanics drills', (e) => e.category === 'speed-agility' && e.goals.includes('speed')],
  ['agility ladder drills', (e) => e.equipment.includes('agility-ladder')],
  ['quiet exercises for an apartment', (e) => e.category !== 'plyometric'],
  ['lateral quickness for defense', (e) => e.goals.includes('agility') || e.goals.includes('defense')],
  ['upper body pull with no equipment', (e) => e.pattern === 'pull' && bodyweight(e)],
  ['push exercises for chest with dumbbells', (e) => e.pattern === 'push' && e.equipment.includes('dumbbell') && muscles(e).includes('chest')],
  ['bodyweight squats for kids', (e) => e.pattern === 'squat' && bodyweight(e) && e.youthOk],
  ['explosive med ball throws', (e) => e.equipment.includes('medicine-ball')],
  ['copenhagen plank', has(/copenhagen/i)],
];

describe('Ask: the deterministic parser (AI off)', () => {
  it('reads the three brief examples into the expected chips', () => {
    const a = parseAsk('knee-friendly exercises for vertical jump with no equipment');
    expect(a.filters).toMatchObject({ lowLoad: ['knee'], equipment: [], equipmentOnly: true, goal: ['vertical'] });
    const b = parseAsk('something easier than a pistol squat');
    expect(b.relation).toEqual({ kind: 'easier', anchorText: 'pistol squat' });
    const c = parseAsk('warm-up for basketball, 10 minutes');
    expect(c).toMatchObject({ intent: 'warmup', minutes: 10, filters: { sport: ['basketball'] } });
    for (const p of [a, b, c]) expect(p.chips.length).toBeGreaterThan(0);
  });

  it(`answers ${CASES.length} realistic questions with relevant top results`, async () => {
    const rows: string[] = [];
    let sum = 0;
    for (const [q, relevant] of CASES) {
      const ans = await answerAsk(index, q, OPTS);
      const top = ans.results.slice(0, 5);
      const p = top.length ? top.filter(relevant).length / top.length : 0;
      sum += p;
      rows.push(`${(p * 100).toFixed(0).padStart(3)}%  ${q}  →  ${top.map((e) => e.name).join('; ')}`);
      expect(top.length, q).toBeGreaterThan(0);
    }
    const mean = sum / CASES.length;
    // the table the report quotes
    console.log(`Ask relevance, top-5 precision, ${CASES.length} questions, mean ${(mean * 100).toFixed(1)}%\n${rows.join('\n')}`);
    expect(mean).toBeGreaterThanOrEqual(0.85);
  });

  it('the warm-up is a plan that adds up to the minutes asked', async () => {
    const a = await answerAsk(index, 'warm-up for basketball, 10 minutes', OPTS);
    expect(a.plan!.length).toBeGreaterThanOrEqual(4);
    expect(a.plan!.reduce((s, p) => s + p.minutes, 0)).toBe(10);
    expect(new Set(a.plan!.map((p) => p.entry.id)).size).toBe(a.plan!.length);
  });

  it('"easier than" walks the library\'s own links and stays below the anchor', async () => {
    const a = await answerAsk(index, 'something easier than a pistol squat', OPTS);
    expect(a.anchor?.name).toBe('Pistol Squat');
    const rank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
    expect(a.results.every((e) => rank[e.level] <= rank[a.anchor!.level])).toBe(true);
    expect(a.results.map((e) => e.id)).toContain(a.anchor!.regressionId);
  });

  it('never drops the person\'s equipment or joint limits to find something', async () => {
    const a = await answerAsk(index, 'knee-friendly box jumps with no equipment', OPTS);
    expect(a.relaxed).not.toContain('equipment');
    expect(a.results.every((e) => bodyweight(e) && e.lowLoad.includes('knee'))).toBe(true);
  });

  it('youth: an under-18 asker never sees an adults-only entry', async () => {
    for (const q of ['depth jumps', 'nordic curl', 'advanced plyometrics', 'something harder than a box jump']) {
      const a = await answerAsk(index, q, { ...OPTS, youth: true, limit: 20 });
      expect(a.results.every((e) => e.youthOk), q).toBe(true);
    }
  });
});

describe('Ask: the injury guard', () => {
  const PAIN = ['my knee hurts when i squat', 'exercises after acl surgery', 'I tweaked my ankle, what can I do', 'sore lower back from deadlifts', 'rehab for a sprained wrist', 'what helps tendonitis in my shoulder', 'I have a bad back', 'pulled my hamstring yesterday'];
  for (const q of PAIN) {
    it(`"${q}" → the existing see-a-professional wording and general prehab only`, async () => {
      let called = 0;
      const a = await answerAsk(index, q, { ...OPTS, ai: { call: async () => { called++; return '{"ids": []}'; } } });
      expect(a.safety).toEqual([AI_COACH_DISCLOSURE, PAIN_DECISION_COPY.stop_see_clinician]);
      expect(a.results.length).toBeGreaterThan(0);
      expect(a.results.every((e) => e.category === 'prehab' && e.prehabNote === PREHAB_NOTE)).toBe(true);
      expect(called).toBe(0);
      expect(a.ai.used).toBe(false);
    });
  }
  it('a minor gets the tell-an-adult line', async () => {
    const a = await answerAsk(index, 'my knee hurts', { ...OPTS, youth: true });
    expect(a.safety).toEqual([AI_COACH_DISCLOSURE, PAIN_DECISION_COPY.stop_tell_adult]);
  });
  it('a joint preference is not an injury question', () => {
    for (const q of ['knee-friendly vertical jump work', 'easy on my back core work', 'low impact conditioning', 'ankle stability drills']) expect(parseAsk(q).injury.flagged, q).toBe(false);
  });
});

describe('Ask: the AI layer is grounded', () => {
  it('with the AI off, the parser answers on its own', async () => {
    const a = await answerAsk(index, 'kettlebell swing alternatives', { ...OPTS, ai: null });
    expect(a.ai.used).toBe(false);
    expect(a.results.length).toBeGreaterThan(0);
  });
  it('ids outside the candidates (or the library) are dropped; the order of real ones is kept', async () => {
    const real = ALL.filter((e) => e.equipment.includes('kettlebell')).slice(0, 3).map((e) => e.id);
    let seen = '';
    const a = await answerAsk(index, 'kettlebell exercises', {
      ...OPTS,
      ai: { call: async (_s, u) => { seen = u; const cands = JSON.parse(u).candidates.map((c: { id: string }) => c.id); return JSON.stringify({ ids: ['invented-super-squat', cands[2], 'pistol-squat-of-doom', cands[0]], why: 'These build hip power with one bell.' }); } },
    });
    const cands = JSON.parse(seen).candidates.map((c: { id: string }) => c.id) as string[];
    expect(a.ai.used).toBe(true);
    expect(a.results[0].id).toBe(cands[2]);
    expect(a.results[1].id).toBe(cands[0]);
    expect(a.results.every((e) => index.byId.has(e.id))).toBe(true);
    expect(a.results.some((e) => e.id === 'invented-super-squat')).toBe(false);
    expect(a.ai.why).toBe('These build hip power with one bell.');
    void real;
  });
  it('parseAiReply keeps only candidate ids and vocabulary filters', () => {
    const cands = [{ id: 'goblet-squat', name: 'Goblet Squat' }, { id: 'pogo-hop', name: 'Pogo Hop' }];
    const r = parseAiReply('noise {"ids":["pogo-hop","nope","goblet-squat","pogo-hop"],"filters":{"equipment":["kettlebell","laser-sword"],"mood":["happy"],"level":["beginner"]},"why":"Simple ones."} noise', cands)!;
    expect(r.ids).toEqual(['pogo-hop', 'goblet-squat']);
    expect(r.filters).toEqual({ equipment: ['kettlebell'], level: ['beginner'] });
    expect(parseAiReply('not json', cands)).toBeNull();
  });
  it('the why-line is dropped when it gives a dose, a medical word, or names an exercise that is not a candidate', () => {
    const cands = [{ name: 'Goblet Squat' }];
    expect(cleanWhy('Do 3 sets of 10 reps.', cands)).toBeNull();
    expect(cleanWhy('Great to rehab a torn ACL.', cands)).toBeNull();
    expect(cleanWhy('This will cure your tendinitis.', cands)).toBeNull();
    expect(cleanWhy('Try "Bulgarian Hyper Squat" first.', cands)).toBeNull();
    expect(cleanWhy('Start with "Goblet Squat" to own the bottom position.', cands)).toBe('Start with "Goblet Squat" to own the bottom position.');
    expect(cleanWhy('x'.repeat(250), cands)).toBeNull();
  });
  it('a model that throws or returns junk leaves the deterministic answer untouched', async () => {
    const base = await answerAsk(index, 'ball handling drills', OPTS);
    const boom = await answerAsk(index, 'ball handling drills', { ...OPTS, ai: { call: async () => { throw new Error('down'); } } });
    const junk = await answerAsk(index, 'ball handling drills', { ...OPTS, ai: { call: async () => 'I think you should dribble.' } });
    expect(boom.results.map((e) => e.id)).toEqual(base.results.map((e) => e.id));
    expect(junk.results.map((e) => e.id)).toEqual(base.results.map((e) => e.id));
    expect(boom.ai.used || junk.ai.used).toBe(false);
  });
  it('the model is told the youth status and never sees cue text or doses', async () => {
    let sys = '';
    let user = '';
    await answerAsk(index, 'kettlebell exercises', { ...OPTS, youth: true, ai: { call: async (s, u) => { sys = s; user = u; return '{}'; } } });
    expect(sys).toMatch(/IS a minor on file/);
    expect(user).not.toMatch(/"cues"|"dosage"|"setup"|"faults"/);
  });
});
