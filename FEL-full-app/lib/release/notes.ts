// Release notes from merged pull requests, in plain language (QG-05, quality-gates lane, 2026-10-25).
//
// Owner, quality round 2026-10-20: "plain-language release notes generated from merged PRs, plus an in-app What's new
// page." A PR title here is written for the owner reviewing a lane ("Combine day: coach-run tryout (jump, agility,
// sprint, skills) → ranked report; pending SQL, teen-held, jump-gated"); a player reading What's new needs the first
// half of that and none of the second. So:
//   1. A PR body may say it in its own words: a line `What's new: <text>` is used as written; `What's new: none` keeps a
//      PR out of the public notes (it still appears in the owner's full list).
//   2. Otherwise the title is cleaned: the lane prefix in capitals, anything in brackets, and the clauses after the
//      first ";" are dropped; work that is only for the team (tests, CI, probes, docs, guards, refactors, pins) is kept
//      out of the public list.
//   3. Each note is filed under an area by its words, for the page's headings.
// Pure: scripts/release-notes.ts feeds it the git log (and, with --bodies, the PR bodies through `gh`).

export interface MergedPr { number: number; title: string; body?: string; mergedAt?: string; sha?: string }
export type Area = 'Games' | 'Training and body' | 'Coaching' | 'Store' | 'Account and privacy' | 'The app' | 'Fixes';
export interface Note { pr: number; area: Area; text: string; public: boolean }
export interface Release {
  /** a name the owner gives the release, or the date */
  version: string;
  date: string;
  /** the commit the notes run up to (the deploy), and the one they start after (the last release) */
  sha: string;
  fromSha: string;
  /** null until the owner records the deploy (scripts/release-notes.ts --deployed) */
  deployedAt: string | null;
  notes: Note[];
}

export const AREAS: Area[] = ['Games', 'Training and body', 'Coaching', 'Store', 'Account and privacy', 'The app', 'Fixes'];

/** `git log --merges --first-parent --format=%H%x1f%ad%x1f%s%x1f%b%x1e` → the merged PRs, newest first. */
export function parseMergeLog(log: string): MergedPr[] {
  const out: MergedPr[] = [];
  for (const rec of log.split('\u001e')) {
    const [sha, date, subject, body] = rec.replace(/^\s+/, '').split('\u001f');
    const m = /^Merge pull request #(\d+) from /.exec(subject ?? '');
    if (!m) continue;
    const title = (body ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    out.push({ number: Number(m[1]), title, sha, mergedAt: date });
  }
  return out;
}

/** Work for the team, not for players: a title that STARTS with one of these words stays off the public page. */
const INTERNAL = /^(pin|pins|docs?|tests?|ci|lint|probes?|refactor|chore|backlog|prisma|merge|u13|baseline|rebaseline|registry|guards?|scorecard|brief|audit|lanes?)\b/i;
/** …and a note that would only mean something to the owner. */
const OWNER_ONLY = /\b(pending sql|schema|migration|env var|firebase\.json|runbook)\b/i;

/** The lane's own label at the front of a title: "RATE-LIMITS (PR #289 …): " or "hoops-h2: " or "quality-gates QG-04: ". */
const PREFIX = /^(?:[a-z0-9]+(?:-[a-z0-9]+)+(?:\s+[A-Z]{2,}-\d+)?|[A-Z][A-Z0-9]*(?:[-_][A-Za-z0-9]+)+(?:\s*\([^)]*\))?)\s*:\s*/;

export function cleanTitle(title: string): string {
  let t = title.trim().replace(PREFIX, '');
  t = t.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '');
  t = t.split(/;\s+/)[0];
  t = t.replace(/\s+—\s+.*$/, '').replace(/\s\+\s/g, ' and ').replace(/\s*→\s*/g, ' to ').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[.,:;]+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const AREA_WORDS: Array<[Area, RegExp]> = [
  ['Fixes', /^(fix|fixes|fixed|hotfix|bug)\b/i],
  ['Store', /\b(store|checkout|pric|premium|payment|stripe|purchase|buy|sell|subscription|refund|book shop|fees?\b)/i],
  ['Coaching', /\b(coach|client|roster|combine|tryout|check-in|habit|drill)/i],
  ['Games', /\b(hoops|dunk|game|mode|karate|dance|race|kart|golf|tennis|tiebreak|basketball|3v3|1v1|3pt|shot|dribble|arena|party|multiplayer|studio|dragon|shootout|challenge|baseball|volleyball|soccer|football|combat|duel|derby|carnival|rim\b|rival|skate|snowboard|surf|sprint)/i],
  ['Training and body', /\b(jump|vertical|mirror|screen|readiness|velocity|exercise|library|anatomy|workout|body|pose|camera|vbt|program|training)/i],
  ['Account and privacy', /\b(privacy|account|erase|export|age|teen|consent|guardian|data rights|sign[- ]?up|login|password|profile|rate limit)/i],
];

/** The words before the first ":" name the feature ("Exercise library: … basketball …" is the library, not a game),
 *  so they decide first; the rest of the line only when they say nothing. */
export function areaOf(text: string): Area {
  const head = text.split(':')[0];
  for (const part of head === text ? [text] : [head, text]) for (const [area, re] of AREA_WORDS) if (re.test(part)) return area;
  return 'The app';
}

/** One PR → its note. The body's `What's new:` line wins over the title. */
export function noteFor(pr: MergedPr): Note {
  const said = /^\s*what[’']?s new:\s*(.+)$/im.exec(pr.body ?? '');
  if (said) {
    const text = said[1].trim();
    const none = /^(none|no|-|n\/a)\.?$/i.test(text);
    return { pr: pr.number, area: areaOf(`${text} ${pr.title}`), text: none ? cleanTitle(pr.title) : text, public: !none };
  }
  const text = cleanTitle(pr.title);
  const codeOnly = /^[#A-Z0-9][#A-Z0-9 _-]*$/.test(text);   // a lane code with nothing after it ("SCREEN-MINOR-LOCK")
  const internal = INTERNAL.test(pr.title.trim()) || INTERNAL.test(text) || OWNER_ONLY.test(text) || codeOnly || text.length < 8;
  return { pr: pr.number, area: areaOf(text), text, public: !internal };
}

export function buildRelease(prs: MergedPr[], o: { version?: string; date: string; sha: string; fromSha: string }): Release {
  const notes = prs.map(noteFor).sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || b.pr - a.pr);
  return { version: o.version ?? o.date, date: o.date, sha: o.sha, fromSha: o.fromSha, deployedAt: null, notes };
}

/** The owner's markdown: every PR, public or not, under its area; the public ones are what /whats-new shows. */
export function releaseMarkdown(r: Release): string {
  const lines = [`## ${r.version} (${r.date})`, '', `Merged pull requests after \`${r.fromSha.slice(0, 8)}\` up to \`${r.sha.slice(0, 8)}\`. Shown on /whats-new: the ones not marked (team only).`, ''];
  for (const area of AREAS) {
    const ns = r.notes.filter((n) => n.area === area);
    if (!ns.length) continue;
    lines.push(`### ${area}`, '');
    for (const n of ns) lines.push(`- ${n.text} (#${n.pr})${n.public ? '' : ' (team only)'}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** What the public page shows: the releases with at least one public note, newest first, public notes only. */
export function publicReleases(all: readonly Release[]): Array<Omit<Release, 'notes'> & { areas: Array<{ area: Area; notes: string[] }> }> {
  return [...all]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({
      version: r.version, date: r.date, sha: r.sha, fromSha: r.fromSha, deployedAt: r.deployedAt,
      areas: AREAS.map((area) => ({ area, notes: r.notes.filter((n) => n.public && n.area === area).map((n) => n.text) })).filter((a) => a.notes.length),
    }))
    .filter((r) => r.areas.length);
}
