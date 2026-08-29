// M28 Creative Card — five-discipline unified social object. (Phase 11–14 spec.)
// NOTE: named `CreativeCard` (not `CreatorCard`) to avoid clashing with the
// existing athlete-identity CreatorCard model/type in this project.

export type Discipline = 'sport' | 'music' | 'art' | 'dance' | 'acting';

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
  | { kind: 'acting'; sceneId: string; performanceUrl: string; voiceLineIds: string[] };

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
export const NEEDS_REVIEW: Discipline[] = ['music', 'acting'];

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
