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

import React, { useEffect, useMemo, useRef, useState, useCallback, useReducer } from 'react';
import { AudioEngine, type TrackState } from './AudioEngine';
import { synthesizeKit, KIT_SLOTS, KIT_META, type KitId } from './SynthKit';
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
// MUSIC-SUITE P3 FIX PASS (2026-09-25): which sound each Flip row plays — the open project's, and only its.
import { openFlipRowSounds, reloadFlipRowSounds } from './flipRowSounds';
// MUSIC-SUITE P3 (2026-09-25), tier-honesty-editing: the edit rules (undo, sections, CLEAR, CELL's preview, the chops a
// publish carries) and the dance export's tier gate.
import {
  EditHistory, applyFoundation, cellFoundation, chopSignature, clearGrid, foundationPreview, gridHitCount, historyAudioKeys, playbackSource,
  previewTracks, publishRender, publishTracks, publishedAudioKeys, remixSeed, sameSlice, shownSection, toggleStep, undoSlice, type UndoSlice,
} from './studioEdit';
import { danceSongAtTier, exportSongToDance, saveExportedTrack } from './DanceExport';
import { chopBuffer, monoOf, sourceKey, type DecodedSource } from './FlipPad';
import { padFromAction } from './Flip';
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
import { loadRoomCalibration } from '@/lib/feel/rhythm-calibrate';
// MUSIC-SUITE P2 (2026-09-25): the room's shop — ask first, typed answers, the account's kits, a remix that never buys.
import {
  DEFAULT_KIT, SPEND_FAILURE_TEXT, SPEND_REFUSED, SPEND_UNREACHABLE, assistSpend, confirmCopy, initialShop, kitSpend, readKitCache,
  remixKit, remixKitNote, shopReducer, spendReason, writeKitCache,
  type PendingSpend, type ReadOwnedKits, type ShardSpend, type ShardSpendResult,
} from './purchases';

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
  const songChange = useCallback((fn: (s: SongSlice) => SongSlice) =>
    edit((p) => ({ ...p, ...fn({ sections: p.sections, chain: p.chain, takes: p.takes }) })), [edit]);
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
  /**
   * MUSIC-SUITE P3 FIX PASS: why the open project can't be switched right now — ONE rule for MY PROJECTS and REMIX (REMIX
   * got past the hold: a take recording landed in the remix, and a PERFORM set's grid was swapped mid-set).
   */
  const switchLock = mode === 'perform' ? 'End the set to switch projects' : takeRec || micRec ? 'Stop the recording first' : null;

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
  const flipTrigger = useRef<((pad: number) => void) | null>(null);   // filled by FlipPad; hit by paired phones

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const t = setInterval(() => setTip(OKTA_TIPS[Math.floor(Math.random() * OKTA_TIPS.length)]), 14000);
    return () => clearInterval(t);
  }, []);

  const say = useCallback((msg: string) => {
    setToast(msg);
    // MUSIC-SUITE P3 FIX PASS (2026-09-25): clear THIS line only — every say scheduled a blind clear, so an older line's
    // timer wiped a newer one early (a save-failure or "turn SONG MODE off" line vanished in ~200 ms; measured in the probe)
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2200);
  }, []);
  sayLater.current = say;   // MUSIC-SUITE P3: the project hook speaks through the room's toast

  // MUSIC-SUITE P3 (2026-09-25): the library's first-read work — moving pre-P3 songs' audio out of localStorage, repairing
  // the walk-out's copy, clearing audio a failed delete left — then a re-read, and any line it has for the player.
  useEffect(() => {
    let live = true;
    void StudioLibrary.ready().then((rep) => {
      if (!live) return;
      setLibraryRev((r) => r + 1);
      if (rep.lines.length) say(rep.lines.join(' · '));
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
      if (modeRef.current !== 'perform') return;
      const set = setRef.current;
      set.latencySec = performLatencySec({
        savedOffsetMs: savedOffsetRef.current, outputLatency: eng.context.outputLatency, baseLatency: eng.context.baseLatency,
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

  /** One Flip row's chop, decoded from its source and cut at the rate it was sliced at. */
  const chopFor = useCallback(async (row: ProjectFlipRow): Promise<AudioBuffer> => {
    const d = await loadFlipSource(row.source);
    const eng = engineRef.current;
    if (!eng) throw new Error('the studio is still starting');
    return chopBuffer(eng.context, d, row.slice, row.reverse, row.rate);
  }, [loadFlipSource]);
  const sayGone = useCallback((gone: readonly string[]): void => {
    if (gone.length) say(`${gone.join(', ')}: the sound isn't on this device any more — the row is silent until you send a pad to ${gone.length === 1 ? 'it' : 'them'} again`);
  }, [say]);

  // MUSIC-SUITE P3 FIX PASS: a project opened — the engine forgets every Flip sound first (flipRowSounds.openFlipRowSounds),
  // so a row whose chop can't be had plays nothing instead of the last project's chop. The kit and MASTER follow their
  // own effects.
  useEffect(() => {
    if (!ready || !room.restored) return;
    const eng = engineRef.current;
    if (!eng) return;
    let alive = true;
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
      if (!playing) togglePlay();
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

  /** A cell, by row id (the grid draws a filtered list, so its index is not the project's). An undo step. */
  const toggleCell = (sampleId: string, si: number): void => {
    if (gridLock === 'song') { say(`SONG MODE is playing "${songSection?.name ?? 'the song'}" — turn it off to edit your own grid`); return; }
    if (gridLock === 'preview') { say("That's CELL's preview — BUY it or CANCEL to edit your grid"); return; }
    edit((p) => ({ ...p, tracks: toggleStep(p.tracks, sampleId, si) }));
  };

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
    if (eng) void reloadFlipRowSounds(eng, cur.flipRows, to.flipRows, chopFor, () => genRef.current === gen).then((gone) => { if (genRef.current === gen) sayGone(gone); });
    const done = dir === 'undo' ? 'Undone' : 'Redone';
    say(gridLock === 'song' ? `${done} (your own grid, hidden under SONG MODE)` : done);
  };
  const stepHistoryRef = useRef(stepHistory); stepHistoryRef.current = stepHistory;
  // ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo — on the STUDIO tab only (the FLIP tab's keys are its pads), and
  // never while typing in a field (a title, a section's new name).
  useEffect(() => {
    if (view !== 'studio') return;
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); stepHistoryRef.current(e.shiftKey ? 'redo' : 'undo'); }
      else if (k === 'y') { e.preventDefault(); stepHistoryRef.current('redo'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  /** CLEAR (asked first): every step off, every row kept. An undo step. */
  const clearNow = (): void => {
    setConfirmClear(false);
    edit((p) => ({ ...p, tracks: clearGrid(p.tracks) }));
    say('Grid cleared — UNDO brings it back');
  };

  // MUSIC-SUITE P3: SEND TO THE DANCE FLOOR at the tier the ladder names (the GRID): the chain once there is one, else the
  // grid itself looped — only the rows the room draws and plays (DanceExport.danceSongAtTier).
  const danceSong = useMemo(() => danceSongAtTier({
    danceExport: caps.danceExport, arrangement: caps.arrangement, chain: project.chain, sections: project.sections, grid: tracks,
    heard: (t) => shownIds.has(t.sampleId),
  }), [caps.danceExport, caps.arrangement, project.chain, project.sections, tracks, shownIds]);
  const danceSig = JSON.stringify([project.id, project.title, bpm, danceSong]);
  const sendToDance = (): void => {
    if (!danceSong) return;
    const out = exportSongToDance({ id: project.id, name: project.title, bpm, steps: STEPS, ...danceSong });
    if (!out) { say('nothing to dance to yet — put a hit in the grid first'); return; }
    // MUSIC-SUITE P3 FIX PASS: the write can fail (a full localStorage, private mode) — then it was NOT sent, and says so
    if (!saveExportedTrack(out)) { say("Not sent — this browser wouldn't keep the dance export (storage full or private mode). Free some space and send it again."); return; }
    setDancedSig(danceSig);
    say(`"${out.track.name}" sent to the dance floor · ${out.summary.hits} hits · ${out.track.bars} bars${danceSong.from === 'grid' ? ' (your grid, looped)' : ''} · ${'●'.repeat(out.track.difficulty)}`);
  };

  const togglePlay = (): void => {
    const eng = engineRef.current;
    if (!eng) return;
    if (playing) { eng.stop(); setPlaying(false); setPlayhead(-1); }
    else {
      eng.start(); setPlaying(true);
    }
  };

  // MUSIC-SUITE P2: one tap, from the TAP button's pointerdown or the keyboard's Space / J. The judge takes the nearest
  // note by signed error, so the line says which side it landed on (GOOD · EARLY 112ms), not just that it landed.
  const performTap = useCallback((): void => {
    const eng = engineRef.current;
    if (!eng || modeRef.current !== 'perform') return;
    const set = setRef.current;
    set.tap(eng.context.currentTime);
    showTally(set, 0);   // a tap that must WAIT for its note (not scheduled yet) shows when it settles
  }, [showTally]);

  // MUSIC-SUITE P2: PERFORM on the keyboard — Space and J, judged on keydown (a held key is one tap, e.repeat is
  // ignored). Neither is a Flip pad key (Flip.ts PAD_KEYS: 1-4 / q-r / a-f / z-v), and the Flip's own listener only exists
  // while FlipPad is mounted, i.e. on the FLIP tab (FlipPad.tsx:99-101); this one only on the STUDIO tab in PERFORM.
  // Space is taken on keyup too: a focused button (PLAY!) activates on Space's keyup and would stop the music mid-set.
  // Typing in a field is left alone.
  useEffect(() => {
    if (mode !== 'perform' || view !== 'studio') return;
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
  }, [mode, view, performTap]);

  const publishTrack = async (): Promise<void> => {
    const eng = engineRef.current;
    if (!eng || saving) return;
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
      const blob = await eng.renderMixdown(2, render.tracks, render.swing);
      room.noteCreation();   // MUSIC-SUITE P3: a render counts toward the day's creation session (the streak)
      const pub = publishTracks(tracks, project.flipRows, shownIds);
      const res = await StudioLibrary.publishWithAudio({
        // MUSIC-SUITE P3 FIX PASS: the signed-in player is the author (GameShell passes no `profile`, so every song was
        // 'me'), and the kit is the one that PLAYED in the render
        title: title.trim(), authorId: me, authorName: profile.name,
        kit: playingKit, bpm, swing, polished,
        sequencer: { bpm, steps: STEPS, tracks: pub.tracks, swing },
        remixOf,
        streamingLinks: link ? [link] : [],
      }, blob);
      if (!res.ok) { say(res.line); return; }
      onPublish?.(res.rec);                   // Creator Card pipeline hook (M28 contract)
      setLibraryRev((r) => r + 1);
      const left = pub.silent.length ? ` · ${pub.silent.length} Flip row${pub.silent.length === 1 ? '' : 's'} with no sound left out` : '';
      say(res.line ? `"${res.rec.title}" published — ${res.line}${left}` : `"${res.rec.title}" published to the Academy library${left}`);
      setTitle(''); setStreamUrl('');
    } catch (e) {
      say(`Could not publish (${e instanceof Error ? e.name : 'error'}) — nothing was saved; try again`);
    } finally {
      setSaving(false);
    }
  };

  // MUSIC-SUITE P3: a song's audio is fetched from the store (an object URL), so PLAY waits for it; a song whose audio is
  // not on this device says so instead of a silent Audio('') that never starts.
  const playRecord = (t: TrackRecord): void => {
    playerRef.current?.pause();
    void StudioLibrary.audioSource(t.id).then((src) => {
      if (!src.ok) { say(src.line); return; }
      const el = new Audio(src.src);
      playerRef.current?.pause();
      playerRef.current = el;
      void el.play().then(() => {
        StudioLibrary.countPlay(t.id);        // counted when audio actually starts, as the doc on countPlay says
        setLibraryRev((r) => r + 1);
      }).catch(() => say('This browser would not start the audio — tap PLAY again'));
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
    const seed = remixSeed(r.sequencer.tracks);
    // MUSIC-SUITE P3 FIX PASS: MASTER comes along (a remix of a mastered song opened with MASTER off), and the remix-kit
    // note belongs to the remix project it was said about; nothing is said if the switch was refused (unsaved work)
    const note = remixKitNote(plan);
    void room.ops.create({ title: `Remix · ${t.title}`, tracks: seed.tracks, flipRows: seed.flipRows, bpm: r.bpm, swing: r.swing, kit: plan.kit, remixOf: r.remixOf, polish: r.polished }).then((id) => {
      if (!id) return;
      setRemixNote(note ? { id, line: note } : null);
      setView('studio');
      const dropped = seed.dropped.length ? ` · ${seed.dropped.length} Flip row${seed.dropped.length === 1 ? '' : 's'} came without ${seed.dropped.length === 1 ? 'its' : 'their'} sound and ${seed.dropped.length === 1 ? 'was' : 'were'} left out` : '';
      say((plan.locked
        ? `Remixing "${t.title}" on ${KIT_META[plan.kit].label} — ${KIT_META[plan.locked].label} is locked; nothing was charged`
        : `Remixing "${t.title}" — credit stays with ${t.authorName}`) + dropped);
    });
  };

  // ── styles (warm music-school palette; deliberately NOT the neon bezel) ──
  const S: Record<string, React.CSSProperties> = {
    root: { fontFamily: 'inherit', color: '#f5ead9', background: 'linear-gradient(165deg,#2a1a3a 0%,#3a1f2e 55%,#402a18 100%)', minHeight: '100%', padding: 16, borderRadius: 12 },
    header: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 },
    h1: { fontSize: 22, fontWeight: 800, letterSpacing: 1, color: '#ffd75e' },
    tabs: { display: 'flex', gap: 8, margin: '10px 0' },
    tab: { padding: '6px 14px', borderRadius: 20, border: '1px solid #7a5c9e', background: 'transparent', color: '#e8d9c2', cursor: 'pointer' },
    tabOn: { background: '#7a5c9e', color: '#fff' },
    grid: { display: 'grid', gridTemplateColumns: `90px repeat(${STEPS}, 1fr)`, gap: 3, marginTop: 8 },
    cell: { aspectRatio: '1', borderRadius: 4, border: '1px solid #5a4470', background: '#33244a', cursor: 'pointer' },
    cellOn: { background: '#ffb347', borderColor: '#ffd75e' },
    cellHead: { outline: '2px solid #22d3ee' },
    label: { fontSize: 11, alignSelf: 'center', opacity: 0.9 },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#2a1a10', fontWeight: 700, cursor: 'pointer' },
    btnAlt: { padding: '8px 14px', borderRadius: 8, border: '1px solid #ffb347', background: 'transparent', color: '#ffd75e', cursor: 'pointer' },
    mentor: { marginTop: 12, padding: '8px 12px', borderLeft: '3px solid #ffd75e', background: 'rgba(255,215,94,0.08)', fontStyle: 'italic', fontSize: 13 },
    card: { padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.25)', marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    toast: { position: 'sticky', bottom: 8, marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#7a5c9e', color: '#fff', width: 'fit-content' },
  };

  // ONE WAY INTO PERFORM. The set clock starts here and nowhere else — when this was
  // only stamped on the splash's READY tap, a player who built for ten minutes and then
  // tapped PERFORM reported the whole ten minutes as their set. That is the "both" path,
  // and it is the normal one: the stage pick chooses where you land, not where you stay.
  const enterPerform = useCallback(() => {
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
    <div style={S.root}>
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

      {/* MUSIC-SUITE P3 FIX PASS: a take keeps recording while its panel is hidden on another tab — its STOP is here too */}
      {takeRec && view !== 'studio' && (
        <div data-qa="take-recording-chip" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
          <button style={{ ...S.btn, background: '#ff5c5c', color: '#fff' }} onClick={() => takeStopRef.current?.()}>● TAKE RECORDING — STOP</button>
          <span style={{ fontSize: 12, opacity: 0.75 }}>the take lands in &quot;{project.title}&quot;</span>
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

      {view === 'listen' && <StreamingDeck />}

      {view === 'flip' && (
        <>
          {/* M1b: pair a phone — its 4×4 pad bank hits these pads (controller link, room code + QR in the badge) */}
          <HostLobby config={MODE_CONTROLLERS.music_flip} collapsed onInput={(ev) => { const i = padFromAction(ev.a); if (i >= 0) flipTrigger.current?.(i); }} />
          <FlipPad engine={engineRef.current} playing={playing} playhead={playhead} steps={STEPS} say={say} triggerRef={flipTrigger}
            /* MUSIC-SUITE P3 (2026-09-25): the FLIP tab's source + chops are the project's (FlipPad remounts on every tab
               switch and restores from here); a pad sent or recorded to the grid brings its exact chop, so the row keeps
               sounding after a reload — and a recorded pad now loads its buffer (P1: flip_1 written but silent). */
            flip={project.flip} onFlipChange={flipChange} loadSource={loadFlipSource} saveAudio={room.saveAudio} onRecording={setMicRec}
            projectId={project.id} rowSourceKeys={new Set(project.flipRows.map((r) => sourceKey(r.source)))}
            /* MUSIC-SUITE P3 (tier-honesty-editing): the row a pad lands on is DRAWN now (the Flip section under the kit
               rows, every tier), the pad shows it has one, and a send or a burst of recorded hits is one undo step. */
            rowPads={new Set(project.flipRows.map((r) => r.pad))}
            onAssign={(_pad, buffer, row) => {
              engineRef.current?.loadBuffer(row.sampleId, row.label, buffer, 'melody');
              edit((p) => withFlipRow(p, row));
            }}
            onRecordHit={(pad, step, chop) => {
              // MUSIC-SUITE P3 FIX PASS: a row that holds ANOTHER chop (sent from an earlier source, or one that failed to
              // load after a reload) takes the pad's chop on the first recorded hit — what the taps sound like is what the
              // row plays. One undo step with the burst.
              const differs = (p: StudioProject): boolean => {
                const r = p.flipRows.find((x) => x.sampleId === chop.row.sampleId);
                return !r || chopSignature(r) !== chopSignature(chop.row);
              };
              const had = projectRef.current.flipRows.some((r) => r.sampleId === chop.row.sampleId);
              if (differs(projectRef.current)) {
                engineRef.current?.loadBuffer(chop.row.sampleId, chop.row.label, chop.buffer, 'melody');
                if (had) say(`${chop.row.label} now plays pad ${pad + 1}'s chop (it replaced the row's old one — UNDO puts it back)`);
              }
              edit((p) => withFlipHit(differs(p) ? withFlipRow(p, chop.row) : p, chop.row.sampleId, step), 'flip-rec');
            }} />
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
          {(() => {
            const rows = visibleRows(gridTracks, caps);
            const flipName = (id: string): string => {
              const r = project.flipRows.find((x) => x.sampleId === id);
              return r ? `${r.label} · ${r.source.label}` : `FLIP ${Number(id.slice(5)) + 1}`;
            };
            const row = (t: TrackState) => (
              <React.Fragment key={t.sampleId}>
                <div style={S.label} data-qa="grid-row" data-row={t.sampleId}>{KIT_SLOTS.find((k) => k.id === t.sampleId)?.name ?? flipName(t.sampleId)}</div>
                {t.pattern.map((on, si) => (
                  <div key={si} data-qa="cell" data-row={t.sampleId} data-step={si} data-on={on ? '1' : '0'}
                    style={{ ...S.cell, ...(on ? S.cellOn : {}), ...(playhead === si ? S.cellHead : {}), ...(gridLock ? { cursor: 'not-allowed' } : {}) }}
                    onClick={() => toggleCell(t.sampleId, si)} />
                ))}
              </React.Fragment>
            );
            return (
              <>
                <div style={S.grid} data-qa="kit-grid">{rows.kit.map(row)}</div>
                {rows.flip.length > 0 && (
                  <>
                    <div data-qa="flip-rows-head" style={{ fontSize: 11, opacity: 0.8, marginTop: 10 }}>
                      FLIP ROWS — pads you sent from the FLIP tab ({rows.flip.length}) · every pad gets a row, at every tier
                    </div>
                    <div style={S.grid} data-qa="flip-grid">{rows.flip.map(row)}</div>
                  </>
                )}
              </>
            );
          })()}
          {!gridLock && hiddenHits(tracks, caps) > 0 && (
            <div data-qa="hidden-hits" style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
              {hiddenHits(tracks, caps)} hit{hiddenHits(tracks, caps) === 1 ? '' : 's'} sit on rows {caps.name} doesn&apos;t show yet — silent until a tier opens them.
            </div>
          )}

          <div style={S.row}>
            <button style={S.btn} onClick={togglePlay}>{playing ? 'STOP' : 'PLAY'}</button>
            {/* MUSIC-SUITE P3: UNDO / REDO (⌘Z / ⇧⌘Z) and CLEAR (asked first) */}
            <button data-qa="undo" style={S.btnAlt} disabled={!histDepth.undo} onClick={() => stepHistory('undo')} title="Undo (⌘Z / Ctrl+Z)">UNDO</button>
            <button data-qa="redo" style={S.btnAlt} disabled={!histDepth.redo} onClick={() => stepHistory('redo')} title="Redo (⇧⌘Z / Ctrl+Y)">REDO</button>
            <button data-qa="clear" style={S.btnAlt} disabled={!!gridLock || gridHitCount(tracks) === 0} onClick={() => setConfirmClear(true)}>CLEAR</button>
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

          <div style={S.row}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>KITS:</span>
            {(Object.keys(KIT_META) as KitId[]).map((k) => (
              <button key={k}
                style={{ ...S.btnAlt, ...(playingKit === k ? { background: '#7a5c9e', color: '#fff', borderColor: '#7a5c9e' } : {}) }}
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
                    <button data-qa="cell-hear" style={{ ...S.btnAlt, marginTop: 6, ...(hearPreview ? { background: '#22d3ee', color: '#101018', borderColor: '#22d3ee' } : {}) }}
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
            <button style={S.btn} disabled={saving} onClick={() => void publishTrack()}>
              {saving ? 'RENDERING…' : 'PUBLISH TO LIBRARY'}
            </button>
          </div>

          {/* DANCE RHYTHM EXPORT. The chart is built from the song's own drums (music/DanceExport.ts), not from a seed, so the
              routine lands on the hits the player wrote. MUSIC-SUITE P3 (2026-09-25): at the tier the ladder names — THE
              GRID (it lived in the song panel, which mounts at THE CHAIN). The chain once there is one, else the grid looped;
              only the rows the room draws and plays; under the project's own id and title. */}
          {caps.danceExport && danceSong && (
            <div style={S.row}>
              <button data-qa="dance-export"
                style={{ ...S.btnAlt, ...(dancedSig === danceSig ? { background: '#4FD1E8', color: '#101018', borderColor: '#4FD1E8' } : {}) }}
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
            onRendered={room.noteCreation} onRecording={setTakeRec} onTake={takeRecorded} stopRef={takeStopRef}
            songMode={songMode} onSongMode={(on) => { if (on) setHearPreview(false); setSongMode(on); }} onSongNow={setSongNow}
            caps={{ takes: caps.takes, mixdown: caps.mixdown }}
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
                  {t.authorName} · {KIT_META[t.kit].label} · {t.bpm}bpm{t.polished ? ' · mastered' : ''}
                  {t.remixOf ? ` · remix of "${t.remixOf.title}"` : ''}
                  {t.isWalkOut ? ' · your walk-out' : ''}{t.audio === 'visit' ? ' · this visit only' : t.audio === 'none' ? ' · no audio on this device' : ''}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{t.plays} plays · {t.saves} saves</div>
              </div>
              <button style={S.btn} onClick={() => playRecord(t)}>▶ PLAY</button>
              <button style={S.btnAlt} onClick={() => { const kept = StudioLibrary.saveToMyLibrary(t.id); setLibraryRev((r) => r + 1); say(kept ? 'Saved to your library' : "Could not save — this device's storage is full"); }}>
                {StudioLibrary.mySavedIds().includes(t.id) ? 'SAVED ✓' : '+ SAVE'}
              </button>
              <button style={S.btnAlt} title={switchLock ?? undefined} onClick={() => startRemix(t)}>REMIX</button>
              {/* MUSIC-SUITE P3: delete, asked first (LibraryDelete.tsx) — a full library now has a way out.
                  MUSIC-SUITE P3 FIX PASS: on YOUR songs only (it was offered on every author's, another player's walk-out
                  included); a legacy 'me' row is the device owner's until the per-player library split lands. */}
              {(t.authorId === me || t.authorId === 'me') && (
                <LibraryDelete track={t} btnStyle={S.btnAlt} onDone={(line) => { setLibraryRev((r) => r + 1); say(line); }} />
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

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}
