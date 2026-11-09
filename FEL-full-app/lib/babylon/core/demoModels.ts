// demoModels — DEMO-MODELS-1 (owner, 2026-11-09: "make sure the demos aren't the meshy model"; "Yes full swap"): which body the
// demos show, decided in one pure place, each change behind its own SERVER setting.
//
// The settings are read on the server (lib/flags.ts demoModelFlagsFromEnv) and ride to the client on the hero-body answer
// (/api/v1/hero-body `demo`, present only while at least one is on). resolveIdentity stores them here, and the spawn, the
// garment mask, the dunk's rival fetch and the crowd read them from here. Every setting is OFF by default, and with every one
// off nothing below changes a single request or a single body: the hero-body answer carries no `demo`, the store stays at
// NO_DEMO_MODEL_FLAGS, and planPlayerBody returns exactly urlForHeroBody(kind) with no fallback.
//
// THE COACH BODY is the owner's approved v7.2 likeness on the MPFB2 builder body, prep2 (1.73 m): public/models/coach/
// fel-elijah-coach.prep2.glb and its phone file, copied byte for byte from the QC'd build (QC-coach-prep2.md, 2026-10-28; no
// gltf-transform, which flattens its morph targets). Same 22 joints, names, order and rest pose as the scan, so every clip the
// scan plays, it plays. The Meshy scan stays on disk and is the fallback when the coach file will not load.
//
// Pure: no Babylon, no fetch.
import { COACH_BODY_URL, KIT_BODY_URL, SCAN_BODY_URL, urlForHeroBody, type HeroBodyKind } from './heroBody';

export interface DemoModelFlags {
  /** 1. The scan owner's player body is the coach body (Meshy scan as fallback). DEMO_COACH_BODY_ENABLED */
  coachBody: boolean;
  /** 2. The garment mask also reads the coach body's garment names (Top_/Bottom_/Shoe_/Sock_): no skin through the tee. COACH_BODY_MASK_ENABLED */
  coachBodyMask: boolean;
  /** 3. Flight Night fetches tonight's rival's body file as soon as your first dunk is in. DUNK_RIVAL_PREFETCH_ENABLED */
  rivalPrefetch: boolean;
  /** 4. A signed-out guest on /try plays the coach body instead of the male kit body. TRY_GUEST_COACH_BODY_ENABLED */
  tryGuestCoach: boolean;
  /** 5. The coach and library demos show the coach body as the demonstrator, for every viewer. DEMO_LIBRARY_COACH_ENABLED */
  libraryCoach: boolean;
  /** 6. The crowd's forge front row is on by default (the feel knob crowd.forgeFront still overrides). CROWD_FORGE_FRONT_ENABLED */
  crowdForgeFront: boolean;
}

/** Each setting's env var (read only on the server, lib/flags.ts). */
export const DEMO_MODEL_FLAG_ENV: Readonly<Record<keyof DemoModelFlags, string>> = {
  coachBody: 'DEMO_COACH_BODY_ENABLED',
  coachBodyMask: 'COACH_BODY_MASK_ENABLED',
  rivalPrefetch: 'DUNK_RIVAL_PREFETCH_ENABLED',
  tryGuestCoach: 'TRY_GUEST_COACH_BODY_ENABLED',
  libraryCoach: 'DEMO_LIBRARY_COACH_ENABLED',
  crowdForgeFront: 'CROWD_FORGE_FRONT_ENABLED',
};
export const DEMO_MODEL_FLAG_KEYS = Object.keys(DEMO_MODEL_FLAG_ENV) as (keyof DemoModelFlags)[];

export const NO_DEMO_MODEL_FLAGS: Readonly<DemoModelFlags> = Object.freeze({
  coachBody: false, coachBodyMask: false, rivalPrefetch: false, tryGuestCoach: false, libraryCoach: false, crowdForgeFront: false,
});

/** The settings from a wire answer: a setting is on only when it is exactly `true`; anything else (absent, junk) is off. */
export function demoModelFlagsFrom(raw: unknown): DemoModelFlags {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...NO_DEMO_MODEL_FLAGS };
  for (const k of DEMO_MODEL_FLAG_KEYS) out[k] = r[k] === true;
  return out;
}

export function anyDemoModelFlag(f: DemoModelFlags): boolean { return DEMO_MODEL_FLAG_KEYS.some((k) => f[k]); }

// The client's copy of the server's answer (set by playerIdentity.resolveIdentity on every hero-body read).
let current: DemoModelFlags = { ...NO_DEMO_MODEL_FLAGS };
export function setDemoModelFlags(f: DemoModelFlags): void { current = { ...f }; }
export function demoModelFlags(): DemoModelFlags { return current; }

export interface PlayerBodyPlan {
  /** The file to load. */
  url: string;
  /** The file to load instead if `url` will not load; null when there is nothing to fall back to (today's path). */
  fallback: string | null;
  /** The coach body is the demonstrator (item 5): the viewer's own look is NOT painted onto it. */
  demonstrator: boolean;
}

/**
 * The player's body file. `kind` is the server's decision (hero-body), `signedOut` is the host's word that this visitor is a
 * known guest (only /try's guest shell says so: visitor.ts), `demonstrator` marks a coach / library demo stage.
 * Order: the library demonstrator (5), the /try guest (4), the owner's scan (1). Each falls back to what it replaced.
 */
export function planPlayerBody(a: { kind: HeroBodyKind; signedOut: boolean; demonstrator: boolean; flags: DemoModelFlags }): PlayerBodyPlan {
  const today = urlForHeroBody(a.kind);
  if (a.demonstrator && a.flags.libraryCoach) return { url: COACH_BODY_URL, fallback: today, demonstrator: true };
  if (a.signedOut && a.flags.tryGuestCoach) return { url: COACH_BODY_URL, fallback: KIT_BODY_URL.male, demonstrator: false };
  if (a.kind === 'scan' && a.flags.coachBody) return { url: COACH_BODY_URL, fallback: SCAN_BODY_URL, demonstrator: false };
  return { url: today, fallback: null, demonstrator: false };
}

/** The coach body's garments, by node name (the loader may add `_primitive<n>` and `_c<n>`): its tee, shorts, socks and shoes. */
const COACH_GARMENT_RE = /^(Top|Bottom|Shoe|Sock)_/;
const COACH_SLOT: Record<string, 'tops' | 'shorts' | 'shoes'> = { Top: 'tops', Bottom: 'shorts', Shoe: 'shoes', Sock: 'shoes' };
export function coachGarmentSlotOf(name: string): 'tops' | 'shorts' | 'shoes' | null {
  const m = COACH_GARMENT_RE.exec(name);
  return m ? COACH_SLOT[m[1]] : null;
}

/** The coach body's own hair node (`CoachHair_coily`): not a forge `Hair_<key>` node, so applyHairStyle never touches it. */
export function isCoachHairName(name: string): boolean { return /^CoachHair_/.test(name); }
