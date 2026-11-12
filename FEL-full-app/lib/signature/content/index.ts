// lib/signature/content — SIGNATURE-PROGRAMS (2026-10-25): the four programs, in the order the owner listed them.
// Every one ships as a DRAFT: only the owner's approval (the review page, ./../store.ts) shows it to athletes. Pure.
import type { SignatureId, SignatureProgram } from '../types';
import { VERTICAL_JUMP } from './verticalJump';
import { BASKETBALL_SKILLS } from './basketballSkills';
import { ATHLETIC_FOUNDATION } from './athleticFoundation';
import { PAIN_FREE } from './painFree';

export const SIGNATURE_PROGRAMS: readonly SignatureProgram[] = [VERTICAL_JUMP, BASKETBALL_SKILLS, ATHLETIC_FOUNDATION, PAIN_FREE];
export const SIGNATURE_IDS: readonly SignatureId[] = SIGNATURE_PROGRAMS.map((p) => p.id);
export const isSignatureId = (v: unknown): v is SignatureId => typeof v === 'string' && (SIGNATURE_IDS as readonly string[]).includes(v);
export const signatureProgram = (id: unknown): SignatureProgram | null => SIGNATURE_PROGRAMS.find((p) => p.id === id) ?? null;
