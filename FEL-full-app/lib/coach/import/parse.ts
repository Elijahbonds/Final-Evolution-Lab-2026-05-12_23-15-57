// lib/coach/import/parse.ts — COACH-PARITY (2026-10-26): a pasted program (typed text, a spreadsheet copy, or a CSV) read
// into weeks → days → exercise lines, deterministically. No AI is needed for any of it; the optional AI assist
// (./ai.ts) only rewrites a paste this cannot read into a table, which then comes back through parseTable here.
//
// TEXT ("Week 1" / "Mon: Back squat 5x5 @ 75%" / "A1. DB row 3x10 each" / "Warm-up:" / "Notes: …"):
//   · a WEEK header starts a week ("Week 2", "Wk 3 - Deload", "## Week 1");
//   · a DAY header starts a day: a weekday ("Mon", "Monday:", "Tue - Upper"), "Day 1", "Session A", "Workout 2", or any
//     short line ending in ":" that is not a section ("Lower body:"). Text after a weekday is the day's label, or its
//     first exercise when it reads as one ("Mon: Back squat 5x5");
//   · a SECTION header ("Warm-up:", "Accessories", "Finisher:", "Cool-down") puts the lines under it in that section;
//   · "A1." / "B2)" marks a superset; "-", "•", "1." bullets are dropped;
//   · "Note:" / "Cue:" lines and a whole line in brackets join the line above as its note;
//   · a long sentence with no dose is not an exercise: it joins the line above as a note, or is listed as unread.
// TABLE (tabs, or a CSV): the first row is a header when it names the columns ("Day, Exercise, Sets, Reps, Load, Rest,
// Notes" and their usual synonyms); a blank Week or Day cell repeats the one above (a merged cell copies as blank). With no
// header, each row is read as day? + exercise + sets + reps + the rest.
// Pure.
import type { SessionSection } from '@/public/_prisma/client';
import { WEEK_DAYS, type WeekDayName } from '../offDay';
import { guessDelimiter, parseCsv } from './csv';
import { normalise, readDose, readRepsUnit, toSeconds, MAX_SETS } from './dose';
import type { ParsedDay, ParsedItem, ParsedProgram, ParsedWeek, SkippedLine } from './types';

export const LIMITS = { chars: 30_000, lines: 800, weeks: 12, daysPerWeek: 7, itemsPerDay: 20, label: 40 } as const;

const DAY_WORD = /^(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday|s)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?/i;
const WEEK_HEAD = /^(?:week|wk)\s*(\d{1,2})\b|^w(\d{1,2})(?=\s*(?:[:.\-|]|$))/i;
const DAY_HEAD = /^(day|session|workout|training\s+day|wod)\s*(\d{1,2}|[a-h])\b/i;
const SPLIT_DAY = /^(upper|lower|full|total|push|pull|legs?|arms?|chest|back|shoulders|core|posterior|anterior|speed|power|strength|conditioning|hypertrophy)(\s+(body|day|chain|focus|session|[a-d]|\d))*$/i;
const NOTE = /^(?:notes?|cues?|coach(?:ing)?\s+notes?|comments?)\s*[:\-]\s*(.+)$/i;
const BULLET = /^(?:[-*•·▪◦>]+|\d{1,2}[.)](?!\d)|[a-h][.)](?=\s))\s*/i;
/** "Rest 60-90 sec between sets" on its own line: the rest for the day's lines that have none yet. */
const REST_LINE = /^rest\b(?!\s*day)/i;
const SUPERSET = /^([a-h])\s*(\d{1,2})\s*[.):\-]?\s+/i;

const SECTION_WORDS: [RegExp, SessionSection][] = [
  [/^(warm[\s-]?up|warmup|prep(aration)?|mobility\s+prep|movement\s+prep|activation)$/i, 'prep'],
  [/^(prime|primer|power|plyos?|plyometrics?|jumps?|explosive)$/i, 'prime'],
  [/^(main|main\s+lifts?|strength|key|main\s+work|primary)$/i, 'key'],
  [/^(accessor(y|ies)|assist(ance)?|auxiliary|supplemental|secondary)$/i, 'assist'],
  [/^(finisher|finish|conditioning|metcon|core\s+finisher)$/i, 'finish'],
  [/^(cool[\s-]?down|cooldown|stretch(ing)?|recovery|down[\s-]?regulation)$/i, 'cooldown'],
];

/** "Warm-up" → 'prep', … (null: not a section word). */
export function sectionOf(s: string): SessionSection | null {
  const t = s.replace(/[:.\-\s]+$/g, '').replace(/^#+\s*/, '').trim();
  return SECTION_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

/** "monday" / "Tue" → 'Tue'. */
export function weekDayOf(s: string): WeekDayName | null {
  const m = DAY_WORD.exec(s.trim());
  if (!m) return null;
  const w = m[1].toLowerCase().slice(0, 3);
  return WEEK_DAYS.find((d) => d.toLowerCase() === w) ?? null;
}

const clean = (s: string) => s.replace(/^[\s:.\-|–—)]+|[\s:.\-|–—(]+$/g, '').replace(/\s+/g, ' ').trim();
const label = (s: string) => clean(s).slice(0, LIMITS.label);

class Builder {
  weeks: ParsedWeek[] = [];
  skipped: SkippedLine[] = [];
  section: SessionSection | null = null;
  read = 0;
  unread = 0;
  private week(): ParsedWeek {
    if (!this.weeks.length) this.weeks.push({ label: 'Week 1', days: [] });
    return this.weeks[this.weeks.length - 1];
  }
  newWeek(l: string): void {
    const w = this.weeks[this.weeks.length - 1];
    if (w && !w.days.some((d) => d.items.length)) { w.label = l; w.days = []; } else this.weeks.push({ label: l, days: [] });
    this.section = null;
  }
  newDay(l: string, day: WeekDayName | null): void {
    const w = this.week();
    const last = w.days[w.days.length - 1];
    if (last && !last.items.length) { last.label = l; last.day = day; } else w.days.push({ label: l, day, items: [] });
    this.section = null;
  }
  day(): ParsedDay {
    const w = this.week();
    if (!w.days.length) w.days.push({ label: `Day ${w.days.length + 1}`, day: null, items: [] });
    return w.days[w.days.length - 1];
  }
  lastItem(): ParsedItem | null {
    const d = this.week().days[this.week().days.length - 1];
    return d?.items[d.items.length - 1] ?? null;
  }
  addNote(n: string): boolean {
    const it = this.lastItem();
    if (!it) return false;
    it.note = [it.note, n].filter(Boolean).join('; ').slice(0, 300);
    return true;
  }
  add(item: Omit<ParsedItem, 'section'> & { section?: SessionSection | null }): void {
    this.read += 1;
    this.day().items.push({ ...item, section: item.section ?? this.section });
  }
  done(format: 'text' | 'table'): ParsedProgram {
    // a day header that never got an exercise ("Sat: Rest") is not a session
    const weeks = this.weeks.map((w) => ({ ...w, days: w.days.filter((d) => d.items.length) })).filter((w) => w.days.length);
    const any = this.read + this.unread;
    return { format, weeks, skipped: this.skipped, readRate: any ? this.read / any : 0 };
  }
}

/** One exercise line (bullets, superset label and a leading weekday already gone) → an item, or null when it is not one. */
function itemFrom(text: string, lineNo: number, raw: string, superset: string | null): Omit<ParsedItem, 'section'> | null {
  const d = readDose(text);
  if (!d.name || !/[a-z]{2}/i.test(d.name)) return null;
  // a sentence, not an exercise: no dose and many words
  if (!d.hasDose && d.name.split(' ').length > 7) return null;
  return {
    line: lineNo, raw, name: d.name.slice(0, 80), sets: d.sets, reps: d.reps, load: d.load, restSeconds: d.restSeconds, tempo: d.tempo,
    workSeconds: d.workSeconds, superset, note: d.note, warnings: d.warnings,
  };
}

/** A header-ish line: is it a week, a day or a section? Returns what it did, or false. */
function header(b: Builder, text: string, lineNo: number, raw: string): boolean {
  const t = text.replace(/^#+\s*/, '').trim();
  const wk = WEEK_HEAD.exec(t);
  if (wk) {
    const n = wk[1] ?? wk[2];
    const restText = clean(t.slice(wk[0].length));
    const sub = restText;
    b.newWeek(`Week ${Number(n)}${sub && !DAY_HEAD.test(sub) && !weekDayOf(sub) ? ` · ${label(sub)}` : ''}`);
    if (sub && (DAY_HEAD.test(sub) || weekDayOf(sub))) header(b, sub, lineNo, raw);
    return true;
  }
  const wd = weekDayOf(t);
  if (wd && DAY_WORD.test(t)) {
    const after = clean(t.replace(DAY_WORD, ''));
    // "Mon - Lower: Back squat 5x5" → label Lower, then an exercise; "Mon: Back squat 5x5" → an exercise
    const colon = after.indexOf(':');
    const labelPart = colon >= 0 ? after.slice(0, colon) : after;
    const itemPart = colon >= 0 ? after.slice(colon + 1).trim() : '';
    const asItem = colon < 0 && after ? itemFrom(after, lineNo, raw, null) : null;
    if (asItem && readDose(after).hasDose) {
      b.newDay(wd, wd);
      b.add(asItem);
    } else {
      // the words after a weekday name the day ("Fri - Power" is a power day, not a Prime section)
      b.newDay(labelPart ? `${wd} · ${label(labelPart)}` : wd, wd);
      if (itemPart) line(b, itemPart, lineNo, raw);
    }
    return true;
  }
  const dh = DAY_HEAD.exec(t);
  if (dh) {
    const kind = dh[1].toLowerCase().startsWith('training') ? 'Day' : dh[1][0].toUpperCase() + dh[1].slice(1).toLowerCase();
    const after = clean(t.slice(dh[0].length));
    const colon = after.indexOf(':');
    const labelPart = colon >= 0 ? after.slice(0, colon) : after;
    const itemPart = colon >= 0 ? after.slice(colon + 1).trim() : '';
    const asItem = colon < 0 && after && readDose(after).hasDose ? itemFrom(after, lineNo, raw, null) : null;
    b.newDay(`${kind === 'Wod' ? 'WOD' : kind} ${dh[2].toUpperCase()}${labelPart && !asItem ? ` · ${label(labelPart)}` : ''}`, null);
    if (asItem) b.add(asItem);
    if (itemPart) line(b, itemPart, lineNo, raw);
    return true;
  }
  const sec = sectionOf(t);
  if (sec) { b.section = sec; return true; }
  // "Lower body", "Upper A", "Push day", "Full body 2" — a split's day name on its own line
  if (SPLIT_DAY.test(t.replace(/:\s*$/, ''))) { b.newDay(label(t), null); return true; }
  // "Lower body:" — a short label ending in a colon, with no dose
  if (/:\s*$/.test(t) && t.length <= 48 && !readDose(t).hasDose) { b.newDay(label(t), null); return true; }
  return false;
}

function line(b: Builder, rawLine: string, lineNo: number, raw: string): void {
  let t = normalise(rawLine);
  if (!t) return;
  if (/^(\/\/|--\s|;)/.test(t)) { b.skipped.push({ line: lineNo, raw, why: 'comment' }); return; }
  if (/^(exercise|movement|lift)s?\b.*\b(sets?|reps?)\b/i.test(t) && !readDose(t).hasDose) { b.skipped.push({ line: lineNo, raw, why: 'header_row' }); return; }
  const note = NOTE.exec(t) ?? (/^\((.+)\)$/.exec(t));
  if (note) { if (!b.addNote(note[1].trim())) b.skipped.push({ line: lineNo, raw, why: 'unreadable' }); return; }
  if (REST_LINE.test(t)) {
    const d = readDose(t);
    if (d.restSeconds != null) {
      const day = b.day();
      for (const it of day.items) if (it.restSeconds == null) it.restSeconds = d.restSeconds;
      b.addNote(t);
      return;
    }
  }
  if (header(b, t, lineNo, raw)) return;
  t = t.replace(BULLET, '');
  let superset: string | null = null;
  const ss = SUPERSET.exec(t);
  if (ss && /[a-z]{2}/i.test(t.slice(ss[0].length))) { superset = ss[1].toUpperCase(); t = t.slice(ss[0].length); }
  // "Warm-up: 5 min bike" → the section, then the line
  const lead = /^([^:]{3,24}):\s*(.+)$/.exec(t);
  if (lead && sectionOf(lead[1])) { b.section = sectionOf(lead[1]); t = lead[2]; }
  const item = itemFrom(t, lineNo, raw, superset);
  if (item) { b.add(item); return; }
  // a sentence under an exercise is its note; anything else is listed as unread
  if (b.addNote(t)) return;
  b.unread += 1;
  b.skipped.push({ line: lineNo, raw, why: 'unreadable' });
}

/** Typed text, line by line (see the header). */
export function parseText(text: string): ParsedProgram {
  const b = new Builder();
  const lines = text.slice(0, LIMITS.chars).split(/\r?\n/).slice(0, LIMITS.lines);
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    line(b, l, i + 1, l.trim());
  });
  return b.done('text');
}

// ── tables ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Col = 'week' | 'day' | 'exercise' | 'sets' | 'reps' | 'dose' | 'load' | 'rest' | 'tempo' | 'notes' | 'order' | 'section';
const HEADERS: [RegExp, Col][] = [
  [/^(week|wk|block|phase|micro(cycle)?)$/i, 'week'],
  [/^(day|session|workout|training\s*day|day\s*\/\s*session)$/i, 'day'],
  [/^(exercises?|movements?|lifts?|names?|exercise\s*name|drills?|what)$/i, 'exercise'],
  [/^(sets?|#\s*sets|no\.?\s*of\s*sets|number\s*of\s*sets)$/i, 'sets'],
  [/^(reps?|repetitions|reps?\s*\/\s*time|time|duration|distance|reps?\s*\/\s*distance)$/i, 'reps'],
  [/^(sets?\s*[x×]\s*reps?|sets?\s*\/\s*reps?|prescription|scheme|volume|dose|sets\s*&\s*reps)$/i, 'dose'],
  [/^(load|weight|intensity|%|%\s*1rm|rpe|kg|lbs?|@|target|effort)$/i, 'load'],
  [/^(rest|rest\s*\(s(ec)?\)|rest\s*\(min\)|recovery|rest\s*period|rest\s*time)$/i, 'rest'],
  [/^tempo$/i, 'tempo'],
  [/^(notes?|cues?|comments?|coach(ing)?\s*notes?|instructions?|details?)$/i, 'notes'],
  [/^(order|#|group|superset|pair|a\/b|letter)$/i, 'order'],
  [/^(section|part|phase\s*of\s*session|category)$/i, 'section'],
];

/** The column map of a header row, or null when it does not name an exercise column and one more. */
export function headerMap(cells: readonly string[]): Map<number, Col> | null {
  const map = new Map<number, Col>();
  cells.forEach((c, i) => {
    const hit = HEADERS.find(([re]) => re.test(c.trim()));
    if (hit && ![...map.values()].includes(hit[1])) map.set(i, hit[1]);
  });
  const cols = [...map.values()];
  return cols.includes('exercise') && cols.length >= 2 ? map : null;
}

/** "1" / "Week 1" / "wk1" → "Week 1"; anything else as written ("Deload"). */
function weekLabel(s: string): string {
  if (/^\d{1,2}$/.test(s.trim())) return `Week ${Number(s)}`;
  const m = WEEK_HEAD.exec(s.trim());
  return m ? `Week ${Number(m[1] ?? m[2])}` : label(s);
}

const isNum = (s: string) => /^\d{1,4}(\.\d+)?$/.test(s.trim());

/** Rows of cells (a spreadsheet copy or a CSV) → the same program shape. */
export function parseTable(rows: readonly (readonly string[])[]): ParsedProgram {
  const b = new Builder();
  const firstIdx = rows.findIndex((r) => r.length && r.some((c) => c));
  const map = firstIdx >= 0 ? headerMap(rows[firstIdx]) : null;
  if (map) b.skipped.push({ line: firstIdx + 1, raw: rows[firstIdx].join(' | '), why: 'header_row' });
  let curWeek = '';
  let curDay = '';
  rows.forEach((row, i) => {
    if (!row.length || !row.some((c) => c.trim())) return;
    if (map && i === firstIdx) return;
    const lineNo = i + 1;
    const raw = row.join(' | ');
    const get = (c: Col) => { for (const [k, v] of map ?? []) if (v === c) return (row[k] ?? '').trim(); return ''; };
    let week = '', day = '', exercise = '', sets = '', reps = '', dose = '', load = '', rest = '', tempo = '', notes = '', order = '', section = '';
    if (map) {
      week = get('week'); day = get('day'); exercise = get('exercise'); sets = get('sets'); reps = get('reps'); dose = get('dose');
      load = get('load'); rest = get('rest'); tempo = get('tempo'); notes = get('notes'); order = get('order'); section = get('section');
    } else {
      // no header: [day?] exercise [sets] [reps] [anything else]
      const cells = row.map((c) => c.trim());
      let k = 0;
      if (cells[k] && (weekDayOf(cells[k]) || DAY_HEAD.test(cells[k]) || WEEK_HEAD.test(cells[k])) && cells.length > 1) {
        if (WEEK_HEAD.test(cells[k])) { week = cells[k]; k += 1; }
        if (cells[k] && (weekDayOf(cells[k]) || DAY_HEAD.test(cells[k]))) { day = cells[k]; k += 1; }
      } else if (!cells[k] && cells.length > 1) k += 1;   // a blank first cell under a merged day
      exercise = cells[k] ?? ''; k += 1;
      if (cells[k] && isNum(cells[k])) { sets = cells[k]; k += 1; }
      if (cells[k] && (isNum(cells[k]) || /^\d+\s*-\s*\d+$|^amrap$|^max$/i.test(cells[k]) || readRepsUnit(cells[k]))) { reps = cells[k]; k += 1; }
      dose = cells.slice(k).filter(Boolean).join(' ');
    }
    // a lone header cell in a sheet: a week or a day on its own row
    if (!exercise && !sets && !reps && !dose) {
      const lone = (week || day || row.find((c) => c.trim()) || '').trim();
      if (lone) { if (!header(b, lone, lineNo, raw)) b.skipped.push({ line: lineNo, raw, why: 'unreadable' }); }
      return;
    }
    if (week && week !== curWeek) { curWeek = week; b.newWeek(weekLabel(week)); curDay = ''; }
    if (day && day !== curDay) {
      curDay = day;
      const wd = weekDayOf(day);
      b.newDay(wd ? (clean(day.replace(DAY_WORD, '')) ? `${wd} · ${label(day.replace(DAY_WORD, ''))}` : wd) : isNum(day) ? `Day ${Number(day)}` : label(day), wd);
    }
    if (!exercise) { b.unread += 1; b.skipped.push({ line: lineNo, raw, why: 'unreadable' }); return; }
    if (section) b.section = sectionOf(section) ?? b.section;
    // sets and reps cells first; a "5x5" anywhere is read by the line reader
    const parts = [exercise];
    if (sets && reps) parts.push(`${sets}x${reps}`);
    else if (sets && !reps && isNum(sets)) parts.push(`${sets} sets`);
    else if (reps) parts.push(/^\d/.test(reps) && !readRepsUnit(reps) ? `${reps} reps` : reps);
    if (dose) parts.push(dose);
    if (load) parts.push(/^(@|at\b)/i.test(load) ? load : `@ ${load}`);
    if (rest) parts.push(`rest ${isNum(rest) ? `${rest}${Number(rest) <= 5 ? ' min' : 's'}` : rest}`);
    if (tempo) parts.push(`tempo ${tempo}`);
    let superset: string | null = null;
    const ss = /^([a-h])\s*\d{0,2}$/i.exec(order);
    if (ss) superset = ss[1].toUpperCase();
    const leadSs = SUPERSET.exec(exercise);
    if (!superset && leadSs) { superset = leadSs[1].toUpperCase(); parts[0] = exercise.slice(leadSs[0].length); }
    const item = itemFrom(parts.join(' '), lineNo, raw, superset);
    if (!item) { b.unread += 1; b.skipped.push({ line: lineNo, raw, why: 'unreadable' }); return; }
    // "sets" given alone with no reps: the dose reader saw "N sets" without reps, which it does not count as a dose
    if (item.sets === null && sets && isNum(sets)) { item.sets = Math.min(MAX_SETS, Math.max(1, Number(sets))); item.warnings = item.warnings.filter((w) => w !== 'no_dose'); }
    if (notes) item.note = [item.note, notes].filter(Boolean).join('; ').slice(0, 300);
    b.add(item);
  });
  return b.done('table');
}

/** Rest text from a cell, in seconds (exported for the tests). */
export const restCellSeconds = (s: string): number | null => {
  const m = /^(\d+(?::\d{2})?)\s*(s|sec|secs|min|mins|')?$/i.exec(s.trim());
  return m ? toSeconds(m[1], undefined, m[2]) : null;
};

/** Is this paste a table? Tabs on most lines (a spreadsheet copy). */
export function looksTabular(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  const tabbed = lines.filter((l) => l.includes('\t')).length;
  return tabbed >= 2 && tabbed / lines.length >= 0.5;
}

/** Any paste: a spreadsheet copy is read as a table, anything else as text. `csv` = the coach uploaded a .csv file. */
export function parseProgram(input: string, o: { csv?: boolean } = {}): ParsedProgram {
  const text = input.slice(0, LIMITS.chars);
  if (o.csv) return parseTable(parseCsv(text, guessDelimiter(text)).slice(0, LIMITS.lines));
  if (looksTabular(text)) {
    const t = parseTable(parseCsv(text, '\t').slice(0, LIMITS.lines));
    // a sheet with a header row or most rows read stands; otherwise the text reader may do better
    if (t.readRate >= 0.5) return t;
    const x = parseText(text.replace(/\t+/g, ' '));
    return x.readRate > t.readRate ? x : t;
  }
  return parseText(text);
}

/** Counts for the review header: weeks, days, exercise lines. */
export function shapeOf(p: ParsedProgram): { weeks: number; days: number; items: number } {
  return { weeks: p.weeks.length, days: p.weeks.reduce((n, w) => n + w.days.length, 0), items: p.weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.items.length, 0), 0) };
}

