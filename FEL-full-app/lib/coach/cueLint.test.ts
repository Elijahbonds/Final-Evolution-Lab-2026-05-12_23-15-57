// FEL's external-focus cue policy, held over every cue it covers (MIRROR-COACH P9, 2026-09-30). The policy and its four
// rules: lib/coach/cueLint.ts. Before P9 two headers said "external-focus cues" and nothing checked it. Run over the
// pre-P9 tree (HEAD 72b49537), this lint fails 90 of 398 lines (p9/feedback-cues/cuelint-before.json): 84 in FEL's own
// words — 35 template cues and fixes, 31 Mirror pattern-audit cues, 11 of the live coach's lines, 7 warm-up cues — all
// rewritten; and 6 of the owner's (the Playbook's light-punch set-up cue, three Wake-Up phases), allow-listed with why —
// reported, not rewritten (CLAUDE.md: a stricter guard that turns the owner's work red is a finding).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BODY_WORDS, CUE_ALLOW, EFFECT_WORDS, MUSCLE_WORDS, SCREEN_FIX_IDS, TEMPLATE_SETUP_LINES, WORLD_WORDS, cueCorpus, leadClause, lintCue,
  type CueEntry,
} from './cueLint';
import { SETUP_CUES } from './taxonomy';

const corpus = cueCorpus();
const byId = new Map(corpus.map((e) => [e.id, e] as [string, CueEntry]));

describe('the rules catch internal-focus cues (negative controls) and let external ones through (positive controls)', () => {
  // the classic internal cues, one per rule — every one must fail
  const INTERNAL: [string, string][] = [
    ['Squeeze your glutes at the top.', 'muscle'],
    ['Engage your core before you lift.', 'muscle'],
    ['Feel your hamstrings stretch.', 'muscle'],
    ['Relax your traps.', 'muscle'],
    ['Contract, relax, sink a little further.', 'squeeze'],
    ['Pack the chin and go.', 'squeeze'],
    ['Brace hard, then pull.', 'squeeze'],
    ['Squeeze at the top.', 'squeeze'],
    ['Knees out.', 'leads'],
    ['Shoulders down and back.', 'leads'],
    ['Heels heavy — pull the floor toward your heel.', 'leads'],
    ['Tuck your chin.', 'anchored'],
    ['Stack tall — shoulders level over your hips.', 'anchored'],
    ['Keep your shin still — let your hips move, not your knee.', 'leads'],
  ];
  it.each(INTERNAL)('fails: "%s" (%s)', (text, rule) => {
    const f = lintCue(text, 'attention');
    expect(f.map((x) => x.rule)).toContain(rule);
  });

  const EXTERNAL = [
    'Push the floor away.',
    'Reach the wall.',
    'Spread the floor apart with your feet — all the way down, all the way up.',
    'Push the wall behind you with your hips.',
    'Crush the handle.',
    'Squeeze the bag tighter and lead the stand with your chest.',
    'Brace for a light punch, then push the floor away.',
    'Land quiet: as little sound as you can.',
    'Grow tall toward the ceiling.',
    'Still drifting. Slow the descent and sit into it.',
    'Set up a hand-width closer to the bar than feels natural.',
  ];
  it.each(EXTERNAL)('passes: "%s"', (text) => {
    expect(lintCue(text, 'attention')).toEqual([]);
  });

  it('an instruction may name where the body goes (rules 1–2 only); an attention cue may not lead with it', () => {
    const t = 'Forearms on a bench, elbows under the shoulders.';
    expect(lintCue(t, 'instruction')).toEqual([]);
    expect(lintCue('Elbows under the shoulders, then go.', 'attention').map((f) => f.rule)).toEqual(['leads', 'anchored']);
    // …and an instruction still may not ask for a muscle or a squeeze
    expect(lintCue('Stand tall, glutes squeezed.', 'instruction').map((f) => f.rule)).toEqual(['muscle', 'squeeze']);
    expect(lintCue('Hold, then squeeze for five seconds.', 'instruction').map((f) => f.rule)).toEqual(['squeeze']);
  });

  it('the narrow words stay narrow: "still" only as the whole body holding still, "trap bar" is equipment, "as you step" is not a step', () => {
    expect(EFFECT_WORDS.test('Still drifting')).toBe(false);
    expect(EFFECT_WORDS.test('hold still where it stops')).toBe(true);
    expect(EFFECT_WORDS.test('Stack tall')).toBe(false);
    expect(MUSCLE_WORDS.test('Trap Bar Deadlift')).toBe(false);
    expect(MUSCLE_WORDS.test('the trap stays out of this')).toBe(true);
    expect(WORLD_WORDS.test('Keep both hips level as you step')).toBe(false);
    expect(WORLD_WORDS.test('Set the front foot a little further from the step')).toBe(true);
    expect(BODY_WORDS.test('Step back softly')).toBe(false);          // "back" as a direction is not the body
    expect(leadClause('Heel, big toe, little toe: press all three into the floor.')).toMatch(/floor/);   // a colon does not split
    expect(leadClause('Knees out — press the floor apart.')).toBe('Knees out ');
  });
});

describe('the corpus: every cue the policy covers', () => {
  it('reaches every source it names, with ids unique', () => {
    const prefixes = ['mirror-coach:', 'pattern:lunge:', 'pattern:pushup:', 'pattern:overhead:', 'pattern:carry:', 'pattern:hinge:',
      'pattern:setupLine:', 'setup:', 'template:', 'warmup:', 'wakeup:'];
    for (const p of prefixes) expect(corpus.some((e) => e.id.startsWith(p)), p).toBe(true);
    expect(new Set(corpus.map((e) => e.id)).size).toBe(corpus.length);
    // the live coach's eight cards, three levels each, and (MIRROR-MOVES P2) each card's reply to a repeated fault
    expect(corpus.filter((e) => e.id.startsWith('mirror-coach:'))).toHaveLength(32);
    expect(corpus.filter((e) => e.id.endsWith(':reply')).length).toBeGreaterThanOrEqual(8 + 5 + 3 + 4);   // + lunge, hinge, push-up
    expect(corpus.length).toBeGreaterThanOrEqual(390);
  });

  it('every cue passes, or is allow-listed', () => {
    const failing = corpus
      .map((e) => ({ id: e.id, text: e.text, findings: lintCue(e.text, e.tier) }))
      .filter((x) => x.findings.length && !CUE_ALLOW[x.id]);
    expect(failing).toEqual([]);
  });
});

// MIRROR-COACH P9 fix (2026-09-30, code review): every template primaryCue was linted as an instruction; run at the
// attention tier 38 failed. Now each is an attention cue unless TEMPLATE_SETUP_LINES names it a set-up, with a reason.
describe('P9 fix: template cues are attention cues unless named a set-up', () => {
  const templatePrimary = corpus.filter((e) => /^template:.+:primary\d+$/.test(e.id));

  it('every template primaryCue is linted at the attention tier except the named set-ups', () => {
    expect(templatePrimary.length).toBeGreaterThanOrEqual(190);
    for (const e of templatePrimary) expect(e.tier, e.id).toBe(TEMPLATE_SETUP_LINES[e.id] ? 'instruction' : 'attention');
  });

  it('each set-up entry exists, needs the list (it would fail as an attention cue), passes as an instruction, and says why', () => {
    const ids = Object.keys(TEMPLATE_SETUP_LINES);
    expect(ids.length).toBeLessThanOrEqual(10);
    for (const id of ids) {
      const e = byId.get(id);
      expect(e, `${id} is not in the corpus`).toBeTruthy();
      expect(lintCue(e!.text, 'attention').length, `${id} passes as an attention cue — remove it from TEMPLATE_SETUP_LINES`).toBeGreaterThan(0);
      expect(lintCue(e!.text, 'instruction'), id).toEqual([]);
      expect(TEMPLATE_SETUP_LINES[id], id).toMatch(/^(SET-UP|DRILL) — .{20,}/);
    }
  });

  it('the movement cues the review named now lead with the world, in FEL\'s words', () => {
    const text = (id: string) => byId.get(id)!.text;
    for (const id of ['template:glute-bridge-close:primary1', 'template:breathing-plank-taps:primary1', 'template:door-row:primary1',
      'template:hip-snap:primary1', 'template:split-squat-hold:primary1', 'template:db-rdl:primary1', 'template:rfe-split-squat:primary1']) {
      expect(byId.get(id)!.tier, id).toBe('attention');
      expect(lintCue(text(id), 'attention'), id).toEqual([]);
    }
    expect(text('template:glute-bridge-close:primary1')).toBe('Push the floor away through your heels until knees, hips and shoulders make one straight line.');
    expect(text('template:door-row:primary1')).toBe('Pull your chest to the door frame fast, lower slow.');
  });

  it('the screen\'s "What to do:" lines and the cool-down breath are in the corpus now; no FIX line names a muscle', () => {
    for (const id of SCREEN_FIX_IDS) expect(byId.get(`screen-fix:${id}`), id).toBeTruthy();
    for (const id of SCREEN_FIX_IDS) expect(lintCue(byId.get(`screen-fix:${id}`)!.text, 'instruction'), id).toEqual([]);
    expect(byId.get('screen-fix:kneeWindow')!.text).not.toMatch(/glute/i);
    expect(byId.get('cooldown:recovery-breath:cue')!.tier).toBe('attention');
    expect(corpus.some((e) => e.id.startsWith('cooldown:recovery-breath:line'))).toBe(true);
  });

  it('"band" is an implement (the world), so a band pull-apart is an external cue', () => {
    expect(WORLD_WORDS.test('the band')).toBe(true);
    expect(lintCue('Pull the band apart to your chest, return slow.', 'attention')).toEqual([]);
  });
});

describe('the allow-list: small, owner-only or unavoidable, and never stale', () => {
  const entries = Object.entries(CUE_ALLOW);

  it('each entry names a cue that exists and still fails (a fixed cue leaves the list)', () => {
    for (const [id] of entries) {
      const e = byId.get(id);
      expect(e, `${id} is not in the corpus`).toBeTruthy();
      expect(lintCue(e!.text, e!.tier).length, `${id} passes now — remove it from CUE_ALLOW`).toBeGreaterThan(0);
    }
  });

  it('each reason says which kind it is, and says why', () => {
    for (const [id, why] of entries) {
      expect(why, id).toMatch(/^(OWNER|UNAVOIDABLE|OWNER and UNAVOIDABLE) — /);
      expect(why.length, id).toBeGreaterThan(40);
    }
  });

  // MIRROR-COACH P9 fix (2026-09-30, code review): the corpus now takes the cool-down's breath (it was left out "by
  // scope"), and its cue is the Playbook's ch9 recovery breath — "Lie on your back … Place one hand on the belly, one on
  // the lower ribs … Exhale through pursed lips for 6 seconds" — so it is the owner's words, found in the Playbook itself
  // here, not taken on a comment's say-so. That is the one entry this adds, and the ceiling moves from 6 to 7 with it
  // (flagged in the P9 fix report: a guard widened by exactly the owner line it now has to hold).
  it('only the owner\'s words are on it: the Wake-Up (lib/drills), the Playbook\'s set-up cues and its recovery breath — no FEL-written cue', () => {
    const playbook = readFileSync('lib/education/playbook.data.json', 'utf8');
    for (const [id] of entries) {
      const e = byId.get(id)!;
      const ownersSetupCue = id.startsWith('setup:') && SETUP_CUES.find((c) => `setup:${c.id}` === id)?.source !== 'fel';
      const playbookBreath = id === 'cooldown:recovery-breath:cue'
        && playbook.includes('Place one hand on the belly, one on the lower ribs.') && playbook.includes('Exhale through pursed lips for 6 seconds')
        && /one hand on your belly, one on your lower ribs/.test(e.text) && /pursed lips for 6/.test(e.text);
      expect(e.file === 'lib/drills/drills.ts' || ownersSetupCue || playbookBreath, id).toBe(true);
    }
    expect(entries.length).toBeLessThanOrEqual(7);
  });
});
