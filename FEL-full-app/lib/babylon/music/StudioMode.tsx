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

import React, { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { AudioEngine, type SequencerState, type TrackState } from './AudioEngine';
import { synthesizeKit, KIT_SLOTS, KIT_META, type KitId } from './SynthKit';
import { StudioLibrary, blobToDataUrl, type TrackRecord } from './StudioLibrary';
import { parseStreamingUrl, PROVIDER_META } from './StreamingBridge';
import StreamingDeck from './StreamingDeck';
import FlipPad from './FlipPad';   // lane 2 M1 — the chop pad
import SongPanel from './SongPanel';   // lane 2 M2–M4 — sections, chain, take, stems
import { padFromAction } from './Flip';
import { HostLobby } from '@/components/controller-link/host-lobby';   // M1b — the phone is the pad controller
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { BootSplash } from '@/components/games/boot-splash';
import { readMusicStage } from './musicStage';
import {
  advance as advanceProgress, isRealPattern, nextUnlock, readProgress, tierDef, tierFor, writeProgress,
  type MusicProgress,
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

function emptyTracks(): TrackState[] {
  return KIT_SLOTS.map((k) => ({
    sampleId: k.id, pattern: new Array<boolean>(STEPS).fill(false),
    volume: 0.8, muted: false, pan: 0,
  }));
}

/** CELL SEAM — today: a real local generator that writes a musically
 *  sensible foundation (kick/snare/hat/bass locked to each other). This
 *  function is exactly where a real Cell/Nexus LLM call plugs in: same
 *  input (current state), same output (a new pattern set). */
function cellFoundation(seed = Date.now()): Record<string, boolean[]> {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const P = (): boolean[] => new Array<boolean>(STEPS).fill(false);
  const kick = P(), snare = P(), hat = P(), open = P(), clap = P(), bass = P(), lead = P(), fx = P();
  for (const i of [0, 4, 8, 12]) kick[i] = true;
  if (rnd() < 0.5) kick[10] = true; else kick[14] = true;             // one syncopated push
  snare[4] = true; snare[12] = true;
  if (rnd() < 0.35) clap[12] = true;                                  // layered backbeat sometimes
  for (let i = 0; i < STEPS; i += 2) hat[i] = true;
  hat[Math.floor(rnd() * 8) * 2] = false;                             // one gap breathes
  if (rnd() < 0.5) open[14] = true;
  for (const i of [0, 3, 8, 11]) if (rnd() < 0.85) bass[i] = true;    // follows the kick's pocket
  const leadHits = 2 + Math.floor(rnd() * 2);
  for (let n = 0; n < leadHits; n++) lead[(2 + Math.floor(rnd() * 6) * 2 + 1) % STEPS] = true;
  if (rnd() < 0.4) fx[15] = true;
  return { kick, snare, hat, open, clap, bass, lead, fx };
}

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
}) {
  const engineRef = useRef<AudioEngine | null>(null);
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
  const [bpm, setBpm] = useState(92);
  const [swing, setSwing] = useState(0.15);
  const [tracks, setTracks] = useState<TrackState[]>(emptyTracks());

  // THE LADDER, FINALLY READ. MusicTiers has existed since 2026-09-13 with a header explaining that the room
  // "shipped M1-M4 all at once ... a player who opens it meets ALL of it — a full DAW on the first visit. That
  // is the actual problem this closes." Nothing imported it, so the problem was never closed: a first-time
  // player still met eight tracks, sections, a chain, takes, stems and a render on the opening screen.
  const [progress, setProgress] = useState<MusicProgress>(() => readProgress());
  const tier = tierFor(progress);
  const caps = tierDef(progress);
  const opensNext = nextUnlock(progress);

  /**
   * THE GRID'S GATE. Watching the state rather than a click handler, for two reasons found the hard way:
   * tying it to the PLAY press read a `tracks` the closure had already gone stale on, so the chain never
   * opened at all — and doing it inside the setTracks updater made the updater impure, which React's
   * StrictMode duly double-invoked and counted one click as two patterns.
   *
   * An effect on `tracks` is the honest place: it runs after the state is real, exactly once per change.
   */
  useEffect(() => {
    if (progress.patternsMade > 0) return;   // the gate only has to open once
    if (isRealPattern(tracks)) noteProgress('pattern');
  }, [tracks, progress.patternsMade]);

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
  const [kit, setKit] = useState<KitId>('street');
  /** The kit the room is loading or has loaded — set at the call, so a revoke check never races the synth. */
  const kitRef = useRef<KitId>('street');
  // MUSIC-SUITE P2 (2026-09-25): THE ROOM'S SHOP (purchases.ts shopReducer). Kits owned used to be this device's
  // localStorage alone ('fel_studio_kits_v1', read raw — a hand edit to '["street","neon","dust"]' unlocked both paid
  // kits, since kits are synthesised on the client). Now the account's list from GET /api/music/unlock replaces it at
  // mount and the key is only a cache (cleaned: only real kit ids, the free kit always in). A tap on a kit you don't
  // own, or on CELL, only ASKS; the one charge is confirmSpend, behind the confirm's yes.
  const [shop, shopDispatch] = useReducer(shopReducer, undefined, () => initialShop(readKitCache(kitStorage())));
  const shopRef = useRef(shop);
  useEffect(() => { shopRef.current = shop; }, [shop]);
  const spendingRef = useRef(false);   // one yes, one purchase: a second press before the re-render is ignored
  /** Why a remix opened on another kit than the track's own (shown under the remix banner while it lasts). */
  const [remixNote, setRemixNote] = useState<string | null>(null);
  const [polished, setPolished] = useState(false);
  const [title, setTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [openEmbed, setOpenEmbed] = useState<string | null>(null);   // trackId whose embed is expanded
  const [remixOf, setRemixOf] = useState<TrackRecord['remixOf']>(null);
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
    setTimeout(() => setToast(''), 2200);
  }, []);

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

  useEffect(() => {
    engineRef.current?.setState({ bpm, steps: STEPS, tracks, swing });
  }, [bpm, tracks, swing]);

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

  /** Load a kit the account owns. Never charges. */
  const loadKit = useCallback(async (id: KitId, announce = true): Promise<void> => {
    kitRef.current = id;
    const buffers = await synthesizeKit(id);
    if (kitRef.current !== id) return;   // a later pick won the race to the synth
    engineRef.current?.swapKit(buffers);
    setKit(id);
    if (announce) say(`${KIT_META[id].label} kit loaded`);
  }, [say]);

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
    }, () => { /* the cache stands */ });
  }, [readOwnedKits]);
  useEffect(() => { refreshOwned(); }, [refreshOwned]);

  // The cache follows the room's list: the server's once it answered, plus what was bought here since.
  useEffect(() => { writeKitCache(kitStorage(), shop.owned); }, [shop.owned]);
  // A kit the account turned out not to own (refunded, or only ever in this device's cache) leaves the deck.
  useEffect(() => {
    if (shop.owned.includes(kitRef.current)) return;
    const gone = kitRef.current;
    void loadKit(DEFAULT_KIT, false);
    say(`${KIT_META[gone].label} isn't on your account — back to ${KIT_META[DEFAULT_KIT].label}`);
  }, [shop.owned, loadKit, say]);

  /** A kit you own loads; one you don't opens the confirm. Nothing is charged here. */
  const pickKit = (id: KitId): void => {
    if (shop.owned.includes(id)) { void loadKit(id); return; }
    shopDispatch({ type: 'ask', spend: kitSpend(id) });
  };

  /** CELL opens the confirm (a fresh nonce per ask: each foundation bought is its own purchase). Nothing is charged here. */
  const cellAssist = (): void => { shopDispatch({ type: 'ask', spend: assistSpend() }); };

  const layFoundation = (): void => {
    const gen = cellFoundation();
    setTracks((prev) => prev.map((t) => ({ ...t, pattern: gen[t.sampleId] ?? t.pattern })));
    say('Cell laid a foundation — make it yours');
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
    shopDispatch({ type: 'confirm' });
    try {
      const result = await trySpend(p);
      shopDispatch({ type: 'spent', spend: p, result });
      if (!result.ok) {
        if (result.reason === 'unreachable' && p.kind === 'kit') refreshOwned();
        return;
      }
      if (p.kind === 'kit') await loadKit(p.kit);
      else layFoundation();
    } finally {
      spendingRef.current = false;
    }
  };

  const toggleCell = (ti: number, si: number) =>
    setTracks((prev) => prev.map((t, i) =>
      i !== ti ? t : { ...t, pattern: t.pattern.map((v, j) => (j === si ? !v : v)) }));

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
    try {
      const blob = await eng.renderMixdown(2);
      const dataUrl = await blobToDataUrl(blob);
      // optional: the creator's own authorized Spotify/Apple version rides
      // along and plays via the OFFICIAL embed in the library
      const link = streamUrl.trim() ? parseStreamingUrl(streamUrl) : null;
      if (streamUrl.trim() && !link) { say('Streaming link not recognized — publish without it or fix the URL'); setSaving(false); return; }
      const rec = StudioLibrary.publish({
        title: title.trim(), authorId: profile.id, authorName: profile.name,
        kit, bpm, swing, polished,
        sequencer: { bpm, steps: STEPS, tracks, swing },
        mixdownDataUrl: dataUrl, remixOf,
        streamingLinks: link ? [link] : [],
      });
      onPublish?.(rec);                       // Creator Card pipeline hook (M28 contract)
      setLibraryRev((r) => r + 1);
      say(`"${rec.title}" published to the Academy library`);
      setTitle(''); setStreamUrl('');
    } finally {
      setSaving(false);
    }
  };

  const playRecord = (t: TrackRecord): void => {
    playerRef.current?.pause();
    const el = new Audio(t.mixdownDataUrl);
    playerRef.current = el;
    void el.play();
    StudioLibrary.countPlay(t.id);
    setLibraryRev((r) => r + 1);
  };

  const startRemix = (t: TrackRecord): void => {
    const r = StudioLibrary.beginRemix(t.id);
    if (!r) return;
    setTracks(r.sequencer.tracks);
    setBpm(r.bpm); setSwing(r.swing); setRemixOf(r.remixOf);
    // MUSIC-SUITE P2 (2026-09-25): REMIX NEVER BUYS. This was `void pickKit(r.kit)`, and pickKit charged for a kit not
    // owned — so remixing somebody's NEON track from the LIBRARY took 200 shards with no ask. Now a locked kit opens the
    // remix on the default kit, and the room says so under the remix banner (remixKitNote); unlocking it is a KITS tap.
    const plan = remixKit(r.kit, shop.owned);
    setRemixNote(remixKitNote(plan));
    void loadKit(plan.kit, false);
    setView('studio');
    say(plan.locked
      ? `Remixing "${t.title}" on ${KIT_META[plan.kit].label} — ${KIT_META[plan.locked].label} is locked; nothing was charged`
      : `Remixing "${t.title}" — credit stays with ${t.authorName}`);
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
      stats: { score: r.score, kit: String(kit), ...performResultStats(r) },
      // MUSIC-SUITE P2 FIX PASS: `bars` counts only bars that offered a note, so the line says so
      outcome: r.won ? 'set won'
        : r.notes === 0 ? 'no notes landed'
        : r.bars < PERFORM_WIN_MIN_BARS ? `under ${PERFORM_WIN_MIN_BARS} bars with notes` : 'under grade C',
    });
    setMode('build');
    setScore(0);
    setCombo(0);
    setJudgement('');
  }, [onEnd, kit]);
  useEffect(() => { endSetRef.current = endSet; }, [endSet]);

  const allTracks = StudioLibrary.list();
  const creators = [...new Map(allTracks.map((t) => [t.authorId, t.authorName])).entries()];
  void libraryRev;                                        // read to re-render on library writes

  // The same start ritual as every other mode: the splash carries the STAGE pick, and
  // the READY tap is what enters the room. It used to be a bare line of text, which is
  // why music had no screen on which to choose what it was going to be.
  if (!ready || !started) {
    return (
      <div style={S.root}>
        <BootSplash
          modeId="music"
          title="FEL GROOVE ACADEMY"
          phase={ready ? 'ready' : 'loading'}
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
            onAssign={(pad, buffer, label) => {
              const id = `flip_${pad}`;
              engineRef.current?.loadBuffer(id, label, buffer, 'melody');
              setTracks((prev) => prev.some((t) => t.sampleId === id) ? prev : [...prev, { sampleId: id, pattern: Array(STEPS).fill(false), volume: 0.9, muted: false, pan: 0 }]);
            }}
            onRecordHit={(pad, step) => {
              const id = `flip_${pad}`;
              setTracks((prev) => {
                const has = prev.some((t) => t.sampleId === id);
                const next = has ? prev : [...prev, { sampleId: id, pattern: Array(STEPS).fill(false), volume: 0.9, muted: false, pan: 0 }];
                return next.map((t) => (t.sampleId === id ? { ...t, pattern: t.pattern.map((v, j) => (j === step ? true : v)) } : t));
              });
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
              {remixNote && <div data-qa="remix-kit-note" style={{ color: '#ffd75e', marginTop: 2 }}>{remixNote}</div>}
            </div>
          )}
          <div style={S.grid}>
            {tracks.slice(0, caps.tracks).map((t, ti) => (
              <React.Fragment key={t.sampleId}>
                <div style={S.label}>{KIT_SLOTS.find((k) => k.id === t.sampleId)?.name ?? (t.sampleId.startsWith('flip_') ? `FLIP ${Number(t.sampleId.slice(5)) + 1}` : t.sampleId)}</div>
                {t.pattern.map((on, si) => (
                  <div key={si}
                    style={{ ...S.cell, ...(on ? S.cellOn : {}), ...(playhead === si ? S.cellHead : {}) }}
                    onClick={() => toggleCell(ti, si)} />
                ))}
              </React.Fragment>
            ))}
          </div>

          <div style={S.row}>
            <button style={S.btn} onClick={togglePlay}>{playing ? 'STOP' : 'PLAY'}</button>
            <button style={{ ...S.btnAlt, ...(polished ? { background: '#ffb347', color: '#2a1a10' } : {}) }}
              onClick={() => { const on = !polished; setPolished(on); engineRef.current?.masterPolish(on); }}>
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

          <div style={S.row}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>KITS:</span>
            {(Object.keys(KIT_META) as KitId[]).map((k) => (
              <button key={k}
                style={{ ...S.btnAlt, ...(kit === k ? { background: '#7a5c9e', color: '#fff', borderColor: '#7a5c9e' } : {}) }}
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

          {caps.arrangement ? (
            <SongPanel
              engine={engineRef.current} tracks={tracks} setTracks={setTracks} playing={playing}
              bpm={bpm} steps={STEPS} say={say} S={S} swing={swing} setSwing={setSwing}
              onSectionSaved={() => noteProgress('section')}
              onChained={() => noteProgress('chain')}
            />
          ) : null}

          {/* The room SAYS what opens next rather than leaving a locked control on screen for somebody to
              prod at. nextUnlock returns null at the top, which is the honest answer. */}
          {opensNext && (
            <div style={{ ...S.mentor, color: '#ffd75e' }}>
              Next: {opensNext.needs} — and the {opensNext.tier} opens.
            </div>
          )}

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
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{t.plays} plays · {t.saves} saves</div>
              </div>
              <button style={S.btn} onClick={() => playRecord(t)}>▶ PLAY</button>
              <button style={S.btnAlt} onClick={() => { StudioLibrary.saveToMyLibrary(t.id); setLibraryRev((r) => r + 1); say('Saved to your library'); }}>
                {StudioLibrary.mySavedIds().includes(t.id) ? 'SAVED ✓' : '+ SAVE'}
              </button>
              <button style={S.btnAlt} onClick={() => startRemix(t)}>REMIX</button>
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
