// The schema push, checked before it runs (MIRROR-COACH P2 review, 2026-09-26).
//
// Owner decision #16 (painfree/DECISIONS-2.md) is a STANDING GO for `prisma db push` against the hosted database —
// "after checking the diff adds only columns/tables". Three things about how that check was going to be made were
// wrong, and this is the check made mechanical:
//   · the P2 preview (painfree/p2/schema-structure/schema-push-preview.sql) was a diff from the HEAD schema to the working
//     schema, never from the LIVE database. Production drift (an index somebody added by hand, a column a hotfix pushed)
//     only shows in a diff taken against the database itself;
//   · the only push recipe on disk (outbox/finish-release/setup-hosted-db.sh) runs `db push --accept-data-loss`
//     unconditionally, which silences exactly the warning a real drop would raise;
//   · nothing said, in a form a script can refuse on, what "adds only columns/tables" means.
//
// So: `additiveOnly` says which statements of a SQL diff are additive (a new type, a new table and its own indexes and
// keys, a new column that is nullable or has a default), and names every other one; `comparePushDiff` says whether the
// diff taken against the live database is the reviewed preview, statement for statement. scripts/db/check-push-diff.ts
// runs both against the hosted database and exits non-zero unless the live diff IS the preview AND the preview is
// additive. It never pushes; the push itself is `prisma db execute --file <preview>` (exactly the reviewed statements),
// then the same check again, which must now find nothing left to do. Pure: strings in, verdicts out.

/** One SQL statement, comments dropped and whitespace collapsed, without its trailing semicolon. */
export function sqlStatements(sql: string): string[] {
  return sql
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const q = (name: string) => name.replace(/"/g, '');

/** Tables a diff creates, by name (so their own indexes and foreign keys count as part of creating them). */
function createdTables(stmts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const s of stmts) { const m = /^CREATE TABLE ("?[\w.]+"?)/i.exec(s); if (m) out.add(q(m[1])); }
  return out;
}

/** Is one `ADD COLUMN …` clause additive: nullable, or NOT NULL with a DEFAULT (existing rows get the default)? */
function additiveColumn(clause: string): boolean {
  return !/\bNOT NULL\b/i.test(clause) || /\bDEFAULT\b/i.test(clause);
}

/**
 * Which statements are additive, and which are not. Additive: CREATE TYPE; CREATE TABLE; an index, unique index or
 * foreign key on a table the same diff creates; a non-unique index anywhere (it cannot fail on data); ALTER TABLE …
 * ADD COLUMN when every added column is nullable or defaulted. Everything else — any DROP, a RENAME, ALTER COLUMN, a
 * unique index on a table that already has rows, a new constraint on an existing table — is named in `offending`.
 */
export function additiveOnly(sql: string): { ok: boolean; offending: string[] } {
  const stmts = sqlStatements(sql);
  const fresh = createdTables(stmts);
  const offending = stmts.filter((s) => {
    if (/^CREATE TYPE\b/i.test(s) || /^CREATE TABLE\b/i.test(s)) return false;
    const idx = /^CREATE (UNIQUE )?INDEX\s+"?[\w.]+"?\s+ON\s+("?[\w.]+"?)/i.exec(s);
    if (idx) return !!idx[1] && !fresh.has(q(idx[2]));
    const fk = /^ALTER TABLE ("?[\w.]+"?) ADD CONSTRAINT "?[\w.]+"? FOREIGN KEY\b/i.exec(s);
    if (fk) return !fresh.has(q(fk[1]));
    const alter = /^ALTER TABLE "?[\w.]+"? (ADD COLUMN\b[\s\S]*)$/i.exec(s);
    if (alter) {
      const clauses = alter[1].split(/,\s*(?=(?:ADD|DROP|ALTER|RENAME|VALIDATE|SET|OWNER|ENABLE|DISABLE)\b)/i);
      return !clauses.every((c) => /^ADD COLUMN\b/i.test(c) && additiveColumn(c));
    }
    return true;
  });
  return { ok: offending.length === 0, offending };
}

export interface PushDiffVerdict {
  /** The live diff is the preview, statement for statement (order ignored: Prisma orders by kind, not by us). */
  same: boolean;
  /** Statements the live database would get that the preview never showed (drift, or a schema edit since). */
  onlyLive: string[];
  /** Statements in the preview the live database does not need (already applied, or the database moved on). */
  onlyPreview: string[];
}

export function comparePushDiff(live: string, preview: string): PushDiffVerdict {
  const a = sqlStatements(live), b = sqlStatements(preview);
  const onlyLive = a.filter((s) => !b.includes(s));
  const onlyPreview = b.filter((s) => !a.includes(s));
  return { same: onlyLive.length === 0 && onlyPreview.length === 0 && a.length === b.length, onlyLive, onlyPreview };
}
