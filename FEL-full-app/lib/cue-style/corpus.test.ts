// The copy screen (CUE-REWRITE, 2026-10-27): every word in scope of docs/CUE-STYLE.md, held to it.
//   · every line passes lintStyle at its tier (live 2–5 words, prompt ≤ 14, card ≤ 18, set-up ≤ 24, label ≤ 8, result ≤ 24;
//     no medical, shaming or body-image word; a technical term only with its gloss; a reading level per line);
//   · each surface reads at about 6th–8th grade on average;
//   · every result has what we saw / what it means / what to do next, and a number carries its meaning;
//   · a line about pain routes to stopping and to a person;
//   · one name per fault: the review labels, the flags and the Quick Screen rows read lib/cue-style/names.ts;
//   · the weekly draft's MEDICAL_WORDS screen, extended (style.ts isMedical), over every string in every file this lane
//     touched — the legal/policy disclaimers excepted by name (they are out of this lane's scope).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryCorpus, resultCorpus, styleCorpus, type StyleEntry } from './corpus';
import { grade, isMedical, lintStyle, MAX_MEAN_GRADE, mentionsPain, PAIN_ROUTE, wordCount } from './style';
import { shapeProblems } from './result';
import { FAULT_NAMES } from './names';
import { loadLibraryFiles } from '@/lib/library/files';
import { SQUAT_FAULT_LABEL } from '@/lib/mirror/squatStage';
import { LUNGE_FAULT_LABEL } from '@/lib/mirror/lungeStage';
import { HINGE_FAULT_LABEL } from '@/lib/mirror/hingeStage';
import { PUSHUP_FAULT_LABEL } from '@/lib/mirror/pushupStage';
import { PRESS_ROW_FAULT_LABEL } from '@/lib/mirror/pressRowStage';
import { faultPhrase, MOVEMENT_SPECS, REVIEW_MOVEMENTS } from '@/lib/coach/formReview/movements';
import { GRADED_CHECKS } from '@/lib/screen/PROPOSED-thresholds';

const ROOT = join(__dirname, '../..');
const corpus = styleCorpus();
const library = libraryCorpus(loadLibraryFiles());
const all: StyleEntry[] = [...corpus, ...library];

describe('every line passes the style screen at its tier', () => {
  it('the corpus covers every surface the owner named', () => {
    const surfaces = new Set(all.map((e) => e.surface));
    for (const s of ['mirror', 'form-review', 'quick-screen', 'readiness', 'vbt', 'sprint', 'library', 'programs']) expect(surfaces, s).toContain(s);
    expect(corpus.filter((e) => e.tier === 'live').length).toBeGreaterThan(60);
    expect(library.length).toBeGreaterThan(3000);
  });
  it('the app\'s own lines', () => {
    const bad = corpus.map((e) => ({ id: e.id, text: e.text, f: lintStyle(e.text, e.tier) })).filter((x) => x.f.length);
    expect(bad).toEqual([]);
  });
  it('the exercise library (every unique cue, fault, fix, set-up and caution)', () => {
    const bad = library.map((e) => ({ text: e.text, f: lintStyle(e.text, e.tier) })).filter((x) => x.f.length);
    expect(bad).toEqual([]);
  });
  it('a live cue is said in the moment: 2–5 words, every one', () => {
    for (const e of corpus.filter((x) => x.tier === 'live')) {
      expect(wordCount(e.text), e.id).toBeGreaterThanOrEqual(2);
      expect(wordCount(e.text), e.id).toBeLessThanOrEqual(5);
    }
  });
  it(`each surface reads at about a 6th–8th grade level on average (mean Flesch–Kincaid ≤ ${MAX_MEAN_GRADE})`, () => {
    const by = new Map<string, number[]>();
    for (const e of all) if (wordCount(e.text) >= 6) by.set(e.surface, [...(by.get(e.surface) ?? []), grade(e.text)]);
    for (const [s, g] of by) expect(g.reduce((a, b) => a + b, 0) / g.length, s).toBeLessThanOrEqual(MAX_MEAN_GRADE);
  });
});

describe('every result: what we saw / what it means / what to do next', () => {
  const results = resultCorpus();
  it('covers the Mirror, the form review, the Quick Screen, bar speed and sprint', () => {
    const surfaces = new Set(results.map((r) => r.surface));
    for (const s of ['mirror', 'form-review', 'quick-screen', 'vbt', 'sprint']) expect(surfaces, s).toContain(s);
  });
  it.each(results.map((r) => [r.id, r] as const))('%s', (_id, r) => {
    expect(shapeProblems(r.result)).toEqual([]);
    for (const part of [r.result.saw, r.result.means, r.result.next.text]) expect(lintStyle(part, 'result'), part).toEqual([]);
  });
});

describe('safety and appropriateness', () => {
  it('a line about pain routes to stopping and to a person (a question that asks about pain is not a route)', () => {
    for (const e of all) if (mentionsPain(e.text) && !/\?\s*$/.test(e.text)) expect(PAIN_ROUTE.test(e.text), `${e.id}: ${e.text}`).toBe(true);
    for (const r of resultCorpus()) {
      const t = `${r.result.saw} ${r.result.means} ${r.result.next.text}`;
      if (mentionsPain(t)) expect(PAIN_ROUTE.test(t), r.id).toBe(true);
    }
  });
});

describe('one name per fault, on every surface', () => {
  const canonical = new Set<string>(Object.values(FAULT_NAMES));
  it('the Mirror\'s review labels are the canonical names', () => {
    for (const l of [SQUAT_FAULT_LABEL, LUNGE_FAULT_LABEL, HINGE_FAULT_LABEL, PUSHUP_FAULT_LABEL, PRESS_ROW_FAULT_LABEL]) {
      for (const [f, name] of Object.entries(l)) expect(canonical.has(name), `${f}: ${name}`).toBe(true);
    }
  });
  it('a form-review flag says the same name as the Mirror\'s review card', () => {
    for (const m of REVIEW_MOVEMENTS) for (const f of MOVEMENT_SPECS[m].faults) {
      expect(faultPhrase(m, f, null), `${m}:${f}`).toBe(MOVEMENT_SPECS[m].label_of[f]);
    }
  });
  it('the Quick Screen\'s knee rows use the same words as the Mirror ("Knees cave in", never "valgus")', () => {
    const knees = GRADED_CHECKS.filter((c) => /kneeCave|KneeCave/.test(c.id)).map((c) => c.name.replace(/\s*\([^)]*\)$/, ''));
    for (const n of knees) expect([FAULT_NAMES.kneeCave, FAULT_NAMES.kneeCaveOne, FAULT_NAMES.landingKneeCave], n).toContain(n);
  });
});

/** Every file this lane rewrote the words of (CUE-REWRITE). Their string literals are screened for medical words. */
const TOUCHED = [
  'app/play/mirror/assess/_components/jump-result.tsx', 'app/play/mirror/assess/_components/results-view.tsx',
  'components/coach/form-review/film-set-link.tsx', 'components/coach/form-review/record-set.tsx', 'components/jump/fv-profile.tsx',
  'components/jump/jump-session-card.tsx', 'components/jump/jump-tests.tsx', 'components/library/library-browser.tsx',
  'components/mirror/screen-next-steps.tsx', 'components/sprint/run-result.tsx', 'components/vbt/velocity-session.tsx',
  'lib/assess/protocol.ts', 'lib/assess/rejection.ts', 'lib/assess/runner.ts', 'lib/assess/why.ts',
  'lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts', 'lib/coach/formReview/movements.ts', 'lib/coach/formReview/view.ts',
  'lib/coach/readiness/next.ts', 'lib/coach/templateCatalogue.ts', 'lib/coach/warmupContent.ts', 'lib/cue-style/names.ts',
  'lib/jump/protocols.ts', 'lib/mirror/assessment.ts', 'lib/mirror/carryAudit.ts', 'lib/mirror/framing.ts', 'lib/mirror/hingeAudit.ts',
  'lib/mirror/hingeStage.ts', 'lib/mirror/hudChip.ts', 'lib/mirror/kneeOverlay.ts', 'lib/mirror/liveMovements.ts', 'lib/mirror/lungeAudit.ts',
  'lib/mirror/lungeStage.ts', 'lib/mirror/overheadAudit.ts', 'lib/mirror/pressRowStage.ts', 'lib/mirror/program.ts',
  'lib/mirror/progressReading.ts', 'lib/mirror/pushupAudit.ts', 'lib/mirror/pushupStage.ts', 'lib/mirror/screen.ts',
  'lib/mirror/screenCorrectives.ts', 'lib/mirror/screenRunner.ts', 'lib/mirror/setupLine.ts', 'lib/mirror/sideRepStage.ts',
  'lib/mirror/squatStage.ts', 'lib/mirror/stationCard.ts', 'lib/mirror/stationGraders.ts', 'lib/screen/PROPOSED-thresholds.ts',
  'lib/screen/copy.ts', 'lib/sprint/copy.ts', 'lib/vbt/copy.ts',
];
/**
 * The disclaimers and policy lines that NAME what the app is not ("not a medical exam", "not a diagnosis", "not medical
 * clearance"): legal/policy copy, out of this lane's scope by the brief — kept word for word, excepted here by their words.
 */
const DISCLAIMER = /not (a )?medical|not a diagnosis|not medical clearance|clinician|physician|clinical measurement|Health data|medical pro\b|medical exam/i;

describe('the medical-word screen, over every file this lane touched', () => {
  const literals = (src: string): string[] => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n');
    return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '')
      .filter((t) => /[a-z]{3,}\s+[a-z]{2,}/i.test(t));
  };
  it('control: a planted medical line is caught, a comment and a disclaimer are not', () => {
    const src = "// treats nothing\nconst A = 'This drill treats knee injuries.';\nconst B = 'This is not a medical exam.';\n";
    expect(literals(src).filter((t) => isMedical(t) && !DISCLAIMER.test(t))).toEqual(['This drill treats knee injuries.']);
  });
  it.each(TOUCHED)('%s', (f) => {
    const bad = literals(readFileSync(join(ROOT, f), 'utf8')).filter((t) => isMedical(t) && !DISCLAIMER.test(t));
    expect(bad).toEqual([]);
  });
});
