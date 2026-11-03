// lib/program-ask/server.ts — PROGRAM-ASK (2026-11-02): the server half of "Build my program". The route
// (app/api/program-ask/route.ts) is a few lines over askProgram.
//
// THE ORDER, every time:
//   1. read the ask (./request.ts, deterministic) with the account's age rules as the floor (libraryViewer → youthRules),
//      and lay the chips' edits over it (applyEdits clamps every value);
//   2. SAFETY: pain or injury words in the ask, or a stored pain decision that says stop (lib/coach/warmupServer.ts reads
//      it, consent rules and all) → FEL's existing lines (the coach disclosure and the pain rule's own stop line: see a
//      clinician, or tell an adult for a minor). No program, no AI;
//   3. build (./build.ts) from the library as it stands (lib/library/server.ts libraryState), with the protocol gate's
//      verdict for this person (the warm-up's own read, jumpGateFor: adults only, a failed read closes it);
//   4. check (./check.ts): a program with any problem is never served (500, logged);
//   5. optionally the AI (./ai.ts), only while the Abacus switch is on: picks among equivalent entries, then the rules
//      REBUILD and RE-CHECK the program; its paragraph goes through cleanWhy. Any failure serves step 4's program;
//   6. each week's access (./access.ts, the owner's call) and each exercise's demo loop (lib/session-player/clips.ts).
import 'server-only';
import { prisma } from '@/lib/db';
import { AI_COACH_DISCLOSURE } from '@/lib/coach/aiSystemPrompt';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { PAIN_DECISION_COPY } from '@/lib/health/painRule';
import { libraryState, libraryViewer } from '@/lib/library/server';
import { isProUser } from '@/lib/pro-guard';
import { clipsFor } from '@/lib/session-player/clips';
import { programWeekAccess } from './access';
import { aiSystemPrompt, aiUserMessage, cleanWhy, parsePolish } from './ai';
import { buildProgram } from './build';
import { programProblems } from './check';
import { applyEdits, readProgramAsk, type RequestEdits } from './request';
import type { BuiltProgram, ProgramAskRead } from './types';

export interface AskProgramResult {
  read: ProgramAskRead;
  safety: string[] | null;
  program: BuiltProgram | null;
  access: ('free' | 'pro' | 'locked')[];
  clips: Record<string, string | null>;
  ai: { used: boolean };
}

export type ModelCall = (system: string, user: string) => Promise<string>;

export async function askProgram(user: { id: string; role?: string }, q: string, edits: RequestEdits | null, ai: ModelCall | null): Promise<AskProgramResult> {
  const viewer = await libraryViewer(user.id, user.role);
  const read = applyEdits(readProgramAsk(q, { youth: viewer.youth }), edits, { youth: viewer.youth });
  const youth = read.request.age !== 'adult';
  const ctx = await loadWarmupContext(prisma, user.id).catch(() => null);
  const stop = ctx?.painDecision === 'stop_see_clinician' || ctx?.painDecision === 'stop_tell_adult';
  const empty = { access: [], clips: {}, ai: { used: false } };
  if (read.injury.flagged || stop) {
    return { read, safety: [AI_COACH_DISCLOSURE, youth ? PAIN_DECISION_COPY.stop_tell_adult : PAIN_DECISION_COPY.stop_see_clinician], program: null, ...empty };
  }
  const { index } = await libraryState();
  const jumpsOpen = !youth && !!ctx && !ctx.isYouth && !ctx.jumpGate.closed;
  const jumpsWhy = ctx?.jumpGate.why || null;
  let program = buildProgram({ request: read.request, library: index.docs, jumpsOpen, jumpsWhy });
  const problems = programProblems(program, index.docs, { jumpsOpen });
  if (problems.length) {
    console.error('[program-ask] a built program failed its own check; nothing served', problems.slice(0, 10));
    throw new Error('program_check_failed');
  }
  let used = false;
  if (ai && program.choices.length) {
    try {
      const polish = parsePolish(await ai(aiSystemPrompt(youth), aiUserMessage(program)), program);
      if (polish) {
        const again = Object.keys(polish.picks).length ? buildProgram({ request: read.request, library: index.docs, jumpsOpen, jumpsWhy, picks: polish.picks }) : program;
        if (!programProblems(again, index.docs, { jumpsOpen }).length) {
          const why = cleanWhy(polish.why, again);
          program = why ? { ...again, why, whyBy: 'ai' } : again;
          used = true;
        }
      }
    } catch { /* the deterministic program stands */ }
  }
  const hasPro = await isProUser(user.id).catch(() => false);
  const byId = (id: string) => index.docs[index.byId.get(id) ?? -1] ?? null;
  return {
    read, safety: null, program,
    access: program.weeks.map((w) => programWeekAccess(w.n, hasPro)),
    clips: clipsFor(program.exerciseIds, byId),
    ai: { used },
  };
}
