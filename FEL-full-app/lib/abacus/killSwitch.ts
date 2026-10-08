/**
 * lib/abacus/killSwitch.ts — one server-side switch in front of every runtime Abacus.AI call.
 *
 * Off by default: no user data leaves for Abacus.AI until Elijah sets ABACUS_ENABLED=true (FE PM, 2026-09-29).
 *
 * ON only for the exact string 'true'. Unset, '', 'TRUE', '1', 'yes' and ' true' are all OFF, which is stricter than
 * lib/flags.ts's envOn() (that one also takes 1/on/yes). The env is read at call time, never at module load, so a
 * restart with the variable set turns it on and no build bakes the answer in. Server only: never NEXT_PUBLIC_*.
 *
 * Covered: the Coach (app/api/coach/chat, lib/coach-service.ts callCoachLLM), CELL and the Studio
 * (app/api/cell/{chat,compile,projects/[id]/files} POST; lib/cell-engine.ts callLLM and completeText;
 * lib/cell-providers.ts callModel, all four providers) and the marketing email sender (lib/marketing/email.ts send()).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { comingSoonBody, type AiFeature } from '@/lib/abacus/aiStatus';

export { AI_COMING_SOON } from '@/lib/abacus/aiStatus';

export function abacusEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.ABACUS_ENABLED === 'true';
}

/** Thrown by the AI libraries before any fetch while the switch is off. The routes answer it with the coming-soon 503. */
export class AiDisabledError extends Error {
  constructor(where: string) {
    super(`${where}: AI calls are off (ABACUS_ENABLED is not 'true')`);
    this.name = 'AiDisabledError';
  }
}

export function aiComingSoonResponse(feature: AiFeature): NextResponse {
  return NextResponse.json(comingSoonBody(feature), { status: 503 });
}
