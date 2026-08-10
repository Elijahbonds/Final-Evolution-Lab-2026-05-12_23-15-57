// StudioLibrary v2 — REPLACES the M57 file. One addition (Phase 8): a
// published FEL track can carry STREAMING LINKS — the creator's authorized
// Spotify/Apple Music versions of the song. The library then plays those
// through the official embed players (StreamingBridge), which is the
// honest meaning of "external-streaming-authorized playback on save": the
// CREATOR attaches the link, the OFFICIAL player does the playback, the
// artist gets their plays. Everything else is byte-identical to M57
// (localStorage today, marked SYNC SEAMs for the real backend).

import type { SequencerState } from './AudioEngine';
import type { KitId } from './SynthKit';
import type { StreamingLink } from './StreamingBridge';

export interface TrackRecord {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  kit: KitId;
  bpm: number;
  swing: number;
  polished: boolean;
  /** The full pattern — enough to REPLAY and to REMIX. */
  sequencer: SequencerState;
  /** data: URL of the rendered mixdown WAV (2 bars) — instant playback. */
  mixdownDataUrl: string;
  remixOf: { id: string; title: string; authorName: string } | null;
  /** The creator's own authorized Spotify/Apple versions of this song —
   *  played back via the OFFICIAL embed players, never scraped audio. */
  streamingLinks: StreamingLink[];
  createdAt: number;
  plays: number;
  saves: number;
}

const KEY_TRACKS = 'fel_studio_tracks_v1';       // all published tracks visible to this device
const KEY_SAVED = 'fel_studio_saved_v1';         // track ids this user saved to their library

function readAll(): TrackRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY_TRACKS) ?? '[]') as TrackRecord[]; }
  catch { return []; }
}
function writeAll(tracks: TrackRecord[]): void {
  // keep the newest 40 — data URLs are heavy; a real backend lifts this cap
  localStorage.setItem(KEY_TRACKS, JSON.stringify(tracks.slice(0, 40)));
}
function readSaved(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY_SAVED) ?? '[]') as string[]; }
  catch { return []; }
}

export const StudioLibrary = {
  /** Publish a finished track to the library. */
  publish(rec: Omit<TrackRecord, 'id' | 'createdAt' | 'plays' | 'saves' | 'streamingLinks'> & { streamingLinks?: StreamingLink[] }): TrackRecord {
    const full: TrackRecord = {
      streamingLinks: [],
      ...rec,
      id: `trk_${Date.now()}_${Math.floor(Math.random() * 1e5)}`,
      createdAt: Date.now(), plays: 0, saves: 0,
    };
    writeAll([full, ...readAll()]);
    // SYNC SEAM: POST /api/studio/tracks  { full }  — server assigns id,
    // stores the mixdown in object storage, returns the canonical record.
    return full;
  },

  /** Every track on this device, newest first. */
  list(): TrackRecord[] {
    // SYNC SEAM: GET /api/studio/tracks?limit=… replaces the local read.
    return readAll();
  },

  /** All of one creator's songs — the "see everything they've made" view. */
  byAuthor(authorId: string): TrackRecord[] {
    return readAll().filter((t) => t.authorId === authorId);
  },

  get(id: string): TrackRecord | null {
    return readAll().find((t) => t.id === id) ?? null;
  },

  /** Count a play (called when the library actually starts audio). */
  countPlay(id: string): void {
    const all = readAll();
    const t = all.find((x) => x.id === id);
    if (t) { t.plays++; writeAll(all); }
    // SYNC SEAM: POST /api/studio/tracks/:id/play
  },

  /** Save someone's track to MY library. */
  saveToMyLibrary(id: string): void {
    const saved = readSaved();
    if (!saved.includes(id)) {
      saved.push(id);
      localStorage.setItem(KEY_SAVED, JSON.stringify(saved));
      const all = readAll();
      const t = all.find((x) => x.id === id);
      if (t) { t.saves++; writeAll(all); }
    }
    // SYNC SEAM: POST /api/studio/library { trackId } per user.
  },

  mySavedIds(): string[] { return readSaved(); },
  mySaved(): TrackRecord[] {
    const ids = new Set(readSaved());
    return readAll().filter((t) => ids.has(t.id));
  },

  remove(id: string): void {
    writeAll(readAll().filter((t) => t.id !== id));
  },

  /** Attach (or replace) an authorized streaming link on my own track. */
  attachStreamingLink(id: string, link: StreamingLink): void {
    const all = readAll();
    const t = all.find((x) => x.id === id);
    if (!t) return;
    t.streamingLinks = [...(t.streamingLinks ?? []).filter((l) => l.provider !== link.provider), link];
    writeAll(all);
    // SYNC SEAM: PATCH /api/studio/tracks/:id { streamingLinks }
  },

  /** Start a remix: returns the state to load into the editor + attribution. */
  beginRemix(id: string): { sequencer: SequencerState; kit: KitId; bpm: number; swing: number; remixOf: TrackRecord['remixOf'] } | null {
    const t = this.get(id);
    if (!t) return null;
    return {
      sequencer: JSON.parse(JSON.stringify(t.sequencer)) as SequencerState,
      kit: t.kit, bpm: t.bpm, swing: t.swing,
      remixOf: { id: t.id, title: t.title, authorName: t.authorName },
    };
  },
};

/** Blob → data: URL (stored inline today; object storage at the SYNC SEAM). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
