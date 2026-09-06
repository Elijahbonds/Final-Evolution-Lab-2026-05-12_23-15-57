// M28 Creative Card — five-discipline unified social object. (Phase 11–14 spec.)
// NOTE: named `CreativeCard` (not `CreatorCard`) to avoid clashing with the
// existing athlete-identity CreatorCard model/type in this project.

// Lane 4 (SPEC-PASSION-PIPELINES, owner decision 2026-09-06): scene, cooking, fashion and writing are first-class disciplines
// with their own payloads, review rules and the same remix royalty.
export type Discipline = 'sport' | 'music' | 'art' | 'dance' | 'acting' | 'scene' | 'cooking' | 'fashion' | 'writing';
export const DISCIPLINES: Discipline[] = ['sport', 'music', 'art', 'dance', 'acting', 'scene', 'cooking', 'fashion', 'writing'];
export function isDiscipline(x: unknown): x is Discipline { return typeof x === 'string' && (DISCIPLINES as string[]).includes(x); }

/** Hub metadata — one list, every surface reads it. */
export const DISCIPLINE_META: Record<Discipline, { label: string; blurb: string; color: string }> = {
  sport:   { label: 'Sport',   blurb: 'Routines, signature moves, highlight reels',           color: 'bg-orange-500' },
  music:   { label: 'Music',   blurb: 'Build a beat, flip a sample, perform it live',          color: 'bg-emerald-500' },
  art:     { label: 'Art',     blurb: 'Paint courts, boards, kits, UI',                        color: 'bg-sky-500' },
  dance:   { label: 'Dance',   blurb: 'Choreograph routines and celebrations',                 color: 'bg-fuchsia-500' },
  acting:  { label: 'Acting',  blurb: 'Record commentary and callouts',                        color: 'bg-amber-500' },
  scene:   { label: 'Scene',   blurb: 'Author a Who Scene It pack from FEL\'s own venues',      color: 'bg-violet-500' },
  cooking: { label: 'Cooking', blurb: 'A recipe the Fuel floor can serve and a coach can assign', color: 'bg-rose-500' },
  fashion: { label: 'Fashion', blurb: 'A look from your closet, equippable and sellable',      color: 'bg-pink-500' },
  writing: { label: 'Writing', blurb: 'A story beat, a caption, a verse — reads in Story',     color: 'bg-lime-500' },
};

export type SportDesignation =
  | 'basketball' | 'football' | 'soccer' | 'baseball' | 'tennis'
  | 'golf' | 'skate' | 'snowboard' | 'karate';

export interface CardRarity {
  tier: 'common' | 'rare' | 'epic' | 'legendary';
  statMultiplier: number;              // 1.0 / 1.15 / 1.35 / 1.6
}

export interface DanceStep {
  clipId: string;
  beat: number;                        // beat index in the track
  holdBeats: number;
  mirrored: boolean;
}

/** Art payload — discriminated union keyed by discipline. */
export type ArtPayload =
  | { kind: 'sport'; highlightReelUrl?: string; routineId?: string; signatureMoveId?: string }
  | { kind: 'music'; trackId: string; stemUrls: string[]; coverArtUrl: string; bpm: number; keySignature: string }
  | { kind: 'art'; canvasDataUrl: string; palette: string[]; brushSetId: string; appliedSurface: 'court' | 'board' | 'kit' | 'ui' }
  | { kind: 'dance'; choreographyId: string; sequence: DanceStep[]; routineVideoUrl?: string }
  | { kind: 'acting'; sceneId: string; performanceUrl: string; voiceLineIds: string[] }
  | { kind: 'scene'; venueId: string; cameraPath: string; questions: SceneQuestion[]; freeUse?: boolean }
  | { kind: 'cooking'; steps: string[]; ingredients: string[]; photoUrl?: string; fuelTags: string[] }
  | { kind: 'fashion'; lookId: string; wearableIds: string[]; palette: string[]; photoUrl?: string }
  | { kind: 'writing'; text: string; coverUrl?: string; storyNodeId?: string };

/** A Who Scene It question authored by a player: four options, one right — about FEL's own world only. */
export interface SceneQuestion { prompt: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3 }

export interface CardStats {
  moveset: string[];
  gearModifier: Record<string, number>;
  hypeMultiplier: number;
  bpmSyncBonus: number;
}

export type ReviewState = 'approved' | 'pending_review' | 'rejected';

export interface CreativeCard {
  id: string;
  ownerId: string;
  title: string;
  primary: Discipline;
  secondary: Discipline[];             // max 2
  sportDesignation?: SportDesignation; // required when sport is primary/secondary
  art: ArtPayload;
  stats: CardStats;
  rarity: CardRarity;
  createdAt: string;
  isPublic: boolean;
  remixOf?: string;                    // parent card id — powers the remix graph
  /** Opt-in creator license — set ONLY by the explicit checkbox; server-enforced. */
  licenseAccepted: true;
  /** UGC audio (music stems, acting) enters pending_review before public listing. */
  reviewState: ReviewState;
}

/** Disciplines whose payloads contain UGC audio needing moderation first. */
export const NEEDS_REVIEW: Discipline[] = ['music', 'acting', 'scene', 'writing'];   // scene: original-content screen; writing: text screen

export const REMIX_ROYALTY_COINS = 25;   // paid to the parent card's creator per remix
export const FREE_CARD_SLOTS = 3;

/** Default stats for a freshly authored card. */
export function defaultStats(): CardStats {
  return { moveset: [], gearModifier: {}, hypeMultiplier: 1, bpmSyncBonus: 0 };
}

/** Default rarity tier for a freshly authored card. */
export function defaultRarity(): CardRarity {
  return { tier: 'common', statMultiplier: 1.0 };
}

// ── Payload validation (pure; the service calls it after the kind check) ──────────────────────────────────────────────
const isHttp = (s: unknown) => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s) && s.length <= 600;
const isDataOrHttp = (s: unknown) => isHttp(s) || (typeof s === 'string' && s.startsWith('data:image/') && s.length <= 3_000_000);
const strs = (v: unknown, max: number, each: number) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.trim().length > 0 && x.length <= each);
const text = (v: unknown, min: number, max: number) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
export const PAYLOAD_LIMITS = { sceneQuestions: 8, steps: 30, ingredients: 40, wearables: 12, writing: 4000 } as const;

/** Every payload the API accepts is checked here — field shapes, URL schemes, bounded lists. */
export function validateArtPayload(art: unknown): { ok: true } | { ok: false; error: string } {
  if (!art || typeof art !== 'object') return { ok: false, error: 'art payload required' };
  const a = art as Record<string, unknown>;
  switch (a.kind) {
    case 'sport': return { ok: true };
    case 'music': return strs(a.stemUrls, 16, 600) && typeof a.bpm === 'number' && a.bpm >= 40 && a.bpm <= 300 ? { ok: true } : { ok: false, error: 'music: stemUrls and bpm 40–300' };
    case 'art': return isDataOrHttp(a.canvasDataUrl) && ['court', 'board', 'kit', 'ui'].includes(String(a.appliedSurface)) ? { ok: true } : { ok: false, error: 'art: canvas image and a surface' };
    case 'dance': return Array.isArray(a.sequence) && a.sequence.length > 0 && a.sequence.length <= 64 ? { ok: true } : { ok: false, error: 'dance: 1–64 steps' };
    case 'acting': return isHttp(a.performanceUrl) && text(a.sceneId, 1, 64) ? { ok: true } : { ok: false, error: 'acting: sceneId and performance url' };
    case 'scene': {
      if (!text(a.venueId, 1, 64) || !text(a.cameraPath, 1, 64)) return { ok: false, error: 'scene: venueId and cameraPath' };
      const qs = a.questions;
      if (!Array.isArray(qs) || qs.length < 1 || qs.length > PAYLOAD_LIMITS.sceneQuestions) return { ok: false, error: `scene: 1–${PAYLOAD_LIMITS.sceneQuestions} questions` };
      for (const q of qs as Record<string, unknown>[]) {
        if (!q || !text(q.prompt, 4, 200) || !strs(q.options, 4, 80) || (q.options as string[]).length !== 4) return { ok: false, error: 'scene: each question needs a prompt and four options' };
        if (typeof q.answer !== 'number' || ![0, 1, 2, 3].includes(q.answer)) return { ok: false, error: 'scene: answer index 0–3' };
        if (new Set((q.options as string[]).map((o) => o.trim().toLowerCase())).size !== 4) return { ok: false, error: 'scene: options must differ' };
      }
      return { ok: true };
    }
    case 'cooking': {
      if (!strs(a.steps, PAYLOAD_LIMITS.steps, 300) || (a.steps as string[]).length < 1) return { ok: false, error: `cooking: 1–${PAYLOAD_LIMITS.steps} steps` };
      if (!strs(a.ingredients, PAYLOAD_LIMITS.ingredients, 80) || (a.ingredients as string[]).length < 1) return { ok: false, error: 'cooking: at least one ingredient' };
      if (!strs(a.fuelTags, 8, 24)) return { ok: false, error: 'cooking: up to 8 fuel tags' };
      if (a.photoUrl !== undefined && !isDataOrHttp(a.photoUrl)) return { ok: false, error: 'cooking: photo must be an image url' };
      return { ok: true };
    }
    case 'fashion': {
      if (!text(a.lookId, 1, 64)) return { ok: false, error: 'fashion: lookId' };
      if (!strs(a.wearableIds, PAYLOAD_LIMITS.wearables, 64) || (a.wearableIds as string[]).length < 1) return { ok: false, error: `fashion: 1–${PAYLOAD_LIMITS.wearables} wearables` };
      if (!Array.isArray(a.palette) || a.palette.length > 6 || !(a.palette as unknown[]).every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) return { ok: false, error: 'fashion: up to 6 hex colours' };
      if (a.photoUrl !== undefined && !isDataOrHttp(a.photoUrl)) return { ok: false, error: 'fashion: photo must be an image url' };
      return { ok: true };
    }
    case 'writing': {
      if (!text(a.text, 20, PAYLOAD_LIMITS.writing)) return { ok: false, error: `writing: 20–${PAYLOAD_LIMITS.writing} characters` };
      if (a.coverUrl !== undefined && !isDataOrHttp(a.coverUrl)) return { ok: false, error: 'writing: cover must be an image url' };
      return { ok: true };
    }
    default: return { ok: false, error: 'unknown discipline payload' };
  }
}
