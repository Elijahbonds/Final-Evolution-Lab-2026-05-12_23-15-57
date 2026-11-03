// lib/program-ask/accountServer.ts — PROGRAM-ASK-2 (2026-11-03): the account half of saving a plan.
//
// THE RULE: an adult's plan is kept on the phone AND, once the pending table exists, on the account (so a new phone
// picks it up). Under youth rules (lib/coach/taxonomy.ts youthRules: under 18, or no birth year) nothing is written to
// the server — the plan stays on the phone, the signature programs' rule (lib/signature/deviceProgress.ts). Until the SQL
// is applied every call answers `keep: 'device'` with `ready: false`, and the page simply keeps saving on the phone:
// fail closed, never a 500.
import 'server-only';
import { prisma } from '@/lib/db';
import { libraryViewer } from '@/lib/library/server';
import { forgetAccountProgram, readAccountProgram, saveAccountProgram, shapeSave, type AccountProgram, type RawDb } from './accountStore';

const raw = (): RawDb => prisma as unknown as RawDb;

export type Keep = 'account' | 'device';

export interface AccountAnswer { status: number; body: { keep: Keep; ready: boolean; saved?: AccountProgram | null; error?: string } }

export async function accountRead(user: { id: string; role?: string }, db: RawDb = raw()): Promise<AccountAnswer> {
  const v = await libraryViewer(user.id, user.role);
  if (v.youth) return { status: 200, body: { keep: 'device', ready: false, saved: null } };
  const r = await readAccountProgram(db, user.id);
  if (r === 'not_ready') return { status: 200, body: { keep: 'device', ready: false, saved: null } };
  return { status: 200, body: { keep: 'account', ready: true, saved: r } };
}

export async function accountSave(user: { id: string; role?: string }, body: unknown, db: RawDb = raw()): Promise<AccountAnswer> {
  const v = await libraryViewer(user.id, user.role);
  if (v.youth) return { status: 403, body: { keep: 'device', ready: false, error: 'youth_device_only' } };
  const shaped = shapeSave(body);
  if (!shaped) return { status: 400, body: { keep: 'device', ready: false, error: 'invalid_plan' } };
  const r = await saveAccountProgram(db, user.id, shaped);
  if (r === 'not_ready') return { status: 503, body: { keep: 'device', ready: false, error: 'program_ask_not_ready' } };
  return r ? { status: 200, body: { keep: 'account', ready: true } } : { status: 500, body: { keep: 'device', ready: true, error: 'save_failed' } };
}

export async function accountForget(user: { id: string; role?: string }, db: RawDb = raw()): Promise<AccountAnswer> {
  const r = await forgetAccountProgram(db, user.id);
  if (r === 'not_ready') return { status: 503, body: { keep: 'device', ready: false, error: 'program_ask_not_ready' } };
  return { status: r ? 200 : 500, body: { keep: 'account', ready: true } };
}
