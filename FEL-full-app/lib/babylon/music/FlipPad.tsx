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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioEngine } from './AudioEngine';
import { FEL_SOURCES, PAD_COUNT, PAD_KEYS, onsetSlices, gridSlices, padForKey, padsFromSlices, quantizeTap, rateForPitch, sliceSamples, type FlipSource, type Pad, type Slice } from './Flip';
import { flipSampleId, type AudioRef, type ProjectFlip, type ProjectFlipRow, type ProjectFlipSource } from './StudioProject';

/** A source ready to chop: its decoded buffer and a mono copy of it. */
export interface DecodedSource { buffer: AudioBuffer; mono: Float32Array }

/** The key the room caches a decoded source under: its saved bytes, else its first-party path. */
export function sourceKey(src: Pick<ProjectFlipSource, 'id' | 'url' | 'audio'>): string { return src.audio?.key ?? src.url ?? src.id; }

/** Every channel averaged into one (the Flip slices and plays mono). */
export function monoOf(buf: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'getChannelData'>): Float32Array {
  const m = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < m.length; i++) m[i] += ch[i] / buf.numberOfChannels; }
  return m;
}

/** The pads' slices for a slicing mode: onsets, or `n` equal parts. */
export function slicesFor(d: DecodedSource, mode: 'transient' | 'grid', n: number): Slice[] {
  return mode === 'transient' ? onsetSlices(d.mono, d.buffer.sampleRate) : gridSlices(d.mono.length, n);
}

/**
 * MUSIC-SUITE P3 FIX PASS: a slice counted at `from` Hz, in samples at `to` Hz (the source decoded at another rate).
 * Undefined / equal rates = the slice as it is.
 */
export function sliceAtRate(slice: Slice, from: number | undefined, to: number): Slice {
  if (!from || !to || from === to) return slice;
  const k = to / from;
  const start = Math.max(0, Math.round(slice.start * k));
  return { start, end: Math.max(start + 1, Math.round(slice.end * k)) };
}

/**
 * One chop as a playable buffer (reversed when asked) — what a pad plays and what a Flip row loads into the engine.
 * MUSIC-SUITE P3 FIX PASS: `rate` = the sample rate the slice was cut at (rescaled when the source decoded at another).
 */
export function chopBuffer(ctx: BaseAudioContext, d: DecodedSource, slice: Slice, reverse: boolean, rate?: number): AudioBuffer {
  const s = sliceSamples(d.mono, sliceAtRate(slice, rate, d.buffer.sampleRate), reverse);
  const out = ctx.createBuffer(1, Math.max(1, s.length), d.buffer.sampleRate);
  out.copyToChannel(s, 0);
  return out;
}

export interface FlipPadProps {
  engine: AudioEngine | null;
  playing: boolean;
  playhead: number;
  steps: number;
  /** MUSIC-SUITE P3: the project's FLIP state and the one way to change it. MUSIC-SUITE P3 FIX PASS: every change is an
   *  undo step (`group` makes a slider drag ONE step); `projectId` = the project a recording started in. */
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
  /** a pad's chop becomes (or replaces) the groovebox track `flip_<pad>` */
  onAssign: (pad: number, buffer: AudioBuffer, row: ProjectFlipRow) => void;
  /** a live tap while playing: light the step under the playhead on that pad's track (its chop comes along) */
  onRecordHit: (pad: number, step: number, chop: { buffer: AudioBuffer; row: ProjectFlipRow }) => void;
  say: (msg: string) => void;
  /** filled with `play(pad)` so a paired phone (controller link) can hit the pads */
  triggerRef?: React.MutableRefObject<((pad: number) => void) | null>;
  /** MUSIC-SUITE P3: the mic is recording (the room holds MY PROJECTS until it stops). */
  onRecording?: (on: boolean) => void;
  /** MUSIC-SUITE P3: pads that already have a grid row (flip_<pad>) — marked, and SEND replaces that row's chop. */
  rowPads?: ReadonlySet<number>;
}

declare global { interface Window { __FEL_FLIP__?: { source: string | null; slices: number; pads: number; lastPlayed: number | null; mode: string; decoded?: boolean; edited?: number } } }

export default function FlipPad({ engine, playing, playhead, steps, flip, onFlipChange, loadSource, saveAudio, onAssign, onRecordHit, say, triggerRef, onRecording, rowPads, projectId, rowSourceKeys }: FlipPadProps) {
  const { source, slicing: mode, gridN, chops: pads } = flip;
  /** MUSIC-SUITE P3 FIX PASS: the ask before the player's own recording (on no grid row) is replaced. */
  const [askReplace, setAskReplace] = useState<{ next: string; go: () => void } | null>(null);
  /** The loaded source is the player's own recording and no grid row plays it: replacing it asks first. */
  const ownAtRisk = !!source && source.kind === 'own' && !(rowSourceKeys?.has(sourceKey(source)) ?? false);
  const guardReplace = (next: string, go: () => void): void => { if (ownAtRisk) setAskReplace({ next, go }); else go(); };
  const [decoded, setDecoded] = useState<{ key: string; d: DecodedSource } | null>(null);
  const live = source && decoded?.key === sourceKey(source) ? decoded.d : null;
  const [lit, setLit] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recArm, setRecArm] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const playheadRef = useRef(playhead); useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  const playingRef = useRef(playing); useEffect(() => { playingRef.current = playing; }, [playing]);
  const recArmRef = useRef(recArm); useEffect(() => { recArmRef.current = recArm; }, [recArm]);
  useEffect(() => { onRecording?.(recording); }, [recording, onRecording]);
  const onRecordingRef = useRef(onRecording); onRecordingRef.current = onRecording;
  // leaving the tab mid-take stops the mic; the take is still kept (onstop → the room's saveAudio / onFlipChange), and the
  // room is told the mic is off (this panel's own `recording` can't report it once unmounted — MY PROJECTS would stay held)
  useEffect(() => () => { if (recRef.current?.state === 'recording') recRef.current.stop(); onRecordingRef.current?.(false); }, []);

  // MUSIC-SUITE P3: the project's source, decoded — on return to FLIP (the room's cache: instant), after a reload or REPLAY
  // (its path or its kept bytes), or when another project opens. The chops are the project's; nothing is resliced here.
  useEffect(() => {
    if (!source) return;
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

  /** A newly loaded source goes on the pads, sliced the current way; the project remembers it (an undo step). */
  const open = useCallback(async (src: ProjectFlipSource, startedIn?: string): Promise<void> => {
    const d = await loadSource(src);
    const rate = d.buffer.sampleRate;
    // MUSIC-SUITE P3 FIX PASS: a recording that finished after another project opened goes to the project it began in
    const elsewhere = startedIn !== undefined && startedIn !== projectId;
    if (!elsewhere) { setDecoded({ key: sourceKey(src), d }); setSelected(null); }
    onFlipChange((f) => ({ ...f, source: src, rate, chops: padsFromSlices(slicesFor(d, f.slicing, f.gridN)) }), elsewhere ? { projectId: startedIn } : {});
    if (elsewhere) return;
    const n = slicesFor(d, mode, gridN).length;
    say(`${src.label}: ${n} slice${n === 1 ? '' : 's'} on the pads`);
  }, [loadSource, onFlipChange, mode, gridN, say, projectId]);

  const loadFel = async (src: FlipSource) => {
    if (!src.url) return;
    try { await open({ id: src.id, label: src.label, kind: src.kind, note: src.note, url: src.url }); }
    catch (e) { say(`Could not load ${src.label} (${(e as Error)?.message ?? 'unreadable'})`); }
  };
  const keepAndOpen = async (blob: Blob, meta: { id: string; label: string; note: string; upload?: true }, startedIn?: string) => {
    try {
      const audio = await saveAudio(blob);
      await open({ ...meta, kind: 'own', audio }, startedIn);
    } catch (e) { say(`Could not load ${meta.label} (${(e as Error)?.message ?? 'not audio'})`); }
  };
  // MUSIC-SUITE P3 FIX PASS (decision #15): an upload is marked as one, explicitly — the sharing pass keys on it
  const loadOwn = (f: File) => keepAndOpen(f, { id: `own_${Date.now()}`, label: f.name.slice(0, 32), note: 'Uploaded by the player — their own recording.', upload: true });
  const toggleMic = async () => {
    if (recording) { recRef.current?.stop(); return; }
    const startedIn = projectId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = []; const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); recRef.current = null; setRecording(false);
        await keepAndOpen(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), { id: `mic_${Date.now()}`, label: 'mic take', note: 'Recorded in the room — the player\'s own take.' }, startedIn);
      };
      recRef.current = rec; rec.start(); setRecording(true); say('Recording… tap again to stop (8 s max)');
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 8000);
    } catch { say('Microphone not available'); }
  };

  /** Reslice when the player changes how (a fresh chop set: pitch / reverse / gate start over, as they always did). */
  const setMode = (m: 'transient' | 'grid') => onFlipChange((f) => ({ ...f, slicing: m, ...(live ? { rate: live.buffer.sampleRate } : {}), chops: live ? padsFromSlices(slicesFor(live, m, f.gridN)) : f.chops }));
  const setGridN = (n: number) => onFlipChange((f) => ({ ...f, gridN: n, ...(live && f.slicing === 'grid' ? { rate: live.buffer.sampleRate } : {}), chops: live && f.slicing === 'grid' ? padsFromSlices(slicesFor(live, 'grid', n)) : f.chops }), { group: 'flip-grid-n' });
  const setPads = (fn: (ps: Pad[]) => Pad[], group?: string) => onFlipChange((f) => ({ ...f, chops: fn(f.chops) }), group ? { group } : {});

  const padBuffer = useCallback((i: number): AudioBuffer | null => {
    if (!engine || !live) return null;
    const p = pads[i]; if (!p?.slice) return null;
    return chopBuffer(engine.context, live, p.slice, p.reverse, flip.rate);
  }, [engine, live, pads, flip.rate]);

  /** Pad i's chop as a grid row remembers it (its own copy of the source, so a later reslice never changes the row). */
  const chopRow = useCallback((i: number): ProjectFlipRow | null => {
    const p = pads[i];
    if (!source || !p?.slice) return null;
    const rate = flip.rate ?? live?.buffer.sampleRate;
    return { sampleId: flipSampleId(i), pad: i, label: `FLIP ${i + 1}`, source, slice: p.slice, reverse: p.reverse, pitch: p.pitch, gate: p.gate, ...(rate ? { rate } : {}) };
  }, [pads, source, flip.rate, live]);

  const play = useCallback((i: number) => {
    if (!engine) return;
    const b = padBuffer(i); if (!b) return;
    const ctx = engine.context; if (ctx.state === 'suspended') void ctx.resume();
    const node = ctx.createBufferSource(); node.buffer = b; node.playbackRate.value = rateForPitch(pads[i].pitch);
    const g = ctx.createGain(); g.gain.value = 0.9; node.connect(g).connect(ctx.destination); node.start();
    if (pads[i].gate) node.stop(ctx.currentTime + Math.min(b.duration / node.playbackRate.value, 1.2));
    setLit(i); setTimeout(() => setLit((l) => (l === i ? null : l)), 120);
    if (recArmRef.current && playingRef.current) {
      const row = chopRow(i);
      if (row) onRecordHit(i, quantizeTap(playheadRef.current, steps), { buffer: b, row });
    }
    window.__FEL_FLIP__ = { source: source?.id ?? null, slices: pads.filter((p) => p.slice).length, pads: PAD_COUNT, lastPlayed: i, mode, decoded: !!live };
  }, [engine, padBuffer, pads, onRecordHit, steps, source, mode, chopRow, live]);

  useEffect(() => { if (triggerRef) triggerRef.current = play; return () => { if (triggerRef) triggerRef.current = null; }; }, [play, triggerRef]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; const i = padForKey(e.key); if (i >= 0 && !e.repeat) { e.preventDefault(); play(i); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [play]);
  useEffect(() => {
    window.__FEL_FLIP__ = {
      source: source?.id ?? null, slices: pads.filter((p) => p.slice).length, pads: PAD_COUNT, lastPlayed: null, mode, decoded: !!live,
      edited: pads.filter((p) => p.pitch !== 0 || p.reverse || !p.gate).length,
    };
  }, [source, pads, mode, live]);

  const filled = useMemo(() => pads.filter((p) => p.slice).length, [pads]);
  const S: Record<string, React.CSSProperties> = {
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#2a1a10', fontWeight: 700, cursor: 'pointer' },
    alt: { padding: '6px 12px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: '#ffb347', background: 'transparent', color: '#ffd75e', cursor: 'pointer', fontSize: 12 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12, maxWidth: 420 },
    pad: { aspectRatio: '1', borderRadius: 12, borderWidth: 1, borderStyle: 'solid', borderColor: '#7a5c9e', background: '#33244a', color: '#e8d9c2', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation' },
    padOn: { background: '#ffb347', color: '#2a1a10', borderColor: '#ffd75e' },
    padEmpty: { opacity: 0.35, cursor: 'default' },
    padSel: { outline: '2px solid #22d3ee' },
  };
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>THE FLIP — chop a source onto sixteen pads. Sources: FEL&apos;s own stems, your recordings, public-domain records with a note. Never someone else&apos;s catalogue.</div>
      <div style={S.row}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>FEL STEMS:</span>
        {FEL_SOURCES.map((s) => <button key={s.id} style={{ ...S.alt, ...(source?.id === s.id ? { background: '#7a5c9e', color: '#fff', borderColor: '#7a5c9e' } : {}) }} onClick={() => guardReplace(s.label, () => void loadFel(s))}>{s.label}</button>)}
      </div>
      <div style={S.row}>
        <label style={S.alt}>YOUR FILE <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) guardReplace(f.name.slice(0, 32), () => void loadOwn(f)); }} /></label>
        <button style={{ ...S.alt, ...(recording ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={() => (recording ? void toggleMic() : guardReplace('a new mic take', () => void toggleMic()))}>{recording ? '■ STOP' : '● MIC TAKE'}</button>
        <button style={{ ...S.alt, ...(mode === 'transient' ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setMode('transient')}>TRANSIENTS</button>
        <button style={{ ...S.alt, ...(mode === 'grid' ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setMode('grid')}>GRID</button>
        {mode === 'grid' && <label style={{ fontSize: 12 }}>{gridN} <input type="range" min={2} max={16} value={gridN} onChange={(e) => setGridN(Number(e.target.value))} /></label>}
        <span data-qa="flip-source" style={{ fontSize: 12, opacity: 0.75 }}>{source ? `${source.label} · ${filled} slices · ${source.upload ? 'your upload' : source.kind}${live ? '' : ' · opening…'}` : 'no source loaded'}</span>
      </div>
      {/* MUSIC-SUITE P3 FIX PASS: replacing the player's own recording that no grid row plays asks first (UNDO also brings it back) */}
      {askReplace && source && (
        <div data-qa="flip-replace-confirm" role="group" aria-label={`Replace ${source.label}?`} style={{ ...S.row, padding: 8, borderRadius: 10, border: '1px solid #ffb4a2', background: 'rgba(0,0,0,0.25)' }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>Replace your {source.label} with {askReplace.next}?</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>No grid row plays it, and its {filled} pads{pads.some((p) => p.pitch !== 0 || p.reverse || !p.gate) ? ' (with your edits)' : ''} go with it. UNDO brings it back.</span>
          <button data-qa="flip-replace-yes" style={S.btn} onClick={() => { const go = askReplace.go; setAskReplace(null); go(); }}>REPLACE</button>
          <button style={S.alt} onClick={() => setAskReplace(null)}>KEEP</button>
        </div>
      )}
      <div style={S.grid}>
        {pads.map((p, i) => (
          <button key={i} style={{ ...S.pad, ...(p.slice ? {} : S.padEmpty), ...(lit === i ? S.padOn : {}), ...(selected === i ? S.padSel : {}) }}
            onPointerDown={(e) => { e.preventDefault(); if (p.slice) { play(i); setSelected(i); } }} disabled={!p.slice} aria-label={`pad ${i + 1}`}>
            <span style={{ fontWeight: 800 }}>{i + 1}</span>
            <span style={{ fontSize: 10, opacity: 0.8 }}>{PAD_KEYS[i]}{p.pitch ? ` · ${p.pitch > 0 ? '+' : ''}${p.pitch}` : ''}{p.reverse ? ' · rev' : ''}{rowPads?.has(i) ? ' · row' : ''}</span>
          </button>
        ))}
      </div>
      {selected !== null && pads[selected]?.slice && (
        <div style={S.row}>
          <span style={{ fontSize: 12 }}>PAD {selected + 1}</span>
          <label style={{ fontSize: 12 }}>pitch {pads[selected].pitch > 0 ? '+' : ''}{pads[selected].pitch}
            <input type="range" min={-12} max={12} value={pads[selected].pitch} onChange={(e) => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, pitch: Number(e.target.value) } : p)), `flip-pitch-${selected}`)} />
          </label>
          {/* MUSIC-SUITE P3 FIX PASS: pitch and gate are the PAD's — a grid row plays the chop as recorded (baked chops come later) */}
          {(pads[selected].pitch !== 0 || !pads[selected].gate) && (
            <span data-qa="flip-pitch-note" style={{ fontSize: 11, opacity: 0.7 }}>pad only — a grid row plays this chop at its recorded pitch and full length</span>
          )}
          <button style={{ ...S.alt, ...(pads[selected].reverse ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, reverse: !p.reverse } : p)))}>REVERSE</button>
          <button style={{ ...S.alt, ...(pads[selected].gate ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, gate: !p.gate } : p)))}>GATE</button>
          <button data-qa="flip-send" style={S.btn} onClick={() => {
            const b = padBuffer(selected); const row = chopRow(selected);
            if (!b || !row) return;
            const had = rowPads?.has(selected) ?? false;
            onAssign(selected, b, row);
            say(`Pad ${selected + 1} → ${had ? 'the FLIP ' + (selected + 1) + ' row now plays this chop' : 'row FLIP ' + (selected + 1)} — in the STUDIO grid under the kit rows`);
          }}>{rowPads?.has(selected) ? `REPLACE ROW FLIP ${selected + 1}` : 'SEND TO TRACK'}</button>
        </div>
      )}
      <div style={S.row}>
        <button style={{ ...S.alt, ...(recArm ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={() => setRecArm((a) => !a)}>{recArm ? '● REC ARMED' : 'ARM REC'}</button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{recArm ? (playing ? 'taps land on the step under the playhead' : 'press PLAY in the studio, then tap pads') : 'arm, play, tap — your hits write into the pattern'}</span>
      </div>
    </div>
  );
}
