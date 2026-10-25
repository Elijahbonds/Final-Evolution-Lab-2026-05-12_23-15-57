// lib/coach/import/dose.ts — COACH-PARITY (2026-10-26): one exercise line as a coach types it, read into a name and a dose.
//
//   "Back squat 5x5 @ 75%"                 → Back squat · 5 × 5 · 75%
//   "Bench Press — 4 x 6-8 @ RPE 8, rest 2 min" → Bench Press · 4 × 6-8 · RPE 8 · rest 120 s
//   "3 sets of 10 goblet squats"            → goblet squats · 3 × 10
//   "Plank 3 x :40" / "Plank 3x40s"         → Plank · 3 × 40 s (a timed set)
//   "SL RDL 3x8/leg @ 20kg"                 → SL RDL · 3 × 8 each leg · 20kg
//   "Back squat 5/5/3/3/1 @ 80%"            → Back squat · 5 sets · 5/5/3/3/1
//   "Pull-ups 3xAMRAP", "Sled push 6 x 20m", "Squat 3RM", "Box jump 3x5 tempo 31X1"
// What it cannot place is kept, never dropped: unread brackets and leftovers go to the note, a tempo FEL's box cannot hold
// goes to the note, and every adjustment is a warning the review grid shows. Pure; no clock, no I/O.
import type { LineWarning } from './types';

export interface Dose {
  name: string;
  sets: number | null;
  reps: string | null;
  load: string | null;
  restSeconds: number | null;
  tempo: string | null;
  workSeconds: number | null;
  note: string | null;
  warnings: LineWarning[];
  /** Something countable was found (sets, reps, a time or a distance). */
  hasDose: boolean;
}

export const MAX_SETS = 10;          // lib/coach/loop.ts validateExerciseSpec: sets 1–10
export const MAX_WORK_SECONDS = 1800; // lib/coach/structure.ts WORK_SECONDS.max
export const MAX_REST_SECONDS = 600;  // validateExerciseSpec: rest 0–600
export const MAX_TEXT = 24;           // reps and load are kept to 24 characters

/** Unicode and spreadsheet noise to plain text: × → x, dashes → '-', smart quotes, non-breaking spaces. */
export function normalise(s: string): string {
  return s
    .replace(/[   ]/g, ' ')
    .replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"')
    .replace(/(\d)\s*[×✕✖*]\s*(?=[\d:a-z])/gi, '$1x')
    .replace(/[‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUM = String.raw`\d+(?:\.\d+)?`;
const TIME_UNIT = String.raw`(?:seconds|second|secs|sec|s|minutes|minute|mins|min|')`;
const DIST_UNIT = String.raw`(?:meters|meter|metres|metre|m|yards|yard|yds|yd|km|mi|ft)`;
const EACH = String.raw`(?:\s*(?:each(?:\s+(?:side|leg|arm|way|direction))?|per\s+(?:side|leg|arm)|\/\s*(?:side|leg|arm|s|l)|e\/s|ea\.?|a\s+side|each\s+side))`;

/** The each-side words as FEL's reps text writes them. */
function eachText(raw: string | undefined): string {
  if (!raw) return '';
  const t = raw.toLowerCase();
  if (/leg|\/\s*l\b/.test(t)) return ' each leg';
  if (/arm/.test(t)) return ' each arm';
  if (/way|direction/.test(t)) return ' each way';
  return ' each side';
}

/** "90", "90s", "2 min", "2:00", "1-2 min" → seconds. A bare number of 5 or less is minutes ("rest 2"). */
export function toSeconds(n: string, n2: string | undefined, unit: string | undefined): number {
  const mins = (x: string) => (x.includes(':') ? Number(x.split(':')[0]) * 60 + Number(x.split(':')[1]) : Number(x));
  const a = mins(n), b = n2 ? mins(n2) : null;
  const v = b != null ? (a + b) / 2 : a;
  const u = (unit ?? '').toLowerCase();
  if (n.includes(':')) return Math.round(v);
  if (/^(min|mins|minute|minutes|')$/.test(u)) return Math.round(v * 60);
  if (u) return Math.round(v);
  return Math.round(v <= 5 ? v * 60 : v);
}

/** A timed or distance reps cell ("40s", ":40", "1:30", "1 min", "20m", "400 m") → { workSeconds } or { reps }. */
export function readRepsUnit(s: string): { workSeconds: number } | { reps: string } | null {
  const t = s.trim().toLowerCase();
  let m = /^(\d{0,2}):(\d{2})$/.exec(t);
  if (m) return { workSeconds: Number(m[1] || 0) * 60 + Number(m[2]) };
  m = new RegExp(`^(${NUM})\\s*(${TIME_UNIT})$`, 'i').exec(t);
  if (m) return { workSeconds: toSeconds(m[1], undefined, m[2]) };
  m = new RegExp(`^(${NUM})\\s*(${DIST_UNIT})$`, 'i').exec(t);
  if (m) return { reps: `${m[1]} ${m[2] === 'meter' || m[2] === 'meters' || m[2] === 'metre' || m[2] === 'metres' ? 'm' : m[2]}` };
  return null;
}

interface Cut { text: string }
/** Remove the first match of `re` from cut.text and return its groups. */
function take(cut: Cut, re: RegExp): RegExpExecArray | null {
  const m = re.exec(cut.text);
  if (!m) return null;
  cut.text = `${cut.text.slice(0, m.index)} ${cut.text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return m;
}

const clip = (s: string, max: number, w: LineWarning, warnings: LineWarning[]): string => {
  if (s.length <= max) return s;
  warnings.push(w);
  return s.slice(0, max).trim();
};

/** Read one exercise line (bullets and superset labels already stripped). */
export function readDose(line: string): Dose {
  const warnings: LineWarning[] = [];
  const notes: string[] = [];
  const cut: Cut = { text: normalise(line) };
  let sets: number | null = null;
  let reps: string | null = null;
  let workSeconds: number | null = null;
  let restSeconds: number | null = null;
  let tempo: string | null = null;
  const loads: string[] = [];

  // rest: "rest 90s", "(rest 2 min)", "R: 90", "90s rest", "rest 1-2 min", "rest 2:00"
  let m = take(cut, new RegExp(String.raw`[,;(]?\s*\b(?:rest|r|rec|recovery)\b\s*[:=]?\s*(\d+(?::\d{2})?|${NUM})(?:\s*-\s*(\d+(?::\d{2})?|${NUM}))?\s*(${TIME_UNIT})?\)?`, 'i'))
    ?? take(cut, new RegExp(String.raw`[,;(]?\s*(${NUM})(?:\s*-\s*(${NUM}))?\s*(${TIME_UNIT})\s+rest\b\)?`, 'i'));
  if (m) restSeconds = Math.min(MAX_REST_SECONDS, toSeconds(m[1], m[2], m[3]));

  // tempo: "tempo 3-1-1-0", "tempo: 31X1", "@ 3010 tempo"
  m = take(cut, /[,;(]?\s*\btempo\b\s*[:=]?\s*([0-9xX](?:\s*-\s*[0-9xX]){3}|[0-9xX]{4})\)?/i)
    ?? take(cut, /[,;(]?\s*\b([0-9xX](?:-[0-9xX]){3}|[0-9xX]{4})\s+tempo\b\)?/i);
  if (m) {
    const parts = m[1].replace(/\s+/g, '').replace(/-/g, '').split('');
    if (parts.every((p) => /\d/.test(p))) tempo = parts.join('-');
    else { notes.push(`tempo ${parts.join('').toUpperCase()}`); warnings.push('tempo_kept_in_note'); }
  }

  // sets × reps, in the shapes coaches type
  // time and distance first: "1 min" must not read as 1 rep
  const REPS = String.raw`(${NUM}\s*${TIME_UNIT}|${NUM}\s*${DIST_UNIT}|\d{0,2}:\d{2}|\d+\s*rm|\d+(?:\s*-\s*\d+)?|amrap|max|failure|f)`;
  const setsReps = new RegExp(String.raw`(?:^|\s|\()(\d{1,2})\s*(?:sets?\s*)?(?:x|of)\s*${REPS}(?:\s*reps?)?(${EACH})?(?=$|[\s,;)@])`, 'i');
  m = take(cut, setsReps) ?? take(cut, new RegExp(String.raw`(?:^|\s)(\d{1,2})\s*sets?\s*(?:of\s*|x\s*|,\s*)?${REPS}(?:\s*reps?)(${EACH})?(?=$|[\s,;)@])`, 'i'));
  if (m) {
    sets = Number(m[1]);
    const r = m[2].trim();
    const unit = readRepsUnit(r);
    const each = eachText(m[3]);
    if (unit && 'workSeconds' in unit) { workSeconds = unit.workSeconds; reps = each ? `${unit.workSeconds} s${each}` : null; }
    else if (unit) reps = `${unit.reps}${each}`;
    else if (/^(amrap|max|failure|f)$/i.test(r)) reps = /^f$/i.test(r) ? 'to failure' : r.toUpperCase() === 'AMRAP' ? 'AMRAP' : r.toLowerCase();
    else if (/rm$/i.test(r)) reps = r.replace(/\s+/g, '').toUpperCase();
    else reps = `${r.replace(/\s+/g, '')}${each}`;
  }
  if (sets === null) {
    // a set-by-set scheme: "5/5/5/5/5", "5/3/1", "10-8-6"
    m = take(cut, /(?:^|\s)(\d{1,2}(?:\s*\/\s*\d{1,2}){2,}|\d{1,2}(?:-\d{1,2}){2,})(?:\s*reps?)?(?=$|[\s,;@])/i);
    if (m) {
      const parts = m[1].split(/[/-]/).map((x) => x.trim());
      sets = parts.length;
      reps = new Set(parts).size === 1 ? parts[0] : parts.join('/');
    }
  }
  if (sets !== null && !tempo) {
    // a bare tempo after the dose: "3x8 3-1-1-0"
    m = take(cut, /(?:^|\s)(\d-\d-\d-\d)(?=$|[\s,;)])/);
    if (m) tempo = m[1];
  }
  if (sets === null) {
    m = take(cut, /(?:^|\s)(\d{1,2})\s*rm\b/i);
    if (m) { sets = 1; reps = `${m[1]}RM`; }
  }
  if (sets === null) {
    // "3 rounds", "EMOM 10", "every minute for 10"
    m = take(cut, /(?:^|\s)\(?(\d{1,2})\s*(?:rounds?|rds?)\b\)?\s*(?:of\s*)?:?/i) ?? take(cut, /\b(?:emom|e1mom)\s*(?:x\s*)?(\d{1,2})(?:\s*min(?:utes)?)?\s*:?/i);
    if (m) { sets = Number(m[1]); warnings.push('circuit'); }
  }
  if (reps === null && workSeconds === null) {
    // a lone reps or time: "20 reps", "x 10", "for 30s", "hold 40 sec", "200m"
    m = take(cut, new RegExp(String.raw`(?:^|\s)(?:x\s*|for\s+|hold\s+)?(${NUM}\s*${TIME_UNIT}|\d{0,2}:\d{2}|${NUM}\s*${DIST_UNIT})(${EACH})?(?=$|[\s,;)@])`, 'i'))
      ?? take(cut, new RegExp(String.raw`(?:^|\s)(?:x\s*)(\d+(?:-\d+)?)(${EACH})?(?=$|[\s,;)@])|(?:^|\s)(\d+(?:-\d+)?)\s*reps?(${EACH})?(?=$|[\s,;)@])`, 'i'));
    if (m) {
      const r = (m[1] ?? m[3]).trim();
      const each = eachText(m[2] ?? m[4]);
      const unit = readRepsUnit(r);
      if (unit && 'workSeconds' in unit) { workSeconds = unit.workSeconds; reps = each ? `${unit.workSeconds} s${each}` : null; }
      else reps = `${unit ? unit.reps : r}${each}`;
      if (sets === null) sets = 1;
    }
  }

  // anything in brackets is a note (read before the load, so "(pause at the top)" is not a load "the top")
  cut.text = cut.text.replace(/\(([^()]*)\)|\[([^[\]]*)\]/g, (_, a: string | undefined, b: string | undefined) => { const n = (a ?? b ?? '').trim(); if (n) notes.push(n); return ' '; }).replace(/\s+/g, ' ').trim();

  // load: "@ 75%", "@ RPE 8", "at 100kg", "70-75% 1RM", "RPE 7-8", "RIR 2", "225 lb", "BW"
  m = take(cut, /(?:@|\bat\s+(?=\d|rpe|rir|bw\b|body))\s*([^,;()]+?)(?=$|[,;()]|\s+(?:rest|tempo|each)\b)/i);
  if (m) loads.push(m[1].trim());
  for (const re of [
    new RegExp(String.raw`(?:^|\s)(${NUM}(?:\s*-\s*${NUM})?\s*%(?:\s*(?:of\s*)?(?:1\s*rm|e1rm|max|tm))?)`, 'i'),
    new RegExp(String.raw`(?:^|\s)((?:rpe|rir)\s*${NUM}(?:\s*-\s*${NUM})?)`, 'i'),
    new RegExp(String.raw`(?:^|\s)(${NUM}(?:\s*-\s*${NUM})?\s*(?:kgs?|lbs?|#|pood))(?=$|[\s,;)])`, 'i'),
    /(?:^|\s)(bw|bodyweight|body\s*weight)\b/i,
  ]) {
    const x = take(cut, re);
    if (x) loads.push(x[1].trim());
  }

  // what is left: the name, and anything in brackets is a note
  let rest = cut.text;
  // "EMOM 10: 3 power cleans", "3 rounds: 10 push-ups", "10 push-ups": a count in front of the name is the reps
  const front = /^[\s:,-]*(\d{1,3})\s+(?=[a-z])/i.exec(rest);
  if (front && reps === null && workSeconds === null) { reps = front[1]; rest = rest.slice(front[0].length); if (sets === null) sets = 1; }
  // a trailing "- cue words" after the name: "Back squat - drive the knees out" (only when a dose was found)
  const dash = /\s+-\s+(.{3,})$/.exec(rest);
  const found = sets !== null || reps !== null || workSeconds !== null;
  if (dash && found && /[a-z]{3}/i.test(dash[1])) { notes.push(dash[1].trim()); rest = rest.slice(0, dash.index); }
  const name = rest.replace(/\b(sets?|reps?|x|of|for|rounds?)\b\s*$/i, '').replace(/^[\s\-:,.|;()]+|[\s\-:,.|;()]+$/g, '').replace(/\s+/g, ' ').trim();

  if (sets !== null && sets > MAX_SETS) { warnings.push('sets_capped'); notes.push(`${sets} sets written`); sets = MAX_SETS; }
  if (sets !== null && sets < 1) sets = 1;
  if (workSeconds !== null && workSeconds > MAX_WORK_SECONDS) { warnings.push('work_capped'); workSeconds = MAX_WORK_SECONDS; }
  if (workSeconds !== null && workSeconds < 1) workSeconds = null;
  if (reps) reps = clip(reps, MAX_TEXT, 'reps_trimmed', warnings);
  let load = loads.length ? loads.join(' ').replace(/\s+/g, ' ') : null;
  if (load) load = clip(load, MAX_TEXT, 'load_trimmed', warnings);
  if (!found) warnings.push('no_dose');
  return { name, sets, reps, load, restSeconds, tempo, workSeconds, note: notes.length ? notes.join('; ').slice(0, 300) : null, warnings, hasDose: found };
}
