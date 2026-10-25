// Test support (SAFETY lane, SAF-01): an in-memory GuardianConsent model for route tests that need a REAL withdraw to
// run against the same rows the gates read. It answers the where shapes the readers and lib/consent/withdraw.ts use:
// findMany { menteeId } | { menteeId: { in } }, findUnique { id } | { token }, updateMany { menteeId, revokedAt: null,
// OR: [{ id } | { guardianEmail } | { acceptedById }] }, update { token | id }, create.
export interface ConsentRow {
  id: string;
  menteeId: string;
  guardianName: string;
  guardianEmail: string;
  menteeBirthYear: number;
  token: string;
  requestedAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  acceptedById?: string | null;
  selfRequested?: boolean;
}

type Where = Record<string, any>;

function matches(row: ConsentRow, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') { if (!(v as Where[]).some((w) => matches(row, w))) return false; continue; }
    const have = (row as unknown as Record<string, unknown>)[k] ?? null;
    if (v && typeof v === 'object' && !(v instanceof Date) && Array.isArray(v.in)) { if (!v.in.includes(have)) return false; continue; }
    if (v === null ? have !== null : have !== v) return false;
  }
  return true;
}

function pick(row: ConsentRow, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) out[k] = (row as unknown as Record<string, unknown>)[k] ?? null;
  return out;
}

export function consentTable(rows: ConsentRow[] = []) {
  const calls: string[] = [];
  return {
    rows,
    calls,
    model: {
      async findMany(a: { where?: Where; select?: Record<string, unknown> } = {}) { calls.push('findMany'); return rows.filter((r) => matches(r, a.where)).map((r) => pick(r, a.select)); },
      async findUnique(a: { where: Where; select?: Record<string, unknown> }) { calls.push('findUnique'); const r = rows.find((x) => matches(x, a.where)); return r ? pick(r, a.select) : null; },
      async findFirst(a: { where?: Where; select?: Record<string, unknown> } = {}) { calls.push('findFirst'); const r = rows.find((x) => matches(x, a.where)); return r ? pick(r, a.select) : null; },
      async updateMany(a: { where: Where; data: Partial<ConsentRow> }) {
        calls.push('updateMany');
        const hit = rows.filter((r) => matches(r, a.where));
        for (const r of hit) Object.assign(r, a.data);
        return { count: hit.length };
      },
      async update(a: { where: Where; data: Partial<ConsentRow> }) {
        calls.push('update');
        const r = rows.find((x) => matches(x, a.where));
        if (!r) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        return Object.assign(r, a.data);
      },
      async create(a: { data: Partial<ConsentRow> }) {
        calls.push('create');
        const row: ConsentRow = {
          id: `gc-${rows.length + 1}`, guardianName: '', guardianEmail: '', menteeBirthYear: 0, token: '', menteeId: '',
          requestedAt: new Date(), acceptedAt: null, revokedAt: null, ...a.data,
        } as ConsentRow;
        rows.push(row);
        return row;
      },
    },
  };
}

/** One accepted consent for a mentee, requested at `requestedAt` (default 2026-09-01, the suites' fixture day). */
export function acceptedConsent(menteeId: string, menteeBirthYear: number, o: Partial<ConsentRow> = {}): ConsentRow {
  return {
    id: `gc-${menteeId}-${Math.random().toString(36).slice(2, 8)}`, menteeId, guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test',
    menteeBirthYear, token: `tok-${menteeId}`, requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, ...o,
  };
}
