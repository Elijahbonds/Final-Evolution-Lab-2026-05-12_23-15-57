// Today's automatic cool-down (MIRROR-COACH P6, 2026-09-29): it is added only when the coach wrote none (and never on
// an off day); it is 3–5 minutes for every session there is; the owner's recovery breath comes first and the stretches
// follow the patterns the session trained; nothing in it is off-limits under youth rules; the done tap lands on the
// right coached session; and every line it can show is FEL's own words — no risk/prevent/injury, no condition, no book.
import { describe, expect, it } from 'vitest';
import type { MovementPattern } from '@/public/_prisma/client';
import { BREATH_CYCLE_MS } from '@/lib/mirror/squatStage';
import { screenText } from '@/lib/share/screen';
import { PATTERNS } from './catalogue';
import { MAX_EFFORT_CUE, PIN_EXERCISE } from './taxonomy';
import { startGuided, pauseGuided } from './warmup';
import { ROCK_HOLDS, ROCK_HOLD_SEC } from './warmupContent';
import {
  BREATH_LINES, BREATH_SOURCE_LINE, COOLDOWN_DONE_LINE, COOLDOWN_ERROR_COPY, COOLDOWN_STRETCHES, COOLDOWN_TAP_WINDOW_MS, COOLDOWN_TITLE,
  EASY_RANGE_LINE, RECOVERY_BREATH, RECOVERY_BREATH_STEP, UNTAGGED_NOTE, breathCycleSec, breathTotalSec, coolBreathAt, cooldownAt,
  cooldownMeaning, cooldownStepStart, cooldownTarget, generateCooldown, needsAutoCooldown, nextCooldownStep, pickCooldownStretches,
  sessionPatterns, showsGeneratedWarmup, type CooldownItemLike, type CooldownPlan,
} from './cooldown';

const item = (order: number, section: string, pattern: MovementPattern | null, isKeySet = false): CooldownItemLike =>
  ({ order, section, isKeySet, coaching: { pattern: pattern ? { id: pattern } : null } });

/** A typical coached session: prep breath, a squat key set, a lunge/pull superset, a carry finish. No Cool-down. */
const SQUAT_DAY: CooldownItemLike[] = [
  item(1, 'prep', 'breath'), item(2, 'key', 'squat', true), item(3, 'assist', 'lunge'), item(4, 'assist', 'pull'), item(5, 'finish', 'carry'),
];

const planText = (p: CooldownPlan): string[] => [
  cooldownMeaning(p.minutes), ...p.notes.map((n) => n.text),
  ...p.steps.flatMap((s) => [s.name, s.cue, s.dose, ...s.lines.map((l) => l.text)]),
];

describe('added only when the coach wrote none', () => {
  it('a session with no Cool-down item gets one', () => {
    expect(needsAutoCooldown(SQUAT_DAY)).toBe(true);
    expect(needsAutoCooldown(SQUAT_DAY, 'training')).toBe(true);
    expect(needsAutoCooldown([item(1, 'key', null)])).toBe(true);   // untagged: still a cool-down (the general one)
  });
  it("a coach's own Cool-down section always wins — one item anywhere in it is enough", () => {
    expect(needsAutoCooldown([...SQUAT_DAY, item(9, 'cooldown', 'breath')])).toBe(false);
    expect(needsAutoCooldown([item(1, 'cooldown', null)])).toBe(false);
  });
  it('an empty session gets nothing (there is nothing to cool down from)', () => {
    expect(needsAutoCooldown([])).toBe(false);
  });
  it("an off day (kind 'recovery') never gets one — its own Cool-down section is the breath and the stretches — nor the generated warm-up", () => {
    expect(needsAutoCooldown(SQUAT_DAY, 'recovery')).toBe(false);
    expect(showsGeneratedWarmup('recovery')).toBe(false);
    expect(showsGeneratedWarmup('training')).toBe(true);
    expect(showsGeneratedWarmup(undefined)).toBe(true);   // a payload from before the column: a training session
  });
});

describe('the breath: the owner\'s recovery breath, first', () => {
  it('is 4 in, 6 out, a 2-second pause, ten breaths — a 12 s breath, the same cycle as the Mirror\'s pacer', () => {
    expect(RECOVERY_BREATH).toEqual({ inSec: 4, holdSec: 0, outSec: 6, restSec: 2, rounds: 10 });
    expect(breathCycleSec(RECOVERY_BREATH)).toBe(BREATH_CYCLE_MS / 1000);
    expect(breathTotalSec(RECOVERY_BREATH)).toBe(120);
  });
  it('coolBreathAt walks in → out → pause, breath by breath, and is null outside the ten', () => {
    const b = RECOVERY_BREATH;
    expect(coolBreathAt(b, 0)).toEqual({ phase: 'in', left: 4, round: 1 });
    expect(coolBreathAt(b, 3.2)).toEqual({ phase: 'in', left: 1, round: 1 });
    expect(coolBreathAt(b, 4)).toEqual({ phase: 'out', left: 6, round: 1 });
    expect(coolBreathAt(b, 9.5)).toEqual({ phase: 'out', left: 1, round: 1 });
    expect(coolBreathAt(b, 10)).toEqual({ phase: 'rest', left: 2, round: 1 });
    expect(coolBreathAt(b, 12)).toEqual({ phase: 'in', left: 4, round: 2 });
    expect(coolBreathAt(b, 119.9)).toEqual({ phase: 'rest', left: 1, round: 10 });
    expect(coolBreathAt(b, 120)).toBeNull();
    expect(coolBreathAt(b, -1)).toBeNull();
    // a pacer with a hold (the Mirror's 4-2-6) runs through the same function: phase 7's full pacer can take it over
    const mirror = { inSec: 4, holdSec: 2, outSec: 6, restSec: 0, rounds: 3 };
    expect([0, 4, 6, 11.5].map((t) => coolBreathAt(mirror, t)?.phase)).toEqual(['in', 'hold', 'out', 'out']);
  });
  it('is the first step of every cool-down, so it starts the moment the last set ends (the Playbook: within 5 minutes)', () => {
    const p = generateCooldown(SQUAT_DAY);
    expect(p.steps[0].kind).toBe('breath');
    expect(p.steps[0].id).toBe(RECOVERY_BREATH_STEP.id);
    expect(p.steps[0].seconds).toBe(120);
    expect(cooldownStepStart(p, 0)).toBe(0);
    expect(p.steps.filter((s) => s.kind === 'breath')).toHaveLength(1);
  });
});

describe("the stretches follow the session's patterns, 3–5 minutes in all", () => {
  // every session shape that matters to the picker: 0–3 working patterns from all 11 (and untagged), with or without a
  // key set, with a tagged prep item or not
  const shapes = function* (): Generator<CooldownItemLike[]> {
    const ps: (MovementPattern | null)[] = [...PATTERNS, null];
    for (const a of ps) {
      yield [item(1, 'key', a, true)];
      for (const b of ps) {
        yield [item(1, 'key', a, true), item(2, 'assist', b)];
        yield [item(1, 'prep', 'mobility'), item(2, 'key', a), item(3, 'finish', b)];
        for (const c of ['squat', 'pull', 'carry', 'other', null] as (MovementPattern | null)[]) yield [item(1, 'key', a, true), item(2, 'assist', b), item(3, 'assist', c), item(4, 'finish', 'hinge')];
      }
    }
  };

  it('sweeps every shape: breath then 1–3 stretches, 180–300 s, whole minutes, no stretch twice, each stretch fits its pattern', () => {
    let n = 0;
    for (const items of shapes()) {
      const p = generateCooldown(items);
      n++;
      const tag = JSON.stringify(items.map((i) => [i.section, i.coaching?.pattern?.id ?? null]));
      expect(p.totalSec, tag).toBeGreaterThanOrEqual(180);
      expect(p.totalSec, tag).toBeLessThanOrEqual(300);
      expect(p.totalSec % 60, tag).toBe(0);
      expect(p.minutes * 60).toBe(p.totalSec);
      expect(p.totalSec).toBe(p.steps.reduce((s, x) => s + x.seconds, 0));
      const stretches = p.steps.filter((s) => s.kind === 'rock_hold');
      expect(p.steps[0].kind).toBe('breath');
      expect(stretches.length).toBeGreaterThanOrEqual(COOLDOWN_STRETCHES.min);
      expect(stretches.length).toBeLessThanOrEqual(COOLDOWN_STRETCHES.max);
      expect(new Set(stretches.map((s) => s.id)).size).toBe(stretches.length);
      for (const s of stretches) {
        expect(s.seconds).toBe(ROCK_HOLD_SEC);
        const row = ROCK_HOLDS.find((r) => r.id === s.id)!;
        if (s.aim === 'pattern') expect(row.patterns, tag).toContain(s.pattern);
      }
    }
    expect(n).toBeGreaterThan(700);
  });

  it('one pattern → 3 minutes; two → 4; three or more → 5; the key set\'s pattern is stretched first', () => {
    expect(generateCooldown([item(1, 'key', 'squat', true)]).minutes).toBe(3);
    expect(generateCooldown([item(1, 'key', 'squat', true), item(2, 'assist', 'pull')]).minutes).toBe(4);
    const p = generateCooldown(SQUAT_DAY);
    expect(p.minutes).toBe(5);
    expect(p.patterns).toEqual(['squat', 'lunge', 'pull', 'carry']);   // the key set first, then running order; prep's breath not "trained"
    expect(p.steps.slice(1).map((s) => s.pattern)).toEqual(['squat', 'lunge', 'pull']);
    // the key set comes first even when it is not the first item in the Key section
    expect(sessionPatterns([item(1, 'key', 'hinge'), item(2, 'key', 'push', true)]).patterns).toEqual(['push', 'hinge']);
  });

  it('spreads three patterns over three different areas of the body when it can', () => {
    const p = generateCooldown(SQUAT_DAY);
    const zones = p.steps.slice(1).map((s) => ROCK_HOLDS.find((r) => r.id === s.id)!.zones);
    for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) expect(zones[i].some((z) => zones[j].includes(z))).toBe(false);
    // squat → Ankle Rock (feet), lunge → Hinge Rock (hips and the backs of the legs), pull → Open Book (upper back)
    expect(p.steps.slice(1).map((s) => s.id)).toEqual(['ankle-rock', 'hinge-rock', 'open-book-rock']);
  });

  it('an untagged session gets the general pair (hips, upper back) and says so; so does one tagged only Other', () => {
    for (const items of [[item(1, 'key', null, true), item(2, 'assist', null)], [item(1, 'key', 'other', true)]]) {
      const p = generateCooldown(items);
      expect(p.patterns).toEqual([]);
      expect(p.steps.slice(1).map((s) => s.id)).toEqual(['ninety-ninety-rock', 'open-book-rock']);
      expect(p.steps.slice(1).every((s) => s.aim === 'general')).toBe(true);
      expect(p.minutes).toBe(4);
      expect(p.notes.map((n) => n.id)).toEqual(['untagged', 'easy_range']);
    }
    // a tagged session does not say it is untagged
    expect(generateCooldown(SQUAT_DAY).notes.map((n) => n.id)).toEqual(['easy_range']);
    expect(pickCooldownStretches([])).toHaveLength(2);
  });

  it('a mobility-only day (its patterns all outside the working sections) follows what it did tag', () => {
    const p = generateCooldown([item(1, 'prep', 'mobility'), item(2, 'prep', 'breath')]);
    expect(p.patterns).toEqual(['mobility', 'breath']);
    expect(p.steps.slice(1).every((s) => s.aim === 'pattern')).toBe(true);
  });
});

describe('youth-safe (owner decision #6): nothing leaves the floor, pins, loads or asks for a max effort', () => {
  it('every step of every cool-down, for any session', () => {
    for (const pattern of [...PATTERNS, null]) {
      const p = generateCooldown([item(1, 'key', pattern, true), item(2, 'assist', 'hinge'), item(3, 'finish', 'push')]);
      for (const s of p.steps) {
        expect(s.impact).toBe(false);
        for (const text of [s.name, s.cue, s.dose, ...s.lines.map((l) => l.text)]) {
          expect(text, text).not.toMatch(MAX_EFFORT_CUE);
          expect(text, text).not.toMatch(PIN_EXERCISE);
        }
        if (s.kind === 'rock_hold') expect(ROCK_HOLDS.find((r) => r.id === s.id)!.youthSafe).toBe(true);
      }
    }
  });
});

describe('the run: the card\'s clock', () => {
  const p = generateCooldown(SQUAT_DAY);
  it('cooldownAt reads the breath\'s part inside the breath step and the stretch\'s rock/hold lines after it', () => {
    const a = cooldownAt(p, 0);
    expect(a.index).toBe(0);
    expect(a.line).toBe(BREATH_LINES[0].text);
    expect(a.breath).toEqual({ phase: 'in', left: 4, round: 1 });
    expect(cooldownAt(p, 61).line).toBe(BREATH_LINES[1].text);
    const b = cooldownAt(p, 120);
    expect(b.index).toBe(1);
    expect(b.breath).toBeNull();
    expect(b.line).toMatch(/rock in small, easy moves/);
    expect(cooldownAt(p, 140).line).toBe('Hold still. One long breath out.');
    const end = cooldownAt(p, p.totalSec);
    expect(end.done).toBe(true);
    expect(end.step).toBeNull();
  });
  it('next jumps to the next step, keeps a paused run paused, and ends at the end', () => {
    const r = startGuided(1000);
    const n = nextCooldownStep(p, r, 11_000);           // 10 s in → the start of step 2 (120 s)
    expect(n.baseSec).toBe(120);
    expect(n.pausedAt).toBeNull();
    const paused = nextCooldownStep(p, pauseGuided(r, 2000), 3000);
    expect(paused.baseSec).toBe(120);
    expect(paused.pausedAt).toBe(3000);
    const last = { from: 0, baseSec: p.totalSec - 1, pausedAt: null };
    expect(nextCooldownStep(p, last, 0).baseSec).toBe(p.totalSec);
  });
});

describe('the done tap lands on the right coached session', () => {
  const now = new Date('2026-09-29T18:00:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  it('the open session (cooled down before pressing Done)', () => {
    expect(cooldownTarget([{ id: 'open', completedAt: null, createdAt: ago(50) }], now)).toEqual({ action: 'mark', id: 'open' });
  });
  it('else the one just completed (Done first, then the cool-down) — within the window, newest completion first', () => {
    const rows = [{ id: 'old', completedAt: ago(100), createdAt: ago(160) }, { id: 'new', completedAt: ago(5), createdAt: ago(60) }];
    expect(cooldownTarget(rows, now)).toEqual({ action: 'mark', id: 'new' });
  });
  it('else a new open one (nothing open, nothing just finished) — but never a new row on a session completed long ago', () => {
    expect(cooldownTarget([], now)).toEqual({ action: 'create' });
    // MIRROR-COACH P6 FIX (2026-09-29): this was 'create' — a second, never-completed row on a done session. A completion
    // from yesterday is not this cool-down, and Today never serves that session again: the tap is refused ('late').
    expect(cooldownTarget([{ id: 'yday', completedAt: ago(COOLDOWN_TAP_WINDOW_MS / 60_000 + 1), createdAt: ago(1500) }], now)).toEqual({ action: 'late' });
    // a completion stamped in the future (a skewed clock) is not "just finished"
    expect(cooldownTarget([{ id: 'future', completedAt: new Date(now.getTime() + 3_600_000), createdAt: ago(5) }], now)).toEqual({ action: 'create' });
  });
  it('a second tap changes nothing: the first time stands', () => {
    const first = ago(3);
    expect(cooldownTarget([{ id: 'open', completedAt: null, cooldownDoneAt: first, createdAt: ago(40) }], now)).toEqual({ action: 'already', id: 'open', at: first });
    expect(cooldownTarget([{ id: 'done', completedAt: ago(10), cooldownDoneAt: first.toISOString(), createdAt: ago(40) }], now)).toEqual({ action: 'already', id: 'done', at: first });
  });
});

describe("every line is FEL's own words: no risk, no prevention, no condition, no book", () => {
  const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|biphasic|pin[- ]and[- ]stretch|soft[- ]tissue|nervous[- ]system|tension table|parasympathetic|vagus|downshift/i;
  const ACRONYMS = /\bRAMP\b|\bPAILs?\b|\bRAILs?\b|\bCARs\b|\bRPR\b|\bSMR\b|\bKPI\b/;
  const CLAIMS = /\b(injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal\w*|cure\w*|treat\w*|rehab\w*|guarantee\w*|safer|heart rate|recover faster)\b/i;
  const lint = (text: string) => {
    expect(text, text).not.toMatch(BOOK);
    expect(text, text).not.toMatch(ACRONYMS);
    expect(text, text).not.toMatch(CLAIMS);
    expect(text, text).not.toMatch(/diagnos/i);
    expect(screenText(text), text).toEqual([]);
  };
  it('the fixed copy', () => {
    [COOLDOWN_TITLE, EASY_RANGE_LINE, BREATH_SOURCE_LINE, UNTAGGED_NOTE, COOLDOWN_DONE_LINE, RECOVERY_BREATH_STEP.name, RECOVERY_BREATH_STEP.cue,
      ...BREATH_LINES.map((l) => l.text), ...Object.values(COOLDOWN_ERROR_COPY), cooldownMeaning(3), cooldownMeaning(5)].forEach(lint);
  });
  it('every line of a plan for every single-pattern and untagged session, and says "builds capacity"', () => {
    for (const pattern of [...PATTERNS, null]) planText(generateCooldown([item(1, 'key', pattern, true)])).forEach(lint);
    planText(generateCooldown(SQUAT_DAY)).forEach(lint);
    expect(cooldownMeaning(4)).toMatch(/builds capacity/);
    // it does not promise "not scored": P9 counts done cool-downs toward PRQ recovery (owner decision #12)
    expect(cooldownMeaning(4)).not.toMatch(/scored/i);
  });
});
