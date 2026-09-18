export interface CreateProgramInput {
  name?: unknown;
  clientId?: unknown;
  clientEmail?: unknown;
  durationWeeks?: unknown;
  sessionsPerWeek?: unknown;
}

export interface ProgramSessionDraft {
  order: number;
  label: string;
}

export interface ProgramBlockDraft {
  order: number;
  label: string;
  sessions: ProgramSessionDraft[];
}

export interface CleanProgramCreate {
  name: string;
  clientLookup: string;
  durationWeeks: number;
  sessionsPerWeek: number;
  blocks: ProgramBlockDraft[];
}

const str = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
};

export function programSchedule(durationWeeks: number, sessionsPerWeek: number): ProgramBlockDraft[] {
  return Array.from({ length: durationWeeks }, (_, blockIndex) => ({
    order: blockIndex + 1,
    label: `Week ${blockIndex + 1}`,
    sessions: Array.from({ length: sessionsPerWeek }, (_, sessionIndex) => ({
      order: sessionIndex + 1,
      label: `Session ${sessionIndex + 1}`,
    })),
  }));
}

export function validateProgramCreate(input: CreateProgramInput): { ok: true; program: CleanProgramCreate } | { ok: false; error: string } {
  const name = str(input.name, 80);
  if (!name) return { ok: false, error: 'name_required' };
  const clientLookup = str(input.clientId, 254) ?? str(input.clientEmail, 254);
  if (!clientLookup) return { ok: false, error: 'client_required' };
  const durationWeeks = int(input.durationWeeks, 1, 12) ?? 4;
  const sessionsPerWeek = int(input.sessionsPerWeek, 1, 7) ?? 3;
  return {
    ok: true,
    program: {
      name,
      clientLookup,
      durationWeeks,
      sessionsPerWeek,
      blocks: programSchedule(durationWeeks, sessionsPerWeek),
    },
  };
}
