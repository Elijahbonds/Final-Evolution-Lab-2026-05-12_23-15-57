// StudioMode v2 — REPLACES the M57 file. Phase 8 additions on top of the
// Academy: a LISTEN tab (StreamingDeck — official Spotify/Apple embeds +
// connect seams), an optional "your Spotify/Apple link" field on publish,
// and per-track streaming chips in the library that expand the official
// embed player inline. Everything else byte-identical to M57.
//
// THE FEL MUSIC ACADEMY — the creation studio, template: the loop that
// makes in-browser music tools sticky (multi-track groovebox, unlockable
// sound kits, one-tap mastering, remix-with-attribution, per-creator song
// pages). Presentation: a warm, vibrant music-school hub with an ORIGINAL
// mentor cast (Professor Okta — no real-person likeness, no franchise
// characters, no show references; original name/design per the standing
// IP rule).
//
// What's real vs. seamed (honest boundaries, stated in-code where they live):
//   REAL: synthesis (zero asset files — fixes M28's missing-WAV dependency),
//         sequencing, mastering chain, mixdown render, save/library/remix,
//         per-creator pages, perform-mode scoring.
//   REAL (MUSIC-SUITE P2, 2026-09-25): Shards spend — the loaders wire spendShards to POST /api/music/unlock and
//         readOwnedKits to its GET; every spend is asked about first (the inline confirm), a remix never buys, and
//         each failure says what it was (purchases.ts holds the pure half).
//   SEAM: Cell/Nexus generation (local musical generator today, labeled as
//         the LLM integration point), backend sync (StudioLibrary's four
//         SYNC SEAMs), external streaming (Phase 8, not faked here).
//
// MUSIC-SUITE P3 (2026-09-25), "Keep my work" — tier-honesty-editing. What P1 measured (outbox musicsuite/BASELINE.md 2b)
// and the map read (understand-wf_3a55346f-032.json), and what the room does now:
//   · WHAT YOU HEAR IS WHAT YOU SEE. The grid drew `tracks.slice(0, caps.tracks)` while the engine played every track:
//     10 tracks, 6 rows drawn; flip_0 played 8 times in 2 bars on a row never drawn; CELL's lead played on the 4-row grid.
//     One rule now (MusicTiers.shownRowIds): the grid draws the tier's kit rows plus EVERY Flip row (their own section under
//     the kit rows, with their own cap — every pad, at every tier; MusicTiers' header says why), and the engine plays
//     exactly those (AudioEngine.setAudible). CELL fills only those rows, and its confirm shows (and can play) the exact
//     foundation the yes will lay — the P2 confirm stays the only charge.
//   · SONG MODE IS A SEPARATE PLAYBACK SOURCE. It wrote every bar's section into the grid (SongPanel ~:52 then): edits in
//     song mode were overwritten, and song mode off left the last section in the grid. Now the grid shows the section
//     playing READ-ONLY while the player's own grid is kept, and song mode off plays it again. Sections can be renamed,
//     updated from the grid, deleted (asked first) and reordered in the chain (SongPanel; rules in studioEdit.ts).
//   · UNDO / REDO (100 steps) for grid edits, Flip sends and recorded pad hits, section edits and CLEAR (asked first);
//     ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y on the STUDIO tab.
//   · TIER HONESTY. The dance export is open at the GRID as the ladder says (it lived in the song panel, CHAIN-only); takes
//     and the song render + stems follow `takes` / `mixdown` (they showed from the CHAIN); the chain opens when a pattern
//     is PLAYED, as its words say; the tier chips say what each tier opens and what unlocks the next.
//   · PUBLISH AND REMIX CARRY THE FLIP CHOPS (a published record kept flip_N rows with no sound; a remix's Flip rows were
//     silent). A published song's own-audio chops are kept by the store while the song is listed.
//   · THE KITS CACHE IS THE PLAYER'S (P2's open item): `playerId` comes from app/play/music (/dev/music: a fixed dev id).
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25) — the review's findings, each against this file:
//   · PROJECTS ARE THE PLAYER'S (useStudioProject playerId): on a shared device the next player opened, autosaved over and
//     could delete the last player's projects. LIBRARY DELETE shows on your own songs only.
//   · UNDO COVERS THE TAKES, THE FLIP TAB, TEMPO, SWING, KIT AND MASTER (owner decision #4): a take's × and a new Flip
//     source were final. Every one of them goes through `edit` now; slider drags are one step each.
//   · THE KIT IS PLAYED, NOT REWRITTEN. Opening a project whose kit the cached list lacked (a new per-player cache before
//     the server read landed, a shared device) loaded STREET through setKit, which wrote 'street' INTO the project — a
//     saved NEON beat rewritten for good, and "isn't on your account" said of a kit the player owns. The engine now plays
//     what the account owns (the project's kit, else STREET) and follows the owned list as it lands; only the player's
//     own pick changes the project's kit. A publish and a set's stats name the kit that PLAYED.
//   · MASTER follows the project (an effect), so a remix of a mastered song opens mastered (beginRemix → polish).
//   · THE FLIP ROWS' SOUNDS ARE THE OPEN PROJECT'S (flipRowSounds.ts): another project's chop no longer plays on a row
//     whose own chop is missing, and an undo's reload can't land on the next project.
//   · PUBLISH renders the working grid at the PROJECT's swing (studioEdit.publishRender), not the playing section's.
//   · REMIX IS HELD like MY PROJECTS (a take recording, a PERFORM set: `switchLock`), and a take or a mic take lands in
//     the project it was recorded in (onTake / flipChange → ops.amend when that is not the open one).
//   · The take being recorded has a STOP wherever the player is; SEND TO THE DANCE FLOOR says when the export was not
//     kept; ARM REC on a pad whose row holds another chop replaces the row's chop (one undo step); the remix-kit note
//     belongs to the project it was said about.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody" — grid-ui: the room on top of the PHASE-4 ENGINE CONTRACT (one
// mix graph, notes on steps, metronome + count-in, looping takes, the mixer in the project). What P1 / P3 measured and
// the map found (outbox musicsuite/BASELINE.md, p3/REPORT.md "Not done", understand-wf_3a55346f-032.json), and now:
//   · THE PHONE GRID. 16.5 px cells and 43 px of sideways scroll at 375 px: the grid was `90px repeat(16, 1fr)` at every
//     width (~:866 then). ui/StepGrid: under 640 px two pages of 8 steps (page buttons + a swipe on the step strip) with
//     ≥ 40 px cells, and the room's side padding is 8 px there; desktop keeps 16 columns. Beat shading, the playhead on
//     either page, a key cursor, and DRAG-TO-PAINT (down on an off cell paints on, on an on cell paints off, across
//     cells; one stroke = one undo step). The rules are ui/gridMath (tested).
//   · MELODY. A pitched row (bass, lead, every Flip row) has a ♪ that opens its NoteRow: one octave of the song's key at a
//     time with an octave switch, one note per step (ui/noteMath; every note goes through StudioProject.withStep, which
//     locks it to the key). The KEY + SCALE picker sits over the grid; a key change moves every note with it
//     (setProjectKey — one undo step: the key is in the undo slice now) and the key rides on the dance export's card and
//     the library record. The bass / lead notes in use are rendered ON their note for the kit that plays (noteRenders).
//   · THE MIXER at THE STUDIO (the ladder's "mix it"; the chip names it): ui/MixerStrip — a strip per drawn row (+ TAKES)
//     with M / S / VOL / PAN / ROOM / DELAY, a peak meter and clip light, and the MASTER with its meters and the limiter's
//     pull. Every move is a project edit (undo, autosave — P3); the engine follows (setMixer).
//   · METRONOME + COUNT-IN in the transport (engine.setMetronome / countIn; remembered on this device). PLAY counts in.
//   · DESKTOP KEYS (ui/keys): Space play/stop, the arrows + Enter on the grid, ⌥↑↓ a note, B the booth (P4 FIX PASS: was ⇧R),
//     ⌘Z / ⇧⌘Z undo / redo (P4 FIX PASS: the bare Z / ⇧Z went — pad letters); as first written: ⇧R the booth, Z / ⇧Z undo /
//     redo, ? the key map — never on the FLIP tab (its pad keys), never PERFORM's Space / J, never while typing.
//   · CHECK MY TIMING (moved here from P2): a 2-bar count-in at the calibration tempo, 8 taps, the offset read with
//     rhythm-calibrate computeOffsetMs and saved dated — "your offset +75 ms" (ui/timingCheck).
//   · P3's open items: the 2.2 s line floats at the top or the bottom, whichever covers less of the grid and the
//     transport, and never takes a tap; a library failure stays on a lasting line under the project bar; a new project's
//     default name gets " (2)" when the minute's name is taken (useStudioProject / StudioProject.uniqueTitle).
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25) — the review's findings against this room (outbox musicsuite/p4/fixes):
//   · THE KEYS WAIT FOR THE ROOM. The key map listened on window from mount — behind the boot splash (Space on the focused
//     TAP TO START started the beat behind it and never pressed START: measured {splashStillThere, engineRunning}) and
//     under GameShell's end card (the Game stays mounted: Space toggled the transport behind REPLAY, Z undid and autosaved
//     the grid). Now it listens only while the room is on screen (started, ready, restored), and it is SUSPENDED from the
//     moment a set is handed to the shell's card until the room is touched again (a remount — REPLAY — starts clean).
//     The map itself (ui/keys) gives a focused button its own Space, keeps the arrows / Enter to the GRID, swallows a held
//     Space, and uses no Flip pad letter (B is the booth; undo / redo are ⌘Z / Ctrl+Z / ⇧⌘Z / Ctrl+Y).
//   · PERFORM IGNORES THE STUDIO'S COUNT-IN AND METRO (decision #13). PLAY in PERFORM counted in and the metronome ticked
//     through a scored set; a tap on a count-in click settled as an EXTRA — a miss (tsx on performSet: a 1-bar count-in
//     tapped on time + 9 bars perfect = 36 of 40, combo broken; a sparse beat with a 2-bar count-in sat at 50 %, the win
//     line). PERFORM starts on the press with no clicks, as P2's did.
//   · THE DESK HEARS ONLY WHAT CAN SOUND (decision #11). A solo left on TAKES after its last take was deleted silenced every
//     row — PLAY, PUBLISH and PERFORM's notes — with no S left on screen. The engine gets the desk scoped to the strips
//     drawn (mixGraph.scopeSolo), and removing the last take clears the TAKES strip's mute / solo in the same undo step.
//   · MUTE / SOLO AT EVERY TIER (decision #4): the MIXER shows each row's M / S and meter from THE GRID; its faders, sends and
//     the master LEVEL open at THE STUDIO (the ladder's "mix it"). The lane had hidden the whole desk until THE STUDIO.
//   · CHECK MY TIMING counts in a LEAD-IN bar and reads the last 8 clicks (the first click was a reaction), and reads them
//     as they leave the desk (engine.graphLatencySec), so the saved offset is the device's alone; PERFORM adds the desk.
//   · WHAT IS PUBLISHED IS WHAT YOU HEAR: the record and the dance export leave out rows the desk silences, as the render
//     does; a remix of a pre-P4 song keeps its SOURCE kit's notes (studioEdit.remixSeed(rows, kit)); the dance card says
//     the key in words ('A minor' — the Cypher's chip upper-cased 'Am' into 'AM').

import React, { useEffect, useMemo, useRef, useState, useCallback, useReducer } from 'react';
import { AudioEngine, type RenderSounds, type TrackState } from './AudioEngine';
import { synthesizeKit, synthesizeNote, isPitchedSlot, KIT_SLOTS, KIT_META, VOICE_ROOTS, type KitId, type PitchedSlot } from './SynthKit';
// MUSIC-SUITE P3 (2026-09-25): the library's audio lives in the Academy's IndexedDB store now (StudioLibrary.ts header);
// publish hands it the rendered Blob, PLAY asks it for a source, and every failure comes back as a line to say.
import { StudioLibrary, type TrackRecord } from './StudioLibrary';
import LibraryDelete from './LibraryDelete';
import { parseStreamingUrl, PROVIDER_META } from './StreamingBridge';
import StreamingDeck from './StreamingDeck';
import FlipPad from './FlipPad';   // lane 2 M1 — the chop pad
import SongPanel from './SongPanel';   // lane 2 M2–M4 — sections, chain, take, stems
// MUSIC-SUITE P3 (2026-09-25), "Keep my work": everything the player makes here is ONE StudioProject, autosaved on the
// device (StudioProject.ts, studioStore.ts, useStudioProject.ts), with MY PROJECTS to keep several.
import { useStudioProject } from './useStudioProject';
import MyProjects from './MyProjects';
import { withFlipHit, withFlipRow, type ProjectFlip, type ProjectFlipRow, type ProjectFlipSource, type ProjectTake, type SongSlice, type StudioProject } from './StudioProject';
// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real": baked chops, a section's own chops, ARM REC on the audio clock, and
// decoded sources let go when the project no longer plays them (chopEdit.ts).
import { sectionChopsFor, stampSectionChops } from './StudioProject';
import { bakeKey, liveSourceKeys, planChopSwap, pruneMap, type StepMark } from './chopEdit';
import { stepDurSec } from './stepTime';
// MUSIC-SUITE P4 (2026-09-25): the contract's step / key / desk edits (StudioProject.ts) — every note is locked there
import { mixerOf, setProjectKey, withChannel, withMaster, withTrackStep } from './StudioProject';
// MUSIC-SUITE P3 FIX PASS (2026-09-25): which sound each Flip row plays — the open project's, and only its.
import { openFlipRowSounds, reloadFlipRowSounds } from './flipRowSounds';
// MUSIC-SUITE P3 (2026-09-25), tier-honesty-editing: the edit rules (undo, sections, CLEAR, CELL's preview, the chops a
// publish carries) and the dance export's tier gate.
import {
  EditHistory, applyFoundation, cellFoundation, chopSignature, clearGrid, foundationPreview, gridHitCount, historyAudioKeys, playbackSource,
  previewTracks, publishRender, publishTracks, publishedAudioKeys, remixSeed, sameSlice, shownSection, toggleStep, undoSlice, type UndoSlice,
} from './studioEdit';
// MUSIC-SUITE P5 FIX PASS (2026-09-25): a render's Flip rows play the sounds handed to it (the working grid's for PUBLISH,
// each bar's section's for RENDER SONG / STEMS) — never whatever song mode swapped into the engine last
import { flipSoundMap, songBarSounds, songChops } from './studioEdit';
import { danceSongAtTier, exportSongToDance, saveExportedTrack } from './DanceExport';
import { bakedBuffer, monoOf, sourceKey, type DecodedSource, type StepClock } from './FlipPad';
// MUSIC-SUITE P5 (2026-09-25), phone-mpc: the phone's room lives at ROOM level, its pads play the room's bank on any tab
// (the pad_N parse moved from Flip.padFromAction to phonePad.phoneCommand, which also reads PLAY / STOP / REC / BANK A–D)
import { padRowFor, readBankView, readQuantize, tapStep, writeBankView, type PadHit } from './FlipPad';
import { medianRtt, padGain, phoneBadgeShown, phoneCommand, phoneRoomOpen, phoneTapSec, pushRtt, transportEffect, PHONE_BANKS, PHONE_LATE_S } from './phonePad';
import { bankOf, flipSampleId } from './StudioProject';
import { rowSlotFor } from './chopEdit';
import type { ControlEvent, LobbyPeer, PeerId } from '@/lib/controller-link/types';
import { decodeFlipPackSource } from './flipPack';            // MUSIC-SUITE P5: FEL's Flip pack items and kits
import { projectUploadPrivacy, tracksHaveUpload, uploadDoorOpen, uploadNeedsTick, UPLOAD_DOORS } from './uploadPrivacy';   // MUSIC-SUITE P5: decision #15
import { judgesPhoneTap } from './phonePad';
import { HostLobby } from '@/components/controller-link/host-lobby';   // M1b — the phone is the pad controller
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { BootSplash } from '@/components/games/boot-splash';
import { readMusicStage } from './musicStage';
import {
  advance as advanceProgress, heardTracks, hiddenHits, patternCounts, readProgress, shownRowIds, tierChips, tierDef, tierFor,
  visibleRows, writeProgress, type MusicProgress,
} from './MusicTiers';
import type { GameProps } from '@/components/games/game-shell';
import { PerformSet, PERFORM_STEPS_PER_BAR, ARENA_SET_NOTE, performStatusLine } from './performSet';
// MUSIC-SUITE P2 (2026-09-25): the judge's new half — notes offered when scheduled, the heard clock, the result contract.
import { isPerformTapKey, performLatencySec, performNoteAt, performResultStats, performTapLabel, PERFORM_WIN_MIN_BARS, type PerformTap } from './performSet';
// MUSIC-SUITE P2 FIX PASS (2026-09-25): a held Enter on the focused TAP button is one tap, not one per key repeat.
import { isRepeatedActivation } from './performSet';
import { calibrationAgeText, loadAudioCalibration, loadRoomCalibration, saveAudioOffsetMs } from '@/lib/feel/rhythm-calibrate';
// MUSIC-SUITE P2 (2026-09-25): the room's shop — ask first, typed answers, the account's kits, a remix that never buys.
import {
  DEFAULT_KIT, SPEND_FAILURE_TEXT, SPEND_REFUSED, SPEND_UNREACHABLE, assistSpend, confirmCopy, initialShop, kitSpend, readKitCache,
  remixKit, remixKitNote, shopReducer, spendReason, writeKitCache,
  type PendingSpend, type ReadOwnedKits, type ShardSpend, type ShardSpendResult,
} from './purchases';
// MUSIC-SUITE P4 (2026-09-25), grid-ui: the pocket studio's UI (ui/*) over the phase-4 engine contract.
import { SCALES, SCALE_IDS, isPitchedRow, keyCardText, keyLabel, keySignature, pitchName, type ScaleId, type SongKey } from './scales';
import { TAKES_CHANNEL, anySolo, channelMix, gateOpen, scopeSolo, type ChannelMix } from './mixGraph';
import StepGrid, { type StepGridRow } from './ui/StepGrid';
import NoteRow from './ui/NoteRow';
import MixerPanel from './ui/MixerStrip';
import { KEY_HELP, cancelsKeyUp, keyTargetOf, studioKeyAction, type StudioKeyAction } from './ui/keys';
import { PHONE_PAD_PX, gridLayout, moveCursor, pageOfStep, stepsOnPage, toastSpot } from './ui/gridMath';
import { cellNoteLabel, nudgeNote, pickNote } from './ui/noteMath';
import { CHECK_BPM, CHECK_COUNT_BARS, CHECK_TAPS, acceptsTap, checkClicks, checkLine, checkWindow, formatOffset, heardClicks, readTimingCheck } from './ui/timingCheck';

// HOTFIX (2026-09-24): the grid's steps and PERFORM's set are one number, so the set's length in bars is the grid's bars.
const STEPS = PERFORM_STEPS_PER_BAR;
const CELL_ASSIST_COST = 50;

const OKTA_TIPS = [
  'Okta: a beat is a conversation — leave space for the answer.',
  'Okta: kick and bass are one instrument. Make them agree.',
  'Okta: swing is confidence. Nudge it and listen again.',
  'Okta: mute everything but two tracks. If that grooves, you have a song.',
  'Okta: steal from yourself — remix your old tracks.',
  'Okta: the MASTER button is polish, not rescue. Fix the pattern first.',
];

/**
 * MUSIC-SUITE P2: the player's saved calibration (ms), or null when there is none the room can apply.
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): through the one reader both rooms share (rhythm-calibrate loadRoomCalibration).
 * This read the key itself and took ANY stored value — an offset from the pre-P2 screen (nearest-click pairing, ±200 ms
 * clamp) included, which a Bluetooth player would have had applied ~550 ms wrong — and read a corrupt value as a
 * calibration of 0 where the Cypher read it as none. An undated offset is now ignored (outputLatency stands in).
 */
function savedAudioOffsetMs(): number | null {
  return loadRoomCalibration().offsetMs;
}

/** MUSIC-SUITE P2: the kits cache's storage, or null where reading it throws (blocked site data, some previews). */
function kitStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * MUSIC-SUITE P4 (2026-09-25): the transport's METRO and COUNT-IN, remembered on this device — a per-viewer convenience,
 * like a DAW's click settings, not part of the song (so they are not in the project, and not undo steps).
 */
const TRANSPORT_KEY = 'fel-studio-transport';
interface TransportPrefs { metronome: boolean; countIn: 0 | 1 | 2 }
function readTransportPrefs(): TransportPrefs {
  try {
    const o = JSON.parse(window.localStorage.getItem(TRANSPORT_KEY) ?? 'null') as Partial<TransportPrefs> | null;
    return { metronome: o?.metronome === true, countIn: o?.countIn === 1 || o?.countIn === 2 ? o.countIn : 0 };
  } catch { return { metronome: false, countIn: 0 }; }
}
function writeTransportPrefs(p: TransportPrefs): void {
  try { window.localStorage.setItem(TRANSPORT_KEY, JSON.stringify(p)); } catch { /* not kept: the toggles still work this visit */ }
}

/** MUSIC-SUITE P4: the saved calibration the rooms apply (dated, P2), for "your offset +75 ms · today"; null = none. */
function readSavedCal(): { offsetMs: number; age: string | null } | null {
  try {
    const room = loadRoomCalibration();
    if (room.offsetMs === null) return null;
    return { offsetMs: room.offsetMs, age: calibrationAgeText(loadAudioCalibration().measuredAt, Date.now()) };
  } catch { return null; }
}

/** MUSIC-SUITE P4: where the transient line goes — the band covering less of these (the grid, the transport). */
function toastSpotFor(els: readonly (HTMLElement | null)[]): 'top' | 'bottom' {
  if (typeof window === 'undefined') return 'bottom';
  const rects = els.filter((e): e is HTMLElement => !!e).map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  return toastSpot(window.innerHeight, rects);
}

declare global {
  interface Window {
    /** MUSIC-SUITE P4 dev/probe hook: the pocket studio's UI state (the grid's layout, cursor, notes, desk, check). */
    __FEL_GRID__?: {
      compact: boolean; page: number; pages: number; pageSteps: number; cursor: { row: string; step: number } | null;
      openNote: string | null; key: string; metronome: boolean; countIn: number; mixerOpen: boolean; help: boolean;
      check: string | null; checkTaps: number; checkClicks: number[]; savedOffsetMs: number | null; toastAt: 'top' | 'bottom'; libraryLine: string | null;
      noteRenders: Record<string, number[]>;
      /** MUSIC-SUITE P4 FIX PASS: the key map is listening (the room is on screen and not under the shell's card). */
      keysLive?: boolean;
      /** MUSIC-SUITE P4 FIX PASS: the desk's delay the room reads latencies with (engine.graphLatencySec, s). */
      graphLatencySec?: number;
    };
    /** MUSIC-SUITE P5 dev/probe hook: ARM REC's audio clock, the decoded sources and baked chops the room holds. */
    __FEL_FLIP_ROOM__?: {
      clock: () => StepClock | null; sources: () => string[]; chops: () => number; loaded: (id: string) => boolean;
      /** the decoded source's samples [at − n, at + n) (a probe checks a cut is on a zero crossing) */
      peek: (key: string, at: number, n: number) => Promise<number[] | null>;
    };
  }
}

// CELL SEAM — the local generator that writes a musically sensible foundation (kick/snare/hat/bass locked to each other)
// is studioEdit.cellFoundation now (MUSIC-SUITE P3: moved so the preview-then-lay rule is tested). It is exactly where a
// real Cell/Nexus LLM call plugs in: same input (a seed and the current state), same output (a new pattern set).

type View = 'studio' | 'flip' | 'library' | 'creator' | 'listen';
type Mode = 'build' | 'perform';

// MUSIC IS BOTH (owner, 2026-09-16). The Academy mounts through GameShell like every
// other mode, and the STAGE pick on the boot splash decides which half you get: STUDIO
// is the tool (no clock, no score, nothing reported) and PERFORM is the scored mode
// that ends on a card. `onEnd` comes from the shell; the rest are the tool's own seams.
export default function StudioMode({
  onEnd,
  onPublish,
  profile = { id: 'me', name: 'You' },
  spendShards,
  readOwnedKits,
  arenaSet = false,
  playerId = null,
}: GameProps & {
  onPublish?: (payload: unknown) => void;
  profile?: { id: string; name: string };
  /** The shop: POST /api/music/unlock on /play/music, answering a typed result (purchases.ts ShardSpendResult). Absent =
   *  nothing is for sale here, and every spend is refused (it used to be ALLOWED for free, with a console line). */
  spendShards?: ShardSpend;
  /** The account's kits: GET /api/music/unlock on /play/music, read at mount. Absent = this device's cache only. */
  readOwnedKits?: ReadOwnedKits;
  /** The run came from an Arena duel (?arena=<matchId>, passed by app/play/music's loader): PERFORM is the staked set,
   *  PERFORM_SET_BARS long. Absent = free play, which runs until END SET. */
  arenaSet?: boolean;
  /** MUSIC-SUITE P3 (2026-09-25): the signed-in player's id (app/play/music's server page → loader; /dev/music a fixed dev
   *  id). Keys the owned-kits cache to the player (purchases.ts kitCacheKey). Absent = no cache is read or written. */
  playerId?: string | null;
}) {
  const engineRef = useRef<AudioEngine | null>(null);
  /** MUSIC-SUITE P3 FIX PASS: who is making music here — the signed-in player (GameShell passes no `profile`). */
  const me = playerId ?? profile.id;
  const modeRef = useRef<Mode>('build');
  // HOTFIX (2026-09-24): PERFORM's notes, judge and score live in PerformSet (pure, performSet.ts) — the same rules the
  // Arena's server check reads. An Arena set is PERFORM_SET_BARS long, so its score has a ceiling; free play runs until
  // END SET, as it always did (owner, 2026-09-24: "Cap only Arena sets").
  const setRef = useRef(new PerformSet({ arena: arenaSet }));
  /** endSet as of the last render, for the engine callback that ends a finished set (its closure is from mount). */
  const endSetRef = useRef<() => void>(() => {});
  /** MUSIC-SUITE P2: the saved calibration (ms) as read when the set began; null = never calibrated (performLatencySec). */
  const savedOffsetRef = useRef<number | null>(null);
  /** MUSIC-SUITE P2: the tap verdict last put on screen. A tap that WAITED for its note settles inside an engine callback. */
  const shownTapRef = useRef<PerformTap | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('studio');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // The boot splash's STAGE pick decides where the Academy opens. 'perform' is the
  // scored half, so it maps to the PERFORM tab; 'studio' is the tool's BUILD floor.
  const [mode, setMode] = useState<Mode>(() => (readMusicStage() === 'perform' ? 'perform' : 'build'));
  const [started, setStarted] = useState(false);
  const setStartedAt = useRef(0);
  const [playhead, setPlayhead] = useState(-1);
  // MUSIC-SUITE P3 (2026-09-25), "Keep my work": THE PROJECT IS THE ROOM'S STATE. bpm / swing / tracks / kit / MASTER /
  // remix credit were useState here (P1: REPLAY and a reload cleared the grid, 14 lit cells → 0), and SongPanel and FlipPad
  // held the rest. Now all of it is one StudioProject (useStudioProject: restored before the splash lets the player in,
  // autosaved 400 ms after each change and whenever the tab hides or the room unmounts — GameShell's REPLAY remount
  // included). The setters below keep their old shapes, so every call site reads as it did.
  const sayLater = useRef<(msg: string) => void>(() => undefined);
  // ── MUSIC-SUITE P3 (2026-09-25): UNDO / REDO ───────────────────────────────────────────────────────────────────────
  // The room had neither, and no CLEAR. Every edit to the grid, the Flip rows (SEND, recorded pad hits), the sections and
  // the chain goes through `edit`, which remembers what it replaced (studioEdit.EditHistory, 100 steps; a burst of live
  // pad taps is one step). Opening another project starts a fresh history.
  // MUSIC-SUITE P3 FIX PASS (2026-09-25), owner decision #4: the takes, the FLIP tab (source + chops), the tempo, the
  // swing, the kit and MASTER are undo steps too (they were "settings, not edits" — and a take's × and a new Flip source
  // could not be taken back). A slider drag is one step (`group`).
  const historyRef = useRef(new EditHistory<UndoSlice>({ same: sameSlice }));
  const [histDepth, setHistDepth] = useState({ undo: 0, redo: 0 });
  // MUSIC-SUITE P3 (tier-honesty-editing): the store keeps the audio a published song's Flip chops point at (a remix of it
  // must play the same sounds after its project is deleted) — read from the library's index at each sweep / delete.
  // MUSIC-SUITE P3 FIX PASS: and the audio an undo or redo could bring back (a removed take comes back with its sound).
  // The projects are the signed-in player's (`playerId`).
  const room = useStudioProject((m) => sayLater.current(m), {
    keepAudio: () => new Set([...publishedAudioKeys(StudioLibrary.list()), ...historyAudioKeys(historyRef.current.states())]),
    playerId,
  });
  const { project, update } = room;
  const projectRef = useRef(project);
  projectRef.current = project;
  const { bpm, swing, tracks, kit, remixOf } = project;
  const polished = project.mixer.polish;
  /** MUSIC-SUITE P3 FIX PASS: the open project's generation, for loads that must not land on the next project. */
  const genRef = useRef(room.generation); genRef.current = room.generation;
  const edit = useCallback((fn: (p: StudioProject) => StudioProject, group?: string): void => {
    const before = projectRef.current;
    if (!sameSlice(undoSlice(before), undoSlice(fn(before)))) {
      historyRef.current.record(undoSlice(before), { group, at: Date.now() });
      setHistDepth(historyRef.current.depth);
    }
    update(fn);
  }, [update]);
  // MUSIC-SUITE P3 FIX PASS: tempo, swing and MASTER are undo steps (a drag of a slider is one); the engine follows the
  // project (the setState effect below; the MASTER effect).
  const setBpm = useCallback((v: number) => edit((p) => ({ ...p, bpm: v }), 'bpm'), [edit]);
  const setSwing = useCallback((v: number) => edit((p) => ({ ...p, swing: v }), 'swing'), [edit]);
  const setPolished = useCallback((on: boolean) => edit((p) => ({ ...p, mixer: { ...p.mixer, polish: on } })), [edit]);
  /** SongPanel's and FlipPad's slices of the project (they were those components' own useState — lost on unmount). A
   *  section, chain or take change is an undo step (MUSIC-SUITE P3 FIX PASS: the takes too), and so is the FLIP tab's. */
  // MUSIC-SUITE P4 FIX PASS (2026-09-25): the LAST take removed takes the TAKES strip's mute / solo with it (the same undo
  // step) — its strip is only drawn while there are takes, and a solo left on it silenced every row (decision #11)
  // MUSIC-SUITE P5 (2026-09-25), P3 deferred: A SECTION KEEPS ITS OWN CHOPS. A section snapshot kept its Flip rows' steps
  // but not their chops, so re-sending a pad changed how every older section sounded. A section saved (or retaken with
  // UPDATE FROM GRID) now keeps a copy of the chops its Flip rows play (StudioProject.stampSectionChops), and song mode
  // plays them (swapSectionChops, on the bar line).
  const songChange = useCallback((fn: (s: SongSlice) => SongSlice) =>
    edit((p) => {
      const next = { ...p, ...fn({ sections: p.sections, chain: p.chain, takes: p.takes }) };
      next.sections = stampSectionChops(p.sections, next.sections, p.flipRows);   // MUSIC-SUITE P5 (a fresh object: safe to set)
      return p.takes.length && !next.takes.length ? withChannel(next, TAKES_CHANNEL, { mute: false, solo: false }) : next;
    }), [edit]);
  /**
   * MUSIC-SUITE P3 FIX PASS: the FLIP tab's changes are undo steps (a new source replaced a mic take and 16 edited chops
   * for good), and a mic take that finished after another project opened goes to the project it was recorded in.
   */
  const flipChange = useCallback((fn: (f: ProjectFlip) => ProjectFlip, o: { group?: string; projectId?: string } = {}) => {
    if (o.projectId && !room.isOpen(o.projectId)) { void room.ops.amend(o.projectId, (p) => ({ ...p, flip: fn(p.flip) }), 'The mic take'); return; }
    edit((p) => ({ ...p, flip: fn(p.flip) }), o.group);
  }, [edit, room.isOpen, room.ops]);
  /** MUSIC-SUITE P3 FIX PASS: a finished take goes to the project it was recorded in (a remount or a switch since). */
  const takeRecorded = useCallback((take: ProjectTake, projectId: string) => {
    if (room.isOpen(projectId)) songChange((x) => ({ ...x, takes: [...x.takes, take] }));
    else void room.ops.amend(projectId, (p) => ({ ...p, takes: [...p.takes, take] }), 'The take');
  }, [songChange, room.isOpen, room.ops]);
  /** MUSIC-SUITE P3 FIX PASS: SongPanel's STOP TAKE, shown by the room while the panel is hidden on another tab. */
  const takeStopRef = useRef<(() => void) | null>(null);
  /** MUSIC-SUITE P3: song mode is the room's — the grid shows the section playing (read-only), the engine effect stands
   *  down, and the working grid is never written (SongPanel plays the sections). */
  const [songMode, setSongMode] = useState(false);
  const [songNow, setSongNow] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** MUSIC-SUITE P3: CELL's foundation, made when CELL is pressed and shown in the confirm; the yes lays exactly this. */
  const [cellPreview, setCellPreview] = useState<Record<string, boolean[]> | null>(null);
  const cellPreviewRef = useRef(cellPreview); cellPreviewRef.current = cellPreview;
  const [hearPreview, setHearPreview] = useState(false);
  /** What the dance floor last got from this room (the ✓ holds only while the song is unchanged). */
  const [dancedSig, setDancedSig] = useState<string | null>(null);
  /** A take or a Flip mic take is recording: MY PROJECTS waits (a take lands in the project it started in). */
  const [takeRec, setTakeRec] = useState(false);
  const [micRec, setMicRec] = useState(false);
  /** What the booth has open: only the mic ('mic'), or a take counting in / recording ('take') — for the room's chip. */
  const [takeWhat, setTakeWhat] = useState<'mic' | 'take'>('take');
  /**
   * MUSIC-SUITE P3 FIX PASS: why the open project can't be switched right now — ONE rule for MY PROJECTS and REMIX (REMIX
   * got past the hold: a take recording landed in the remix, and a PERFORM set's grid was swapped mid-set).
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): with only the booth's MIC armed (nothing recording) it says so — it said "Stop the
   * recording first" of a recording that did not exist (the booth reports phase 'armed' as on, what 'mic').
   */
  const boothOnlyMic = takeRec && takeWhat === 'mic' && !micRec;
  const switchLock = mode === 'perform' ? 'End the set to switch projects' : boothOnlyMic ? 'Close the mic first' : takeRec || micRec ? 'Stop the recording first' : null;

  // THE LADDER, FINALLY READ. MusicTiers has existed since 2026-09-13 with a header explaining that the room
  // "shipped M1-M4 all at once ... a player who opens it meets ALL of it — a full DAW on the first visit. That
  // is the actual problem this closes." Nothing imported it, so the problem was never closed: a first-time
  // player still met eight tracks, sections, a chain, takes, stems and a render on the opening screen.
  const [progress, setProgress] = useState<MusicProgress>(() => readProgress());
  const caps = tierDef(progress);
  /** MUSIC-SUITE P3: THE ONE RULE for rows — what the grid draws and the only rows the engine plays (MusicTiers). */
  const shownIds = useMemo(() => shownRowIds(caps), [caps.tracks]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shownIdsRef = useRef(shownIds); shownIdsRef.current = shownIds;

  /**
   * THE GRID'S GATE. Watching the state rather than a click handler, for two reasons found the hard way:
   * tying it to the PLAY press read a `tracks` the closure had already gone stale on, so the chain never
   * opened at all — and doing it inside the setTracks updater made the updater impure, which React's
   * StrictMode duly double-invoked and counted one click as two patterns.
   *
   * An effect on `tracks` is the honest place: it runs after the state is real, exactly once per change.
   * MUSIC-SUITE P3 (2026-09-25): and on `playing` — the ladder's words are "Play a pattern with at least one hit in it",
   * and a lit cell with the transport stopped opened the chain anyway. Now it takes a heard hit while the grid PLAYS
   * (MusicTiers.patternCounts: a hit only on a row the tier hides is not heard, so it does not count either).
   */
  useEffect(() => {
    if (progress.patternsMade > 0) return;   // the gate only has to open once
    // (CELL's preview playing is not the player's pattern being played: HEAR IT does not open the chain)
    if (patternCounts({ playing: playing && !hearPreview, tracks, def: caps })) noteProgress('pattern');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, playing, hearPreview, progress.patternsMade]);

  /** Fold an event in, remember it, and say what it opened. Monotonic — a tier reached is a tier kept. */
  const noteProgress = useCallback((e: 'pattern' | 'section' | 'chain') => {
    setProgress((prev) => {
      const before = tierFor(prev);
      const next = advanceProgress(prev, e);
      writeProgress(next);
      const after = tierFor(next);
      if (after !== before) say(`${tierDef(next).name} unlocked — ${tierDef(next).blurb}`);
      return next;
    });
  }, []);
  /** The kit the room is loading or has loaded — set at the call, so a revoke check never races the synth. */
  const kitRef = useRef<KitId>('street');
  /** MUSIC-SUITE P3 FIX PASS: the kit the engine PLAYS (the project's when owned, else STREET) — what the buttons light,
   *  what a publish records and what a set's stats name. */
  const [playingKit, setPlayingKit] = useState<KitId>('street');
  // MUSIC-SUITE P2 (2026-09-25): THE ROOM'S SHOP (purchases.ts shopReducer). Kits owned used to be this device's
  // localStorage alone ('fel_studio_kits_v1', read raw — a hand edit to '["street","neon","dust"]' unlocked both paid
  // kits, since kits are synthesised on the client). Now the account's list from GET /api/music/unlock replaces it at
  // mount and the key is only a cache (cleaned: only real kit ids, the free kit always in). A tap on a kit you don't
  // own, or on CELL, only ASKS; the one charge is confirmSpend, behind the confirm's yes.
  // MUSIC-SUITE P3 (2026-09-25): the cache is THIS player's (purchases.ts kitCacheKey) — one shared key showed the last
  // player's kits to the next on a shared device until the server read landed.
  const [shop, shopDispatch] = useReducer(shopReducer, undefined, () => initialShop(readKitCache(kitStorage(), playerId)));
  const shopRef = useRef(shop);
  useEffect(() => { shopRef.current = shop; }, [shop]);
  const spendingRef = useRef(false);   // one yes, one purchase: a second press before the re-render is ignored
  /** Why a remix opened on another kit than the track's own (shown under the remix banner while it lasts).
   *  MUSIC-SUITE P3 FIX PASS: keyed by the remix project's id — another remix project opened later showed it too. */
  const [remixNote, setRemixNote] = useState<{ id: string; line: string } | null>(null);
  const [title, setTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [openEmbed, setOpenEmbed] = useState<string | null>(null);   // trackId whose embed is expanded
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [tip, setTip] = useState(OKTA_TIPS[0]);
  const [libraryRev, setLibraryRev] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [judgement, setJudgement] = useState('');
  const [perfBar, setPerfBar] = useState(1);   // HOTFIX (2026-09-24): the set's bar, shown beside the score on an Arena set
  /** MUSIC-SUITE P2 FIX PASS: a calibration is saved but predates the fixed reader, so it is ignored — ask for a new one. */
  const [calStale, setCalStale] = useState(() => { try { return loadRoomCalibration().stale; } catch { return false; } });
  // the calibrate tab saving a new reading updates the link here (the offset itself is read when the next set begins)
  useEffect(() => {
    const onStorage = (): void => setCalStale(loadRoomCalibration().stale);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const flipTrigger = useRef<((pad: number, hit?: PadHit) => void) | null>(null);   // filled by FlipPad; hit by paired phones

  // ── MUSIC-SUITE P5 (2026-09-25), phone-mpc: THE PHONE'S ROOM IS THE ROOM'S ─────────────────────────────────────────
  // Owner decision #16 ("stays connected across tabs, transport, banks"). <HostLobby> was mounted inside the FLIP tab, and
  // its unmount disposes the HostSession (host-lobby.tsx :102-118): every tab switch closed the phone's data channel and
  // the next FLIP visit opened a new room with a new code. It is mounted beside the tabs now, from the first FLIP visit
  // (phonePad.phoneRoomOpen) until the Academy unmounts; the bank on the pads and ARM REC moved up here with it, so the
  // phone's BANK A–D and REC work on every tab and FLIP shows what the phone picked.
  const [phoneRoom, setPhoneRoom] = useState(false);
  useEffect(() => { setPhoneRoom((on) => phoneRoomOpen(on, view)); }, [view]);
  /** Phones connected now (the badge stays on screen on every tab while one is). */
  const [phones, setPhones] = useState(0);
  /** Each phone's recent round trips, ms (the lobby's rttMs — host.ts:149), for moving its taps back (phonePad.phoneTapSec). */
  const rttRef = useRef(new Map<PeerId, number[]>());
  /** The Flip bank on the pads (FlipPad's view, held here): per project for this browser tab, as FlipPad kept it. */
  const [flipBank, setFlipBankState] = useState(() => readBankView(project.id));
  const flipBankRef = useRef(flipBank); flipBankRef.current = flipBank;
  useEffect(() => { const b = readBankView(project.id); flipBankRef.current = b; setFlipBankState(b); }, [project.id]);
  const setFlipBank = useCallback((b: number): void => { flipBankRef.current = b; setFlipBankState(b); writeBankView(projectRef.current.id, b); }, []);
  /** ARM REC (FlipPad's, held here): a phone's REC arms it from any tab, and a phone hit on any tab records. */
  const [flipRecArm, setFlipRecArmState] = useState(false);
  const flipRecArmRef = useRef(flipRecArm); flipRecArmRef.current = flipRecArm;
  const setFlipRecArm = useCallback((on: boolean): void => { flipRecArmRef.current = on; setFlipRecArmState(on); }, []);
  /** MUSIC-SUITE P5: the steps the engine scheduled lately, with their audio-clock times (onStepScheduled). */
  const stepMarksRef = useRef<StepMark[]>([]);
  /**
   * MUSIC-SUITE P5 (2026-09-25): ARM REC's clock. FlipPad wrote a tap to quantizeTap(playhead) — the step that had already
   * SOUNDED (onStep fires after a step's time), so a tap 20 ms before a beat landed on the beat before it. It reads the
   * audio clock now: the time of the tap, minus the player's delay (the saved calibration, else the device's output delay,
   * plus the desk's — the same performLatencySec PERFORM judges with), against the steps actually scheduled.
   */
  const flipClock = useCallback((): StepClock | null => {
    const eng = engineRef.current;
    if (!eng || !eng.isRunning) return null;
    return {
      now: eng.context.currentTime,
      latencySec: performLatencySec({ savedOffsetMs: savedAudioOffsetMs(), outputLatency: eng.context.outputLatency, baseLatency: eng.context.baseLatency, graphLatencySec: eng.graphLatencySec }),
      marks: stepMarksRef.current, stepSec: stepDurSec(projectRef.current.bpm), startSec: eng.songStartSec,
    };
  }, []);
  /** MUSIC-SUITE P5: the grid's row ids — a Flip row whose chop was lost still holds its number (chopEdit.rowSlotFor). */
  const flipTrackIds = useMemo(() => new Set(tracks.map((t) => t.sampleId)), [tracks]);

  // ── MUSIC-SUITE P4 (2026-09-25), grid-ui: the pocket studio's own state ────────────────────────────────────────────
  /** The viewport's width: under 640 px the grid is the phone grid, pages of 8 (ui/gridMath gridLayout). */
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = (): void => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const layout = useMemo(() => gridLayout(vw, STEPS), [vw]);
  const [page, setPage] = useState(0);
  /** The key cursor (a row id and a step), shown from the first arrow key. */
  const [cursor, setCursor] = useState<{ row: string; step: number } | null>(null);
  /** The pitched row whose NoteRow is open. */
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** MUSIC-SUITE P4 FIX PASS: the key map's panel (scrolled into view when it opens), and a touch-only device (no '?'). */
  const helpRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (helpOpen) helpRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [helpOpen]);
  const [touchOnly] = useState(() => {
    try { return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
  });
  const [mixerOpen, setMixerOpen] = useState(false);
  const [transport, setTransportState] = useState<TransportPrefs>(readTransportPrefs);
  const setTransport = useCallback((next: TransportPrefs): void => { setTransportState(next); writeTransportPrefs(next); }, []);
  /** CHECK MY TIMING: listening (taps so far), or its result line. The run itself (clicks, taps, the timer) is in the ref. */
  const [check, setCheck] = useState<{ phase: 'listening'; taps: number } | { phase: 'done'; ok: boolean; line: string } | null>(null);
  const checkRef = useRef<{ clicks: number[]; taps: number[]; beat: number; timer: number | null } | null>(null);
  /** The saved calibration the rooms apply, shown as "your offset +75 ms". */
  const [savedCal, setSavedCal] = useState(readSavedCal);
  useEffect(() => {
    const on = (): void => setSavedCal(readSavedCal());   // another tab (the calibrate page) saved one
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  /** A library failure, kept on screen until dismissed or the next library success (P3: a 2.2 s toast said it). */
  const [libraryLine, setLibraryLine] = useState<string | null>(null);
  /** Where the transient line floats (ui/gridMath toastSpot): clear of the grid and the transport. */
  const [toastAt, setToastAt] = useState<'top' | 'bottom'>('bottom');
  const gridRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<HTMLDivElement>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const t = setInterval(() => setTip(OKTA_TIPS[Math.floor(Math.random() * OKTA_TIPS.length)]), 14000);
    return () => clearInterval(t);
  }, []);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setToastAt(toastSpotFor([gridRef.current, transportRef.current]));   // MUSIC-SUITE P4: clear of the grid + transport
    // MUSIC-SUITE P3 FIX PASS (2026-09-25): clear THIS line only — every say scheduled a blind clear, so an older line's
    // timer wiped a newer one early (a save-failure or "turn SONG MODE off" line vanished in ~200 ms; measured in the probe)
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2200);
  }, []);
  sayLater.current = say;   // MUSIC-SUITE P3: the project hook speaks through the room's toast
  // MUSIC-SUITE P4: the line moves as the page scrolls under it (it follows the free band, and never takes a tap)
  useEffect(() => {
    if (!toast) return;
    const on = (): void => setToastAt(toastSpotFor([gridRef.current, transportRef.current]));
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [toast]);

  // MUSIC-SUITE P3 (2026-09-25): the library's first-read work — moving pre-P3 songs' audio out of localStorage, repairing
  // the walk-out's copy, clearing audio a failed delete left — then a re-read, and any line it has for the player.
  useEffect(() => {
    let live = true;
    void StudioLibrary.ready().then((rep) => {
      if (!live) return;
      setLibraryRev((r) => r + 1);
      // MUSIC-SUITE P4 (P3's open item): the library's lines last — a moved library or a list that could not be read is
      // not a 2.2 s toast
      if (rep.lines.length) setLibraryLine(rep.lines.join(' · '));
    });
    return () => { live = false; };
  }, [say]);

  /** MUSIC-SUITE P2: put the set's tally on screen — a tap that has settled since the last look, else a MISS. */
  const showTally = useCallback((set: PerformSet, missed: number) => {
    if (set.lastTap !== shownTapRef.current) {
      shownTapRef.current = set.lastTap;
      setScore(set.score);
      setCombo(set.combo);
      setJudgement(performTapLabel(set.lastTap));
    } else if (missed) {
      setCombo(0);
      setJudgement('MISS');
    }
  }, []);

  useEffect(() => {
    const eng = new AudioEngine({ bpm, steps: STEPS, tracks, swing });
    engineRef.current = eng;
    eng.setAudible(shownIdsRef.current);   // MUSIC-SUITE P3: never a first bar with every row in it
    void (async () => {
      const buffers = await synthesizeKit('street');           // zero asset files
      for (const slot of KIT_SLOTS) {
        const b = buffers.get(slot.id);
        if (b) eng.loadBuffer(slot.id, slot.name, b, slot.category);
      }
      setReady(true);
    })();
    eng.onStep = (s) => setPlayhead(s);
    // MUSIC-SUITE P2 (2026-09-25): a note is offered the moment it is SCHEDULED (up to 100 ms before it sounds), not
    // once drainPlayhead has released it after it sounded (P1: 0.4–24.3 ms late, so a tap dead on a lone note found
    // nothing open and scored EARLY in 25 of 25 timer phases). The judge listens where the player does: the saved
    // calibration, else the device's output delay (performLatencySec). An empty grid offers no notes (performNoteAt).
    eng.onStepScheduled = (s, t, sound) => {
      // MUSIC-SUITE P5 (2026-09-25): the FLIP's ARM REC places a tap by these (chopEdit.recordStep — the nearest step on
      // the audio clock, swing included); the last three bars are plenty
      const marks = stepMarksRef.current;
      marks.push({ step: s, time: t });
      if (marks.length > 48) marks.splice(0, marks.length - 48);
      if (modeRef.current !== 'perform') return;
      const set = setRef.current;
      set.latencySec = performLatencySec({
        savedOffsetMs: savedOffsetRef.current, outputLatency: eng.context.outputLatency, baseLatency: eng.context.baseLatency,
        graphLatencySec: eng.graphLatencySec,   // MUSIC-SUITE P4 FIX PASS: the limiter's 6 ms (12 with MASTER) — neither path holds it
      });
      const now = eng.context.currentTime;
      const { missed } = performNoteAt(sound) ? set.note(s, t, now) : set.rest(s, t, now);
      showTally(set, missed);   // a MISS, or a waiting tap this note just settled
      setPerfBar(set.bar);
    };
    eng.onStepAudible = () => {
      if (modeRef.current !== 'perform') return;
      const set = setRef.current;
      const now = eng.context.currentTime;
      showTally(set, set.expire(now));
      if (set.over(now)) endSetRef.current();   // an Arena set's last bar is out and its last note's window has closed
    };
    return () => eng.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MUSIC-SUITE P3 (2026-09-25): WHAT PLAYS. One source at a time: CELL's preview while the player is hearing it, else the
  // song's sections in song mode (SongPanel hands them to the engine on each bar line — this effect stands down, so the
  // working grid is never written and song mode off plays it again), else the player's own grid.
  // MUSIC-SUITE P3 FIX PASS: the rule is studioEdit.playbackSource (pure, tested by behaviour).
  const previewing = useMemo(() => (hearPreview && cellPreview ? previewTracks(tracks, cellPreview) : null), [hearPreview, cellPreview, tracks]);
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const src = playbackSource({ preview: previewing, songMode, tracks, swing });
    if (src.tracks) eng.setState({ bpm, steps: STEPS, tracks: src.tracks, swing: src.swing });
  }, [bpm, tracks, swing, songMode, previewing]);
  // MUSIC-SUITE P3 FIX PASS: MASTER follows the project (a toggle, an undo, a project opened, a mastered remix)
  useEffect(() => { engineRef.current?.masterPolish(polished); }, [polished, ready]);
  // …and WHICH ROWS sound: exactly the rows the grid draws (MusicTiers.shownRowIds), whatever the source.
  useEffect(() => { engineRef.current?.setAudible(shownIds); }, [shownIds]);
  // MUSIC-SUITE P4 (2026-09-25): THE DESK follows the project (PHASE-4 ENGINE CONTRACT (5)) — a strip moved, an undo, a
  // project opened — live now and in every render after (the same graph builder: mixGraph.ts)
  // MUSIC-SUITE P4 FIX PASS (2026-09-25): …as it can SOUND — a solo on a strip that is not drawn (TAKES with no take left, a
  // row the tier hides) is dropped (mixGraph.scopeSolo): it silenced every row from where no S could turn it off.
  const liveStripIds = useMemo(() => {
    const own = visibleRows(tracks, caps);
    return [...own.kit, ...own.flip].map((t) => t.sampleId).concat(project.takes.length ? [TAKES_CHANNEL] : []);
  }, [tracks, caps.tracks, project.takes.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const deskHeard = useMemo(() => scopeSolo(mixerOf(project), liveStripIds), [project.mixer, liveStripIds]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engineRef.current?.setMixer(deskHeard); }, [deskHeard, ready]);
  // …and the METRONOME (contract (3)): a quarter-note click on the audio clock, the downbeat accented, never in a render.
  // MUSIC-SUITE P4 FIX PASS: never in a PERFORM set either (decision #13 — its clicks are tapped, and a tap that finds no
  // note is an EXTRA: a miss)
  useEffect(() => { engineRef.current?.setMetronome(transport.metronome && mode !== 'perform'); }, [transport.metronome, mode, ready]);

  // ── MUSIC-SUITE P2 (2026-09-25): THE SHOP ────────────────────────────────────────────────────────────────────────
  // P1 (outbox musicsuite/understand-wf_3a55346f-032.json): pickKit and cellAssist charged straight from the click
  // (StudioMode.tsx:231-251 then), startRemix bought the remixed track's kit through pickKit (:313-321), and every
  // failed spend — a 401, a 500 — read 'Not enough Shards'. Now a click ASKS (shopDispatch 'ask', the confirm below the
  // kits), confirmSpend is the only place a spend happens, the answer is typed and each failure has its own words.

  /** The seam, typed. No shop wired = nothing sold (this used to ALLOW every spend for free and log that it had). */
  const trySpend = useCallback(async (p: PendingSpend): Promise<ShardSpendResult> => {
    if (!spendShards) return SPEND_REFUSED;
    try {
      return await spendShards(p.cost, spendReason(p), p.kind === 'assist' ? { nonce: p.nonce } : undefined);
    } catch {
      return SPEND_UNREACHABLE;   // the loaders never throw; a host that does gets the same honest line
    }
  }, [spendShards]);

  /**
   * Put a kit on the engine. Never charges, and (MUSIC-SUITE P3 FIX PASS) never writes the project: the kit EFFECT below
   * decides what plays; only the player's pick (pickKit / a bought kit) changes the project's kit.
   */
  const playKit = useCallback(async (id: KitId): Promise<boolean> => {
    kitRef.current = id;
    const buffers = await synthesizeKit(id);
    if (kitRef.current !== id) return false;   // a later pick won the race to the synth
    engineRef.current?.swapKit(buffers);
    setPlayingKit(id);
    return true;
  }, []);
  /** The player's own pick of a kit the account owns: the project's kit changes (an undo step), and it plays. */
  const chooseKit = useCallback(async (id: KitId): Promise<void> => {
    edit((p) => (p.kit === id ? p : { ...p, kit: id }));
    if (await playKit(id)) say(`${KIT_META[id].label} kit loaded`);
  }, [edit, playKit, say]);

  /** MUSIC-SUITE P3 FIX PASS: the account's answer is in (or never coming) — only then is "isn't on your account" true. */
  const [ownedKnown, setOwnedKnown] = useState(!readOwnedKits);
  /**
   * Ask the account which kits it owns. A read sent before a purchase landed is dropped by the reducer (it would take
   * the new kit away), so it is sent again. A failed read keeps the cache.
   */
  const refreshOwned = useCallback((): void => {
    if (!readOwnedKits) return;
    const sentAt = shopRef.current.epoch;
    void readOwnedKits().then((read) => {
      if (shopRef.current.epoch !== sentAt) { refreshOwned(); return; }
      shopDispatch({ type: 'read', read, epoch: sentAt });
      setOwnedKnown(true);
    }, () => { setOwnedKnown(true); /* the cache stands */ });
  }, [readOwnedKits]);
  useEffect(() => { refreshOwned(); }, [refreshOwned]);

  // The cache follows the room's list: the server's once it answered, plus what was bought here since.
  useEffect(() => { writeKitCache(kitStorage(), shop.owned, playerId); }, [shop.owned, playerId]);
  // MUSIC-SUITE P3 FIX PASS: WHAT KIT PLAYS — the project's, if the account owns it, else the default; re-decided when the
  // owned list lands or changes (a refund, a purchase, the server's answer after an empty cache) and when a project opens
  // or an undo changes its kit. The project keeps its kit either way (it was rewritten to STREET for good), and the room
  // says once per project and kit why it plays another.
  const kitSaidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !room.restored) return;
    const want = shop.owned.includes(kit) ? kit : DEFAULT_KIT;
    if (want !== kitRef.current) void playKit(want);
    const key = `${project.id}:${kit}`;
    // said once the account has answered (a kit missing only from an empty per-player cache is not "not on your account")
    if (want !== kit && ownedKnown && kitSaidRef.current !== key) {
      kitSaidRef.current = key;
      say(`${KIT_META[kit].label} isn't on your account — this project plays on ${KIT_META[want].label} (it keeps ${KIT_META[kit].label} for when it is)`);
    }
  }, [ready, room.restored, kit, shop.owned, ownedKnown, project.id, playKit, say]);

  // ── MUSIC-SUITE P3 (2026-09-25): A PROJECT OPENED — its sounds into the engine ─────────────────────────────────────
  // The first restore (a reload, GameShell's REPLAY remount), MY PROJECTS' OPEN / NEW / DUPLICATE and a remix all bump
  // room.generation. The pattern, tempo and swing reach the engine through the setState effect above; what the engine
  // can't get from state is loaded here: the project's kit (if the account owns it), MASTER, and each Flip row's chop,
  // decoded from its source (a first-party /audio/ path, or the player's own bytes the project keeps). A row whose source
  // is gone says so; nothing is taken out of the project.
  /** Decoded Flip sources for the room's life, by sourceKey: FLIP remounts on every tab switch and must not re-fetch. */
  const sourceCache = useRef(new Map<string, Promise<DecodedSource>>());
  const loadFlipSource = useCallback((src: ProjectFlipSource): Promise<DecodedSource> => {
    const key = sourceKey(src);
    const hit = sourceCache.current.get(key);
    if (hit) return hit;
    const p = (async (): Promise<DecodedSource> => {
      const eng = engineRef.current;
      if (!eng) throw new Error('the studio is still starting');
      // MUSIC-SUITE P5 (2026-09-25): a FEL Flip pack item comes back gapless with FEL's cuts, a kit as its files joined one
      // per pad (flipPack.ts); null = not a pack source (or pack.json unreachable), decoded the plain way below
      if (!src.audio && src.url) { const packed = await decodeFlipPackSource(eng.context, src.url); if (packed) return packed; }
      let bytes: ArrayBuffer | null = null;
      if (src.audio) bytes = await room.loadAudio(src.audio);
      else if (src.url) { const r = await fetch(src.url); if (!r.ok) throw new Error(String(r.status)); bytes = await r.arrayBuffer(); }
      if (!bytes) throw new Error('its audio is not on this device');
      const buffer = await eng.context.decodeAudioData(bytes);
      return { buffer, mono: monoOf(buffer) };
    })();
    sourceCache.current.set(key, p);
    p.catch(() => { sourceCache.current.delete(key); });   // a failure can be tried again
    return p;
  }, [room.loadAudio]);

  /**
   * One Flip row's chop, decoded from its source and cut at the rate it was sliced at.
   * MUSIC-SUITE P5 (2026-09-25): BAKED — the pad's pitch, gate and reverse and the edge fades are in the buffer
   * (FlipPad.bakedBuffer, the same one the pad plays). It was the raw slice (chopBuffer), so a row never had the pad's
   * gate, and its pitch only as the steps' notes. Kept by bakeKey (chopCache) so song mode can swap a section's own
   * chops in on the bar line without waiting for a decode.
   */
  const chopCache = useRef(new Map<string, AudioBuffer>());
  const chopFor = useCallback(async (row: ProjectFlipRow): Promise<AudioBuffer> => {
    const key = bakeKey(row);
    const hit = chopCache.current.get(key);
    if (hit) return hit;
    const d = await loadFlipSource(row.source);
    const eng = engineRef.current;
    if (!eng) throw new Error('the studio is still starting');
    const b = bakedBuffer(eng.context, d, row);
    chopCache.current.set(key, b);
    return b;
  }, [loadFlipSource]);
  const sayGone = useCallback((gone: readonly string[]): void => {
    if (gone.length) say(`${gone.join(', ')}: the sound isn't on this device any more — the row is silent until you send a pad to ${gone.length === 1 ? 'it' : 'them'} again`);
  }, [say]);

  // MUSIC-SUITE P5 (2026-09-25), P3 deferred: "decoded Flip sources stay in memory for the room's life (large uploads)".
  // sourceCache only ever grew — every source ever opened, in every project, until the room closed. Now whatever the open
  // project no longer plays (a cleared bank, a replaced source, the last project's sources after another opens) is let go
  // (chopEdit.liveSourceKeys); an UNDO that brings one back decodes it again. The baked chops follow the same rule.
  useEffect(() => {
    pruneMap(sourceCache.current, liveSourceKeys(project));
    const rows = [...project.flipRows, ...project.sections.flatMap((s) => s.chops ?? [])];
    pruneMap(chopCache.current, new Set(rows.map(bakeKey)));
    // song mode: every section's own chops ready before its bar line comes (a decode can't wait for the bar)
    if (ready && room.restored) for (const r of rows) if (!chopCache.current.has(bakeKey(r))) void chopFor(r).catch(() => undefined);
  }, [project.flip, project.flipRows, project.sections, ready, room.restored, chopFor]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { sourceCache.current.clear(); chopCache.current.clear(); }, []);

  /**
   * MUSIC-SUITE P5: SONG MODE PLAYS A SECTION'S OWN CHOPS. SongPanel tells the room which section a bar plays (onSongNow,
   * from engine.onBar — before that bar's steps are scheduled); the section's Flip rows get the chops it was saved with
   * (StudioProject.sectionChopsFor; the grid's chops when it has none, and when song mode ends). Loaded only when they
   * change.
   * MUSIC-SUITE P5 FIX PASS (2026-09-25): a chop not baked yet was SKIPPED and retried only on the next bar line — which
   * song mode off never has — so (a) a section chop that could not be decoded (a mic take swept from the store) left the
   * row playing the GRID's chop, with no line; (b) after song mode ended, a grid row whose chop had failed kept the last
   * SECTION's chop instead of going silent; (c) an undo, a SEND or a recorded hit during song mode loaded the WORKING
   * chops over the playing section's until the next bar. Now a missing chop is baked and the swap runs again the moment
   * it is ready (no bar line needed); one that can't be had leaves its row SILENT and says so once (swapFailed); and the
   * working-chop loads re-apply the playing section's own (resyncSection). `p` = the project to read (an undo's target).
   */
  const swapSig = useRef('');
  /** MUSIC-SUITE P5 FIX PASS: the section song mode is playing (null = the grid), and the chops that could not be had. */
  const swapNow = useRef<string | null>(null);
  const swapFailed = useRef(new Set<string>());
  const swapRef = useRef<(id: string | null, p?: Pick<StudioProject, 'sections' | 'flipRows'>) => void>(() => undefined);
  const swapSectionChops = useCallback((sectionId: string | null, p: Pick<StudioProject, 'sections' | 'flipRows'> = projectRef.current): void => {
    const eng = engineRef.current;
    if (!eng) return;
    swapNow.current = sectionId;
    const want = sectionChopsFor(sectionId ? p.sections.find((s) => s.id === sectionId) ?? null : null, p.flipRows);
    const sig = JSON.stringify([sectionId, want.map(bakeKey)]);
    if (sig === swapSig.current) return;
    const plan = planChopSwap(want, (k) => chopCache.current.get(k), swapFailed.current);
    for (const { row, buffer } of plan.load) eng.loadBuffer(row.sampleId, row.label, buffer, 'melody');
    for (const id of plan.silence) eng.unloadSample(id);   // a chop that can't be had: silent, never another chop
    for (const r of plan.pending) {
      const key = bakeKey(r);
      void chopFor(r).then(
        () => { if (swapNow.current === sectionId) { swapSig.current = ''; swapRef.current(sectionId); } },
        () => {
          const first = !swapFailed.current.has(key);
          swapFailed.current.add(key);
          if (swapNow.current !== sectionId) return;
          eng.unloadSample(r.sampleId);
          if (first) sayGone([r.label]);
        },
      );
    }
    swapSig.current = plan.done ? sig : '';
  }, [chopFor, sayGone]);
  swapRef.current = swapSectionChops;
  /**
   * MUSIC-SUITE P5 FIX PASS: the engine was just given WORKING chops (an undo, a SEND, a recorded hit); while song mode
   * plays a section, its own chops go back at once — read from `p`, the project as the edit leaves it.
   */
  const resyncSection = useCallback((p: Pick<StudioProject, 'sections' | 'flipRows'>): void => {
    swapSig.current = '';
    if (swapNow.current !== null) swapRef.current(swapNow.current, p);
  }, []);
  const songNowChanged = useCallback((id: string | null): void => { setSongNow(id); swapSectionChops(id); }, [swapSectionChops]);
  /**
   * MUSIC-SUITE P5 FIX PASS (2026-09-25): RENDER SONG and STEMS — what each bar's Flip rows play: its section's own chops
   * (else the grid's), every one baked first (studioEdit.songBarSounds). The renders read the engine's sounds, i.e. the
   * last section song mode swapped in, for every bar.
   */
  const songRenderSounds = useCallback(async (bars: number): Promise<RenderSounds[]> => {
    const p = projectRef.current;
    await Promise.allSettled(songChops(p.flipRows, p.sections, bakeKey).map((r) => chopFor(r)));
    return songBarSounds(p.chain, p.sections, p.flipRows, bars, (r) => chopCache.current.get(bakeKey(r)) ?? null);
  }, [chopFor]);
  // MUSIC-SUITE P5: the dev/probe hook (scripts/probes/_music-p5-flip-editor.mts)
  useEffect(() => {
    window.__FEL_FLIP_ROOM__ = {
      clock: flipClock, sources: () => [...sourceCache.current.keys()], chops: () => chopCache.current.size,
      loaded: (id) => engineRef.current?.hasSample(id) ?? false,
      peek: async (key, at, n) => { const d = await sourceCache.current.get(key)?.catch(() => null); return d ? Array.from(d.mono.slice(Math.max(0, at - n), at + n)) : null; },
    };
    return () => { delete window.__FEL_FLIP_ROOM__; };
  }, [flipClock]);

  /**
   * A live pad hit written into the grid (FlipPad's ARM REC, and a phone hit on any tab). MUSIC-SUITE P5 (phone-mpc): this
   * was FlipPad's inline onRecordHit; it is the room's now so a phone hit on the STUDIO tab records by the same rule, and
   * a MEASURED velocity (a paired phone's) is written into the step (StudioProject.withTrackStep — the grid plays a step at
   * volume × vel). A hit with no velocity leaves the step's velocity as it was (a screen tap never had one).
   */
  const recordFlipHit = useCallback((pad: number, step: number, chop: { buffer: AudioBuffer; row: ProjectFlipRow }, velocity?: number | null): void => {
    // MUSIC-SUITE P3 FIX PASS: a row that holds ANOTHER chop (sent from an earlier source, or one that failed to
    // load after a reload) takes the pad's chop on the first recorded hit — what the taps sound like is what the
    // row plays. One undo step with the burst.
    // MUSIC-SUITE P5: pitch and gate are baked into the chop — a retuned pad is another chop (MUSIC-SUITE P5 FIX PASS:
    // chopSignature carries both now)
    const differs = (p: StudioProject): boolean => {
      const r = p.flipRows.find((x) => x.sampleId === chop.row.sampleId);
      return !r || chopSignature(r) !== chopSignature(chop.row);
    };
    const had = projectRef.current.flipRows.some((r) => r.sampleId === chop.row.sampleId);
    if (differs(projectRef.current)) {
      engineRef.current?.loadBuffer(chop.row.sampleId, chop.row.label, chop.buffer, 'melody');
      chopCache.current.set(bakeKey(chop.row), chop.buffer);
      resyncSection(withFlipRow(projectRef.current, chop.row));   // MUSIC-SUITE P5 FIX PASS: a playing section keeps its own
      if (had) say(`${chop.row.label} now plays pad ${pad + 1}'s chop (it replaced the row's old one — UNDO puts it back)`);
    }
    edit((p) => withFlipHit(differs(p) ? withFlipRow(p, chop.row) : p, chop.row.sampleId, step), 'flip-rec');
    // …and the phone's measured velocity on that step (the same 'flip-rec' undo step as the hit)
    if (typeof velocity === 'number' && Number.isFinite(velocity)) edit((p) => ({ ...p, tracks: withTrackStep(p.tracks, chop.row.sampleId, step, { vel: velocity }, p.key) }), 'flip-rec');
  }, [edit, say, resyncSection]);

  // ── MUSIC-SUITE P5 (2026-09-25), phone-mpc: a phone hit on a tab where FlipPad is not mounted ─────────────────────
  // The room plays the bank's pad itself: the same baked chop FlipPad plays (padRowFor → chopFor → FlipPad.bakedBuffer),
  // through the strip of the row it goes to, at the phone's velocity; with ARM REC on and the transport running it lands
  // on the step tapStep picks (the same rule as FLIP's ARM REC) at the tap's own time. A chop still decoding when the hit
  // comes (the first hit after a reload) is NOT played late: a pad that sounds 300 ms after the finger is worse than one
  // that says it is loading — the bank's pads are baked ahead while a phone is connected (below) so this is rare.
  const phoneSaid = useRef({ full: false, loading: false, tick: false });
  const playPhonePad = (pad: number, hit: PadHit): 'played' | 'loading' | 'empty' => {
    const eng = engineRef.current;
    if (!eng) return 'empty';
    const p = projectRef.current;
    const bk = flipBankRef.current;
    const b = bankOf(p.flip, bk);
    if (!b.source || !b.chops[pad]?.slice) return 'empty';
    const slot = rowSlotFor(p.flipRows, p.tracks.map((t) => t.sampleId), bk, pad);
    const row = padRowFor(b, bk, pad, slot, null);                  // null when all 16 rows are taken: it still plays
    const spec = row ?? padRowFor(b, bk, pad, { slot: pad }, null);
    if (!spec) return 'empty';
    const go = (buffer: AudioBuffer): void => {
      const ctx = eng.context;
      if (ctx.state === 'suspended') void ctx.resume();
      const node = ctx.createBufferSource(); node.buffer = buffer;
      const g = ctx.createGain(); g.gain.value = padGain(hit.velocity);
      node.connect(g).connect(eng.channelInput(flipSampleId(slot?.slot ?? pad))); node.start();
      if (!flipRecArmRef.current || !eng.isRunning) return;
      // MUSIC-SUITE P5 FIX PASS (decision #15): an upload from before the tick is not recorded until it is ticked (FLIP tab)
      if (uploadNeedsTick(b.source)) { if (!phoneSaid.current.tick) { phoneSaid.current.tick = true; say(`Tick "I made this or I own the rights" for ${b.source?.label} on the FLIP tab to record it`); } return; }
      const step = tapStep(flipClock(), STEPS, readQuantize(), playhead, hit.atSec);
      if (!row) { if (!phoneSaid.current.full) { phoneSaid.current.full = true; say('All 16 Flip rows are taken — this pad has no row to record into (clear a row in STUDIO first)'); } return; }
      if (step !== null) recordFlipHit(pad, step, { buffer, row }, hit.velocity ?? null);
    };
    const cached = chopCache.current.get(bakeKey(spec));
    if (cached) { go(cached); return 'played'; }
    // not baked yet: a decoded source bakes in a microtask (played at once); a source still decoding may miss the hit
    const t0 = eng.context.currentTime;
    void chopFor(spec).then(
      (buffer) => {
        if (eng.context.currentTime - t0 <= PHONE_LATE_S) { go(buffer); return; }
        if (!phoneSaid.current.loading) { phoneSaid.current.loading = true; say(`Phone: bank ${PHONE_BANKS[bk]} was still loading — that hit came too late to play`); }
      },
      () => undefined,
    );
    return 'loading';
  };
  // while a phone is connected, the bank on its pads is baked ahead (a hit then never waits for a decode) — again after
  // every change that lets the room's chop cache go (the prune above runs on the same changes, before this)
  useEffect(() => {
    if (!phones || !ready || !room.restored) return;
    const b = bankOf(project.flip, flipBank);
    if (!b.source) return;
    b.chops.forEach((_c, i) => { const r = padRowFor(b, flipBank, i, { slot: i }, null); if (r && !chopCache.current.has(bakeKey(r))) void chopFor(r).catch(() => undefined); });
  }, [phones, flipBank, project.flip, project.flipRows, project.sections, ready, room.restored, chopFor]);

  // MUSIC-SUITE P3 FIX PASS: a project opened — the engine forgets every Flip sound first (flipRowSounds.openFlipRowSounds),
  // so a row whose chop can't be had plays nothing instead of the last project's chop. The kit and MASTER follow their
  // own effects.
  useEffect(() => {
    if (!ready || !room.restored) return;
    const eng = engineRef.current;
    if (!eng) return;
    let alive = true;
    swapSig.current = '';   // MUSIC-SUITE P5: the engine's Flip sounds are the new project's now
    swapNow.current = null; swapFailed.current.clear();   // MUSIC-SUITE P5 FIX PASS: song mode is off in a newly opened project
    void openFlipRowSounds(eng, projectRef.current.flipRows, chopFor, () => alive).then((gone) => { if (alive) sayGone(gone); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, room.restored, room.generation]);

  // MUSIC-SUITE P3: another project is open — its own undo history, song mode off, nothing half-asked about
  useEffect(() => {
    historyRef.current.clear();
    setHistDepth(historyRef.current.depth);
    setSongMode(false);
    setSongNow(null);
    setConfirmClear(false);
  }, [room.generation]);

  /** A kit you own loads; one you don't opens the confirm. Nothing is charged here. */
  const pickKit = (id: KitId): void => {
    if (shop.owned.includes(id)) { void chooseKit(id); return; }
    shopDispatch({ type: 'ask', spend: kitSpend(id) });
  };

  /**
   * CELL opens the confirm (a fresh nonce per ask: each foundation bought is its own purchase). Nothing is charged here.
   * MUSIC-SUITE P3 (2026-09-25): and it makes the foundation NOW, for the rows the player can see — the confirm shows it
   * and HEAR IT plays it, so the player knows what 50 Shards buys; the yes lays exactly this (it rolled a fresh one after
   * the charge, for all eight rows, on a grid that drew four).
   */
  const cellAssist = (): void => {
    setCellPreview(foundationPreview(cellFoundation(Date.now()), shownIds));
    setHearPreview(false);
    shopDispatch({ type: 'ask', spend: assistSpend() });
  };
  // the preview lives only while its confirm is open (a kit ask, CANCEL or a bought foundation closes it)
  useEffect(() => {
    if (shop.pending?.kind === 'assist') return;
    setCellPreview(null);
    setHearPreview(false);
  }, [shop.pending]);

  /** Lay the previewed foundation (an undo step). */
  const layFoundation = (preview: Record<string, boolean[]> | null): void => {
    const rows = preview ?? foundationPreview(cellFoundation(Date.now()), shownIds);
    edit((p) => ({ ...p, tracks: applyFoundation(p.tracks, rows) }));
    say('Cell laid the foundation you heard — make it yours (UNDO takes it back)');
  };

  /** HEAR IT: the transport plays CELL's preview (song mode steps aside); nothing is charged. */
  const toggleHearPreview = (): void => {
    if (!hearPreview) {
      if (songMode) setSongMode(false);
      if (!playing) playOrStop(false);   // MUSIC-SUITE P4: a preview starts at once, never after a count-in
    }
    setHearPreview((h) => !h);
  };

  /**
   * THE ONE CHARGE: the confirm's yes. A failure keeps the confirm open with its reason (and the assist's nonce, so a
   * second yes after "couldn't reach the shop" is the same purchase to the server — a replay if the first landed). A
   * kit's key is permanent, so after a lost answer the account is asked again: if the charge did land, the kit shows up.
   */
  const confirmSpend = async (): Promise<void> => {
    const p = shop.pending;
    if (!p || shop.busy || spendingRef.current) return;
    spendingRef.current = true;
    const preview = cellPreviewRef.current;   // MUSIC-SUITE P3: the foundation the player was shown is the one bought
    shopDispatch({ type: 'confirm' });
    try {
      const result = await trySpend(p);
      shopDispatch({ type: 'spent', spend: p, result });
      if (!result.ok) {
        if (result.reason === 'unreachable' && p.kind === 'kit') refreshOwned();
        return;
      }
      if (p.kind === 'kit') await chooseKit(p.kit);
      else layFoundation(preview);
    } finally {
      spendingRef.current = false;
    }
  };

  // MUSIC-SUITE P3: what the grid SHOWS — CELL's preview while it is being heard, the song's section in song mode (both
  // read-only), else the player's own grid. The engine plays the same source (the effect above).
  const songSection = songMode ? shownSection(project.chain, project.sections, songNow) : null;
  const gridTracks = previewing ?? songSection?.tracks ?? tracks;
  const gridLock: 'preview' | 'song' | null = previewing ? 'preview' : songSection ? 'song' : null;
  // MUSIC-SUITE P4: the rows the grid draws — kit then Flip, P3's one rule (MusicTiers.visibleRows) — for the grid, the
  // key cursor and the mixer's strips alike
  const rows = visibleRows(gridTracks, caps);
  const drawn = [...rows.kit, ...rows.flip];
  const flipName = (id: string): string => {
    const r = project.flipRows.find((x) => x.sampleId === id);
    return r ? `${r.label} · ${r.source.label}` : `FLIP ${Number(id.slice(5)) + 1}`;
  };
  const rowName = (id: string): string => KIT_SLOTS.find((k) => k.id === id)?.name ?? flipName(id);
  /** A row as the grid draws it: its notes' names (pitched rows) and whether the desk keeps it silent (M / S). */
  const gridRow = (t: TrackState): StepGridRow => {
    const pitched = isPitchedRow(t.sampleId);
    const c = channelMix(deskHeard, t.sampleId);   // MUSIC-SUITE P4 FIX PASS: the desk as it sounds (scopeSolo)
    return {
      id: t.sampleId, label: rowName(t.sampleId), track: t, pitched,
      notes: pitched ? t.pattern.map((_, i) => cellNoteLabel(t, i, project.key)) : undefined,
      silent: c.mute ? 'mute' : anySolo(deskHeard) && !c.solo ? 'solo' : null,
    };
  };
  /** MUSIC-SUITE P4: the booth starts / stops the room's transport (RECORD from a stop: the engine has counted in already). */
  const boothTransport = (play: boolean): void => {
    const eng = engineRef.current;
    if (!eng) return;
    if (play) { if (!eng.isRunning) eng.start(); setPlaying(true); }
    else { eng.stop(); setPlaying(false); setPlayhead(-1); }
  };

  /** A cell, by row id (the grid draws a filtered list, so its index is not the project's). An undo step. */
  const toggleCell = (sampleId: string, si: number): void => {
    if (gridLock === 'song') { say(`SONG MODE is playing "${songSection?.name ?? 'the song'}" — turn it off to edit your own grid`); return; }
    if (gridLock === 'preview') { say("That's CELL's preview — BUY it or CANCEL to edit your grid"); return; }
    edit((p) => ({ ...p, tracks: toggleStep(p.tracks, sampleId, si) }));
  };

  // ── MUSIC-SUITE P4 (2026-09-25), grid-ui: the pocket studio's edits ──────────────────────────────────────────────
  /** Why the grid can't be edited right now (song mode's section, CELL's preview) — said on a press, as toggleCell does. */
  const lockLine = (): string => (gridLock === 'song'
    ? `SONG MODE is playing "${songSection?.name ?? 'the song'}" — turn it off to edit your own grid`
    : "That's CELL's preview — BUY it or CANCEL to edit your grid");
  /**
   * DRAG-TO-PAINT (ui/StepGrid → ui/gridMath): the stroke's cells take its one value — an off cell pressed paints ON, an
   * on cell paints OFF. Each cell goes through StudioProject.withTrackStep (a pitched row keeps its step's note). The whole
   * stroke is ONE undo step (grouped by its number).
   */
  const paintCells = (cells: readonly { row: string; step: number }[], value: boolean, stroke: number): void => {
    if (gridLock) { say(lockLine()); return; }
    edit((p) => ({ ...p, tracks: cells.reduce((t, c) => withTrackStep(t, c.row, c.step, { on: value }, p.key), p.tracks) }), `paint:${stroke}`);
  };
  /** A NoteRow tap (ui/noteMath pickNote): the step lights on that note, or goes off if it already plays it. Locked to the key. */
  const pickStepNote = (rowId: string, step: number, midi: number): void => {
    if (gridLock) { say(lockLine()); return; }
    edit((p) => {
      const t = p.tracks.find((x) => x.sampleId === rowId);
      return t ? { ...p, tracks: withTrackStep(p.tracks, rowId, step, pickNote(t, step, midi, p.key), p.key) } : p;
    });
  };
  /** THE KEY: every note row's notes move with it (StudioProject.setProjectKey); one undo step (the key is in the slice). */
  const changeKey = (k: SongKey): void => {
    if (k.root === project.key.root && k.scale === project.key.scale) return;
    edit((p) => setProjectKey(p, k), 'key');
    say(`Key: ${keyLabel(k)} — your bass and lead notes moved with it (UNDO puts them back)`);
  };
  /** THE DESK (THE STUDIO tier): a strip or the master moved — a project edit (one undo step per slider drag, autosaved). */
  const stripChange = (id: string, patch: Partial<ChannelMix>, group?: string): void => { edit((p) => withChannel(p, id, patch), group); };
  const masterChange = (level: number, group?: string): void => { edit((p) => withMaster(p, level), group); };

  /**
   * UNDO / REDO: put back what an edit replaced (an other chop reloads its sound). MUSIC-SUITE P3 FIX PASS: rows it
   * removed go silent, the reload is dropped if another project opens meanwhile (genRef), the kit and MASTER follow their
   * effects, and under song mode the line says the change was to the hidden grid.
   */
  const stepHistory = (dir: 'undo' | 'redo'): void => {
    const cur = undoSlice(projectRef.current);
    const to = dir === 'undo' ? historyRef.current.undo(cur) : historyRef.current.redo(cur);
    setHistDepth(historyRef.current.depth);
    if (!to) { say(dir === 'undo' ? 'Nothing to undo' : 'Nothing to redo'); return; }
    update((p) => ({ ...p, ...to }));
    const eng = engineRef.current;
    const gen = genRef.current;
    // MUSIC-SUITE P5 FIX PASS: …and then, under song mode, the playing section's own chops go back over the working ones
    if (eng) void reloadFlipRowSounds(eng, cur.flipRows, to.flipRows, chopFor, () => genRef.current === gen).then((gone) => {
      if (genRef.current !== gen) return;
      sayGone(gone);
      resyncSection({ sections: to.sections, flipRows: to.flipRows });
    });
    // (MUSIC-SUITE P5 FIX PASS: a row whose pitch or gate the step moved reloads through the same call — studioEdit
    // chopSignature carries both now; P5 had a second pass here, chopEdit.retunedRows)
    resyncSection({ sections: to.sections, flipRows: to.flipRows });
    const done = dir === 'undo' ? 'Undone' : 'Redone';
    say(gridLock === 'song' ? `${done} (your own grid, hidden under SONG MODE)` : done);
  };
  // MUSIC-SUITE P4 (2026-09-25): THE KEY MAP (ui/keys.ts, one pure table — P3's ⌘Z / Ctrl+Z / ⇧⌘Z / Ctrl+Y are in it, plus
  // Space, the arrows, Enter, ⌥↑↓, B (the booth), ? and Esc). It never answers on the FLIP tab (the pad keys, Flip.ts:22), never
  // takes PERFORM's Space / J (P2's handler below), and nothing while typing in a field. A taken Space also cancels its
  // keyup, so a focused button (STOP) is not pressed by it a second time (P2's rule). `keyActRef` does the action.
  const keyActRef = useRef<(a: StudioKeyAction) => boolean>(() => false);
  // MUSIC-SUITE P4 FIX PASS (2026-09-25): THE ROOM IS ON SCREEN — the keys (this map and PERFORM's Space / J below) listen
  // only once the splash has let the player in; before that the splash's own buttons have their keys. And SUSPENDED: set
  // when a set is handed to the shell's end card (endSet), which covers the still-mounted room until REPLAY remounts it;
  // cleared by a press inside the room (a host with no card over it — /dev/music — is back at the first touch).
  const roomShown = started && ready && room.restored;
  const keysSuspended = useRef(false);
  useEffect(() => {
    if (!roomShown) return;
    const ctx = (e: KeyboardEvent) => ({ view, mode, target: keyTargetOf(e.target as HTMLElement | null), checking: !!checkRef.current });
    const onKey = (e: KeyboardEvent): void => {
      if (keysSuspended.current) return;
      const a = studioKeyAction(e, ctx(e));
      if (a && keyActRef.current(a)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent): void => {
      if (keysSuspended.current) return;
      if (cancelsKeyUp(e, studioKeyAction({ key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey }, ctx(e)))) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, [view, mode, roomShown]);

  /** CLEAR (asked first): every step off, every row kept. An undo step. */
  const clearNow = (): void => {
    setConfirmClear(false);
    edit((p) => ({ ...p, tracks: clearGrid(p.tracks) }));
    say('Grid cleared — UNDO brings it back');
  };

  // MUSIC-SUITE P3: SEND TO THE DANCE FLOOR at the tier the ladder names (the GRID): the chain once there is one, else the
  // grid itself looped — only the rows the room draws and plays (DanceExport.danceSongAtTier).
  // MUSIC-SUITE P4 FIX PASS (2026-09-25): …and only rows the DESK lets through (a muted or soloed-out row is not in the
  // render, so it is not charted either — the dance floor charted rows the published audio left out)
  const danceSong = useMemo(() => danceSongAtTier({
    danceExport: caps.danceExport, arrangement: caps.arrangement, chain: project.chain, sections: project.sections, grid: tracks,
    heard: (t) => shownIds.has(t.sampleId) && gateOpen(deskHeard, t.sampleId),
  }), [caps.danceExport, caps.arrangement, project.chain, project.sections, tracks, shownIds, deskHeard]);
  const danceSig = JSON.stringify([project.id, project.title, bpm, danceSong, project.key]);
  // MUSIC-SUITE P5 (2026-09-25), owner decision #15: a song that plays a YOUR FILE upload stays on this device; the line
  // says why. Before, the P3 mark (ProjectFlipSource.upload) was carried everywhere and read nowhere (uploadPrivacy.ts).
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): "on this device" = never shared off it. P5 closed PUBLISH and SEND TO THE DANCE
  // FLOOR for any project with an upload ANYWHERE (an idle bank D, a saved kit) — both stay on the device (the library's
  // server calls are unimplemented seams; the dance export is an audio-free chart), so decision #7 went for nothing. The
  // doors are uploadPrivacy.UPLOAD_DOORS (one switch back to the stricter reading); the rule counts what the SONG plays.
  const privacy = useMemo(() => projectUploadPrivacy(project), [project]);
  const danceOpen = uploadDoorOpen('danceFloor', privacy);
  const libraryOpen = uploadDoorOpen('library', privacy);
  const sendToDance = (): void => {
    if (!danceSong) return;
    if (!danceOpen) { setLibraryLine(privacy.line); return; }
    // MUSIC-SUITE P4: the song's key rides on the dance floor's card ('Your song · Am · 64 hits')
    // MUSIC-SUITE P4 FIX PASS: the key in words ('A minor') — the Cypher's chip upper-cases the blurb ('Am' read 'AM')
    const out = exportSongToDance({ id: project.id, name: project.title, bpm, steps: STEPS, ...danceSong, key: keyCardText(project.key) });
    if (!out) { say('nothing to dance to yet — put a hit in the grid first'); return; }
    // MUSIC-SUITE P3 FIX PASS: the write can fail (a full localStorage, private mode) — then it was NOT sent, and says so
    if (!saveExportedTrack(out)) { say("Not sent — this browser wouldn't keep the dance export (storage full or private mode). Free some space and send it again."); return; }
    setDancedSig(danceSig);
    say(`"${out.track.name}" sent to the dance floor · ${out.summary.hits} hits · ${out.track.bars} bars${danceSong.from === 'grid' ? ' (your grid, looped)' : ''} · ${'●'.repeat(out.track.difficulty)}`);
  };

  const togglePlay = (): void => { playOrStop(true); };
  /**
   * PLAY / STOP. MUSIC-SUITE P4: with COUNT-IN on, PLAY counts the bars in on the audio clock first (engine.countIn — the
   * count's own click, its downbeats accented) and the song starts on bar 0; `countIn` false starts at once (HEAR IT). A
   * running timing check is called off by either.
   * MUSIC-SUITE P5 (phone-mpc): `want` = a paired phone's PLAY or STOP, decided on the ENGINE's state (phonePad
   * transportEffect) — two phone presses can land before a render, when `playing` here still says what it was.
   */
  const playOrStop = (countIn: boolean, want?: 'start' | 'stop'): void => {
    const eng = engineRef.current;
    if (!eng) return;
    if (checkRef.current) finishCheckRef.current(true);
    if (want ? want === 'stop' : playing) { eng.stop(); setPlaying(false); setPlayhead(-1); }
    else {
      // MUSIC-SUITE P4 FIX PASS (2026-09-25), decision #13: a PERFORM set starts on the press, never after the studio's
      // COUNT-IN (its clicks were tapped and scored as EXTRAs)
      if (countIn && transport.countIn > 0 && mode !== 'perform' && modeRef.current !== 'perform') eng.countIn(transport.countIn); else eng.start();
      setPlaying(true);
    }
  };

  // ── MUSIC-SUITE P4 (2026-09-25): CHECK MY TIMING (ui/timingCheck) ─────────────────────────────────────────────────
  // P2 promised "an 8-tap check in the count-in" and moved it here (the Academy had no count-in). The engine counts in 2
  // bars at the calibration tempo (80 BPM — ui/timingCheck says why), the player taps the 8 clicks, the transport stops
  // before bar 0 (nothing of the song plays), and the reading is saved DATED where PERFORM and the Cypher read it.
  // MUSIC-SUITE P4 FIX PASS (2026-09-25): a LEAD-IN bar first (CHECK_COUNT_BARS = 3; the last 8 clicks are read — the
  // first click came 50 ms after the press, so tap 1 was a reaction, and a phone's TAP appeared only after the press), and
  // the clicks are read as they leave the desk (heardClicks + engine.graphLatencySec): the saved offset is the device's
  // alone, as /play/calibrate saves it. The review's "the window closes 200 ms into bar 0" does not hold: it closes at the
  // last click + beat − 200 ms (checkWindow), 200 ms BEFORE bar 0, and stop() takes back every hit not yet begun.
  const finishCheckRef = useRef<(cancelled?: boolean) => void>(() => undefined);
  const bpmRef = useRef(bpm); bpmRef.current = bpm;
  const finishCheck = (cancelled = false): void => {
    const run = checkRef.current;
    if (!run) return;
    checkRef.current = null;
    if (run.timer !== null) window.clearTimeout(run.timer);
    const eng = engineRef.current;
    if (eng) { eng.stop(); eng.setBpm(bpmRef.current); }   // the count-in ran at the check's tempo; the song's comes back
    if (cancelled) { setCheck(null); say('Timing check called off — nothing was saved'); return; }
    const r = readTimingCheck(run.clicks, run.taps, run.beat);
    if (r.ok) {
      saveAudioOffsetMs(r.offsetMs, Date.now());
      setSavedCal(readSavedCal());
      setCalStale(false);
    }
    setCheck({ phase: 'done', ok: r.ok, line: checkLine(r) });
  };
  finishCheckRef.current = finishCheck;
  const startCheck = (): void => {
    const eng = engineRef.current;
    if (!eng || checkRef.current) return;
    if (mode === 'perform') { say('End the set first — the timing check runs on the studio floor'); return; }
    if (takeRec) { say(`${boothOnlyMic ? 'Close the mic first' : 'Stop the recording first'} — the timing check stops the transport`); return; }
    if (playing) { eng.stop(); setPlaying(false); setPlayhead(-1); }
    eng.setBpm(CHECK_BPM);
    // the count-in fires the bar-0 hook as it starts; song mode's (SongPanel) would put the section's tempo back before the
    // clicks are placed, so the hook is held off for the check (nothing of the song plays: it stops before bar 0)
    const onBar = eng.onBar;
    eng.onBar = null;
    const all = eng.countIn(CHECK_COUNT_BARS).clicks.map((c) => c.at);
    eng.onBar = onBar;
    // the lead-in bar is heard, never read; the read clicks are taken as they leave the desk (its limiter's look-ahead)
    const clicks = heardClicks(checkClicks(all), eng.graphLatencySec);
    const beat = clicks.length > 1 ? clicks[1] - clicks[0] : 0;
    const w = checkWindow(clicks, beat);
    if (!w || clicks.length !== CHECK_TAPS) { eng.stop(); eng.setBpm(bpmRef.current); say('The timing check could not start — try again'); return; }
    const ms = Math.max(0, (w.close - eng.context.currentTime) * 1000);
    checkRef.current = { clicks, taps: [], beat, timer: window.setTimeout(() => finishCheckRef.current(), ms) };
    setCheck({ phase: 'listening', taps: 0 });
  };
  /** One tap of the check (Space / J / Enter, or the TAP button's pointerdown) on the audio clock. */
  const tapCheck = (): void => {
    const run = checkRef.current;
    const eng = engineRef.current;
    if (!run || !eng) return;
    const t = eng.context.currentTime;
    if (!acceptsTap(t, run.taps, run.clicks, run.beat)) return;
    run.taps.push(t);
    setCheck({ phase: 'listening', taps: run.taps.length });
    if (run.taps.length >= CHECK_TAPS) finishCheck();
  };
  // the check never outlives the room (a REPLAY remount, leaving the page)
  useEffect(() => () => { const run = checkRef.current; if (run?.timer != null) window.clearTimeout(run.timer); checkRef.current = null; }, []);

  /**
   * B (MUSIC-SUITE P4 FIX PASS: was ⇧R, a Flip pad letter) — THE RECORDING BOOTH (ui/RecordBooth, the booth lane's): arm the mic → RECORD → STOP the take, by pressing the
   * booth's own buttons (the booth keeps every rule: the tier, the count-in, what a STOP means). Below THE STUDIO there is
   * no booth, and the room says where recording opens.
   */
  const recordKey = (): boolean => {
    const panel = typeof document === 'undefined' ? null : document.querySelector('[data-qa="song-panel"]');
    const pick = (qa: string): HTMLButtonElement | null => panel?.querySelector<HTMLButtonElement>(`[data-qa="${qa}"]:not([disabled])`) ?? null;
    const b = pick('booth-stop') ?? pick('booth-record') ?? pick('booth-arm');
    if (b) { b.click(); return true; }
    say(caps.takes ? 'The recording booth is busy — one moment' : `Recording opens at THE STUDIO — ${tierChips(progress).find((c) => c.tier === 'studio')?.needs ?? 'keep building'}`);
    return true;
  };

  // MUSIC-SUITE P2: one tap, from the TAP button's pointerdown or the keyboard's Space / J. The judge takes the nearest
  // note by signed error, so the line says which side it landed on (GOOD · EARLY 112ms), not just that it landed.
  // MUSIC-SUITE P5 (phone-mpc): `at` = a paired phone's tap time (the arrival moved back by half the round trip —
  // phonePad.phoneTapSec); a screen or key tap is judged at now, as before. NOT in an Arena (staked) set: the round trip
  // is measured by pings the PHONE answers, so a phone that held its pongs back would buy its late taps an earlier time
  // (up to MAX_ONE_WAY_MS), and the server cannot check a round trip — a staked set judges a phone tap as it arrives, as
  // it did before this pass (lib/arena-score-integrity.test.ts pins the judge to the audio clock). Free play corrects.
  const performTapAt = useCallback((at?: number): void => {
    const eng = engineRef.current;
    if (!eng || modeRef.current !== 'perform') return;
    const set = setRef.current;
    if (at === undefined || arenaSet) set.tap(eng.context.currentTime); else set.tap(at);
    showTally(set, 0);   // a tap that must WAIT for its note (not scheduled yet) shows when it settles
  }, [showTally, arenaSet]);
  const performTap = useCallback((): void => { performTapAt(); }, [performTapAt]);

  // MUSIC-SUITE P2: PERFORM on the keyboard — Space and J, judged on keydown (a held key is one tap, e.repeat is
  // ignored). Neither is a Flip pad key (Flip.ts PAD_KEYS: 1-4 / q-r / a-f / z-v), and the Flip's own listener only exists
  // while FlipPad is mounted, i.e. on the FLIP tab (FlipPad.tsx:99-101); this one only on the STUDIO tab in PERFORM.
  // Space is taken on keyup too: a focused button (PLAY!) activates on Space's keyup and would stop the music mid-set.
  // Typing in a field is left alone.
  useEffect(() => {
    // MUSIC-SUITE P4 FIX PASS: not behind the splash (with the PERFORM stage picked, Space on TAP TO START was taken here)
    if (mode !== 'perform' || view !== 'studio' || !roomShown) return;
    const typing = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onDown = (e: KeyboardEvent) => {
      if (!isPerformTapKey(e) || typing(e.target)) return;
      e.preventDefault();
      if (!e.repeat) performTap();
    };
    const onUp = (e: KeyboardEvent) => { if (isPerformTapKey(e) && !typing(e.target)) e.preventDefault(); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [mode, view, performTap, roomShown]);

  // ── MUSIC-SUITE P5 (2026-09-25), phone-mpc: WHAT THE PHONE'S BUTTONS DO (phonePad.phoneCommand) ──────────────────────
  // A pad: the tap's time is the arrival moved back by half the phone's measured round trip (the median of its last 8
  // pings, capped — phonePad.phoneTapSec); a free-play PERFORM set JUDGES it at that time (an Arena set at its arrival:
  // performTapAt), and it plays the bank's pad — through
  // FlipPad on the FLIP tab (the pad lights; ARM REC as a screen tap), else the room plays and records it (playPhonePad).
  // BANK A–D picks the bank on the pads; PLAY / STOP drive the room's transport (the same count-in rule as the PLAY
  // button); REC arms or disarms ARM REC. HostLobby calls the latest render's handler (its inputRef), so this reads the
  // room as it is now; the bank / REC / transport decisions read refs and the engine, never a render behind.
  const phoneInput = (ev: ControlEvent, _slot: number, peerId: PeerId): void => {
    const cmd = phoneCommand(ev);
    if (!cmd) return;
    const eng = engineRef.current;
    if (cmd.kind === 'pad') {
      const arrivedAt = Date.now();   // (the probe's readout: the phone stamps ev.t on the same wall clock when both are one machine)
      const rttMs = medianRtt(rttRef.current.get(peerId) ?? []);
      const arrival = eng?.context.currentTime;
      const hit: PadHit = { velocity: cmd.velocity, ...(arrival !== undefined ? { atSec: phoneTapSec(arrival, rttMs) } : {}) };
      // judged at the finger's time — MUSIC-SUITE P5 FIX PASS: only where a screen tap or Space counts (PERFORM on the
      // STUDIO view; phonePad.judgesPhoneTap). A pad played as an instrument on FLIP scored EXTRA misses against the set.
      if (judgesPhoneTap({ mode: modeRef.current, view }) && hit.atSec !== undefined) performTapAt(hit.atSec);
      const trigger = flipTrigger.current;
      const how = trigger ? (trigger(cmd.pad, hit), 'flippad') : playPhonePad(cmd.pad, hit);
      const w = window.__FEL_PHONE__;
      window.__FEL_PHONE__ = {
        hits: (w?.hits ?? 0) + 1, bank: PHONE_BANKS[flipBankRef.current], recArm: flipRecArmRef.current, phones,
        last: { pad: cmd.pad, velocity: cmd.velocity, arrivalSec: arrival ?? null, atSec: hit.atSec ?? null, rttMs, view, how, sentAt: ev.t, arrivedAt },
      };
      return;
    }
    if (cmd.kind === 'bank') {
      if (cmd.bank === flipBankRef.current) return;
      setFlipBank(cmd.bank);
      phoneSaid.current.loading = false;
      const src = bankOf(projectRef.current.flip, cmd.bank).source;
      say(`Phone: bank ${PHONE_BANKS[cmd.bank]} — ${src ? src.label : 'empty (load a sound into it on the FLIP tab)'}`);
      if (window.__FEL_PHONE__) window.__FEL_PHONE__ = { ...window.__FEL_PHONE__, bank: PHONE_BANKS[cmd.bank] };
      return;
    }
    const fx = transportEffect(cmd.op, { running: eng ? eng.isRunning : playing, recArm: flipRecArmRef.current });
    if (fx === 'start' || fx === 'stop') playOrStop(true, fx);
    else if (fx === 'arm' || fx === 'disarm') {
      setFlipRecArm(fx === 'arm');
      say(fx === 'arm' ? `Phone: REC armed — ${eng?.isRunning ? 'your pad hits' : 'press PLAY, then your pad hits'} write into the grid` : 'Phone: REC off');
    }
  };
  /** The lobby's peers (every pong, ~1/s): each phone's round trip, and how many are connected (a render only on a change). */
  const phonePeers = (ps: LobbyPeer[]): void => {
    for (const p of ps) if (p.connected) rttRef.current.set(p.peerId, pushRtt(rttRef.current.get(p.peerId) ?? [], p.rttMs));
    const n = ps.filter((p) => p.connected).length;
    setPhones((was) => (was === n ? was : n));
  };

  const publishTrack = async (): Promise<void> => {
    const eng = engineRef.current;
    if (!eng || saving) return;
    if (!libraryOpen) { setLibraryLine(privacy.line); return; }   // MUSIC-SUITE P5: decision #15 (the switch shut this door)
    if (!title.trim()) { say('Name your track first'); return; }
    setSaving(true);
    // MUSIC-SUITE P3 (2026-09-25): this was try/finally with no catch around a publish that threw QuotaExceededError on
    // the 4th song (P1: an unhandled rejection, no toast, the title still in the field). The rendered WAV now goes into
    // the device's file store as a Blob (no 1.5 MB data URL), the library answers with a line instead of throwing, and
    // anything that does throw (the render itself) is said too. A failed publish keeps the title so a retry is one tap.
    try {
      // optional: the creator's own authorized Spotify/Apple version rides
      // along and plays via the OFFICIAL embed in the library
      const link = streamUrl.trim() ? parseStreamingUrl(streamUrl) : null;
      if (streamUrl.trim() && !link) { say('Streaming link not recognized — publish without it or fix the URL'); return; }
      // MUSIC-SUITE P3: the WORKING grid is rendered (song mode or CELL's preview may be what is playing), and only its
      // heard rows sound (the engine's selection) — the same rows the record keeps, each Flip row with its chop, so a
      // remix plays the same sounds (the record kept flip_N rows with no sound, and a remix's Flip rows were silent).
      // MUSIC-SUITE P3 FIX PASS: at the PROJECT's swing (in song mode the engine's is the playing section's)
      const render = publishRender(project);
      // MUSIC-SUITE P5 FIX PASS (2026-09-25): …with the WORKING grid's own Flip chops handed to the render. It read the
      // engine's, and song mode swaps a section's chops in under the same ids (turning SONG MODE on does it even while
      // stopped): the library audio played the section's old chop while the record, a remix and the card named the grid's.
      await Promise.allSettled(project.flipRows.map((r) => chopFor(r)));
      const sounds = flipSoundMap(render.tracks, project.flipRows, (r) => chopCache.current.get(bakeKey(r)) ?? null);
      const blob = await eng.renderMixdown(2, render.tracks, render.swing, sounds);
      room.noteCreation();   // MUSIC-SUITE P3: a render counts toward the day's creation session (the streak)
      // MUSIC-SUITE P4 FIX PASS: the record keeps the rows the render PLAYED — a row the desk mutes or solos out is left out
      // of both (the library audio was bass-only under a solo while the record, a remix and the dance floor had every row)
      const deskIds = new Set([...shownIds].filter((id) => gateOpen(deskHeard, id)));
      const deskCut = [...shownIds].filter((id) => tracks.some((t) => t.sampleId === id) && !deskIds.has(id)).length;
      const pub = publishTracks(tracks, project.flipRows, deskIds);
      const res = await StudioLibrary.publishWithAudio({
        // MUSIC-SUITE P3 FIX PASS: the signed-in player is the author (GameShell passes no `profile`, so every song was
        // 'me'), and the kit is the one that PLAYED in the render
        title: title.trim(), authorId: me, authorName: profile.name,
        kit: playingKit, bpm, swing, polished,
        sequencer: { bpm, steps: STEPS, tracks: pub.tracks, swing },
        remixOf,
        streamingLinks: link ? [link] : [],
        key: project.key,   // MUSIC-SUITE P4: the song's key is on its record (the card says 'Am'; a remix opens in it)
      }, blob);
      // MUSIC-SUITE P4 (P3's open item): a library failure stays on screen (the lasting line), not a 2.2 s toast
      if (!res.ok) { setLibraryLine(res.line); return; }
      setLibraryLine(res.line);   // "kept for this visit only" and the like last too; a clean publish clears the line
      // Creator Card pipeline hook (M28 contract). MUSIC-SUITE P5 FIX PASS (decision #15): this is the door OFF the device
      // (UPLOAD_DOORS.offDevice) — a song that plays an upload never goes through it until FEL can review uploads online
      if (UPLOAD_DOORS.offDevice || !tracksHaveUpload(res.rec.sequencer.tracks)) onPublish?.(res.rec);
      setLibraryRev((r) => r + 1);
      const left = (pub.silent.length ? ` · ${pub.silent.length} Flip row${pub.silent.length === 1 ? '' : 's'} with no sound left out` : '')
        + (deskCut ? ` · as you hear it: ${deskCut} row${deskCut === 1 ? '' : 's'} muted or soloed out on the mixer left out` : '');
      say(res.line ? `"${res.rec.title}" published — ${res.line}${left}` : `"${res.rec.title}" published to the Academy library${left}`);
      setTitle(''); setStreamUrl('');
    } catch (e) {
      setLibraryLine(`Could not publish (${e instanceof Error ? e.name : 'error'}) — nothing was saved; try again`);
    } finally {
      setSaving(false);
    }
  };

  // MUSIC-SUITE P3: a song's audio is fetched from the store (an object URL), so PLAY waits for it; a song whose audio is
  // not on this device says so instead of a silent Audio('') that never starts.
  const playRecord = (t: TrackRecord): void => {
    playerRef.current?.pause();
    void StudioLibrary.audioSource(t.id).then((src) => {
      if (!src.ok) { setLibraryLine(src.line); return; }   // MUSIC-SUITE P4: the lasting line
      const el = new Audio(src.src);
      playerRef.current?.pause();
      playerRef.current = el;
      void el.play().then(() => {
        StudioLibrary.countPlay(t.id);        // counted when audio actually starts, as the doc on countPlay says
        setLibraryRev((r) => r + 1);
      }).catch(() => setLibraryLine('This browser would not start the audio — tap PLAY again'));
    });
  };

  const startRemix = (t: TrackRecord): void => {
    // MUSIC-SUITE P3 FIX PASS: REMIX opens a project, so it is held exactly when MY PROJECTS is (a take recording would
    // have landed in the remix; a PERFORM set's grid would have been swapped mid-set)
    if (switchLock) { say(`REMIX opens a new project — ${switchLock.charAt(0).toLowerCase()}${switchLock.slice(1)}`); return; }
    const r = StudioLibrary.beginRemix(t.id);
    if (!r) return;
    // MUSIC-SUITE P2 (2026-09-25): REMIX NEVER BUYS. This was `void pickKit(r.kit)`, and pickKit charged for a kit not
    // owned — so remixing somebody's NEON track from the LIBRARY took 200 shards with no ask. Now a locked kit opens the
    // remix on the default kit, and the room says so under the remix banner (remixKitNote); unlocking it is a KITS tap.
    const plan = remixKit(r.kit, shop.owned);
    // MUSIC-SUITE P3 (2026-09-25): A REMIX IS ITS OWN PROJECT. It wrote the remixed pattern over the open grid (setTracks,
    // setBpm, setSwing, setRemixOf) — with autosave that would have overwritten the player's own saved beat. The open
    // project is saved as it is, and the remix opens as a new one named after the original with the credit kept; the
    // project-opened effect loads plan.kit (the track's own kit if owned, else the default — never a purchase).
    // MUSIC-SUITE P3 (tier-honesty-editing): the remix CARRIES THE FLIP CHOPS the song was published with (studioEdit
    // remixSeed, through migrateProject); a Flip row whose sound can't come along (published before P3) is left out and
    // said, never opened as a row that plays nothing.
    // MUSIC-SUITE P4 FIX PASS: with the SOURCE record's kit — a pre-P4 row's notes are its kit voice's (NEON C, DUST G);
    // without it they were STREET's A for every remix, another key than the published audio
    const seed = remixSeed(r.sequencer.tracks, r.kit);
    // MUSIC-SUITE P3 FIX PASS: MASTER comes along (a remix of a mastered song opened with MASTER off), and the remix-kit
    // note belongs to the remix project it was said about; nothing is said if the switch was refused (unsaved work)
    const note = remixKitNote(plan);
    void room.ops.create({ title: `Remix · ${t.title}`, tracks: seed.tracks, flipRows: seed.flipRows, bpm: r.bpm, swing: r.swing, kit: plan.kit, remixOf: r.remixOf, ...(r.key ? { key: r.key } : {}), polish: r.polished }).then((id) => {
      if (!id) return;
      setRemixNote(note ? { id, line: note } : null);
      setView('studio');
      const dropped = seed.dropped.length ? ` · ${seed.dropped.length} Flip row${seed.dropped.length === 1 ? '' : 's'} came without ${seed.dropped.length === 1 ? 'its' : 'their'} sound and ${seed.dropped.length === 1 ? 'was' : 'were'} left out` : '';
      say((plan.locked
        ? `Remixing "${t.title}" on ${KIT_META[plan.kit].label} — ${KIT_META[plan.locked].label} is locked; nothing was charged`
        : `Remixing "${t.title}" — credit stays with ${t.authorName}`) + dropped);
    });
  };

  // ── MUSIC-SUITE P4 (2026-09-25): the key map's actions (ui/keys) — true when the room did something ─────────────
  const cursorCell = (): { row: number; step: number } | null => {
    if (!cursor) return null;
    const row = drawn.findIndex((t) => t.sampleId === cursor.row);
    return row >= 0 ? { row, step: cursor.step } : null;
  };
  const keyAct = (a: StudioKeyAction): boolean => {
    switch (a.kind) {
      case 'hold': return true;   // MUSIC-SUITE P4 FIX PASS: a held Space — nothing, and no page scroll
      case 'help': setHelpOpen((h) => !h); return true;
      case 'escape':
        if (checkRef.current) { finishCheck(true); return true; }
        if (helpOpen) { setHelpOpen(false); return true; }
        if (openNote) { setOpenNote(null); return true; }
        if (cursor) { setCursor(null); return true; }
        return false;
      case 'undo': stepHistory('undo'); return true;
      case 'redo': stepHistory('redo'); return true;
      case 'tap': tapCheck(); return true;
      case 'playStop': togglePlay(); return true;
      case 'record': return recordKey();
      case 'cursor': {
        const next = moveCursor(cursorCell(), a.dRow, a.dStep, drawn.length, STEPS, stepsOnPage(page, layout)[0] ?? 0);
        if (!next) return false;
        setCursor({ row: drawn[next.row].sampleId, step: next.step });
        setPage(pageOfStep(next.step, layout));   // the phone grid turns to the cursor's page
        gridRef.current?.focus({ preventScroll: true });
        return true;
      }
      case 'toggle':
        if (!cursor || !cursorCell()) return keyAct({ kind: 'cursor', dRow: 0, dStep: 0 });
        toggleCell(cursor.row, cursor.step);
        return true;
      case 'note': {
        const c = cursor;
        if (!c || !cursorCell()) return keyAct({ kind: 'cursor', dRow: 0, dStep: 0 });
        if (!isPitchedRow(c.row)) { say('⌥↑ / ⌥↓ move a note on a bass, lead or Flip row'); return true; }
        if (gridLock) { say(lockLine()); return true; }
        // consecutive nudges of one step are one undo step
        edit((p) => {
          const t = p.tracks.find((x) => x.sampleId === c.row);
          const patch = t ? nudgeNote(t, c.step, a.degrees, p.key) : null;
          return patch ? { ...p, tracks: withTrackStep(p.tracks, c.row, c.step, patch, p.key) } : p;
        }, `note:${c.row}:${c.step}`);
        return true;
      }
    }
    return false;
  };
  keyActRef.current = keyAct;
  // the cursor's cell is kept in view (a long Flip section scrolls)
  useEffect(() => {
    if (!cursor) return;
    const el = gridRef.current?.querySelector(`[data-qa="cell"][data-row="${cursor.row}"][data-step="${cursor.step}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [cursor, page]);
  // another project opened: no cursor or open NoteRow carried over from the last one
  useEffect(() => { setCursor(null); setOpenNote(null); }, [room.generation]);

  // MUSIC-SUITE P4 (2026-09-25): THE NOTES, RENDERED ON THEIR NOTE. A pitched kit voice (bass, lead) plays another note
  // at a playbackRate from its root until a render of that note is loaded (AudioEngine voiceFor) — so a lead two octaves
  // up played at rate 4: a quarter as long, and a chirp. Every note the grid and the sections light is rendered for the
  // kit that PLAYS (SynthKit.synthesizeNote: the voice's own envelope and length) and handed to the engine (loadNote); a
  // kit change drops them (swapKit) and the new kit's are rendered. The root note is the kit's own buffer already.
  const noteWant = useMemo(() => {
    const want = new Map<PitchedSlot, Set<number>>();
    const add = (list: readonly TrackState[]): void => {
      for (const t of list) {
        if (!isPitchedSlot(t.sampleId)) continue;
        const slot = t.sampleId;
        t.pattern.forEach((on, i) => {
          const n = t.notes?.[i];
          if (!on || typeof n !== 'number' || !Number.isFinite(n)) return;
          if (!want.has(slot)) want.set(slot, new Set());
          want.get(slot)!.add(Math.round(n));
        });
      }
    };
    add(tracks);
    for (const sec of project.sections) add(sec.tracks);
    return [...want].map(([slot, ns]) => [slot, [...ns].sort((a, b) => a - b)] as const);
  }, [tracks, project.sections]);
  const noteWantSig = JSON.stringify(noteWant);
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !ready) return;
    const kitNow = playingKit;
    let alive = true;
    void (async () => {
      for (const [slot, notes] of noteWant) {
        for (const n of notes) {
          if (!alive || kitRef.current !== kitNow) return;
          if (n === VOICE_ROOTS[kitNow][slot] || eng.loadedNotes(slot).includes(n)) continue;
          const buf = await synthesizeNote(kitNow, slot, n);
          if (!alive || kitRef.current !== kitNow) return;
          eng.loadNote(slot, n, buf);
        }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playingKit, noteWantSig]);

  // MUSIC-SUITE P4: the dev/probe hook (window.__FEL_GRID__) — what the pocket studio's UI is showing right now
  useEffect(() => {
    const eng = engineRef.current;
    window.__FEL_GRID__ = {
      compact: layout.compact, page, pages: layout.pages, pageSteps: layout.pageSteps, cursor, openNote, key: keySignature(project.key),
      metronome: transport.metronome, countIn: transport.countIn, mixerOpen, help: helpOpen,
      check: check ? (check.phase === 'done' ? check.line : 'listening') : null,
      checkTaps: checkRef.current?.taps.length ?? 0, checkClicks: checkRef.current?.clicks.slice() ?? [], savedOffsetMs: savedCal?.offsetMs ?? null, toastAt, libraryLine,
      noteRenders: eng ? { bass: eng.loadedNotes('bass'), lead: eng.loadedNotes('lead') } : {},
      keysLive: roomShown && !keysSuspended.current, graphLatencySec: eng?.graphLatencySec,
    };
  });

  // ── styles (warm music-school palette; deliberately NOT the neon bezel) ──
  const S: Record<string, React.CSSProperties> = {
    // MUSIC-SUITE P4: an 8 px side padding on the phone grid's widths (the ≥ 40 px cells need the room — ui/gridMath)
    root: { fontFamily: 'inherit', color: '#f5ead9', background: 'linear-gradient(165deg,#2a1a3a 0%,#3a1f2e 55%,#402a18 100%)', minHeight: '100%', padding: layout.compact ? PHONE_PAD_PX : 16, borderRadius: 12, maxWidth: '100%', boxSizing: 'border-box' },
    header: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
    h1: { fontSize: 22, fontWeight: 800, letterSpacing: 1, color: '#ffd75e' },
    tabs: { display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' },
    tab: { padding: '6px 14px', borderRadius: 20, border: '1px solid #7a5c9e', background: 'transparent', color: '#e8d9c2', cursor: 'pointer' },
    tabOn: { background: '#7a5c9e', color: '#fff' },
    // (MUSIC-SUITE P4: the grid's own styles — `90px repeat(16, 1fr)` at every width — moved into ui/StepGrid)
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#2a1a10', fontWeight: 700, cursor: 'pointer' },
    btnAlt: { padding: '8px 14px', borderRadius: 8, border: '1px solid #ffb347', background: 'transparent', color: '#ffd75e', cursor: 'pointer' },
    mentor: { marginTop: 12, padding: '8px 12px', borderLeft: '3px solid #ffd75e', background: 'rgba(255,215,94,0.08)', fontStyle: 'italic', fontSize: 13 },
    card: { padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.25)', marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    // MUSIC-SUITE P4 (P3's open item): it was `position: sticky; bottom: 8` — on a phone it sat over the grid and the
    // transport and took their taps. Now it floats in whichever band (top / bottom) covers less of them (toastAt), and
    // never takes a tap (pointer-events: none).
    toast: {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 60, pointerEvents: 'none',
      ...(toastAt === 'top' ? { top: 'calc(8px + env(safe-area-inset-top, 0px))' } : { bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }),
      padding: '8px 12px', borderRadius: 8, background: 'rgba(122,92,158,0.96)', color: '#fff', maxWidth: 'min(560px, calc(100vw - 24px))',
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)', fontSize: 13,
    },
  };

  // MUSIC-SUITE P4: THE KEY MAP's panel — the table ui/keys.ts answers from (P4 FIX PASS: drawn where it was asked for)
  const keysHelp = (
    <div ref={helpRef} data-qa="keys-help-panel" role="dialog" aria-label="Keyboard keys" style={{ ...S.card, display: 'block', border: '1px solid #7a5c9e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 800 }}>KEYS</span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>never while you type in a field</span>
        <button type="button" style={{ ...S.btnAlt, marginLeft: 'auto', padding: '4px 10px' }} onClick={() => setHelpOpen(false)}>CLOSE</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, max-content) minmax(0, 1fr)', gap: '4px 12px', fontSize: 12 }}>
        {KEY_HELP.map((h) => (
          <React.Fragment key={h.keys}>
            <kbd style={{ fontFamily: 'inherit', fontWeight: 800, color: '#ffd75e' }}>{h.keys}</kbd>
            <span>{h.does}{h.where === 'PERFORM' || h.where === 'FLIP' ? '' : h.where === 'STUDIO' ? ' — STUDIO tab' : ''}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  // ONE WAY INTO PERFORM. The set clock starts here and nowhere else — when this was
  // only stamped on the splash's READY tap, a player who built for ten minutes and then
  // tapped PERFORM reported the whole ten minutes as their set. That is the "both" path,
  // and it is the normal one: the stage pick chooses where you land, not where you stay.
  const enterPerform = useCallback(() => {
    if (checkRef.current) finishCheckRef.current(true);   // MUSIC-SUITE P4: the timing check belongs to the studio floor
    setRef.current = new PerformSet({ arena: arenaSet });   // a fresh set: no notes, no score, nothing left over
    savedOffsetRef.current = savedAudioOffsetMs();           // MUSIC-SUITE P2: a calibration saved since last set counts
    setCalStale(loadRoomCalibration().stale);                // (P2 FIX PASS: saved in the calibrate tab since mount)
    shownTapRef.current = null;
    setMode('perform');
    setScore(0);
    setCombo(0);
    setJudgement('');
    setPerfBar(1);
    setStartedAt.current = Date.now();
  }, [arenaSet]);

  // The scored half's finish line. Reports the set to the shell, which posts the
  // session and shows the card — the same path every other mode ends on. Back to the
  // BUILD floor afterwards so the room is still there to keep working in.
  const endSet = useCallback(() => {
    if (modeRef.current !== 'perform') return;   // HOTFIX (2026-09-24): the set's own end and END SET can meet; one card
    modeRef.current = 'build';                   // no more notes before the effect catches up
    const seconds = setStartedAt.current ? Math.round((Date.now() - setStartedAt.current) / 1000) : 0;
    // MUSIC-SUITE P2 (2026-09-25): the set's own result, never a render behind. It used to report `won: score > 0` (one
    // tap won a set and paid its LC) and called the combo the set ENDED on "best". Now: won = accuracy >= 0.5 over >= 8
    // bars (owner decision #13, performSetWon — the server re-reads the same counts from `stats`, lib/session-payout.ts),
    // the real best combo, and the shared contract { bars, notes, hits, perfects, goods, misses, accuracy, grade,
    // maxCombo, arena } in stats.
    const r = setRef.current.result(engineRef.current?.context.currentTime ?? 0);
    const pct = Math.round(r.accuracy * 100);
    // MUSIC-SUITE P4 FIX PASS: the shell's end card now covers the room (still mounted under it): no key reaches the room
    // until it is touched again (REPLAY remounts it) — Space toggled the transport behind REPLAY, and Z undid the grid.
    // (A host with no card — /dev/music's stand-in — gets its keys back at the first press in the room.)
    keysSuspended.current = true;
    onEnd?.({
      score: r.score,
      won: r.won,
      duration: seconds,
      headline: r.notes > 0 ? `${r.score} · GRADE ${r.grade} ${pct}% · best combo x${r.maxCombo}` : `${r.score}`,
      tallies: { hits: r.hits, misses: r.misses, dodges: 0, combos: 0 },
      maxCombo: r.maxCombo,
      stats: { score: r.score, kit: String(playingKit), ...performResultStats(r) },
      // MUSIC-SUITE P2 FIX PASS: `bars` counts only bars that offered a note, so the line says so
      outcome: r.won ? 'set won'
        : r.notes === 0 ? 'no notes landed'
        : r.bars < PERFORM_WIN_MIN_BARS ? `under ${PERFORM_WIN_MIN_BARS} bars with notes` : 'under grade C',
    });
    setMode('build');
    setScore(0);
    setCombo(0);
    setJudgement('');
  }, [onEnd, playingKit]);
  useEffect(() => { endSetRef.current = endSet; }, [endSet]);

  const allTracks = StudioLibrary.list();
  const creators = [...new Map(allTracks.map((t) => [t.authorId, t.authorName])).entries()];
  void libraryRev;                                        // read to re-render on library writes

  // The same start ritual as every other mode: the splash carries the STAGE pick, and
  // the READY tap is what enters the room. It used to be a bare line of text, which is
  // why music had no screen on which to choose what it was going to be.
  // MUSIC-SUITE P3: the splash also waits for the project to be restored, so nothing is built on a blank grid that the
  // restore would then replace.
  if (!ready || !room.restored || !started) {
    return (
      <div style={S.root}>
        <BootSplash
          modeId="music"
          title="FEL GROOVE ACADEMY"
          phase={ready && room.restored ? 'ready' : 'loading'}
          onStart={() => {
            // Re-read the pick at the tap, not at mount: the player may have just
            // changed it on this very screen.
            const picked = readMusicStage();
            if (picked === 'perform') {
              enterPerform();
            } else {
              setMode('build');
              setStartedAt.current = 0;   // no set is running on the studio floor
            }
            setStarted(true);
          }}
          onRetry={() => setStarted(false)}
        />
      </div>
    );
  }

  return (
    <div style={S.root} onPointerDownCapture={() => { keysSuspended.current = false; /* MUSIC-SUITE P4 FIX PASS: the room is touched: its keys again */ }}>
      <div style={S.header}>
        <div style={S.h1}>FEL GROOVE ACADEMY</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>the studio floor is yours</div>
        {/* MUSIC-SUITE P2: PERFORM judges on the heard clock, which a saved calibration sets (performLatencySec).
            MUSIC-SUITE P2 FIX PASS (2026-09-25): IN A NEW TAB. This was a same-tab link with ?return=, and the room has no
            autosave until phase 3 and no leave guard: build a beat, save sections, record a take, calibrate, press "SAVED ·
            BACK TO THE ROOM" and the room remounted on an empty grid — everything gone. The room stays open here and
            enterPerform re-reads the offset, so the next set uses the new one. An old undated reading is ignored
            (loadRoomCalibration) and the link asks for a new one. */}
        <a href="/play/calibrate" target="_blank" rel="noopener noreferrer" data-qa="academy-calibrate"
          title="Opens in a new tab — your beat stays here. The next PERFORM set uses the new reading."
          style={{ marginLeft: 'auto', fontSize: 12, color: '#22d3ee', textDecoration: 'underline' }}>
          {calStale ? 'Recalibrate (old reading ignored) ↗' : 'Calibrate ↗'}
        </a>
      </div>

      {/* MUSIC-SUITE P3 (2026-09-25): MY PROJECTS — the open project's name, how it is kept (every save failure is said
          here), and the list: NEW / OPEN / RENAME / DUPLICATE / DELETE (asked first). Held while a PERFORM set runs or a
          take records, so a set's grid and a take's project can't change under them. */}
      <MyProjects
        current={{ id: project.id, title: project.title }} status={room.status} notice={room.notice} projects={room.projects}
        locked={switchLock}
        onOpenList={room.refreshProjects} onNew={() => void room.ops.create()} onOpen={(id) => void room.ops.open(id)}
        onRename={(id, t) => void room.ops.rename(id, t)} onDuplicate={(id) => void room.ops.duplicate(id)}
        onDelete={(id) => void room.ops.remove(id)} S={S}
        conflict={room.conflict} onReload={() => void room.ops.reload()} onSaveCopy={() => void room.ops.saveCopy()}
        blocked={room.blocked} persisted={room.persisted} />

      {/* MUSIC-SUITE P4 (P3's open item): a LIBRARY failure is a lasting line under the project bar (it was a 2.2 s toast —
          "Your library is full", "this song's audio isn't on this device" came and went before a phone player read it). It
          stays until OK or the next library success. */}
      {libraryLine && (
        <div data-qa="library-line" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '4px 0', fontSize: 12, color: '#ffd7a8' }}>
          <span>LIBRARY: {libraryLine}</span>
          <button type="button" aria-label="dismiss the library line" onClick={() => setLibraryLine(null)} style={{ ...S.btnAlt, padding: '2px 10px', fontSize: 11 }}>OK</button>
        </div>
      )}

      {/* MUSIC-SUITE P3 FIX PASS: a take keeps recording while its panel is hidden on another tab — its STOP is here too */}
      {takeRec && view !== 'studio' && (
        <div data-qa="take-recording-chip" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
          {/* MUSIC-SUITE P4: the booth says whether it is only the open mic or a take (SongPanel onRecording's `what`) */}
          <button style={{ ...S.btn, background: '#ff5c5c', color: '#fff' }} onClick={() => takeStopRef.current?.()}>{takeWhat === 'mic' ? '● MIC ON — CLOSE' : '● TAKE RECORDING — STOP'}</button>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{takeWhat === 'mic' ? "the booth's mic is open" : <>the take lands in &quot;{project.title}&quot;</>}</span>
        </div>
      )}

      {/* MUSIC-SUITE P5 (2026-09-25), phone-mpc: THE PHONE'S ROOM, at ROOM level — opened the first time FLIP shows and
          kept until the Academy closes (it was inside the FLIP tab, and every tab switch disposed it: phonePad.ts). Its
          badge shows on FLIP, and on the other tabs while a phone is connected (hidden, not unmounted, otherwise). */}
      {phoneRoom && (
        <div data-qa="phone-room" data-phones={phones} style={phoneBadgeShown(view, phones) ? undefined : { display: 'none' }}>
          <HostLobby config={MODE_CONTROLLERS.music_flip} collapsed onInput={phoneInput} onPeers={phonePeers} />
        </div>
      )}
      {/* …and a phone's REC armed from another tab says so where the player is (the ARM REC button is on FLIP) */}
      {flipRecArm && view !== 'flip' && (
        <div data-qa="phone-rec-chip" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
          <button style={{ ...S.btn, background: '#ff5c5c', color: '#fff' }} onClick={() => setFlipRecArm(false)}>● FLIP REC ARMED — DISARM</button>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{playing ? `pad hits on bank ${PHONE_BANKS[flipBank]} write into the grid` : `press PLAY — pad hits on bank ${PHONE_BANKS[flipBank]} then write into the grid`}</span>
        </div>
      )}

      <div style={S.tabs}>
        {(['studio', 'flip', 'library', 'listen'] as View[]).map((v) => (
          <button key={v} style={{ ...S.tab, ...(view === v ? S.tabOn : {}) }}
            onClick={() => { setView(v); setCreatorId(null); }}>
            {v === 'studio' ? 'STUDIO' : v === 'flip' ? 'FLIP' : v === 'library' ? 'LIBRARY' : 'LISTEN'}
          </button>
        ))}
        {view === 'creator' && creatorId && (
          <span style={{ ...S.tab, ...S.tabOn }}>CREATOR</span>
        )}
      </div>

      {/* MUSIC-SUITE P4: THE KEY MAP ('?' or the transport's ?) — the table ui/keys.ts answers from. MUSIC-SUITE P4 FIX PASS:
          on the STUDIO tab it opens under the transport (keysHelp, below); on the other tabs here */}
      {helpOpen && view !== 'studio' && keysHelp}

      {view === 'listen' && <StreamingDeck />}

      {view === 'flip' && (
        <>
          {/* M1b: pair a phone — its pad bank hits these pads. MUSIC-SUITE P5 (phone-mpc): the phone's room is mounted at
              ROOM level now (above the tabs), so leaving FLIP no longer closes it */}
          <FlipPad engine={engineRef.current} playing={playing} playhead={playhead} steps={STEPS} say={say} triggerRef={flipTrigger}
            /* MUSIC-SUITE P5 (phone-mpc): the bank on the pads and ARM REC are the room's (a phone's BANK / REC, any tab) */
            bank={flipBank} onBank={setFlipBank} recArm={flipRecArm} onRecArm={setFlipRecArm}
            /* MUSIC-SUITE P3 (2026-09-25): the FLIP tab's source + chops are the project's (FlipPad remounts on every tab
               switch and restores from here); a pad sent or recorded to the grid brings its exact chop, so the row keeps
               sounding after a reload — and a recorded pad now loads its buffer (P1: flip_1 written but silent). */
            flip={project.flip} onFlipChange={flipChange} loadSource={loadFlipSource} saveAudio={room.saveAudio} onRecording={setMicRec}
            projectId={project.id} rowSourceKeys={new Set(project.flipRows.map((r) => sourceKey(r.source)))}
            /* MUSIC-SUITE P3 (tier-honesty-editing): the row a pad lands on is DRAWN now (the Flip section under the kit
               rows, every tier), the pad shows it has one, and a send or a burst of recorded hits is one undo step. */
            /* MUSIC-SUITE P5: the rows (each knows the bank + pad it came from — bank B's pad 3 gets its own row) and the
               audio clock ARM REC places a tap by (flipClock) */
            flipRows={project.flipRows} trackIds={flipTrackIds} stepClock={flipClock}
            playerId={me}   /* MUSIC-SUITE P5: the FEL-theme lesson is remembered per player */
            onAssign={(_pad, buffer, row) => {
              engineRef.current?.loadBuffer(row.sampleId, row.label, buffer, 'melody');
              chopCache.current.set(bakeKey(row), buffer);   // MUSIC-SUITE P5: the baked chop the pad played
              resyncSection(withFlipRow(projectRef.current, row));   // MUSIC-SUITE P5 FIX PASS: a playing section keeps its own
              edit((p) => withFlipRow(p, row));
            }}
            /* MUSIC-SUITE P5 (phone-mpc): the room's recordFlipHit (a phone hit on another tab records by the same rule) */
            onRecordHit={recordFlipHit} />
          <div style={S.row}>
            <button style={S.btn} onClick={togglePlay}>{playing ? 'STOP' : 'PLAY'}</button>
            <span style={{ fontSize: 12, opacity: 0.75 }}>the groovebox runs under the pads — arm REC and your taps land in the STUDIO grid</span>
          </div>
        </>
      )}

      {view === 'studio' && (
        <>
          {remixOf && (
            <div style={{ fontSize: 12, color: '#22d3ee', marginBottom: 6 }}>
              remixing "{remixOf.title}" by {remixOf.authorName}
              {/* MUSIC-SUITE P2: a remix of a locked kit opened on the default kit — said here, not only in a 2 s toast */}
              {remixNote?.id === project.id && <div data-qa="remix-kit-note" style={{ color: '#ffd75e', marginTop: 2 }}>{remixNote.line}</div>}
            </div>
          )}
          {/* MUSIC-SUITE P3 (2026-09-25): THE TIER CHIPS — each tier, what it opens, and what unlocks the next (MusicTiers
              tierChips, built from the same flags the gates read). They replace the one "Next:" line. */}
          <div data-qa="tier-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {tierChips(progress).map((c) => (
              <div key={c.tier} data-qa="tier-chip" data-tier={c.tier} data-state={c.state}
                style={{
                  flex: '1 1 180px', padding: '6px 10px', borderRadius: 10, fontSize: 11,
                  border: `1px solid ${c.state === 'current' ? '#ffd75e' : c.state === 'next' ? '#22d3ee' : '#5a4470'}`,
                  background: c.state === 'current' ? 'rgba(255,215,94,0.12)' : 'rgba(0,0,0,0.2)',
                  opacity: c.state === 'later' ? 0.7 : 1,
                }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>
                  {c.name}{c.state === 'current' ? ' · you are here' : c.state === 'reached' ? ' ✓' : c.state === 'next' ? ' · next' : ''}
                </div>
                <div style={{ opacity: 0.85 }}>{c.opens}</div>
                {c.needs && <div style={{ color: c.state === 'next' ? '#22d3ee' : '#e8d9c2', marginTop: 2 }}>{c.state === 'next' ? `To open: ${c.needs}` : c.needs}</div>}
              </div>
            ))}
          </div>

          {/* MUSIC-SUITE P3: WHAT YOU HEAR IS WHAT YOU SEE. The kit rows the tier shows, then the Flip rows in their own
              section (every pad, at every tier) — the only rows the engine plays. Song mode and CELL's preview are shown
              here read-only while they are what plays; the player's own grid is kept under them. */}
          {gridLock && (
            <div data-qa="grid-lock" style={{ fontSize: 12, color: '#22d3ee', marginBottom: 4 }}>
              {gridLock === 'song'
                ? `SONG MODE — playing "${songSection?.name ?? ''}" (read-only). Your own grid is kept: turn SONG MODE off to hear and edit it.`
                : `CELL PREVIEW — what BUY lays on your ${Object.keys(cellPreview ?? {}).length} rows. Nothing is charged until you BUY; CANCEL keeps your grid.`}
            </div>
          )}
          {/* MUSIC-SUITE P4: THE KEY + SCALE — shown once a pitched row is drawn (the bass at THE CHAIN, or any Flip row). A
              change moves every note with it (one undo step); the key is on the dance card and the library record. */}
          {drawn.some((t) => isPitchedRow(t.sampleId)) && (
            <div data-qa="key-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, margin: '4px 0' }}>
              <span style={{ opacity: 0.8 }}>KEY</span>
              <select aria-label="the song's key" data-qa="key-root" value={project.key.root}
                onChange={(e) => changeKey({ root: Number(e.target.value), scale: project.key.scale })}
                style={{ padding: '6px 8px', minHeight: 34, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }}>
                {Array.from({ length: 12 }, (_, pc) => <option key={pc} value={pc}>{pitchName(pc, { root: pc, scale: project.key.scale })}</option>)}
              </select>
              <select aria-label="the song's scale" data-qa="key-scale" value={project.key.scale}
                onChange={(e) => changeKey({ root: project.key.root, scale: e.target.value as ScaleId })}
                style={{ padding: '6px 8px', minHeight: 34, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }}>
                {SCALE_IDS.map((id) => <option key={id} value={id}>{SCALES[id].label}</option>)}
              </select>
              <span data-qa="key-sig" style={{ fontWeight: 800, color: '#ffd75e' }}>{keySignature(project.key)}</span>
              <span style={{ opacity: 0.7, fontSize: 11 }}>♪ rows play only this key&apos;s notes</span>
            </div>
          )}
          {/* MUSIC-SUITE P4: THE POCKET GRID (ui/StepGrid): pages of 8 under 640 px (≥ 40 px cells), drag-to-paint (one undo
              step a stroke), beat shading, the playhead on either page, the key cursor, and a ♪ NoteRow under a pitched row.
              A plain click with no stroke (a script, assistive tech) toggles one cell by row id, as P3's did. */}
          <StepGrid
            kit={rows.kit.map(gridRow)} flip={rows.flip.map(gridRow)}
            flipHead={(
              <div data-qa="flip-rows-head" style={{ fontSize: 11, opacity: 0.8, marginTop: 10 }}>
                FLIP ROWS — pads you sent from the FLIP tab ({rows.flip.length}) · every pad gets a row, at every tier
              </div>
            )}
            layout={layout} page={page} onPage={setPage} playhead={playhead} cursor={cursor} locked={gridLock}
            onPaint={paintCells} onLocked={() => say(lockLine())} onToggle={(row, step) => toggleCell(row, step)}
            openNote={openNote} onOpenNote={setOpenNote} focusRef={gridRef}
            onKeyFocus={() => { if (!cursor) keyAct({ kind: 'cursor', dRow: 0, dStep: 0 }); /* P4 FIX PASS: Tab in shows where you are */ }}
            renderNoteRow={(r) => (
              <NoteRow row={{ id: r.id, label: r.label, track: r.track }} songKey={project.key} layout={layout}
                steps={stepsOnPage(page, layout)} playhead={playhead} locked={!!gridLock}
                onPick={(step, midi) => pickStepNote(r.id, step, midi)} onLocked={() => say(lockLine())} onClose={() => setOpenNote(null)} />
            )} />
          {!gridLock && hiddenHits(tracks, caps) > 0 && (
            <div data-qa="hidden-hits" style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
              {hiddenHits(tracks, caps)} hit{hiddenHits(tracks, caps) === 1 ? '' : 's'} sit on rows {caps.name} doesn&apos;t show yet — silent until a tier opens them.
            </div>
          )}

          {/* MUSIC-SUITE P4: THE TRANSPORT — PLAY (with the COUNT-IN when it is on), METRO, COUNT-IN, UNDO / REDO / CLEAR,
              CHECK MY TIMING and the key map. */}
          <div ref={transportRef} data-qa="transport" style={S.row}>
            <button style={S.btn} onClick={togglePlay}>{playing ? 'STOP' : 'PLAY'}</button>
            <button data-qa="metronome" aria-pressed={transport.metronome} title="A click on every beat, the downbeat accented — never in a render"
              style={{ ...S.btnAlt, ...(transport.metronome ? { background: '#22d3ee', color: '#101018', border: '1px solid #22d3ee' } : {}) }}
              onClick={() => setTransport({ ...transport, metronome: !transport.metronome })}>
              METRO {transport.metronome ? 'ON' : 'OFF'}
            </button>
            <button data-qa="count-in" aria-pressed={transport.countIn > 0} title="PLAY counts this many bars in first (its own click)"
              style={{ ...S.btnAlt, ...(transport.countIn > 0 ? { background: '#22d3ee', color: '#101018', border: '1px solid #22d3ee' } : {}) }}
              onClick={() => setTransport({ ...transport, countIn: ((transport.countIn + 1) % 3) as 0 | 1 | 2 })}>
              COUNT-IN {transport.countIn === 0 ? 'OFF' : `${transport.countIn} BAR${transport.countIn === 2 ? 'S' : ''}`}
            </button>
            {/* MUSIC-SUITE P3: UNDO / REDO (⌘Z / ⇧⌘Z) and CLEAR (asked first). (P4 FIX PASS: the bare Z / ⇧Z went — a pad letter.) */}
            <button data-qa="undo" style={S.btnAlt} disabled={!histDepth.undo} onClick={() => stepHistory('undo')} title="Undo (⌘Z / Ctrl+Z)">UNDO</button>
            <button data-qa="redo" style={S.btnAlt} disabled={!histDepth.redo} onClick={() => stepHistory('redo')} title="Redo (⇧⌘Z / Ctrl+Y)">REDO</button>
            <button data-qa="clear" style={S.btnAlt} disabled={!!gridLock || gridHitCount(tracks) === 0} onClick={() => setConfirmClear(true)}>CLEAR</button>
            <button data-qa="timing-check" style={S.btnAlt} disabled={mode === 'perform' || check?.phase === 'listening'} onClick={startCheck}
              title="8 taps on a 2-bar count-in: the offset PERFORM and the Cypher judge by">⏱ CHECK MY TIMING</button>
            {savedCal && <span data-qa="timing-offset" style={{ fontSize: 12, color: '#22d3ee' }}>your offset {formatOffset(savedCal.offsetMs)}{savedCal.age ? ` · ${savedCal.age}` : ''}</span>}
            {!touchOnly && <button data-qa="keys-help" aria-expanded={helpOpen} title="Keyboard keys (?)" style={{ ...S.btnAlt, padding: '8px 12px' }} onClick={() => setHelpOpen((h) => !h)}>?</button>}
          </div>
          {/* MUSIC-SUITE P4 FIX PASS: the key map opens HERE, under the ? that opened it (it rendered after the tabs, ~570 px
              above the transport on a desktop and ~1100 px on a phone: pressing ? changed nothing the player could see) */}
          {helpOpen && keysHelp}

          {/* MUSIC-SUITE P4: CHECK MY TIMING — tap each of the 8 count-in clicks; the reading is saved dated */}
          {check && (
            <div data-qa="timing-check-panel" role="group" aria-label="Check my timing" style={{ ...S.card, border: '1px solid #22d3ee' }}>
              {check.phase === 'listening' ? (
                <>
                  <span style={{ fontWeight: 700 }}>Listen to the first bar, then tap each of the next {CHECK_TAPS} clicks — {check.taps} / {CHECK_TAPS}</span>
                  <span aria-hidden style={{ letterSpacing: 2, color: '#22d3ee' }}>{'●'.repeat(check.taps)}{'○'.repeat(Math.max(0, CHECK_TAPS - check.taps))}</span>
                  <button data-qa="timing-tap" style={{ ...S.btn, minWidth: 120, minHeight: 48, touchAction: 'manipulation', userSelect: 'none' }}
                    onKeyDown={(e) => { if (isRepeatedActivation(e)) e.preventDefault(); }}
                    onPointerDown={(e) => { if (e.button === 0) tapCheck(); }}
                    onClick={(e) => { if (e.detail === 0) tapCheck(); }}>TAP</button>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>or Space / J / Enter · 1 + 2 bars at {CHECK_BPM} BPM</span>
                  <button style={S.btnAlt} onClick={() => finishCheck(true)}>CANCEL</button>
                </>
              ) : (
                <>
                  <span data-qa="timing-result" data-ok={check.ok ? '1' : '0'} style={{ fontWeight: 700, color: check.ok ? '#b8e6c1' : '#ffb4a2' }}>{check.line}</span>
                  <button style={S.btnAlt} onClick={startCheck}>CHECK AGAIN</button>
                  <button style={S.btnAlt} onClick={() => setCheck(null)}>CLOSE</button>
                </>
              )}
            </div>
          )}

          <div style={S.row}>
            <button style={{ ...S.btnAlt, ...(polished ? { background: '#ffb347', color: '#2a1a10' } : {}) }}
              onClick={() => setPolished(!polished)}>
              MASTER {polished ? 'ON' : 'OFF'}
            </button>
            <label style={{ fontSize: 12 }}>BPM {bpm}
              <input type="range" min={60} max={160} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
            </label>
            <label style={{ fontSize: 12 }}>SWING {(swing * 100) | 0}%
              <input type="range" min={0} max={40} value={swing * 100} onChange={(e) => setSwing(Number(e.target.value) / 100)} />
            </label>
            <button style={S.btnAlt} onClick={cellAssist}>
              ✦ CELL: LAY A FOUNDATION ({CELL_ASSIST_COST} Shards)
            </button>
          </div>

          {confirmClear && (
            <div data-qa="clear-confirm" role="group" aria-label="Clear the grid?" style={{ ...S.card, border: '1px solid #ffb4a2' }}>
              <span style={{ fontWeight: 700 }}>Clear all {gridHitCount(tracks)} hits from the grid?</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                {hiddenHits(tracks, caps) ? `${hiddenHits(tracks, caps)} of them are on rows ${caps.name} doesn't show. ` : ''}The rows stay; UNDO brings the hits back.
              </span>
              <button data-qa="clear-yes" style={S.btn} onClick={clearNow}>CLEAR</button>
              <button style={S.btnAlt} onClick={() => setConfirmClear(false)}>KEEP</button>
            </div>
          )}

          {/* MUSIC-SUITE P4: THE MIXER (ui/MixerStrip) at THE STUDIO — the ladder's "mix it"; its chip names it. A strip per
              row the grid draws (+ TAKES once there are takes) and the MASTER; every move is an undo step and autosaves.
              MUSIC-SUITE P4 FIX PASS (2026-09-25), owner decision #4 (the mixer is part of the pocket studio): MUTE / SOLO and
              the meters at EVERY tier (collapsed until opened — the ladder's worry was a full DAW on the first screen); the
              faders, sends and the master LEVEL at THE STUDIO (`full`). Okta's own tip asks a first-tier player to mute. */}
          {(() => {
            const strips = liveStripIds.map((id) => ({ id, label: id === TAKES_CHANNEL ? 'TAKES' : rowName(id) }));
            return (
              <MixerPanel rows={strips} mixer={mixerOf(project)} engine={ready ? engineRef.current : null} open={mixerOpen} onOpen={setMixerOpen}
                onStrip={stripChange} onMaster={masterChange} compact={layout.compact} S={S}
                full={caps.mixdown} fullNeeds={tierChips(progress).find((c) => c.tier === 'studio')?.needs ?? undefined} />
            );
          })()}

          <div style={S.row}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>KITS:</span>
            {(Object.keys(KIT_META) as KitId[]).map((k) => (
              <button key={k}
                style={{ ...S.btnAlt, ...(playingKit === k ? { background: '#7a5c9e', color: '#fff', border: '1px solid #7a5c9e' } : {}) }}
                onClick={() => pickKit(k)}>
                {KIT_META[k].label}{shop.owned.includes(k) ? '' : ` · ${KIT_META[k].unlockShards}◈`}
              </button>
            ))}
          </div>

          {/* MUSIC-SUITE P2 (2026-09-25): EVERY SPEND ASKS FIRST — inline, in the room (never window.confirm, which a
              phone browser can suppress and which stops the music clock's thread). 'Unlock NEON for 200 Shards?
              UNLOCK / CANCEL'. The yes is the only thing that charges (confirmSpend); a failure stays here, in words. */}
          {shop.pending && (() => {
            const c = confirmCopy(shop.pending, shop.shards);
            return (
              <div data-qa="shop-confirm" role="group" aria-label={c.question} style={{ ...S.card, border: '1px solid #ffd75e' }}>
                <span style={{ fontWeight: 700 }}>{c.question}</span>
                {c.balance && <span style={{ fontSize: 12, opacity: 0.75 }}>{c.balance}</span>}
                {/* MUSIC-SUITE P3 (2026-09-25): CELL PREVIEWS BEFORE IT CHARGES. The foundation is made at the ask, for the
                    rows the player can see; it is drawn here and HEAR IT plays it. BUY lays exactly this one. */}
                {shop.pending.kind === 'assist' && cellPreview && (
                  <div data-qa="cell-preview" style={{ width: '100%' }}>
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 3 }}>What BUY lays on your {Object.keys(cellPreview).length} rows (your other rows are untouched):</div>
                    <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${STEPS}, 1fr)`, gap: 2, maxWidth: 520 }}>
                      {heardTracks(tracks, caps).filter((t) => cellPreview[t.sampleId]).map((t) => (
                        <React.Fragment key={t.sampleId}>
                          <div style={{ fontSize: 10, opacity: 0.85 }}>{KIT_SLOTS.find((k) => k.id === t.sampleId)?.name ?? t.sampleId}</div>
                          {cellPreview[t.sampleId].map((on, i) => (
                            <div key={i} data-qa="cell-preview-step" data-on={on ? '1' : '0'} style={{ height: 10, borderRadius: 2, background: on ? '#22d3ee' : '#33244a' }} />
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                    <button data-qa="cell-hear" style={{ ...S.btnAlt, marginTop: 6, ...(hearPreview ? { background: '#22d3ee', color: '#101018', border: '1px solid #22d3ee' } : {}) }}
                      disabled={shop.busy} onClick={toggleHearPreview}>{hearPreview ? '■ STOP HEARING IT' : '▶ HEAR IT'}</button>
                  </div>
                )}
                <button data-qa="shop-yes" style={S.btn} disabled={shop.busy} onClick={() => void confirmSpend()}>
                  {shop.busy ? 'ONE MOMENT…' : c.yes}
                </button>
                <button data-qa="shop-no" style={S.btnAlt} disabled={shop.busy} onClick={() => shopDispatch({ type: 'cancel' })}>{c.no}</button>
                {shop.error && (
                  <span data-qa="shop-error" role="status" style={{ fontSize: 12, color: '#ffb4a2', width: '100%' }}>
                    {SPEND_FAILURE_TEXT[shop.error]}
                  </span>
                )}
              </div>
            );
          })()}

          <div style={S.row}>
            <button style={{ ...S.tab, ...(mode === 'build' ? S.tabOn : {}) }} onClick={() => setMode('build')}>BUILD</button>
            <button style={{ ...S.tab, ...(mode === 'perform' ? S.tabOn : {}) }} onClick={enterPerform}>PERFORM</button>
            {mode === 'perform' && (
              <>
                {/* MUSIC-SUITE P2: TAP fires on pointerdown — onClick waited for the RELEASE, a press's length after the
                    finger landed (assumption: ~100 ms; P1 timed Space held 114–195 ms in the dance room). A click still taps when nothing pressed first (e.detail 0: Enter on the focused button, or a
                    script's element.click()); a real mouse/touch click (detail >= 1) already tapped on its pointerdown. */}
                {/* MUSIC-SUITE P2 FIX PASS (2026-09-25): a mouse click focuses TAP, and a held Enter then clicked it on every
                    OS key repeat (headless Chromium: Enter down + 20 repeats = 21 taps; 20–30 a second alone scored C and
                    won). onKeyDown cancels a repeated Enter/Space, so a held key is one tap. */}
                <button style={{ ...S.btn, touchAction: 'manipulation', userSelect: 'none' }} data-qa="perform-tap"
                  onKeyDown={(e) => { if (isRepeatedActivation(e)) e.preventDefault(); }}
                  onPointerDown={(e) => { if (e.button === 0) performTap(); }}
                  onClick={(e) => { if (e.detail === 0) performTap(); }}>TAP</button>
                <span data-qa="perform-status" style={{ fontSize: 13 }}>{performStatusLine({ bars: setRef.current.bars, bar: perfBar, score, combo, judgement })}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>(or Space / J)</span>
                {/* A scored half needs a finish line, or it can never reach a card. STUDIO
                    has no END SET because a tool does not end — that is the whole split. */}
                <button style={S.btn} onClick={endSet}>END SET</button>
                {/* Only a staked set has a length, so only a staked set says so. */}
                {arenaSet && <span style={{ fontSize: 12, color: '#ffd75e' }}>{ARENA_SET_NOTE}</span>}
              </>
            )}
          </div>

          <div style={S.row}>
            <input placeholder="track title…" value={title} onChange={(e) => setTitle(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }} />
            <input placeholder="your Spotify/Apple link (optional)…" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9', minWidth: 220 }} />
            <button style={{ ...S.btn, ...(!libraryOpen ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }} disabled={saving || !libraryOpen} onClick={() => void publishTrack()}>
              {saving ? 'RENDERING…' : 'PUBLISH TO LIBRARY'}
            </button>
          </div>
          {/* MUSIC-SUITE P5 (decision #15): a song with an upload stays on this device — the room says why, in one line */}
          {privacy.private && <div data-qa="upload-private" role="note" style={{ fontSize: 12, color: '#ffd75e', marginTop: 6 }}>{privacy.line}</div>}

          {/* DANCE RHYTHM EXPORT. The chart is built from the song's own drums (music/DanceExport.ts), not from a seed, so the
              routine lands on the hits the player wrote. MUSIC-SUITE P3 (2026-09-25): at the tier the ladder names — THE
              GRID (it lived in the song panel, which mounts at THE CHAIN). The chain once there is one, else the grid looped;
              only the rows the room draws and plays; under the project's own id and title. */}
          {caps.danceExport && danceSong && (
            <div style={S.row}>
              <button data-qa="dance-export" disabled={!danceOpen}
                style={{ ...S.btnAlt, ...(dancedSig === danceSig ? { background: '#4FD1E8', color: '#101018', border: '1px solid #4FD1E8' } : {}), ...(!danceOpen ? { opacity: 0.45 } : {}) }}
                onClick={sendToDance}>
                {dancedSig === danceSig ? '✓ ON THE DANCE FLOOR' : '♪ SEND TO THE DANCE FLOOR'}
              </button>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{danceSong.from === 'chain' ? 'your song, as chained' : 'your grid, looped'}</span>
            </div>
          )}

        </>
      )}

      {/* MUSIC-SUITE P3 (2026-09-25): the SONG panel stays MOUNTED off the STUDIO tab (hidden), so song mode keeps swapping
          sections on the bar line and a take keeps recording while the player is on another tab (MUSIC-SUITE P3 FIX PASS:
          its STOP button is inside this hidden panel, so the room shows its own "● TAKE RECORDING — STOP" chip there). It was
          inside the STUDIO block and unmounted on every tab switch, taking its sections, chain and takes with it (P1:
          sections 1 → 0). Its song is the project's (sections, chain, takes), keyed by the open project. */}
      {caps.arrangement ? (
        <div data-qa="song-panel" style={view === 'studio' ? undefined : { display: 'none' }}>
          {/* MUSIC-SUITE P3 (tier-honesty-editing): SongPanel no longer writes the grid (song mode is a separate playback
              source, shown read-only in the grid above); its takes and its song render follow the tier. */}
          <SongPanel key={room.generation}
            engine={engineRef.current} tracks={tracks} playing={playing}
            bpm={bpm} steps={STEPS} say={say} S={S} swing={swing}
            onSectionSaved={() => noteProgress('section')}
            onChained={() => noteProgress('chain')}
            song={{ id: project.id, title: project.title, sections: project.sections, chain: project.chain, takes: project.takes }}
            onSongChange={songChange} saveAudio={room.saveAudio} loadAudio={room.loadAudio}
            onRendered={room.noteCreation} onRecording={(on, what) => { setTakeRec(on); setTakeWhat(what ?? 'take'); }} onTake={takeRecorded} stopRef={takeStopRef}
            onTransport={boothTransport}
            songMode={songMode} onSongMode={(on) => { if (on) setHearPreview(false); setSongMode(on); }} onSongNow={songNowChanged}
            caps={{ takes: caps.takes, mixdown: caps.mixdown }}
            barSounds={songRenderSounds}
          />
        </div>
      ) : null}

      {view === 'studio' && (
        <>
          {/* What opens next is on the tier chips above the grid (MUSIC-SUITE P3), not a locked control. */}
          <div style={S.mentor}>{tip}</div>
        </>
      )}

      {(view === 'library' || view === 'creator') && (
        <>
          {view === 'library' && (
            <div style={S.row}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>CREATORS:</span>
              {creators.length === 0 && <span style={{ fontSize: 12, opacity: 0.6 }}>nothing published yet — be first</span>}
              {creators.map(([id, name]) => (
                <button key={id} style={S.btnAlt} onClick={() => { setCreatorId(id); setView('creator'); }}>
                  {name} ({StudioLibrary.byAuthor(id).length})
                </button>
              ))}
            </div>
          )}
          {(view === 'creator' && creatorId ? StudioLibrary.byAuthor(creatorId) : allTracks).map((t) => (
            <div key={t.id} style={S.card}>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700 }}>{t.title}</div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  {t.authorName} · {KIT_META[t.kit].label} · {t.bpm}bpm{t.key ? ` · ${keySignature(t.key)}` : ''}{t.polished ? ' · mastered' : ''}
                  {t.remixOf ? ` · remix of "${t.remixOf.title}"` : ''}
                  {t.isWalkOut ? ' · your walk-out' : ''}{t.audio === 'visit' ? ' · this visit only' : t.audio === 'none' ? ' · no audio on this device' : ''}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{t.plays} plays · {t.saves} saves</div>
              </div>
              <button style={S.btn} onClick={() => playRecord(t)}>▶ PLAY</button>
              <button style={S.btnAlt} onClick={() => { const kept = StudioLibrary.saveToMyLibrary(t.id); setLibraryRev((r) => r + 1); if (kept) { say('Saved to your library'); setLibraryLine(null); } else setLibraryLine("Could not save — this device's storage is full"); }}>
                {StudioLibrary.mySavedIds().includes(t.id) ? 'SAVED ✓' : '+ SAVE'}
              </button>
              <button style={S.btnAlt} title={switchLock ?? undefined} onClick={() => startRemix(t)}>REMIX</button>
              {/* MUSIC-SUITE P3: delete, asked first (LibraryDelete.tsx) — a full library now has a way out.
                  MUSIC-SUITE P3 FIX PASS: on YOUR songs only (it was offered on every author's, another player's walk-out
                  included); a legacy 'me' row is the device owner's until the per-player library split lands. */}
              {(t.authorId === me || t.authorId === 'me') && (
                <LibraryDelete track={t} btnStyle={S.btnAlt} onDone={(line, ok) => { setLibraryRev((r) => r + 1); if (ok) { say(line); setLibraryLine(null); } else setLibraryLine(line); }} />
              )}
              {(t.streamingLinks ?? []).map((l) => (
                <button key={l.url}
                  style={{ ...S.btnAlt, borderColor: PROVIDER_META[l.provider].color, color: PROVIDER_META[l.provider].color }}
                  onClick={() => setOpenEmbed(openEmbed === t.id ? null : t.id)}>
                  ▶ {PROVIDER_META[l.provider].label.toUpperCase()}
                </button>
              ))}
              {openEmbed === t.id && (t.streamingLinks ?? []).length > 0 && (
                <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden' }}>
                  <iframe
                    title={`${t.title} — streaming`}
                    src={t.streamingLinks[0].embedUrl}
                    width="100%" height={152} frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy" style={{ display: 'block' }} />
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {toast && <div data-qa="toast" data-spot={toastAt} role="status" aria-live="polite" style={S.toast}>{toast}</div>}
    </div>
  );
}
