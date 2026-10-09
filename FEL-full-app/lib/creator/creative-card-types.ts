// M28 Creative Card — five-discipline unified social object. (Phase 11–14 spec.)
// NOTE: named `CreativeCard` (not `CreatorCard`) to avoid clashing with the
// existing athlete-identity CreatorCard model/type in this project.

import { MOODS, type Mood } from './creative-card-review';
import { RIGHTS_VERSIONS as SOUND_RIGHTS_VERSIONS, RIGHTS_VERSION as SOUND_RIGHTS_VERSION, type RightsRecord } from '@/lib/soundtrack/rights';

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
  scene:   { label: 'Scene',   blurb: 'Author a Spot the Scene pack from FEL\'s own venues',    color: 'bg-violet-500' },
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
// CREATE HUB phase 1 (owner, 2026-10-06; lane/create-hub owns the payload v2 contract, additive by owner exemption):
//  - music v2: optional mixUrl/mime/bytes/durationSec/loudnessLufs/loop/origin/chart/bars/moods. A v1 card (2-bar WAV
//    stems only) still validates; lib/soundtrack reads v2 to play it.
//  - dance keeps its editor's `bpm` (create/page.tsx used to drop it, so every routine replayed at 100).
//  - cooking carries `allergens` (the nine on the Fuel floor, lib/kitchens/allergens.ts on lane/safety-fixes).
//  - every payload may carry `rights` {text, version, at}; one that carries media must (validateArtPayload).
export type ArtPayload = ArtPayloadBody & { rights?: RightsRecord };
export type ArtPayloadBody =
  | { kind: 'sport'; highlightReelUrl?: string; routineId?: string; signatureMoveId?: string }
  | ({ kind: 'music'; trackId: string; stemUrls: string[]; coverArtUrl: string; bpm: number; keySignature: string } & MusicV2Fields)
  | { kind: 'art'; canvasDataUrl: string; palette: string[]; brushSetId: string; appliedSurface: 'court' | 'board' | 'kit' | 'ui' }
  | { kind: 'dance'; choreographyId: string; sequence: DanceStep[]; routineVideoUrl?: string; bpm?: number }
  | { kind: 'acting'; sceneId: string; performanceUrl: string; voiceLineIds: string[] }
  | { kind: 'scene'; venueId: string; cameraPath: string; questions: SceneQuestion[]; freeUse?: boolean }
  | { kind: 'cooking'; steps: string[]; ingredients: string[]; photoUrl?: string; fuelTags: string[]; allergens?: CardAllergen[] }
  | { kind: 'fashion'; lookId: string; wearableIds: string[]; palette: string[]; photoUrl?: string }
  | { kind: 'writing'; text: string; coverUrl?: string; storyNodeId?: string };

/** Where a music card's audio came from. `house` is FEL's own playlist: a creator's card can never claim it. */
export type MusicOrigin = 'academy' | 'maker' | 'upload' | 'house';
export const CARD_MUSIC_ORIGINS: readonly MusicOrigin[] = ['academy', 'maker', 'upload'];

/** Music payload v2 (the soundtrack plan's piece A). All optional, so v1 cards stay valid. */
export interface MusicV2Fields {
  /** One playable mix (the soundtrack plays this, never the stems). */
  mixUrl?: string;
  mime?: MusicMime;
  bytes?: number;
  durationSec?: number;
  /** Measured in the browser before upload; the player normalises toward about -16 LUFS. */
  loudnessLufs?: number;
  /** A gap-free loop inside the mix, for menus. */
  loop?: { startSec: number; endSec: number };
  origin?: MusicOrigin;
  /** A Dance step chart for the song (Academy's dance export), so a music card can be a Dance song. */
  chart?: DanceStep[];
  bars?: number;
  moods?: Mood[];
}

/** The audio types a mix may be stored as; matches the upload allowlist (lib/soundtrack/storage.ts MEDIA_MIME). */
export const MUSIC_MIMES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/wav'] as const;
export type MusicMime = typeof MUSIC_MIMES[number];

/** Owner 2026-10-06 ("about 8 MB and at most 4 minutes"); the same numbers as lib/soundtrack/storage.ts MEDIA_LIMITS. */
export const MUSIC_LIMITS = { bytes: 8 * 1024 * 1024, durationSec: 240, chartSteps: 512, bars: 512, moods: MOODS.length } as const;

// ── Allergens (cooking) ──────────────────────────────────────────────────────────────────────────────────────────────
/** The nine major allergens, the SAME ids as lib/kitchens/allergens.ts ALLERGENS (lane/safety-fixes, owner 2026-10-06). */
export const CARD_ALLERGENS = ['milk', 'egg', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'soy', 'sesame'] as const;
export type CardAllergen = typeof CARD_ALLERGENS[number];

// ── Rights (every card that carries media) ───────────────────────────────────────────────────────────────────────────
/**
 * What a creator agreed to, kept on the card: the exact words, which version they were, and when. A wording change is a
 * NEW version; never edit one in place, so a card that agreed to an older one is still known to have agreed to exactly
 * that. `sound` covers music and voice; `media` covers images and video.
 */
/** The record a card keeps: lane/soundtrack's shape (lib/soundtrack/rights.ts). */
export type { RightsRecord };
export type RightsFamily = 'sound' | 'media';
export const RIGHTS_VERSIONS: Readonly<Record<string, { family: RightsFamily; text: string }>> = {
  // Sound: the owner's wording, verbatim (2026-10-06, "rights text = use proposed wording (versioned + timestamped)").
  // ONE home for it: lane/soundtrack's lib/soundtrack/rights.ts, whose catalogue plays only cards carrying a version it
  // lists. Every version there is a sound version here, so a new wording added there is accepted here too.
  ...Object.fromEntries(Object.entries(SOUND_RIGHTS_VERSIONS).map(([v, text]) => [v, { family: 'sound' as const, text }])),
  // assumption: the owner gave wording for sound only. Images and video get the same promise in their own terms until
  // the owner words it; a new version replaces this, it is never edited.
  'media-2026-10-06': {
    family: 'media',
    text: "I made this, or I own all rights to everything in it. No photos, art, footage, logos or likenesses I don't have " +
      'rights to. FEL may show it in the game, on my card and in the Create hub, credited to me.',
  },
};
export const CURRENT_RIGHTS: Readonly<Record<RightsFamily, string>> = { sound: SOUND_RIGHTS_VERSION, media: 'media-2026-10-06' };

/** Which promise a discipline's media needs: sound for music and voice, media for the rest. */
export const rightsFamilyFor = (kind: Discipline): RightsFamily => (kind === 'music' || kind === 'acting' ? 'sound' : 'media');

/** The record the Create hub stores when the creator ticks the box (the server re-stamps `at`, see stampRights). */
export function rightsRecordFor(kind: Discipline, now: Date = new Date()): RightsRecord {
  const version = CURRENT_RIGHTS[rightsFamilyFor(kind)];
  return { text: RIGHTS_VERSIONS[version].text, version, at: now.toISOString() };
}

/** Valid when the version is known, of the right family, its words are that version's exact words, and it has a time. */
export function isValidRights(r: unknown, family?: RightsFamily): r is RightsRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  const v = typeof x.version === 'string' ? RIGHTS_VERSIONS[x.version] : undefined;
  return !!v && (family === undefined || v.family === family) && x.text === v.text
    && typeof x.at === 'string' && x.at.length <= 40 && !Number.isNaN(Date.parse(x.at));
}

/** Every media URL a payload carries (inline images included). Empty = nothing to hold rights to. */
export function cardMediaOf(art: unknown): string[] {
  const a = (art ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const k of ['mixUrl', 'performanceUrl', 'coverArtUrl', 'coverUrl', 'photoUrl', 'highlightReelUrl', 'routineVideoUrl', 'canvasDataUrl']) {
    if (typeof a[k] === 'string' && (a[k] as string).trim()) out.push(a[k] as string);
  }
  if (Array.isArray(a.stemUrls)) for (const u of a.stemUrls) if (typeof u === 'string' && u.trim()) out.push(u);
  return out;
}

/** The server's clock on the record: when the card was submitted, not whatever the device said. */
export function stampRights<T extends { rights?: RightsRecord }>(art: T, now: Date = new Date()): T {
  return art.rights ? { ...art, rights: { ...art.rights, at: now.toISOString() } } : art;
}

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
  /** CREATE HUB (owner 2026-10-06): remix credit, derived on read (creative-card-service withRemixCredits), never stored. */
  remixedBy?: number;
  remixedFrom?: { id: string; title: string };
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

const isHttps = (s: unknown) => typeof s === 'string' && /^https:\/\/\S+$/i.test(s) && s.length <= 600;
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number) => num(v, lo, hi) && Number.isInteger(v);

/** One Dance step, as the routine builder and the Academy's dance export write it. */
export function isDanceStep(x: unknown): x is DanceStep {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return text(s.clipId, 1, 64) && num(s.beat, 0, 8192) && num(s.holdBeats, 0.25, 64) && typeof s.mirrored === 'boolean';
}

/** The v2 music fields. Each is optional; any that is present must be in bounds. */
function validateMusicV2(a: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  if (a.mixUrl !== undefined && !isHttps(a.mixUrl)) return { ok: false, error: 'music: mixUrl must be an https link' };
  if (a.mime !== undefined && !(MUSIC_MIMES as readonly unknown[]).includes(a.mime)) return { ok: false, error: `music: mime one of ${MUSIC_MIMES.join(', ')}` };
  if (a.mixUrl !== undefined && a.mime === undefined) return { ok: false, error: 'music: a mix needs its mime' };
  if (a.bytes !== undefined && !int(a.bytes, 1, MUSIC_LIMITS.bytes)) return { ok: false, error: 'music: up to 8 MB' };
  if (a.durationSec !== undefined && !num(a.durationSec, 1, MUSIC_LIMITS.durationSec)) return { ok: false, error: 'music: 1 second to 4 minutes' };
  if (a.mixUrl !== undefined && a.durationSec === undefined) return { ok: false, error: 'music: a mix needs its length' };
  if (a.loudnessLufs !== undefined && !num(a.loudnessLufs, -70, 0)) return { ok: false, error: 'music: loudness -70 to 0 LUFS' };
  if (a.loop !== undefined) {
    const l = a.loop as Record<string, unknown> | null;
    const end = typeof a.durationSec === 'number' ? a.durationSec : MUSIC_LIMITS.durationSec;
    if (!l || typeof l !== 'object' || !num(l.startSec, 0, end) || !num(l.endSec, 0, end) || (l.endSec as number) - (l.startSec as number) < 1) {
      return { ok: false, error: 'music: loop inside the track, at least 1 second' };
    }
  }
  if (a.origin !== undefined && !CARD_MUSIC_ORIGINS.includes(a.origin as MusicOrigin)) return { ok: false, error: 'music: origin academy, maker or upload' };
  if (a.chart !== undefined && (!Array.isArray(a.chart) || a.chart.length < 1 || a.chart.length > MUSIC_LIMITS.chartSteps || !a.chart.every(isDanceStep))) {
    return { ok: false, error: `music: chart of 1–${MUSIC_LIMITS.chartSteps} dance steps` };
  }
  if (a.bars !== undefined && !int(a.bars, 1, MUSIC_LIMITS.bars)) return { ok: false, error: `music: bars 1–${MUSIC_LIMITS.bars}` };
  if (a.moods !== undefined && (!Array.isArray(a.moods) || a.moods.length > MUSIC_LIMITS.moods || new Set(a.moods).size !== a.moods.length
    || !a.moods.every((m) => (MOODS as readonly unknown[]).includes(m)))) return { ok: false, error: `music: moods from ${MOODS.join(', ')}` };
  if (a.coverArtUrl !== undefined && a.coverArtUrl !== '' && !isDataOrHttp(a.coverArtUrl)) return { ok: false, error: 'music: cover must be an image url' };
  return { ok: true };
}

/** Every payload the API accepts is checked here — field shapes, URL schemes, bounded lists, and the rights record. */
export function validateArtPayload(art: unknown): { ok: true } | { ok: false; error: string } {
  const body = validateArtBody(art);
  if (!body.ok) return body;
  // CREATE HUB phase 1: a card that carries media carries the creator's rights record, in the words of its family's
  // current or an earlier version. A card with no media (a scene pack, a sport card, a recipe with no photo) may omit it.
  const a = art as Record<string, unknown>;
  const family = rightsFamilyFor(a.kind as Discipline);
  if (a.rights !== undefined && !isValidRights(a.rights, family)) return { ok: false, error: `rights: the ${family} rights statement, word for word` };
  if (cardMediaOf(a).length > 0 && a.rights === undefined) return { ok: false, error: 'rights: tick the rights statement for what you upload' };
  return { ok: true };
}

function validateArtBody(art: unknown): { ok: true } | { ok: false; error: string } {
  if (!art || typeof art !== 'object') return { ok: false, error: 'art payload required' };
  const a = art as Record<string, unknown>;
  switch (a.kind) {
    case 'sport': return a.highlightReelUrl === undefined || isHttps(a.highlightReelUrl) ? { ok: true } : { ok: false, error: 'sport: highlight must be an https link' };
    case 'music': {
      if (!(strs(a.stemUrls, 16, 600) && typeof a.bpm === 'number' && a.bpm >= 40 && a.bpm <= 300)) return { ok: false, error: 'music: stemUrls and bpm 40–300' };
      return validateMusicV2(a);
    }
    case 'art': return isDataOrHttp(a.canvasDataUrl) && ['court', 'board', 'kit', 'ui'].includes(String(a.appliedSurface)) ? { ok: true } : { ok: false, error: 'art: canvas image and a surface' };
    case 'dance': {
      if (!(Array.isArray(a.sequence) && a.sequence.length > 0 && a.sequence.length <= 64)) return { ok: false, error: 'dance: 1–64 steps' };
      if (!a.sequence.every(isDanceStep)) return { ok: false, error: 'dance: each step needs a clip, a beat, a hold and mirrored' };
      if (a.bpm !== undefined && !num(a.bpm, 40, 300)) return { ok: false, error: 'dance: bpm 40–300' };
      if (a.routineVideoUrl !== undefined && !isHttps(a.routineVideoUrl)) return { ok: false, error: 'dance: video must be an https link' };
      return { ok: true };
    }
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
      if (a.allergens !== undefined && (!Array.isArray(a.allergens) || new Set(a.allergens).size !== a.allergens.length
        || !a.allergens.every((x) => (CARD_ALLERGENS as readonly unknown[]).includes(x)))) return { ok: false, error: `cooking: allergens from ${CARD_ALLERGENS.join(', ')}` };
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
