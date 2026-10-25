// lib/signature/trainCard.ts — SIGNATURE-PROGRAMS (2026-10-25): the signature programs' card on Train, and the line under
// the weekly progress card (/profile/week). One read each (lib/signature/server.ts trainLine); a read that fails gives the
// plain card and no line, so neither page ever breaks over it.
import 'server-only';
import { defaultDeps, signatureViewer, trainLine } from './server';
import type { ProgramCard } from './view';

export const TRAIN_LINE_IDLE = "FEL's own programs from the owner's books: vertical jump, basketball skills, athletic foundation and pain-free prehab. Week 1 is free.";

/** The athlete's active program (adults: the server keeps it), or null. */
export async function activeSignature(userId: string, role: string | undefined): Promise<ProgramCard | null> {
  try {
    const deps = defaultDeps();
    return await trainLine(await signatureViewer(userId, role, deps), deps);
  } catch {
    return null;
  }
}

export async function signatureTrainCard(userId: string, role: string | undefined): Promise<{ line: string; tag: string }> {
  const card = await activeSignature(userId, role);
  const p = card?.progress;
  if (!card || !p) return { line: TRAIN_LINE_IDLE, tag: 'Browse' };
  return { line: `${card.title}: week ${p.week} of ${p.of}.${p.next ? ` Next: ${p.next}.` : ''}`, tag: 'Today' };
}
