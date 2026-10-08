// The pack validator. Every pack (the authored JSON and the Playbook pack derived from the book) passes through it in
// lib/knowledge/packs.test.ts, so a card that would overflow a phone screen, a quiz whose answer points at nothing, or
// a duplicate id (which would merge two cards' progress) fails the gate instead of the feed.

import { MOTIFS, TOPIC_IDS, type Card, type Pack, type Visual } from './types';

/** Card limits, in characters. Sized so one card fits one 390×844 phone screen at the feed's type sizes. */
export const LIMITS = {
  headline: 72,
  line: 160,
  linesMin: 2,
  linesMax: 4,
  question: 150,
  option: 64,
  optionsMin: 2,
  optionsMax: 4,
  why: 240,
  factText: 260,
  recapPoint: 120,
  recapMin: 3,
  recapMax: 5,
  stepsMin: 3,
  stepsMax: 5,
  stepLinesMin: 1,
  stepLinesMax: 3,
  source: 200,
  visualText: 40,
  barsMin: 2,
  barsMax: 5,
  cycleMin: 3,
  cycleMax: 5,
  timelineMin: 2,
  timelineMax: 5,
} as const;

const ID_RE = /^([a-z]+)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

function textErr(errs: string[], where: string, s: unknown, max: number): void {
  if (typeof s !== 'string' || !s.trim()) { errs.push(`${where}: empty`); return; }
  if (s.length > max) errs.push(`${where}: ${s.length} chars > ${max}`);
  if (/https?:\/\//i.test(s)) errs.push(`${where}: contains a URL`);
}

function rangeErr(errs: string[], where: string, n: number, min: number, max: number): void {
  if (n < min || n > max) errs.push(`${where}: ${n} items, want ${min}–${max}`);
}

export function visualErrors(v: Visual | undefined, where: string): string[] {
  const errs: string[] = [];
  if (!v) return errs;
  switch (v.kind) {
    case 'stat':
      textErr(errs, `${where}.value`, v.value, 24);
      textErr(errs, `${where}.caption`, v.caption, 60);
      break;
    case 'bars':
      rangeErr(errs, `${where}.items`, v.items.length, LIMITS.barsMin, LIMITS.barsMax);
      v.items.forEach((it, i) => {
        textErr(errs, `${where}.items[${i}].label`, it.label, 24);
        if (!Number.isFinite(it.value) || it.value < 0) errs.push(`${where}.items[${i}].value: not a non-negative number`);
      });
      if (v.items.every((it) => it.value === 0)) errs.push(`${where}: every bar is zero`);
      if (v.caption !== undefined) textErr(errs, `${where}.caption`, v.caption, 70);
      break;
    case 'compare':
      for (const side of ['left', 'right'] as const) {
        textErr(errs, `${where}.${side}.label`, v[side]?.label, 28);
        textErr(errs, `${where}.${side}.text`, v[side]?.text, LIMITS.visualText);
      }
      break;
    case 'cycle':
      rangeErr(errs, `${where}.steps`, v.steps.length, LIMITS.cycleMin, LIMITS.cycleMax);
      v.steps.forEach((s, i) => textErr(errs, `${where}.steps[${i}]`, s, 18));
      break;
    case 'timeline':
      rangeErr(errs, `${where}.points`, v.points.length, LIMITS.timelineMin, LIMITS.timelineMax);
      v.points.forEach((p, i) => { textErr(errs, `${where}.points[${i}].at`, p.at, 10); textErr(errs, `${where}.points[${i}].label`, p.label, 34); });
      break;
    case 'motif':
      if (!(MOTIFS as readonly string[]).includes(v.motif)) errs.push(`${where}: unknown motif ${String(v.motif)}`);
      break;
    default:
      errs.push(`${where}: unknown visual kind ${String((v as { kind?: unknown }).kind)}`);
  }
  return errs;
}

export function cardErrors(c: Card): string[] {
  const errs: string[] = [];
  const at = c.id || '(no id)';
  const m = ID_RE.exec(c.id ?? '');
  if (!m) errs.push(`${at}: id must look like topic.slug`);
  else if (m[1] !== c.topic) errs.push(`${at}: id prefix ${m[1]} ≠ topic ${c.topic}`);
  if (!(TOPIC_IDS as readonly string[]).includes(c.topic)) errs.push(`${at}: unknown topic ${String(c.topic)}`);
  textErr(errs, `${at}.source`, c.source, LIMITS.source);

  switch (c.type) {
    case 'lesson':
      textErr(errs, `${at}.headline`, c.headline, LIMITS.headline);
      rangeErr(errs, `${at}.lines`, c.lines?.length ?? 0, LIMITS.linesMin, LIMITS.linesMax);
      (c.lines ?? []).forEach((l, i) => textErr(errs, `${at}.lines[${i}]`, l, LIMITS.line));
      if (!c.visual) errs.push(`${at}: a lesson needs a visual`);
      errs.push(...visualErrors(c.visual, `${at}.visual`));
      break;
    case 'quiz': {
      textErr(errs, `${at}.question`, c.question, LIMITS.question);
      rangeErr(errs, `${at}.options`, c.options?.length ?? 0, LIMITS.optionsMin, LIMITS.optionsMax);
      (c.options ?? []).forEach((o, i) => textErr(errs, `${at}.options[${i}]`, o, LIMITS.option));
      const norm = (c.options ?? []).map((o) => o.trim().toLowerCase());
      if (new Set(norm).size !== norm.length) errs.push(`${at}: duplicate options`);
      if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= (c.options?.length ?? 0)) errs.push(`${at}: answer ${c.answer} is not an option index`);
      textErr(errs, `${at}.why`, c.why, LIMITS.why);
      break;
    }
    case 'fact':
      textErr(errs, `${at}.headline`, c.headline, LIMITS.headline);
      textErr(errs, `${at}.text`, c.text, LIMITS.factText);
      errs.push(...visualErrors(c.visual, `${at}.visual`));
      break;
    case 'recap':
      textErr(errs, `${at}.headline`, c.headline, LIMITS.headline);
      rangeErr(errs, `${at}.points`, c.points?.length ?? 0, LIMITS.recapMin, LIMITS.recapMax);
      (c.points ?? []).forEach((p, i) => textErr(errs, `${at}.points[${i}]`, p, LIMITS.recapPoint));
      break;
    case 'deeper':
      textErr(errs, `${at}.headline`, c.headline, LIMITS.headline);
      rangeErr(errs, `${at}.steps`, c.steps?.length ?? 0, LIMITS.stepsMin, LIMITS.stepsMax);
      (c.steps ?? []).forEach((s, i) => {
        textErr(errs, `${at}.steps[${i}].headline`, s.headline, LIMITS.headline);
        rangeErr(errs, `${at}.steps[${i}].lines`, s.lines?.length ?? 0, LIMITS.stepLinesMin, LIMITS.stepLinesMax);
        (s.lines ?? []).forEach((l, j) => textErr(errs, `${at}.steps[${i}].lines[${j}]`, l, LIMITS.line));
        errs.push(...visualErrors(s.visual, `${at}.steps[${i}].visual`));
      });
      break;
    default:
      errs.push(`${at}: unknown card type ${String((c as { type?: unknown }).type)}`);
  }
  return errs;
}

export function packErrors(p: Pack): string[] {
  const errs: string[] = [];
  if (!(TOPIC_IDS as readonly string[]).includes(p.topic)) errs.push(`pack: unknown topic ${String(p.topic)}`);
  if (!Number.isInteger(p.version) || p.version < 1) errs.push(`pack ${p.topic}: version must be a positive integer`);
  for (const c of p.cards) {
    if (c.topic !== p.topic) errs.push(`${c.id}: topic ${c.topic} in the ${p.topic} pack`);
    errs.push(...cardErrors(c));
  }
  return errs;
}

/** Ids must be unique across the whole catalogue: progress is keyed by id alone. */
export function catalogErrors(packs: Pack[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const p of packs) {
    errs.push(...packErrors(p));
    for (const c of p.cards) {
      if (seen.has(c.id)) errs.push(`${c.id}: duplicate id`);
      seen.add(c.id);
    }
  }
  return errs;
}
