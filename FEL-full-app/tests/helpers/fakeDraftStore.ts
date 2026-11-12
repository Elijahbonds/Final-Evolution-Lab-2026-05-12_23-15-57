// tests/helpers/fakeDraftStore.ts — COACH-AI-DRAFT (2026-10-24): an in-memory stand-in for the two pending tables
// (prisma/pending/2026-10-24-coach-ai-draft.sql), answering lib/coach/weeklyDraft/store.ts's statements BY NAME
// (store.ts SQL), with the tables' unique keys enforced the way Postgres would (ON CONFLICT DO NOTHING → 0 rows).
// `tables: false` is production today: the probe finds nothing.
import { SQL } from '@/lib/coach/weeklyDraft/store';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeDraftStore {
  tables: boolean;
  drafts: Row[];
  decisions: Row[];
  /** Every statement run, in order (the probe included). */
  log: string[];
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

export function fakeDraftStore(tables = true): FakeDraftStore {
  let clock = Date.parse('2026-10-22T15:00:00Z');
  const s: FakeDraftStore = {
    tables, drafts: [], decisions: [], log: [],
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      s.log.push(q);
      if (q.includes('information_schema')) return (s.tables && q.includes('CoachDraftDecision') ? [{ ok: 1 }] : []) as T;
      if (!s.tables) throw Object.assign(new Error('relation "CoachProgramDraft" does not exist'), { code: '42P01' });
      if (q === SQL.draftsForWeek) return s.drafts.filter((d) => d.coachId === v[0] && d.weekKey === v[1]).map((d) => ({ ...d })) as T;
      if (q === SQL.draftById) return s.drafts.filter((d) => d.id === v[0] && d.coachId === v[1]).map((d) => ({ ...d })) as T;
      if (q === SQL.decisionsFor) return s.decisions.filter((d) => (v[0] as string[]).includes(d.draftId)).map((d) => ({ ...d })) as T;
      if (q === SQL.clientUpdates) {
        return s.decisions.filter((d) => d.clientId === v[0] && ['approved', 'edited', 'partial'].includes(d.decision) && d.decidedAt >= (v[1] as Date))
          .sort((a, b) => b.decidedAt - a.decidedAt).slice(0, 20).map((d) => ({ id: d.id, decision: d.decision, clientLine: d.clientLine, note: d.note, decidedAt: d.decidedAt, programId: d.programId })) as T;
      }
      throw new Error(`fakeDraftStore: unknown query ${q.slice(0, 60)}`);
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      s.log.push(q);
      if (!s.tables) throw Object.assign(new Error('relation "CoachProgramDraft" does not exist'), { code: '42P01' });
      if (q === SQL.insertDraft) {
        const [id, coachId, clientId, programId, weekKey, engine, draft] = v as string[];
        if (s.drafts.some((d) => d.coachId === coachId && d.clientId === clientId && d.programId === programId && d.weekKey === weekKey)) return 0;
        s.drafts.push({ id, coachId, clientId, programId, weekKey, engine, draft: json(draft), createdAt: new Date(clock) });
        return 1;
      }
      if (q === SQL.claimDecision) {
        const [id, draftId, changeId, decision, actorId, programId, clientId, before, after, clientLine, note] = v as string[];
        if (s.decisions.some((d) => d.draftId === draftId && d.changeId === changeId)) return 0;
        clock += 1000;
        s.decisions.push({ id, draftId, changeId, decision, actorId, programId, clientId, before: json(before), after: json(after), clientLine, note, decidedAt: new Date(clock) });
        return 1;
      }
      if (q === SQL.settleDecision) {
        const d = s.decisions.find((x) => x.id === v[0]);
        if (!d) return 0;
        d.decision = v[1]; d.after = json(v[2]);
        return 1;
      }
      if (q === SQL.dropClaim) {
        const n = s.decisions.length;
        s.decisions = s.decisions.filter((x) => !(x.id === v[0] && x.actorId === v[1]));
        return n - s.decisions.length;
      }
      throw new Error(`fakeDraftStore: unknown statement ${q.slice(0, 60)}`);
    },
  };
  return s;
}
