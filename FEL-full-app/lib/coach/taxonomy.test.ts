// FEL's coaching taxonomy (MIRROR-COACH P2, 2026-09-25): every list is unique, documented against its source, and
// speaks the schema's own enum values — and none of its copy makes a claim FEL's rules forbid.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import playbook from '@/lib/education/playbook.data.json';
import { screenText } from '@/lib/share/screen';
import {
  EFFORT_BANDS, MAX_SETUP_CUES, PLAYBOOK_STEPS, SESSION_SECTIONS, SETUP_CUES, SKILL_LAYERS,
  effortBandForRir, effortBandForRpe, isEffortBandId, isSessionSection, isSetupCueId, isSkillLayerId, sectionLabel, sectionRank,
  setupCuesFor, suggestEffortBand,
} from './taxonomy';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
/** An enum's values, read out of prisma/schema.prisma. */
const enumValues = (name: string): string[] => {
  const m = new RegExp(`^enum ${name} \\{([^}]*)\\}`, 'm').exec(schema);
  if (!m) throw new Error(`enum ${name} is not in the schema`);
  return m[1].split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
};
const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;

describe('the ids are unique, and every list speaks the schema', () => {
  it('sections are the SessionSection enum, in running order, each with a label and a meaning', () => {
    expect(SESSION_SECTIONS.map((s) => s.id)).toEqual(enumValues('SessionSection'));
    expect(SESSION_SECTIONS.map((s) => s.id)).toEqual(['prep', 'prime', 'key', 'assist', 'finish', 'cooldown']);
    for (const s of SESSION_SECTIONS) { expect(s.label).toBeTruthy(); expect(s.meaning.length).toBeGreaterThan(15); }
    expect(sectionRank('prep')).toBe(0); expect(sectionRank('cooldown')).toBe(5);
    expect(sectionRank(null)).toBe(sectionRank('key')); expect(sectionRank('nonsense')).toBe(sectionRank('key'));
    expect(sectionLabel('cooldown')).toBe('Cool-down'); expect(sectionLabel(undefined)).toBe('Key');
    expect(isSessionSection('prime')).toBe(true); expect(isSessionSection('warmup')).toBe(false);
  });

  it('skill layers: unique ids and labels, lowercase slugs, each on one of the owner\'s four steps (or between sessions)', () => {
    const ids = SKILL_LAYERS.map((l) => l.id);
    expect(unique(ids)).toBe(true);
    expect(unique(SKILL_LAYERS.map((l) => l.label))).toBe(true);
    for (const l of SKILL_LAYERS) {
      expect(l.id).toMatch(/^[a-z][a-z-]*$/);
      expect(l.meaning.length).toBeGreaterThan(20);
      if (l.step !== null) expect(PLAYBOOK_STEPS.map((s) => s.id)).toContain(l.step);
    }
    // every step of the spine is served by at least one layer
    for (const s of PLAYBOOK_STEPS) expect(SKILL_LAYERS.some((l) => l.step === s.id)).toBe(true);
    expect(isSkillLayerId('tripod')).toBe(true); expect(isSkillLayerId('bracing')).toBe(false); expect(isSkillLayerId(3)).toBe(false);
  });

  it('effort bands: exactly five, unique, RPE 1–10 covered once each in order, and only the top one is adults-only', () => {
    expect(EFFORT_BANDS).toHaveLength(5);
    expect(unique(EFFORT_BANDS.map((b) => b.id))).toBe(true);
    expect(unique(EFFORT_BANDS.map((b) => b.label))).toBe(true);
    const covered = EFFORT_BANDS.flatMap((b) => Array.from({ length: b.rpe[1] - b.rpe[0] + 1 }, (_, i) => b.rpe[0] + i));
    expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const b of EFFORT_BANDS) { expect(b.meaning.length).toBeGreaterThan(20); expect(b.meaning.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3); }
    expect(EFFORT_BANDS.filter((b) => !b.youthAllowed).map((b) => b.id)).toEqual(['full']);
    expect(isEffortBandId('drive')).toBe(true); expect(isEffortBandId('moderate')).toBe(false);
  });

  it('set-up cues: unique ids, each on a real layer, each fitting real MovementPattern values, short enough to read before a rep', () => {
    const patterns = enumValues('MovementPattern');
    expect(unique(SETUP_CUES.map((c) => c.id))).toBe(true);
    expect(unique(SETUP_CUES.map((c) => c.text))).toBe(true);
    for (const c of SETUP_CUES) {
      expect(isSkillLayerId(c.layer)).toBe(true);
      expect(c.patterns.length).toBeGreaterThan(0);
      for (const p of c.patterns) expect(patterns).toContain(p);
      expect(c.text.length).toBeLessThanOrEqual(60);
      expect(c.source).toMatch(/^(playbook ch\d+|fel)$/);
    }
    expect(MAX_SETUP_CUES).toBe(3);
    expect(isSetupCueId('wall-behind')).toBe(true); expect(isSetupCueId('bend-the-bar')).toBe(false);
  });
});

describe('documented: every name is traceable to the owner\'s Playbook', () => {
  const chapters = (playbook as { chapters: { number: number; title: string; sections: { title: string }[] }[] }).chapters;

  it('each skill layer cites a Playbook chapter by its exact imported title (and section, where a chapter splits)', () => {
    for (const l of SKILL_LAYERS) {
      const ch = chapters.find((c) => c.number === l.playbook.chapter);
      expect(ch, `${l.id} cites chapter ${l.playbook.chapter}`).toBeTruthy();
      expect(ch!.title).toBe(l.playbook.title);
      if (l.playbook.section) expect(ch!.sections.map((s) => s.title)).toContain(l.playbook.section);
    }
  });

  it('the layers follow the Playbook\'s chapter order, and the four steps are the owner\'s own ch1 sequence', () => {
    const order = SKILL_LAYERS.map((l) => l.playbook.chapter);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const ch1 = JSON.stringify(chapters.find((c) => c.number === 1));
    expect(ch1).toContain('Assess → Correct → Load → Perform');
    expect(PLAYBOOK_STEPS.map((s) => s.label).join(' → ')).toBe('Assess → Correct → Load → Perform');
  });

  it('the throttle bands take their image from the Playbook (ch1 "opens the throttle")', () => {
    expect(JSON.stringify(chapters.find((c) => c.number === 1))).toMatch(/opens the throttle/);
  });

  it('a set-up cue marked as the owner\'s is findable in that chapter', () => {
    // the anchor words of each owner cue, as the Playbook writes them
    const anchors: Record<string, RegExp> = {
      'tripod-down': /Press all three into the floor/i,
      'wall-behind': /Push the wall behind you/i,
      'floor-away': /pushing the floor away/i,
      'front-heel': /Drive through the front heel/i,
      'light-punch': /light punch/i,
      'long-exhale': /air out longer than it came in/i,
      'quiet-landing': /landing quietly|Landings should be quiet/i,
      'stick-two': /stick is silent and balanced for two seconds/i,
    };
    for (const c of SETUP_CUES.filter((x) => x.source !== 'fel')) {
      const n = Number(c.source.replace('playbook ch', ''));
      expect(anchors[c.id], `${c.id} needs an anchor`).toBeTruthy();
      expect(JSON.stringify(chapters.find((x) => x.number === n))).toMatch(anchors[c.id]);
    }
  });
});

describe('IP and honesty rules hold for every line of copy', () => {
  const copy = [
    ...SESSION_SECTIONS.flatMap((s) => [s.label, s.meaning]),
    ...SKILL_LAYERS.flatMap((l) => [l.label, l.meaning]),
    ...EFFORT_BANDS.flatMap((b) => [b.label, b.meaning, b.rir]),
    ...SETUP_CUES.map((c) => c.text),
  ];

  it('no line trips FEL\'s claims screen (no named condition, no treatment claim, no guarantee)', () => {
    const flagged = copy.map((t) => ({ t, flags: screenText(t) })).filter((x) => x.flags.length);
    expect(flagged).toEqual([]);
  });

  it('no injury-prevention, risk or diagnosis language (builds capacity, never "reduces risk")', () => {
    for (const t of copy) expect(t).not.toMatch(/injur|prevent|reduc\w* risk|safe|diagnos|pain|heal|cure|treat|rehab|correct(ive)?\b/i);
  });

  it('no book or certification brand, method name or pillar label is used as a FEL name', () => {
    const banned = /pain-free performance|ppsc|linchpin|rusin|cordoza|biphasic|huff|tactical breath|positional breath/i;
    for (const t of copy) expect(t).not.toMatch(banned);
    // the certification's six pillars — no layer may be named for one (crossref ipRisks[0])
    const pillars = /^(breath|breathing|brac|center|centre|sequenc|screen|progress)/i;
    for (const l of SKILL_LAYERS) { expect(l.id).not.toMatch(pillars); expect(l.label).not.toMatch(pillars); }
  });
});

describe('suggesting a band', () => {
  it('reads an explicit RPE only', () => {
    expect(suggestEffortBand('RPE7')?.id).toBe('drive');
    expect(suggestEffortBand('@ rpe 8.5')?.id).toBe('surge');
    expect(suggestEffortBand('RPE 10')?.id).toBe('full');
    expect(suggestEffortBand('RPE2')?.id).toBe('idle');
    for (const load of ['24kg', '%85 1RM', 'body', '', null, undefined, 'RPE 11']) expect(suggestEffortBand(load)).toBeNull();
  });

  it('maps RPE and reps in reserve onto the same band (RIR = 10 − RPE)', () => {
    expect(effortBandForRpe(4)?.id).toBe('cruise');
    expect(effortBandForRpe(7.4)?.id).toBe('drive');
    expect(effortBandForRpe(0)).toBeNull(); expect(effortBandForRpe(NaN)).toBeNull();
    expect(effortBandForRir(0)?.id).toBe('full');
    expect(effortBandForRir(2)?.id).toBe('surge');
    expect(effortBandForRir(3)?.id).toBe('drive');
    expect(effortBandForRir(12)?.id).toBe('idle');
    expect(effortBandForRir(-1)).toBeNull();
  });

  it('lists the cues that fit the exercise\'s pattern first, and every cue either way', () => {
    const hinge = setupCuesFor('hinge');
    expect(hinge).toHaveLength(SETUP_CUES.length);
    const firstMiss = hinge.findIndex((c) => !c.patterns.includes('hinge'));
    expect(hinge.slice(0, firstMiss).map((c) => c.id)).toContain('wall-behind');
    expect(hinge.slice(firstMiss).every((c) => !c.patterns.includes('hinge'))).toBe(true);
    expect(setupCuesFor(null).map((c) => c.id)).toEqual(SETUP_CUES.map((c) => c.id));
  });
});
