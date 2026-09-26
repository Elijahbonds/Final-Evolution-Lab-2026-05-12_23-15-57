'use client';
// FlipPad — the chop pad (lane 2 M1). Load a source (FEL stem, your own file, or a mic take), slice it on transients or a
// grid, play the 16 pads by touch or keyboard (1234 / qwer / asdf / zxcv), tune pitch and reverse per pad, send a pad to
// a groovebox track, and record taps live into the running pattern. Web Audio only — no dependency.
//
// MUSIC-SUITE P3 (2026-09-25), "Keep my work": the loaded source, the slicing and the sixteen chops (slice points + pitch /
// gate / reverse) are the PROJECT's now (StudioProject.ts ProjectFlip), read from `flip` and changed through
// `onFlipChange`. They were this component's useState (:26-31 then) and StudioMode mounts FlipPad only on the FLIP tab
// (performSet.test pins that, so the pad keys never fire on STUDIO), so every tab switch threw the sample away (P1: the
// 808 bass and its 8 slices gone on return). Now:
//   · the decoded source lives in the ROOM's cache (`loadSource`, keyed by sourceKey), so coming back to FLIP is instant
//     and a reload / REPLAY decodes it again from its first-party /audio/ path or, for the player's own recording, from
//     the bytes the project keeps (saveAudio → an AudioRef; studioStore.ts);
//   · reslicing happens when the player asks (a new source, TRANSIENTS/GRID, the grid count) — it was an effect on the
//     decoded buffer, which would have resliced a restored source and wiped its edited chops;
//   · a pad sent to the grid (SEND TO TRACK) or recorded into it (ARM REC) hands the room its exact chop
//     (ProjectFlipRow), so the row keeps sounding after a reload. A recorded hit used to add a row with NO buffer (P1:
//     "flip_1 is written but silent") — it now loads the pad's chop too;
//   · a mic take still recording when the tab changes is stopped and kept (its callbacks are the room's, not this panel's).
//
// MUSIC-SUITE P3 (2026-09-25), tier-honesty-editing (send-to-track only): a pad sent to the grid landed on a row the grid
// never drew (flip_* rows sat past every tier's row slice — P1: flip_0 played 8 times in 2 bars, never drawn). The room
// now draws every Flip row in its own section under the kit rows (MusicTiers FLIP_ROW_CAP). Here the pad says so: a pad
// that already has a grid row is marked ("· row"), SEND TO TRACK reads REPLACE ROW when it would swap that row's chop, and
// the line says where the row is. The send itself is an undo step in the room.
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25):
//   * A NEW SOURCE WAS A SILENT, FINAL LOSS. A tap on any FEL stem, YOUR FILE or MIC TAKE replaced the source and all 16
//     chops through a plain update (not an undo step), and a mic take or upload no pad row used was then unreferenced —
//     swept from the store an hour after it was made. Every change here is an undo step now (onFlipChange → the room's
//     edit; slider drags are one step), and replacing the player's OWN recording that no grid row uses asks first.
//   * UPLOADS ARE MARKED (owner decision #15): YOUR FILE's source carries `upload: true` (a mic take does not).
//   * SLICES KNOW THEIR SAMPLE RATE (`flip.rate`, a row's `rate`): chopBuffer cuts at the rate the slice was made at.
//   * THE PROJECT A RECORDING BELONGS TO. A mic take that finishes after another project opened lands in the project it
//     was recorded in (onFlipChange's `projectId`), not in whatever is open.
//   * A pad's pitch reaches only the pad (a grid row plays its chop at the recorded pitch until P5 bakes chops): said.
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25):
//   * A PAD IS HEARD THROUGH THE DESK. play() connected every hit as node → gain 0.9 → ctx.destination, beside the P4
//     desk: over a running beat already at up to −0.3 dBFS (render-peak.json worstP4Grid 0.897) the sum at the
//     destination could pass full scale and clip — what the limiter was built to end — and the pad's row's mute / solo /
//     fader / sends and the meters never saw it. Now a pad goes into its row's strip (engine.channelInput(flip_<pad>)):
//     the same fader, pan, gate, sends, limiter and meters as the row's grid hits (live == render).
//   * A PAD'S PITCH REACHES THE GRID NOW: a recorded hit and a new row carry it as the step's note (StudioProject padNote);
//     only the GATE stays the pad's (the row plays the chop's full length until P5 bakes chops) — the line says so.
//
// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — the chop editor:
//   * A WAVEFORM WITH MARKERS (ui/Waveform). Drag a cut (mouse or finger, pointer-captured), tap a slice to select and
//     hear it, + SLICE cuts the selected pad in two at the dashed line, − SLICE takes a pad's cut away (its sound goes to
//     the pad before it). Every cut snaps to a zero crossing within 2 ms, every chop edge fades (chopEdit), and every edit
//     is a project edit — autosaved, one drag = one undo step. TRANSIENTS / GRID cuts snap too.
//   * FOUR BANKS (A–D), each its own source + slices + chops (StudioProject bankOf / withBank). The pads, the keys, a
//     paired phone and the waveform show the bank picked here (remembered per project for this tab).
//   * CHOP KITS: SAVE BANK AS KIT keeps the bank under a name in the project; LOAD puts a kit into the bank on the pads.
//   * WHAT YOU TUNE IS WHAT YOU SEQUENCE: a pad plays its BAKED chop (chopEdit.bakeChop: pitch, gate, reverse, fades in
//     one buffer — :84-88 sent the raw slice to the grid before), and SEND / ARM REC hand the grid that same buffer.
//   * A PAD GOES TO ITS OWN ROW: bank B's pad 3 no longer replaces the row bank A's pad 3 made — a row remembers the pad
//     it came from (chopEdit.rowSlotFor: the row it went to before, else its own number's, else the first free one).
//   * ARM REC ON THE AUDIO CLOCK: a tap is written to the NEAREST step the engine scheduled (QUANTIZE on), or the step it
//     falls in (off) — chopEdit.recordStep, with the player's calibration taken off (the room's stepClock). It was
//     quantizeTap(playhead): the step that had already sounded, so a tap 20 ms early landed a step late.
//   * FEL CUTS: a source that comes with its own cuts (the FEL pack's, and a pack kit's file boundaries) is sliced on
//     them by default ('cuts'), never through the finder (flippack CONTRACT 12.2 / 12.3).
//   * The decoded source is let go when its bank is cleared (and the room's cache drops sources the project no longer
//     plays — StudioMode, chopEdit.liveSourceKeys).
//
// MUSIC-SUITE P5 (2026-09-25), flip-content (the pack, the lesson, the upload door):
//   * CHOP THE FEL THEME (FlipLesson.tsx): the first FLIP visit for each player opens the lesson and, with nothing on the
//     pads, puts the default theme (Sunday Tape, owner decision #25) on them; its demo taps are auditions (never recorded).
//   * YOUR FILE only after the tick "I made this or I own the rights" (decision #15; FlipShelf UploadPicker) — the note
//     keeps the statement, and the song then stays on this device (uploadPrivacy.ts; the room says so on the publish row).
//   * The shelf offers shelfSources(): FEL's pack, plus public-domain entries once the owner signs one (pdShelf.ts).
//
// MUSIC-SUITE P5 (2026-09-25), phone-mpc (decision #16) — the pad-input bridge only:
//   * a paired phone's hit (triggerRef) carries a MEASURED velocity and its tap time (PadHit): the hit's gain is 0.9 ×
//     velocity (phonePad.padGain — it was 0.9 for every hit), ARM REC writes the velocity into the step, and places the
//     tap at the time the finger came down (the arrival minus half the round trip), not when the packet landed;
//   * the bank on the pads and ARM REC can be held by the ROOM (`bank`/`onBank`, `recArm`/`onRecArm`): the phone's
//     BANK A–D and REC work on every tab, and the panel shows what the phone picked when FLIP opens;
//   * the row a hit goes to (padRowFor) and the step it lands on (tapStep) are exported, so the room plays and records a
//     phone hit on another tab by the same rules.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioEngine } from './AudioEngine';
import { PAD_COUNT, PAD_KEYS, gridSlices, onsetSlices, padForKey, padsFromSlices, quantizeTap, type FlipSource, type Pad, type Slice } from './Flip';
import {
  BANK_LETTERS, MAX_CHOP_KITS, MAX_KIT_NAME, bankHasSound, bankOf, deleteChopKit, emptyBank, flipBanks, flipSampleId, loadChopKit, saveChopKit, withBank,
  type AudioRef, type FlipSlicing, type ProjectFlip, type ProjectFlipBank, type ProjectFlipRow, type ProjectFlipSource,
} from './StudioProject';
import {
  bakeChop, bakeKey, bankAtRate, chopKeyText, moveEdge, msToSamples, padsWithRows, recordStep, removePad, rowLabel, rowSlotFor, sliceAtRate, snapSlices, sourceKey, splitPad,
  type BakeSpec, type DecodedSource, type Edge, type Region, type StepMark,
} from './chopEdit';
import Waveform from './ui/Waveform';
import FlipLesson from './FlipLesson';
import { UploadPicker, shelfSources, uploadSourceMeta, useFlipPack } from './FlipShelf';
import { lessonAutoLoaded, lessonDismissed, padsFromCuts, rememberLessonAutoLoaded, rememberLessonDismissed, type LessonStore } from './flipPack';
import { OWN_RIGHTS_TICK, tickedUploadNote, uploadNeedsTick } from './uploadPrivacy';
import { padGain } from './phonePad';

/** MUSIC-SUITE P5 (flip-content): where the lesson's "seen" mark is kept (null when the browser keeps nothing). */
const lessonStore = (): LessonStore | null => { try { return window.localStorage; } catch { return null; } };

// MUSIC-SUITE P5: these moved to chopEdit (the rules the room and the editor share); kept here for every importer
export { monoOf, sliceAtRate, sourceKey } from './chopEdit';
export type { DecodedSource } from './chopEdit';

/** The pads' slices for a slicing mode: onsets, or `n` equal parts. */
export function slicesFor(d: DecodedSource, mode: 'transient' | 'grid', n: number): Slice[] {
  return mode === 'transient' ? onsetSlices(d.mono, d.buffer.sampleRate) : gridSlices(d.mono.length, n);
}

/**
 * MUSIC-SUITE P5: sixteen pads for a slicing — the source's own cuts ('cuts', when it has them), else the finder or GRID
 * with every inner cut snapped to a zero crossing (chopEdit.snapSlices).
 */
export function slicedPads(d: DecodedSource, m: FlipSlicing, n: number): Pad[] {
  // MUSIC-SUITE P5 FIX PASS: a FEL cut longer than the gate starts with its gate off (flipPack.padsFromCuts — a texture
  // or the default theme's long pad was cut at 1.2 s, on the pad and, baked, on its row)
  if (m === 'cuts' && d.cuts) return padsFromCuts(d.cuts, d.buffer.sampleRate);
  return padsFromSlices(snapSlices(slicesFor(d, m === 'grid' ? 'grid' : 'transient', n), d.mono, d.buffer.sampleRate));
}

/**
 * The RAW chop (reversed when asked) — what a pad and a row played before MUSIC-SUITE P5. Kept for the tests of the rate
 * rule; nothing plays it now (bakedBuffer does).
 * MUSIC-SUITE P3 FIX PASS: `rate` = the sample rate the slice was cut at (rescaled when the source decoded at another).
 */
export function chopBuffer(ctx: BaseAudioContext, d: DecodedSource, slice: Slice, reverse: boolean, rate?: number): AudioBuffer {
  const s = sliceSamples(d.mono, sliceAtRate(slice, rate, d.buffer.sampleRate), reverse);
  const out = ctx.createBuffer(1, Math.max(1, s.length), d.buffer.sampleRate);
  out.copyToChannel(s, 0);
  return out;
}
function sliceSamples(samples: Float32Array, slice: Slice, reverse: boolean): Float32Array {
  const out = samples.slice(Math.max(0, slice.start), Math.min(samples.length, slice.end));
  return reverse ? out.reverse() : out;
}

/**
 * MUSIC-SUITE P5: THE chop — pitch, gate, reverse and the edge fades baked into one mono buffer (chopEdit.bakeChop). A pad
 * plays it, SEND / ARM REC load it into the pad's grid row, and the room bakes a row the same way after a reload.
 */
export function bakedBuffer(ctx: BaseAudioContext, d: DecodedSource, chop: BakeSpec): AudioBuffer {
  const s = bakeChop(d.mono, chop, d.buffer.sampleRate);
  const out = ctx.createBuffer(1, Math.max(1, s.length), d.buffer.sampleRate);
  out.copyToChannel(s, 0);
  return out;
}

/**
 * MUSIC-SUITE P5 (phone-mpc): a hit from a paired phone. `velocity` = what the phone MEASURED (null / absent = the fixed pad
 * level — phonePad.padVelocity); `atSec` = when the finger came down on the audio clock (phonePad.phoneTapSec: the arrival
 * minus half the round trip). A screen tap or a key has neither.
 */
export interface PadHit { velocity?: number | null; atSec?: number }

/**
 * MUSIC-SUITE P5 (phone-mpc): the step ARM REC writes a tap to — on the audio clock (chopEdit.recordStep, the player's
 * delay taken off) when the room has one, else the old playhead rule. `atSec` = the tap's own time (a phone's, moved back
 * by the network); absent = now. The room uses the same rule for a phone hit on another tab.
 */
export function tapStep(clockNow: StepClock | null, steps: number, quantize: boolean, playhead: number, atSec?: number): number | null {
  if (!clockNow) return quantizeTap(playhead, steps);
  const clock = atSec === undefined ? clockNow : { ...clockNow, now: atSec };   // a phone tap: its own time, not the arrival
  return recordStep(clock.now - clock.latencySec, clock.marks, { stepSec: clock.stepSec, steps, quantize, startSec: clock.startSec });
}

/**
 * Pad `i` of a bank as a grid row remembers it (its own copy of the source, so a later reslice never changes the row) —
 * on the pad's own row `slot` (chopEdit.rowSlotFor), with the bank + pad it came from. MUSIC-SUITE P5 (phone-mpc): pulled
 * out of FlipPad's chopRow unchanged so the room builds the same row for a phone hit on another tab.
 */
export function padRowFor(b: Pick<ProjectFlipBank, 'source' | 'chops' | 'rate'>, bank: number, i: number, slot: { slot: number } | null, liveRate?: number | null): ProjectFlipRow | null {
  const p = b.chops[i];
  if (!b.source || !p?.slice || !slot) return null;
  const rate = b.rate ?? liveRate ?? undefined;
  return {
    sampleId: flipSampleId(slot.slot), pad: slot.slot, label: rowLabel(slot.slot, bank, i), source: b.source, slice: p.slice, reverse: p.reverse, pitch: p.pitch, gate: p.gate,
    ...(rate ? { rate } : {}), ...(bank !== 0 || slot.slot !== i ? { origin: { bank, pad: i } } : {}),
  };
}

/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25), decision #15: the player ticks "I made this or I own the rights" for an upload
 * made before the tick existed (P3 / P4 took YOUR FILE without one — uploadPrivacy.uploadNeedsTick). The statement goes
 * into the note of that source wherever the FLIP tab holds it (every bank, every kit), dated; nothing else changes (the
 * source's key, so its sound and its rows, stay the same). A grid row keeps its own copy: a row sent after the tick
 * carries the statement.
 */
export function tickUpload(f: ProjectFlip, key: string, now: number): ProjectFlip {
  const note = tickedUploadNote(now);
  const stamp = <B extends ProjectFlipBank>(b: B): B => (b.source && sourceKey(b.source) === key && uploadNeedsTick(b.source) ? { ...b, source: { ...b.source, note } } : b);
  let out = f;
  flipBanks(f).forEach((b, i) => { const n = stamp(b); if (n !== b) out = withBank(out, i, n); });
  if (f.kits?.some((k) => stamp(k.bank) !== k.bank)) out = { ...out, kits: f.kits.map((k) => ({ ...k, bank: stamp(k.bank) })) };
  return out;
}

/** MUSIC-SUITE P5: the audio clock ARM REC reads (the room fills it from the engine's scheduled steps). */
export interface StepClock {
  /** ctx.currentTime at the tap */
  now: number;
  /** the player's delay: the saved calibration (or the device's output delay) + the desk's (performSet.performLatencySec) */
  latencySec: number;
  /** the steps the engine has scheduled lately (onStepScheduled), with their audio-clock times */
  marks: readonly StepMark[];
  /** one 16th at the current tempo */
  stepSec: number;
  /** bar 0's first step on the audio clock for this run (a tap in the count-in is dropped) */
  startSec: number;
}

export interface FlipPadProps {
  engine: AudioEngine | null;
  playing: boolean;
  playhead: number;
  steps: number;
  /** MUSIC-SUITE P3: the project's FLIP state and the one way to change it. MUSIC-SUITE P3 FIX PASS: every change is an
   *  undo step (`group` makes a slider drag ONE step); `projectId` = the project a recording started in.
   *  MUSIC-SUITE P5: all four banks and the chop kits (StudioProject ProjectFlip). */
  flip: ProjectFlip;
  onFlipChange: (fn: (f: ProjectFlip) => ProjectFlip, opts?: { group?: string; projectId?: string }) => void;
  /** MUSIC-SUITE P3 FIX PASS: the open project's id (a mic take is bound to the project it was recorded in). */
  projectId?: string;
  /** MUSIC-SUITE P3 FIX PASS: sourceKey of every source a grid row plays (replacing an own recording no row uses asks). */
  rowSourceKeys?: ReadonlySet<string>;
  /** MUSIC-SUITE P3: decode a source (the room caches it; rejects with the reason). */
  loadSource: (src: ProjectFlipSource) => Promise<DecodedSource>;
  /** MUSIC-SUITE P3: keep the player's own recording / file (the ref goes in the project). */
  saveAudio: (blob: Blob) => Promise<AudioRef>;
  /** a pad's chop becomes (or replaces) its groovebox row (MUSIC-SUITE P5: `row.sampleId`, the pad's row — chopEdit.rowSlotFor) */
  onAssign: (pad: number, buffer: AudioBuffer, row: ProjectFlipRow) => void;
  /** a live tap while playing: light `step` on that pad's row (its chop comes along). MUSIC-SUITE P5 (phone-mpc):
   *  `velocity` = a paired phone's measured one (written into the step); absent for a screen tap or a key. */
  onRecordHit: (pad: number, step: number, chop: { buffer: AudioBuffer; row: ProjectFlipRow }, velocity?: number | null) => void;
  say: (msg: string) => void;
  /** filled with `play(pad)` so a paired phone (controller link) can hit the pads (of the bank on the pads).
   *  MUSIC-SUITE P5 (phone-mpc): with the phone's measured velocity and its tap time (PadHit). */
  triggerRef?: React.MutableRefObject<((pad: number, hit?: PadHit) => void) | null>;
  /** MUSIC-SUITE P5 (phone-mpc): the bank on the pads, held by the ROOM when given (a phone's BANK A–D picks it on any
   *  tab). Absent = this panel keeps it (per project, for this browser tab), as the chop editor did. */
  bank?: number;
  onBank?: (bank: number) => void;
  /** MUSIC-SUITE P5 (phone-mpc): ARM REC, held by the ROOM when given (a phone's REC arms it on any tab). */
  recArm?: boolean;
  onRecArm?: (on: boolean) => void;
  /** MUSIC-SUITE P3: the mic is recording (the room holds MY PROJECTS until it stops). */
  onRecording?: (on: boolean) => void;
  /** MUSIC-SUITE P5: the grid's Flip rows (each remembers the bank + pad it came from) — marks, SEND / REPLACE, ARM REC. */
  flipRows?: readonly ProjectFlipRow[];
  /** MUSIC-SUITE P5: the grid's row ids (a Flip row whose chop was lost still holds its number). */
  trackIds?: ReadonlySet<string>;
  /** MUSIC-SUITE P5: ARM REC's audio clock; absent = the old playhead rule (quantizeTap). */
  stepClock?: () => StepClock | null;
  /** MUSIC-SUITE P5 (flip-content): who is playing — the FEL-theme lesson is remembered per player. */
  playerId?: string | null;
}

declare global {
  interface Window {
    __FEL_FLIP__?: {
      source: string | null; slices: number; pads: number; lastPlayed: number | null; mode: string; decoded?: boolean; edited?: number;
      /** MUSIC-SUITE P5 */
      bank?: string; banks?: (string | null)[]; kits?: string[]; selected?: number | null; selectedSlice?: Slice | null; rate?: number | null;
      quantize?: boolean; lastRecordedStep?: number | null; cuts?: number[];
      /** the decoded source's length and rate (the waveform's samples) and every pad's slice, in the stored units */
      sourceLength?: number | null; liveRate?: number | null; slicesAll?: (Slice | null)[];
    };
  }
}

const NO_ROWS: readonly ProjectFlipRow[] = [];
const NO_IDS: ReadonlySet<string> = new Set();
/** MUSIC-SUITE P5: the bank on the pads, per project, for this tab (a view, not the project's: it is not an edit). */
const BANK_VIEW_KEY = 'fel.flip.bank';
/** (exported for the room, MUSIC-SUITE P5 phone-mpc: it holds the bank when a phone is paired) */
export function readBankView(projectId?: string): number {
  try { const v = Number(sessionStorage.getItem(`${BANK_VIEW_KEY}.${projectId ?? ''}`)); return Number.isInteger(v) && v >= 0 && v < BANK_LETTERS.length ? v : 0; } catch { return 0; }
}
export function writeBankView(projectId: string | undefined, b: number): void { try { sessionStorage.setItem(`${BANK_VIEW_KEY}.${projectId ?? ''}`, String(b)); } catch { /* storage blocked */ } }
/** MUSIC-SUITE P5: QUANTIZE is the player's (on unless they turned it off). Exported: a phone hit on another tab reads it. */
const QUANTIZE_KEY = 'fel.flip.quantize';
export function readQuantize(): boolean { try { return localStorage.getItem(QUANTIZE_KEY) !== '0'; } catch { return true; } }
function writeQuantize(on: boolean): void { try { localStorage.setItem(QUANTIZE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ } }
const groupLabel = (g: string): string => g.replace(/-/g, ' ').toUpperCase();

export default function FlipPad({ engine, playing, playhead, steps, flip: flipAll, onFlipChange, loadSource, saveAudio, onAssign, onRecordHit, say, triggerRef, onRecording, projectId, rowSourceKeys, flipRows = NO_ROWS, trackIds = NO_IDS, stepClock, playerId = null, bank: bankHeld, onBank, recArm: recArmHeld, onRecArm }: FlipPadProps) {
  // MUSIC-SUITE P5 (flip-content): the FEL pack's index (the lesson reads it) and the lesson card, open on this player's
  // first visit; what the shelf offers (FEL's pack + owner-signed public-domain entries)
  const { pack, error: packError } = useFlipPack();
  const [lessonOpen, setLessonOpen] = useState(() => !lessonDismissed(lessonStore(), playerId));
  const lessonAutoLoadedRef = useRef(false);
  const offered = useMemo(() => shelfSources(), []);
  const [lit, setLit] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  /** MUSIC-SUITE P5: the + SLICE point on the waveform (a sample of the decoded source). */
  const [cursor, setCursor] = useState<number | null>(null);
  // MUSIC-SUITE P5: THE BANK ON THE PADS — its source, slicing and chops are what everything below reads and edits
  // MUSIC-SUITE P5 (phone-mpc): the ROOM holds it when it passes `bank` (a paired phone picks banks on any tab)
  const [bankOwn, setBankView] = useState(() => readBankView(projectId));
  const bank = bankHeld ?? bankOwn;
  const bankRef = useRef(bank); bankRef.current = bank;
  useEffect(() => { if (bankHeld === undefined) setBankView(readBankView(projectId)); setSelected(null); setCursor(null); }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const banks = useMemo(() => flipBanks(flipAll), [flipAll]);
  const flip = banks[bank] ?? bankOf(flipAll, bank);
  const { source, slicing: mode, gridN, chops: pads } = flip;
  const kits = flipAll.kits ?? [];
  const L = BANK_LETTERS[bank];
  /** MUSIC-SUITE P5 FIX PASS (decision #15): this bank's upload predates the tick — SEND, ARM REC and SAVE KIT wait for it. */
  const needsTick = uploadNeedsTick(source);
  const needsTickRef = useRef(needsTick); needsTickRef.current = needsTick;
  const TICK_LINE = `Tick "${OWN_RIGHTS_TICK}" for ${source?.label ?? 'this file'} first (it was added before FEL asked)`;
  /** A change to one bank (the one on the pads unless `bk` says which): an undo step, like every FLIP change. */
  const onBankChange = useCallback((fn: (b: ProjectFlipBank) => ProjectFlipBank, opts: { group?: string; projectId?: string } = {}, bk = bankRef.current): void => {
    onFlipChange((f) => withBank(f, bk, fn(bankOf(f, bk))), opts);
  }, [onFlipChange]);

  /** MUSIC-SUITE P3 FIX PASS: the ask before the player's own recording (on no grid row) is replaced. */
  const [askReplace, setAskReplace] = useState<{ next: string; go: () => void } | null>(null);
  // MUSIC-SUITE P5 (phone-mpc): a bank picked from outside (a phone's BANK B) — nothing stays selected from the old one
  const shownBank = useRef(bank);
  useEffect(() => { if (shownBank.current !== bank) { shownBank.current = bank; setSelected(null); setCursor(null); setAskReplace(null); } }, [bank]);
  /** MUSIC-SUITE P5: sources another bank or a chop kit still holds (replacing this bank's copy loses nothing). */
  const keptElsewhere = useMemo(() => {
    const k = new Set<string>();
    banks.forEach((b, i) => { if (i !== bank && b.source) k.add(sourceKey(b.source)); });
    for (const kit of kits) if (kit.bank.source) k.add(sourceKey(kit.bank.source));
    return k;
  }, [banks, bank, kits]);
  /** The loaded source is the player's own recording and nothing else keeps it: replacing it asks first. */
  const ownAtRisk = !!source && source.kind === 'own' && !(rowSourceKeys?.has(sourceKey(source)) ?? false) && !keptElsewhere.has(sourceKey(source));
  const guardReplace = (next: string, go: () => void): void => { if (ownAtRisk) setAskReplace({ next, go }); else go(); };
  const [decoded, setDecoded] = useState<{ key: string; d: DecodedSource } | null>(null);
  const live = source && decoded?.key === sourceKey(source) ? decoded.d : null;
  const liveRate = live?.buffer.sampleRate ?? null;
  const [recording, setRecording] = useState(false);
  // MUSIC-SUITE P5 (phone-mpc): the ROOM holds ARM REC when it passes `recArm` (a phone's REC arms it on any tab)
  const [recArmOwn, setRecArmOwn] = useState(false);
  const recArm = recArmHeld ?? recArmOwn;
  const toggleRecArm = (): void => { if (onRecArm) onRecArm(!recArm); else setRecArmOwn(!recArm); };
  const [quantize, setQuantize] = useState(readQuantize);
  const [kitName, setKitName] = useState('');
  const [shelf, setShelf] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const playheadRef = useRef(playhead); useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  const playingRef = useRef(playing); useEffect(() => { playingRef.current = playing; }, [playing]);
  const recArmRef = useRef(recArm); useEffect(() => { recArmRef.current = recArm; }, [recArm]);
  const quantizeRef = useRef(quantize); quantizeRef.current = quantize;
  const stepClockRef = useRef(stepClock); stepClockRef.current = stepClock;
  const flipAllRef = useRef(flipAll); flipAllRef.current = flipAll;
  useEffect(() => { onRecording?.(recording); }, [recording, onRecording]);
  const onRecordingRef = useRef(onRecording); onRecordingRef.current = onRecording;
  // leaving the tab mid-take stops the mic; the take is still kept (onstop → the room's saveAudio / onFlipChange), and the
  // room is told the mic is off (this panel's own `recording` can't report it once unmounted — MY PROJECTS would stay held)
  useEffect(() => () => { if (recRef.current?.state === 'recording') recRef.current.stop(); onRecordingRef.current?.(false); }, []);

  // MUSIC-SUITE P3: the project's source, decoded — on return to FLIP (the room's cache: instant), after a reload or REPLAY
  // (its path or its kept bytes), or when another project opens. The chops are the project's; nothing is resliced here.
  // MUSIC-SUITE P5: …and the bank's, when the bank on the pads changes; a bank with no source lets its decode go.
  useEffect(() => {
    if (!source) { setDecoded(null); return; }
    const key = sourceKey(source);
    if (decoded?.key === key) return;
    let alive = true;
    loadSource(source).then(
      (d) => { if (alive) setDecoded({ key, d }); },
      (e) => { if (alive) say(`${source.label} couldn't be reopened (${(e as Error)?.message ?? 'unreadable'}) — load a source again`); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, loadSource]);

  /**
   * A newly loaded source goes on the pads of the bank it was picked for, sliced the current way (MUSIC-SUITE P5: on its
   * own cuts when it has them); the project remembers it (an undo step).
   */
  const open = useCallback(async (src: ProjectFlipSource, startedIn?: string, startedBank: number = bankRef.current, onlyIfEmpty = false): Promise<void> => {
    const d = await loadSource(src);
    // MUSIC-SUITE P5 FIX PASS (2026-09-25): the lesson's auto-load decodes the theme (10.7 s of audio) while the player may
    // already be picking a sound — the P5 probe caught the theme landing AFTER the player's loop and replacing it. An
    // auto-load only fills a bank that is still empty when its decode finishes.
    if (onlyIfEmpty && bankHasSound(bankOf(flipAllRef.current, startedBank))) return;
    const rate = d.buffer.sampleRate;
    // MUSIC-SUITE P3 FIX PASS: a recording that finished after another project opened goes to the project it began in
    const elsewhere = startedIn !== undefined && startedIn !== projectId;
    const was = bankOf(flipAllRef.current, startedBank);
    const m: FlipSlicing = d.cuts ? 'cuts' : was.slicing === 'cuts' ? 'transient' : was.slicing;
    const chops = slicedPads(d, m, was.gridN);
    if (!elsewhere && startedBank === bankRef.current) { setDecoded({ key: sourceKey(src), d }); setSelected(null); setCursor(null); }
    onBankChange((b) => ({ ...b, source: src, rate, slicing: m, chops }), elsewhere ? { projectId: startedIn } : {}, startedBank);
    if (elsewhere) return;
    const n = chops.filter((c) => c.slice).length;
    say(`${src.label}: ${n} slice${n === 1 ? '' : 's'} on bank ${BANK_LETTERS[startedBank]}${m === 'cuts' ? ' — FEL cuts' : ''}`);
  }, [loadSource, onBankChange, say, projectId]);

  const loadFel = async (src: FlipSource, onlyIfEmpty = false) => {
    if (!src.url) return;
    // MUSIC-SUITE P5 FIX PASS: the source keeps its key as the pack says it (a theme's / loop's key, a one-shot's root)
    const item = pack?.byId.get(src.id);
    const key = item?.key ?? item?.root;
    try { await open({ id: src.id, label: src.label, kind: src.kind, note: src.note, url: src.url, ...(key ? { key } : {}) }, undefined, bankRef.current, onlyIfEmpty); }
    catch (e) { say(`Could not load ${src.label} (${(e as Error)?.message ?? 'unreadable'})`); }
  };
  const keepAndOpen = async (blob: Blob, meta: { id: string; label: string; note: string; upload?: true }, startedIn?: string, startedBank?: number) => {
    try {
      const audio = await saveAudio(blob);
      await open({ ...meta, kind: 'own', audio }, startedIn, startedBank);
    } catch (e) { say(`Could not load ${meta.label} (${(e as Error)?.message ?? 'not audio'})`); }
  };
  // MUSIC-SUITE P3 FIX PASS (decision #15): an upload is marked as one, explicitly — the sharing pass keys on it.
  // MUSIC-SUITE P5 (flip-content): it comes through the "I made this or I own the rights" tick (FlipShelf UploadPicker),
  // and its note keeps that statement with the date.
  const loadOwn = (f: File) => keepAndOpen(f, uploadSourceMeta(f.name, Date.now()));
  const toggleMic = async () => {
    if (recording) { recRef.current?.stop(); return; }
    const startedIn = projectId;
    const startedBank = bankRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = []; const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); recRef.current = null; setRecording(false);
        await keepAndOpen(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), { id: `mic_${Date.now()}`, label: 'mic take', note: 'Recorded in the room — the player\'s own take.' }, startedIn, startedBank);
      };
      recRef.current = rec; rec.start(); setRecording(true); say('Recording… tap again to stop (8 s max)');
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 8000);
    } catch { say('Microphone not available'); }
  };

  /** Reslice when the player changes how (a fresh chop set: pitch / reverse / gate start over, as they always did). */
  const setMode = (m: FlipSlicing) => onBankChange((b) => (live ? { ...b, slicing: m, rate: live.buffer.sampleRate, chops: slicedPads(live, m, b.gridN) } : { ...b, slicing: m }));
  const setGridN = (n: number) => onBankChange((b) => ({ ...b, gridN: n, ...(live && b.slicing === 'grid' ? { rate: live.buffer.sampleRate, chops: slicedPads(live, 'grid', n) } : {}) }), { group: 'flip-grid-n' });
  const setPads = (fn: (ps: Pad[]) => Pad[], group?: string) => onBankChange((b) => ({ ...b, chops: fn(b.chops) }), group ? { group } : {});
  /** MUSIC-SUITE P5: a slice edit, in the samples the waveform shows (a bank saved at another rate is rescaled first). */
  const editPads = (fn: (ps: Pad[], mono: Float32Array, rate: number) => Pad[], group?: string): void => {
    const d = live;
    if (!d) return;
    onBankChange((b) => {
      const at = bankAtRate(b, d.buffer.sampleRate);
      const next = fn(at.chops, d.mono, d.buffer.sampleRate);
      return next === at.chops ? b : { ...at, chops: next };
    }, group ? { group } : {});
  };

  /** MUSIC-SUITE P5: pad i's baked chop (cached by everything that changes its sound). */
  const bakeCache = useRef(new Map<string, AudioBuffer>());
  useEffect(() => { bakeCache.current.clear(); }, [live]);
  const padBuffer = useCallback((i: number): AudioBuffer | null => {
    if (!engine || !live || !source) return null;
    const p = pads[i]; if (!p?.slice) return null;
    const spec: BakeSpec = { slice: p.slice, pitch: p.pitch, reverse: p.reverse, gate: p.gate, ...(flip.rate ? { rate: flip.rate } : {}) };
    const key = bakeKey({ ...spec, source });
    let b = bakeCache.current.get(key);
    if (!b) {
      if (bakeCache.current.size >= 64) bakeCache.current.clear();
      b = bakedBuffer(engine.context, live, spec);
      bakeCache.current.set(key, b);
    }
    return b;
  }, [engine, live, pads, flip.rate, source]);

  /**
   * Pad i's chop as a grid row remembers it (its own copy of the source, so a later reslice never changes the row).
   * MUSIC-SUITE P5: on the pad's own row (chopEdit.rowSlotFor), with the bank + pad it came from; null = no row free.
   */
  const chopRow = useCallback((i: number): ProjectFlipRow | null => {
    if (!source || !pads[i]?.slice) return null;
    // MUSIC-SUITE P5 (phone-mpc): the row itself is padRowFor (the room builds a phone hit's row on another tab with it)
    return padRowFor({ source, chops: pads, rate: flip.rate }, bank, i, rowSlotFor(flipRows, trackIds, bank, i), live?.buffer.sampleRate);
  }, [pads, source, flip.rate, live, flipRows, trackIds, bank]);

  const fullSaid = useRef(false);
  const tickSaid = useRef(false);
  const lastRec = useRef<number | null>(null);
  /**
   * Play pad `pad` of the bank on the pads; ARM REC writes it into its row unless it is an `audition` (the waveform).
   * MUSIC-SUITE P5 (phone-mpc): a paired phone's `hit` brings its measured velocity (the hit's gain, like a grid step's —
   * phonePad.padGain — and the recorded step's) and its tap time (moved back by half the round trip), which ARM REC places.
   */
  const play = useCallback((pad: number, audition = false, hit?: PadHit) => {
    if (!engine) return;
    const b = padBuffer(pad); if (!b) return;
    const ctx = engine.context; if (ctx.state === 'suspended') void ctx.resume();
    // MUSIC-SUITE P5: the BAKED chop (the buffer its row plays), heard through the strip of the row it goes to
    const i = rowSlotFor(flipRows, trackIds, bank, pad)?.slot ?? pad;
    const node = ctx.createBufferSource(); node.buffer = b;
    const g = ctx.createGain(); g.gain.value = padGain(hit?.velocity); node.connect(g).connect(engine.channelInput(flipSampleId(i))); node.start();
    setLit(pad); setTimeout(() => setLit((l) => (l === pad ? null : l)), 120);
    if (!audition && recArmRef.current && playingRef.current && needsTickRef.current) {
      if (!tickSaid.current) { tickSaid.current = true; say(TICK_LINE); }   // MUSIC-SUITE P5 FIX PASS: not recorded before the tick
    } else if (!audition && recArmRef.current && playingRef.current) {
      const step = tapStep(stepClockRef.current?.() ?? null, steps, quantizeRef.current, playheadRef.current, hit?.atSec);
      const row = chopRow(pad);
      if (!row && !fullSaid.current) { fullSaid.current = true; say('All 16 Flip rows are taken — this pad has no row to record into (clear a row in STUDIO first)'); }
      if (row && step !== null) { onRecordHit(pad, step, { buffer: b, row }, hit?.velocity ?? null); lastRec.current = step; }
    }
    const w = window.__FEL_FLIP__;
    if (w) window.__FEL_FLIP__ = { ...w, lastPlayed: pad, lastRecordedStep: lastRec.current };
  }, [engine, padBuffer, onRecordHit, steps, chopRow, flipRows, trackIds, bank, say]);

  useEffect(() => { if (triggerRef) triggerRef.current = (pad, hit) => play(pad, false, hit); return () => { if (triggerRef) triggerRef.current = null; }; }, [play, triggerRef]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; const i = padForKey(e.key); if (i >= 0 && !e.repeat && !e.metaKey && !e.ctrlKey) { e.preventDefault(); play(i); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [play]);
  // a pad heard once its edit has landed (the waveform's drag end): the next render's play has the new slice
  const [audition, setAudition] = useState<number | null>(null);
  useEffect(() => { if (audition !== null) { play(audition, true); setAudition(null); } }, [audition, play]);

  // MUSIC-SUITE P5: the waveform — every pad's region in the decoded source's samples
  const regions = useMemo<Region[]>(() => (liveRate === null ? [] : pads.flatMap((p, i) => (p.slice ? [{ pad: i, ...sliceAtRate(p.slice, flip.rate, liveRate) }] : []))), [pads, flip.rate, liveRate]);
  const dragSeq = useRef(0);
  const dragging = useRef(false);
  const onEdge = (pad: number, edge: Edge, at: number, phase: 'move' | 'end'): void => {
    if (!dragging.current) { dragging.current = true; dragSeq.current++; }
    editPads((ps, mono, rate) => moveEdge(ps, pad, edge, at, mono, rate), `flip-edge-${dragSeq.current}`);
    // MUSIC-SUITE P5 FIX PASS: a mouse may drag another pad's marker — once let go, that pad is the selected one (and heard)
    if (phase === 'end') { dragging.current = false; setSelected(pad); setAudition(pad); }
  };
  /** MUSIC-SUITE P5 FIX PASS: ZOOM (the selected slice fills the waveform) — on a phone one pixel was ~31 ms of the theme. */
  const [zoom, setZoom] = useState(false);
  const onNudge = (edge: Edge, dir: -1 | 1, big: boolean): void => {
    const r = regions.find((g) => g.pad === selected);
    if (!r || liveRate === null) return;
    const to = (edge === 'start' ? r.start : r.end) + dir * msToSamples(big ? 50 : 5, liveRate);
    editPads((ps, mono, rate) => moveEdge(ps, r.pad, edge, to, mono, rate), `flip-nudge-${r.pad}-${edge}`);
  };
  const plusSlice = (): void => {
    if (!live || selected === null || !pads[selected]?.slice) { say('Select a slice first (tap it on the waveform or its pad)'); return; }
    const at0 = bankAtRate(flip, live.buffer.sampleRate);
    const s = at0.chops[selected].slice!;
    const at = cursor !== null && cursor > s.start && cursor < s.end ? cursor : (s.start + s.end) / 2;
    const r = splitPad(at0.chops, selected, at, live.mono, live.buffer.sampleRate);
    if (!r) { say(pads.some((p) => !p.slice) ? `Pad ${selected + 1} is too short to cut again (10 ms at least each side)` : 'All 16 pads have a slice — take one away first (− SLICE)'); return; }
    onBankChange(() => ({ ...at0, chops: r.pads }));
    say(`Pad ${selected + 1} cut in two — the second half is pad ${r.added + 1}`);
    setSelected(r.added); setCursor(null);
  };
  const minusSlice = (): void => {
    if (selected === null || !pads[selected]?.slice) { say('Select a slice first (tap it on the waveform or its pad)'); return; }
    const r = removePad(pads, selected);
    onBankChange((b) => ({ ...b, chops: removePad(b.chops, selected).pads }));
    say(r.merged !== null ? `Pad ${selected + 1}'s cut is gone — its sound is part of pad ${r.merged + 1} now (UNDO puts it back)` : `Pad ${selected + 1} is empty now (UNDO puts it back)`);
    setSelected(r.merged);
  };

  // MUSIC-SUITE P5: banks and kits
  const pickBank = (b: number): void => {
    if (b === bank) return;
    if (onBank) onBank(b); else { setBankView(b); writeBankView(projectId, b); }   // MUSIC-SUITE P5 (phone-mpc): the room's, when it holds it
    setSelected(null); setCursor(null); setAskReplace(null);
  };
  const clearBank = (): void => guardReplace('an empty bank', () => {
    onBankChange(() => emptyBank());
    setSelected(null); setCursor(null);
    say(`Bank ${L} cleared — UNDO brings it back`);
  });
  const saveKit = (): void => {
    if (needsTick) { say(TICK_LINE); return; }   // MUSIC-SUITE P5 FIX PASS (decision #15)
    const name = kitName.trim() || source?.label || `Bank ${L}`;
    const now = Date.now();
    const id = `kit_${now.toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
    const r = saveChopKit(flipAll, bank, name, { now, id });
    if (!r) { say(!source ? 'Load a source into this bank first' : `This project keeps ${MAX_CHOP_KITS} kits — delete one first`); return; }
    onFlipChange((f) => saveChopKit(f, bank, name, { now, id })?.flip ?? f);
    setKitName('');
    say(`Bank ${L} saved as the kit "${r.kit.name}" — LOAD puts it in any bank`);
  };
  const loadKit = (id: string): void => {
    const k = kits.find((x) => x.id === id);
    if (!k) return;
    guardReplace(`the kit "${k.name}"`, () => {
      onFlipChange((f) => loadChopKit(f, id, bank));
      setSelected(null); setCursor(null);
      say(`Kit "${k.name}" is on bank ${L}`);
    });
  };
  const dropKit = (id: string): void => {
    const k = kits.find((x) => x.id === id);
    onFlipChange((f) => deleteChopKit(f, id));
    if (k) say(`Kit "${k.name}" deleted — UNDO brings it back`);
  };
  const toggleQuantize = (): void => { setQuantize((q) => { writeQuantize(!q); return !q; }); };
  /** MUSIC-SUITE P5 FIX PASS: the tick for an upload from before it existed (an edit, UNDO takes it back). */
  const tickOldUpload = (): void => {
    if (!source || !needsTick) return;
    const key = sourceKey(source);
    onFlipChange((f) => tickUpload(f, key, Date.now()));
    tickSaid.current = false;
    say(`${source.label}: ticked "${OWN_RIGHTS_TICK}" — it can go to a row, be recorded and saved as a kit (it stays on this device)`);
  };

  // MUSIC-SUITE P5 (flip-content): CHOP THE FEL THEME — on the lesson's first showing with every bank empty, the default
  // theme goes on the pads (once per mount; a sound already loaded is never replaced by the lesson — its LOAD asks, through
  // the same replace guard as the shelf). Its demo taps are auditions: never recorded, even armed.
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): once per PLAYER (flipPack.lessonAutoLoaded — the per-mount ref alone put the theme
  // back on every FLIP visit until GOT IT, after a CLEAR BANK too, and into every new project); the ref still covers a
  // browser that keeps nothing.
  useEffect(() => {
    if (!lessonOpen || !engine || !pack?.themeDefault || lessonAutoLoadedRef.current || banks.some(bankHasSound)) return;
    if (lessonAutoLoaded(lessonStore(), playerId)) return;
    const theme = offered.find((s) => s.id === pack.themeDefault);
    if (!theme) return;
    lessonAutoLoadedRef.current = true;
    rememberLessonAutoLoaded(lessonStore(), playerId);
    void loadFel(theme, true);   // never over a sound the player picked while it decoded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonOpen, engine, pack, banks]);
  const lessonLoad = (id: string): void => { const s = offered.find((x) => x.id === id); if (s) guardReplace(s.label, () => void loadFel(s)); };
  const closeLesson = (): void => { setLessonOpen(false); rememberLessonDismissed(lessonStore(), playerId); };

  useEffect(() => {
    window.__FEL_FLIP__ = {
      source: source?.id ?? null, slices: pads.filter((p) => p.slice).length, pads: PAD_COUNT, lastPlayed: window.__FEL_FLIP__?.lastPlayed ?? null, mode, decoded: !!live,
      edited: pads.filter((p) => p.pitch !== 0 || p.reverse || !p.gate).length,
      bank: L, banks: banks.map((b) => b.source?.id ?? null), kits: kits.map((k) => k.name), selected,
      selectedSlice: selected !== null ? pads[selected]?.slice ?? null : null, rate: flip.rate ?? null, quantize,
      lastRecordedStep: lastRec.current, cuts: pads.flatMap((p) => (p.slice ? [p.slice.start] : [])),
      sourceLength: live?.mono.length ?? null, liveRate, slicesAll: pads.map((p) => p.slice),
    };
  }, [source, pads, mode, live, L, banks, kits, selected, flip.rate, quantize, liveRate]);

  const rowPads = useMemo(() => padsWithRows(flipRows, bank), [flipRows, bank]);
  const filled = useMemo(() => pads.filter((p) => p.slice).length, [pads]);
  const shelves = useMemo(() => [...new Set(offered.map((s) => s.group ?? 'fel'))], [offered]);
  const shelfNow = shelf ?? shelves.find((g) => offered.some((s) => (s.group ?? 'fel') === g && s.id === source?.id)) ?? shelves[0];
  const sendSlot = selected !== null ? rowSlotFor(flipRows, trackIds, bank, selected) : null;
  const S: Record<string, React.CSSProperties> = {
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#2a1a10', fontWeight: 700, cursor: 'pointer' },
    alt: { padding: '6px 12px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: '#ffb347', background: 'transparent', color: '#ffd75e', cursor: 'pointer', fontSize: 12, minHeight: 32 },
    on: { background: '#7a5c9e', color: '#fff', borderColor: '#7a5c9e' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12, maxWidth: 420 },
    pad: { aspectRatio: '1', borderRadius: 12, borderWidth: 1, borderStyle: 'solid', borderColor: '#7a5c9e', background: '#33244a', color: '#e8d9c2', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation' },
    padOn: { background: '#ffb347', color: '#2a1a10', borderColor: '#ffd75e' },
    padEmpty: { opacity: 0.35, cursor: 'default' },
    padSel: { outline: '2px solid #22d3ee' },
    note: { fontSize: 11, opacity: 0.72 },
  };
  const edited = selected !== null ? pads[selected] : null;
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>THE FLIP — chop a source onto sixteen pads, four banks deep. Sources: FEL&apos;s own pack, your recordings, public-domain records with a note. Never someone else&apos;s catalogue.</div>
      {/* MUSIC-SUITE P5 (flip-content): CHOP THE FEL THEME — the first lesson, once per player (FlipLesson.tsx) */}
      {lessonOpen && (
        <FlipLesson pack={pack} packError={packError} loadedId={source?.id ?? null} ready={!!live}
          onLoad={lessonLoad} onPad={(i) => play(i, true)} onClose={closeLesson} />
      )}
      {/* MUSIC-SUITE P5: FOUR BANKS — each its own source, slices and chops; a dot = the bank holds a sound */}
      <div data-qa="flip-banks" role="group" aria-label="Banks" style={S.row}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>BANK</span>
        {BANK_LETTERS.map((letter, b) => (
          <button key={letter} data-qa={`flip-bank-${letter}`} aria-pressed={b === bank} aria-label={`bank ${letter}${bankHasSound(banks[b]) ? `, ${banks[b].source?.label}` : ', empty'}`}
            style={{ ...S.alt, minWidth: 44, fontWeight: 800, ...(b === bank ? S.on : {}) }} onClick={() => pickBank(b)}>
            {letter}{bankHasSound(banks[b]) ? ' •' : ''}
          </button>
        ))}
        {source && <button data-qa="flip-clear-bank" style={S.alt} onClick={clearBank}>CLEAR BANK {L}</button>}
      </div>
      <div style={S.row} role="group" aria-label="FEL pack shelves">
        <span style={{ fontSize: 12, opacity: 0.8 }}>FEL PACK:</span>
        {shelves.length > 1 && shelves.map((g) => (
          <button key={g} data-qa={`flip-shelf-${g}`} aria-pressed={g === shelfNow} style={{ ...S.alt, ...(g === shelfNow ? S.on : {}) }} onClick={() => setShelf(g)}>{groupLabel(g)}</button>
        ))}
      </div>
      <div style={S.row}>
        {offered.filter((s) => (s.group ?? 'fel') === shelfNow).map((s) => <button key={s.id} title={s.kind === 'public-domain' ? s.note : undefined} style={{ ...S.alt, ...(source?.id === s.id ? S.on : {}) }} onClick={() => guardReplace(s.label, () => void loadFel(s))}>{s.label}</button>)}
        {!lessonOpen && <button data-qa="lesson-open" style={S.alt} onClick={() => setLessonOpen(true)}>THEME LESSON</button>}
      </div>
      <div style={S.row}>
        {/* MUSIC-SUITE P5 (flip-content, decision #15): YOUR FILE only after "I made this or I own the rights" is ticked */}
        <UploadPicker style={S.alt} onFile={(f) => guardReplace(f.name.slice(0, 32), () => void loadOwn(f))} />
        <button style={{ ...S.alt, ...(recording ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={() => (recording ? void toggleMic() : guardReplace('a new mic take', () => void toggleMic()))}>{recording ? '■ STOP' : '● MIC TAKE'}</button>
        {live?.cuts && <button data-qa="flip-mode-cuts" style={{ ...S.alt, ...(mode === 'cuts' ? S.on : {}) }} onClick={() => setMode('cuts')}>FEL CUTS</button>}
        <button style={{ ...S.alt, ...(mode === 'transient' ? S.on : {}) }} onClick={() => setMode('transient')}>TRANSIENTS</button>
        <button style={{ ...S.alt, ...(mode === 'grid' ? S.on : {}) }} onClick={() => setMode('grid')}>GRID</button>
        {mode === 'grid' && <label style={{ fontSize: 12 }}>{gridN} <input type="range" min={2} max={16} value={gridN} onChange={(e) => setGridN(Number(e.target.value))} /></label>}
        <span data-qa="flip-source" style={{ fontSize: 12, opacity: 0.75 }}>{source ? `bank ${L} · ${source.label}${source.key ? ` · ${source.key}` : ''} · ${filled} slices · ${source.upload ? 'your upload' : source.kind}${live ? '' : ' · opening…'}` : `bank ${L} · no source loaded`}</span>
      </div>
      {/* MUSIC-SUITE P5 FIX PASS (2026-09-25): a public-domain source names its performer, year and why it is free (the note
          pdShelf.pdSources writes; PD-CANDIDATES.md's publicity-rights assumption rests on the app crediting them) */}
      {source?.kind === 'public-domain' && <div data-qa="flip-pd-credit" style={{ ...S.note, marginTop: 6 }}>{source.note}</div>}
      {/* MUSIC-SUITE P5 FIX PASS (decision #15): an upload from before the tick asks for it before it goes anywhere */}
      {needsTick && source && (
        <div data-qa="upload-tick-old" role="group" aria-label="Ownership" style={{ ...S.row, padding: 8, borderRadius: 10, border: '1px solid #ffd75e', background: 'rgba(0,0,0,0.25)' }}>
          <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 36 }}>
            <input type="checkbox" data-qa="upload-tick-old-box" checked={false} onChange={tickOldUpload} style={{ width: 18, height: 18 }} />
            {OWN_RIGHTS_TICK}
          </label>
          <span style={{ fontSize: 12, opacity: 0.85 }}>&quot;{source.label}&quot; was added before FEL asked. Tick it to send it to a row, record it or save it as a kit — it stays on this device either way.</span>
        </div>
      )}
      {/* MUSIC-SUITE P3 FIX PASS: replacing the player's own recording that nothing else keeps asks first (UNDO also brings it back) */}
      {askReplace && source && (
        <div data-qa="flip-replace-confirm" role="group" aria-label={`Replace ${source.label}?`} style={{ ...S.row, padding: 8, borderRadius: 10, border: '1px solid #ffb4a2', background: 'rgba(0,0,0,0.25)' }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>Replace your {source.label} with {askReplace.next}?</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>No grid row, bank or kit keeps it, and its {filled} pads{pads.some((p) => p.pitch !== 0 || p.reverse || !p.gate) ? ' (with your edits)' : ''} go with it. UNDO brings it back.</span>
          <button data-qa="flip-replace-yes" style={S.btn} onClick={() => { const go = askReplace.go; setAskReplace(null); go(); }}>REPLACE</button>
          <button style={S.alt} onClick={() => setAskReplace(null)}>KEEP</button>
        </div>
      )}
      {/* MUSIC-SUITE P5: THE WAVEFORM — drag a cut, tap a slice, + / − SLICE */}
      {source && (
        <>
          <Waveform mono={live?.mono ?? null} regions={regions} selected={selected} cursor={cursor} zoom={zoom && selected !== null} rate={liveRate ?? 44100}
            onSelect={(p) => { setSelected(p); setAudition(p); }} onCursor={setCursor} onEdge={onEdge} onNudge={onNudge} />
          <div style={S.row}>
            <button data-qa="flip-slice-add" style={S.alt} onClick={plusSlice} disabled={!live}>+ SLICE</button>
            <button data-qa="flip-slice-remove" style={S.alt} onClick={minusSlice} disabled={!live}>− SLICE</button>
            {/* MUSIC-SUITE P5 FIX PASS: fine edits without a keyboard — ZOOM onto the selected slice, and ◀ ▶ nudges (5 ms) */}
            <button data-qa="flip-zoom" aria-pressed={zoom} style={{ ...S.alt, ...(zoom ? S.on : {}) }} onClick={() => setZoom((z) => !z)} disabled={!live || selected === null}>ZOOM</button>
            {selected !== null && live && (['start', 'end'] as const).map((edge) => (
              <span key={edge} role="group" aria-label={`move pad ${selected + 1}'s ${edge}`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{edge.toUpperCase()}</span>
                <button data-qa={`flip-nudge-${edge}-back`} style={{ ...S.alt, padding: '4px 10px' }} aria-label={`${edge} 5 ms earlier`} onClick={() => onNudge(edge, -1, false)}>◀</button>
                <button data-qa={`flip-nudge-${edge}-on`} style={{ ...S.alt, padding: '4px 10px' }} aria-label={`${edge} 5 ms later`} onClick={() => onNudge(edge, 1, false)}>▶</button>
              </span>
            ))}
            <span style={S.note}>tap a slice to select it, then drag its markers · cuts snap to a zero crossing (2 ms) and every edge fades, so no pad clicks · + SLICE cuts the selected pad at the dashed line</span>
          </div>
        </>
      )}
      <div style={S.grid}>
        {pads.map((p, i) => (
          <button key={i} style={{ ...S.pad, ...(p.slice ? {} : S.padEmpty), ...(lit === i ? S.padOn : {}), ...(selected === i ? S.padSel : {}) }}
            onPointerDown={(e) => { e.preventDefault(); if (p.slice) { play(i); setSelected(i); } }} disabled={!p.slice} aria-label={`pad ${i + 1}${bank ? ` (bank ${L})` : ''}`}>
            <span style={{ fontWeight: 800 }}>{i + 1}</span>
            <span style={{ fontSize: 10, opacity: 0.8 }}>{PAD_KEYS[i]}{p.pitch ? ` · ${p.pitch > 0 ? '+' : ''}${p.pitch}` : ''}{p.reverse ? ' · rev' : ''}{rowPads?.has(i) ? ' · row' : ''}</span>
          </button>
        ))}
      </div>
      {selected !== null && edited?.slice && (
        <div style={S.row}>
          <span style={{ fontSize: 12 }}>PAD {L}{selected + 1}{chopKeyText(source?.key, edited.pitch) ? <span data-qa="flip-chop-key" style={{ opacity: 0.8 }}> · {chopKeyText(source?.key, edited.pitch)}</span> : null}</span>
          <label style={{ fontSize: 12 }}>pitch {edited.pitch > 0 ? '+' : ''}{edited.pitch}
            <input type="range" min={-12} max={12} value={edited.pitch} onChange={(e) => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, pitch: Number(e.target.value) } : p)), `flip-pitch-${bank}-${selected}`)} />
          </label>
          <button style={{ ...S.alt, ...(edited.reverse ? S.on : {}) }} onClick={() => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, reverse: !p.reverse } : p)))}>REVERSE</button>
          <button style={{ ...S.alt, ...(edited.gate ? S.on : {}) }} onClick={() => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, gate: !p.gate } : p)))}>GATE</button>
          <button data-qa="flip-send" style={{ ...S.btn, ...(sendSlot && !needsTick ? {} : { opacity: 0.5, cursor: 'default' }) }} disabled={!sendSlot || needsTick} title={needsTick ? TICK_LINE : undefined} onClick={() => {
            if (needsTick) { say(TICK_LINE); return; }   // MUSIC-SUITE P5 FIX PASS (decision #15)
            const b = padBuffer(selected); const row = chopRow(selected);
            if (!b || !row) return;
            const had = sendSlot?.replaces ?? false;
            onAssign(selected, b, row);
            say(`Pad ${L}${selected + 1} → ${had ? `the ${row.label} row now plays this chop` : `row ${row.label}`} — in the STUDIO grid under the kit rows`);
          }}>{!sendSlot ? 'ALL 16 ROWS TAKEN' : sendSlot.replaces ? `REPLACE ROW ${rowLabel(sendSlot.slot, bank, selected)}` : 'SEND TO TRACK'}</button>
          {/* MUSIC-SUITE P5: WHAT YOU TUNE IS WHAT YOU SEQUENCE — the row plays this pad's baked chop (P3/P4 said the gate
              was "pad only" and the pitch rode on the steps' notes) */}
          {(edited.pitch !== 0 || !edited.gate || edited.reverse) && (
            <span data-qa="flip-pitch-note" style={S.note}>
              what you tune is what you sequence: the row plays this pad {edited.pitch !== 0 ? `at ${edited.pitch > 0 ? '+' : ''}${edited.pitch}` : 'as sliced'}{edited.reverse ? ', reversed' : ''}{edited.gate ? ', gated at 1.2 s' : ', full length'}
            </span>
          )}
        </div>
      )}
      {/* MUSIC-SUITE P5: CHOP KITS — a bank kept under a name in the project, loaded into any bank */}
      <div data-qa="flip-kits" style={S.row}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>CHOP KITS</span>
        <input data-qa="flip-kit-name" aria-label="Kit name" value={kitName} maxLength={MAX_KIT_NAME} placeholder={source ? source.label : 'kit name'} onChange={(e) => setKitName(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #7a5c9e', background: '#1a1226', color: '#e8d9c2', fontSize: 12, width: 150 }} />
        <button data-qa="flip-kit-save" style={S.alt} onClick={saveKit} disabled={!source}>SAVE BANK {L} AS KIT</button>
        {kits.map((k) => (
          <span key={k.id} data-qa="flip-kit" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12, padding: '2px 6px', borderRadius: 8, border: '1px solid #7a5c9e' }}>
            {k.name}
            <button style={{ ...S.alt, padding: '4px 8px' }} onClick={() => loadKit(k.id)} aria-label={`load ${k.name} into bank ${L}`}>LOAD → {L}</button>
            <button style={{ ...S.alt, padding: '4px 8px' }} onClick={() => dropKit(k.id)} aria-label={`delete ${k.name}`}>×</button>
          </span>
        ))}
        {!kits.length && <span style={S.note}>save a bank to use its chops again in any bank</span>}
      </div>
      <div style={S.row}>
        <button style={{ ...S.alt, ...(recArm ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={toggleRecArm}>{recArm ? '● REC ARMED' : 'ARM REC'}</button>
        <button data-qa="flip-quantize" aria-pressed={quantize} style={{ ...S.alt, ...(quantize ? S.on : {}) }} onClick={toggleQuantize}>{quantize ? 'QUANTIZE ON' : 'QUANTIZE OFF'}</button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{recArm ? (playing ? (quantize ? 'a tap lands on the nearest step' : 'a tap lands on the step it falls in') : 'press PLAY in the studio, then tap pads') : 'arm, play, tap — your hits write into the pattern'}</span>
      </div>
    </div>
  );
}
