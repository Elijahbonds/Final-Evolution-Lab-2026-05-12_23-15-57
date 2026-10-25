// lib/signature/trainCard.ts — SIGNATURE-PROGRAMS (2026-10-25): the line under the weekly progress card (/profile/week).
// One read (lib/signature/server.ts trainLine); a read that fails gives no line, so the page never breaks over it.
// Train's card is the same for everyone (lib/signature/copy.ts TRAIN_LINE_IDLE): that page reads no age to draw its cards.
import 'server-only';
import { defaultDeps, signatureViewer, trainLine } from './server';
import type { ProgramCard } from './view';

/** The athlete's active program (adults: the server keeps it), or null. */
export async function activeSignature(userId: string, role: string | undefined): Promise<ProgramCard | null> {
  try {
    const deps = defaultDeps();
    return await trainLine(await signatureViewer(userId, role, deps), deps);
  } catch {
    return null;
  }
}
