// Build my program on a phone, with no server (PROGRAM-ASK, 2026-11-02). Bundled by scripts/probes/_program-ask-phone.mts
// with esbuild and loaded into headless Chromium: the real ProgramBuilder, and /api/program-ask answered by the REAL parser
// and builder over the REAL library data files (lib/program-ask; the route's own steps, less the database: an adult, the
// jump gate closed, no FEL Pro), so the shots show what the route would return.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ProgramBuilder } from '@/components/program-ask/program-builder';
import { loadLibraryFiles } from '@/lib/library/files';
import { programWeekAccess } from '@/lib/program-ask/access';
import { buildProgram } from '@/lib/program-ask/build';
import { applyEdits, readProgramAsk } from '@/lib/program-ask/request';
import { clipsFor } from '@/lib/session-player/clips';

const LIB = loadLibraryFiles();
const byId = new Map(LIB.map((e) => [e.id, e]));
try { localStorage.clear(); } catch { /* none */ }

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url, 'http://rig.local').pathname !== '/api/program-ask') return Response.json({ error: 'not_found' }, { status: 404 });
  const body = JSON.parse(String(init?.body ?? '{}')) as { q: string; edits?: Record<string, string | number> };
  const read = applyEdits(readProgramAsk(body.q), body.edits ?? {});
  if (read.injury.flagged) return Response.json({ read, safety: ['(the existing safety lines)'], program: null, access: [], clips: {}, ai: { used: false } });
  const program = buildProgram({ request: read.request, library: LIB });
  return Response.json({ read, safety: null, program, access: program.weeks.map((w) => programWeekAccess(w.n, false)), clips: clipsFor(program.exerciseIds, (id) => byId.get(id) ?? null), ai: { used: false } });
};

createRoot(document.getElementById('root')!).render(
  createElement('div', { className: 'min-h-screen bg-[#050505] pb-28' },
    createElement('main', { className: 'mx-auto max-w-[720px] px-4 py-5' },
      createElement('p', { className: 'font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-soft' }, 'Train'),
      createElement('h1', { className: 'mb-4 font-display text-[30px] font-bold text-white' }, 'Build my program'),
      createElement(ProgramBuilder))),
);
