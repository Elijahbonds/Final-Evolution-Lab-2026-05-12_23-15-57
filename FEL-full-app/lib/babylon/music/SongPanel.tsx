'use client';
// SongPanel — arrangement, vocals and stems in the Academy (lane 2 M2/M3/M4). Save the grid as a named section, chain
// sections into a song, play the song (the engine swaps patterns at every bar line), record a take that starts on the next
// bar, export the mixdown and per-track stems as WAV links. Pure math lives in Song.ts; audio in AudioEngine.
//
// MUSIC-SUITE P3 (2026-09-25), "Keep my work": the sections, the chain and the takes are the PROJECT's now
// (StudioProject.ts SongSlice), read from `song` and changed through `onSongChange`. They were this component's useState
// (:42, :48, :53 then), so they died with it: SongPanel unmounted on every tab switch (P1: sections 1 → 0, chain bars 2 →
// 0 after FLIP and back) and on GameShell's REPLAY remount and a reload (the grid too). StudioMode also keeps this panel
// MOUNTED (hidden) off the STUDIO tab, so song mode keeps swapping sections on the bar line and a take being recorded
// keeps recording while the player is on FLIP (it lost its recorder and its STOP button on unmount).
//   · A take's audio is kept as bytes (saveAudio → the project holds an AudioRef; studioStore.ts), and decoded again
//     from the store after a reload. A take whose audio isn't on this device any more says so and can be removed.
//
// MUSIC-SUITE P3 (2026-09-25), tier-honesty-editing:
//   · SONG MODE NO LONGER WRITES THE GRID. Every bar line did `engine.setState(section)` AND `setTracks(section)` (and
//     moved the swing slider), so the working grid became whichever section was playing: an edit made in song mode was
//     overwritten at the next bar, and turning song mode off left the LAST section in the grid — the player's own beat
//     gone. Song mode is now a separate playback source: the bar line hands the engine the section (studioEdit
//     sectionForBar) and tells the room which one (`onSongNow`, so the grid can SHOW it, read-only); the project's grid
//     and swing are never touched, and song mode off plays the player's own grid again (StudioMode's engine effect).
//     Song mode itself is the room's state (`songMode` / `onSongMode`), because the grid and the engine effect read it.
//   · SECTIONS ARE EDITABLE. saveSection only appended: no rename, no update, no delete, no reorder. Each section now has
//     RENAME, UPDATE FROM GRID, + CHAIN and DELETE (asked first, with how many chain places go with it); each chain entry
//     moves left / right. The rules are studioEdit.ts (pure, tested); every one is an undo step (StudioMode records them).
//   · TIER HONESTY. RECORD TAKE is a STUDIO feature (MusicTiers `takes`) and RENDER SONG + STEMS too (`mixdown`), but both
//     were on screen from the CHAIN (this panel mounts at `arrangement`). They follow `caps` now. SEND TO THE DANCE FLOOR
//     moved to the room: the ladder opens it at the GRID, where this panel is not mounted (DanceExport danceSongAtTier).
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25):
//   * A TAKE'S × ASKED NOTHING AND COULD NOT BE UNDONE — the player's own vocal, gone on one tap of a 0.6-opacity × a few
//     pixels from its label, and its bytes swept from the store an hour after it was recorded. It asks first now, naming
//     the take and its length, and the removal is an undo step (the room's undo slice holds the takes).
//   * A TAKE LANDS IN THE PROJECT IT WAS RECORDED IN. The room remounts this panel when another project opens, and the
//     unmount stops the recorder; onstop then added the take to whatever project was open by then (a REMIX pressed while
//     it recorded put it in the remix). The take is handed to the room with the id of the project it started in
//     (`onTake`), and the room puts it there.
//   * SONG MODE HIDES THE WORKING GRID, so SAVE GRID AS SECTION and UPDATE FROM GRID (which snapshot the hidden grid, not
//     the section on screen) are held while it is on, and say why.
//   * The room shows a STOP for a take recording while this panel is hidden on another tab (`stopRef`).
//
// MUSIC-SUITE P4 (2026-09-25), the recording booth: RECORD TAKE is gone from here. It opened the mic and a MediaRecorder
// inside onBar (was :153-157 and :250-274), which fires up to ~125 ms before the bar is audible, behind a first-time
// permission prompt, with echo cancellation and AGC on; the take was placed on the bar anyway, played once at its absolute
// bar through setOneShots (was :194), and STOP only cleared a timer. The booth (ui/RecordBooth.tsx, clock math in
// takeCapture.ts) arms the mic ahead of time with raw input and a meter, counts in, cuts the take sample-accurately from a
// worklet tape stamped on the audio clock, and hands the takes to engine.setTakes (they loop on their bars and stop on
// STOP), with gain / trim / mute / delete and best of N. This panel keeps the decoded takes (useTakeBuffers) because
// RENDER SONG + STEMS uses them: each group's pick, trims as silence, muted takes left out (engineTakeList + gatePcm).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine, RenderSounds, TrackState } from './AudioEngine';
import { MAX_SONG_BARS, SECTION_NAMES, expandChain, newSectionId, normalizeChain, renderLengthSec, snapshotTracks, songBars, type Section, type SongChain } from './Song';
import type { AudioRef, ProjectSection, ProjectTake, SongSlice } from './StudioProject';
import RecordBooth, { useTakeBuffers } from './ui/RecordBooth';
import { engineTakeList } from './takeCapture';
import {
  SECTION_NAME_MAX, chainUses, deleteSection, moveChainEntry, renameSection, sectionForBar, updateSectionFromGrid,
} from './studioEdit';

declare global { interface Window { __FEL_SONG__?: { sections: number; chain: SongChain; bars: number; songMode: boolean; bar: number; section: string | null; takes: number; stems: number; takesLoaded?: number; takesMissing?: number; songId?: string; songName?: string; names?: string[] } } }

/**
 * MUSIC-SUITE P2 (2026-09-25): a section keeps the swing it was saved at. The song-mode swap (was :52) handed the engine
 * `swing: 0.15` on EVERY bar line, whatever the player had set, so a straight section played swung and a hard-swung one
 * lost its swing at the first swap; the song render used one swing for every bar. `swing` is optional so a section from
 * before this change plays at the room's swing.
 * MUSIC-SUITE P3: the project's ProjectSection carries it (required; StudioProject.ts migrate fills an old one's).
 */
export type SwungSection = Section & { swing?: number };

/** The swing of each bar of the song, laid out exactly as Song.expandChain lays out its patterns (same skips, same cap). */
export function expandChainSwing(chain: SongChain, sections: SwungSection[], fallback: number): number[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const out: number[] = [];
  for (const e of chain) {
    const s = byId.get(e.sectionId); if (!s) continue;
    for (let i = 0; i < Math.max(0, Math.floor(e.bars)) && out.length < MAX_SONG_BARS; i++) out.push(s.swing ?? fallback);
  }
  return out;
}

export interface SongPanelProps {
  /** `tracks` is the WORKING grid (the project's) — what SAVE and UPDATE FROM GRID snapshot. This panel never writes it. */
  engine: AudioEngine | null; tracks: TrackState[]; playing: boolean; bpm: number; steps: number; say: (m: string) => void;
  /** MUSIC-SUITE P2: the room's swing (saved into each section). */
  swing: number;
  S: Record<string, React.CSSProperties>;
  /** Told when a section is saved and when one is put in the chain — the two gates on the studio tier. */
  onSectionSaved?: () => void;
  onChained?: () => void;
  /** MUSIC-SUITE P3: the project's song — its id and title, sections, chain and takes. */
  song: SongSlice & { id: string; title: string };
  /** MUSIC-SUITE P3: the one way this panel changes the song (the project's state; autosaved; each change an undo step). */
  onSongChange: (fn: (s: SongSlice) => SongSlice) => void;
  /** MUSIC-SUITE P3: keep a take's bytes (the ref goes in the project) / read them back after a reload. */
  saveAudio: (blob: Blob) => Promise<AudioRef>;
  loadAudio: (ref: AudioRef) => Promise<ArrayBuffer | null>;
  /** MUSIC-SUITE P3: a render finished (it counts toward the day's creation session). */
  onRendered?: () => void;
  /** MUSIC-SUITE P3: a take is armed or recording (the room holds MY PROJECTS until it stops).
   *  MUSIC-SUITE P4: `what` says whether it is only the booth's open mic ('mic') or a take counting in / recording ('take'). */
  onRecording?: (on: boolean, what?: 'mic' | 'take') => void;
  /** MUSIC-SUITE P3: song mode is the room's (the grid shows the playing section read-only; the engine effect stands down). */
  songMode: boolean;
  onSongMode: (on: boolean) => void;
  /** MUSIC-SUITE P3: the section the song is playing now (null when none) — the grid shows it. */
  onSongNow?: (sectionId: string | null) => void;
  /** MUSIC-SUITE P3: the tier's gates (MusicTiers): takes and the song render + stems are STUDIO features. */
  caps: { takes: boolean; mixdown: boolean };
  /** MUSIC-SUITE P3 FIX PASS: a finished take, with the id of the project it was recorded in (the room puts it there). */
  onTake?: (take: ProjectTake, projectId: string) => void;
  /** MUSIC-SUITE P3 FIX PASS: filled with this panel's STOP TAKE, so the room can show it while the panel is hidden. */
  stopRef?: React.MutableRefObject<(() => void) | null>;
  /** MUSIC-SUITE P4: start/stop the room's transport (RECORD from a stop counts in and starts the song through it). */
  onTransport?: (play: boolean) => void;
  /**
   * MUSIC-SUITE P5 FIX PASS (2026-09-25): what each of the song's first `bars` bars plays on its Flip rows — its section's
   * own chops (StudioMode, studioEdit.songBarSounds). Absent = the engine's sounds (as before).
   */
  barSounds?: (bars: number) => Promise<readonly (RenderSounds | null)[]>;
}

export default function SongPanel({ engine, tracks, playing, bpm, steps, say, S, onSectionSaved, onChained, swing, song, onSongChange, saveAudio, loadAudio, onRendered, onRecording, songMode, onSongMode, onSongNow, caps, onTake, stopRef, onTransport, barSounds }: SongPanelProps) {
  const { sections, chain, takes } = song;
  const swingRef = useRef(swing); useEffect(() => { swingRef.current = swing; }, [swing]);
  const [bar, setBar] = useState(0);
  /** The section the song is playing (song mode), by id — two sections may share a name. */
  const [nowId, setNowId] = useState<string | null>(null);
  const sectionNow = nowId ? sections.find((s) => s.id === nowId)?.name ?? null : null;
  const [name, setName] = useState<string>('verse');
  /** MUSIC-SUITE P3: the section being renamed (inline), and the section whose DELETE is being asked about. */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** MUSIC-SUITE P3: each take's decoded audio, by take id (the project holds only its bytes' ref); takes whose bytes are
   *  not on this device are shown, never silently gone. MUSIC-SUITE P4: the hook lives with the booth (ui/RecordBooth). */
  const { buffers, missing, addBuffer } = useTakeBuffers(engine?.context ?? null, takes, loadAudio, say);
  const [stems, setStems] = useState<{ name: string; url: string }[]>([]);
  const [mixUrl, setMixUrl] = useState<string | null>(null); const [rendering, setRendering] = useState(false);
  const chainRef = useRef(chain); useEffect(() => { chainRef.current = chain; }, [chain]);
  const sectionsRef = useRef(sections); useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const songModeRef = useRef(songMode); songModeRef.current = songMode;
  const onSongNowRef = useRef(onSongNow); onSongNowRef.current = onSongNow;

  /** MUSIC-SUITE P3: put a section on the engine (never on the grid) and tell the room which one is playing. */
  const playSection = useCallback((b: number): void => {
    if (!engine) return;
    const sec = sectionForBar(chainRef.current, sectionsRef.current, b);
    setNowId(sec?.id ?? null);
    onSongNowRef.current?.(sec?.id ?? null);
    if (sec) {
      const sw = sec.swing ?? swingRef.current;   // MUSIC-SUITE P2: the section's own swing, never a forced 0.15
      engine.setState({ bpm, steps, tracks: snapshotTracks(sec.tracks), swing: sw });
    }
  }, [engine, bpm, steps]);

  // the engine crosses a bar line → song mode plays that bar's section (the working grid is not written). MUSIC-SUITE P4:
  // a take no longer starts here (the booth watches the bar's scheduled audio time instead — ui/RecordBooth)
  useEffect(() => {
    if (!engine) return;
    engine.onBar = (b) => {
      setBar(b);
      if (songModeRef.current) playSection(b);
    };
    return () => { engine.onBar = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, playSection]);

  // MUSIC-SUITE P3: song mode ON while playing swaps the section in at once (what the grid shows is what plays); OFF hands
  // the engine back to the room, which plays the player's own grid again. An emptied chain turns song mode off.
  useEffect(() => {
    if (!engine) return;
    if (songMode && !chain.length) { onSongMode(false); return; }
    if (songMode) playSection(engine.isRunning ? engine.currentBar : 0);
    else { setNowId(null); onSongNowRef.current?.(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songMode, engine, chain.length === 0]);

  // MUSIC-SUITE P4: what the takes PLAY is the booth's (engine.setTakes: each group's pick, looping on its bars)
  const playable = takes.filter((t) => buffers.has(t.id));
  useEffect(() => {
    window.__FEL_SONG__ = {
      sections: sections.length, chain, bars: songBars(chain), songMode, bar, section: sectionNow, takes: takes.length, stems: stems.length,
      takesLoaded: playable.length, takesMissing: missing.size, songId: song.id, songName: song.title, names: sections.map((s) => s.name),
    };
  }, [sections, chain, songMode, bar, sectionNow, takes, stems, playable.length, missing, song.id, song.title]);

  const saveSection = () => {
    if (gridHidden) { say(HIDDEN_GRID_LINE); return; }
    const s: ProjectSection = { id: newSectionId(name), name, tracks: snapshotTracks(tracks), swing };
    onSongChange((x) => ({ ...x, sections: [...x.sections, s], chain: normalizeChain([...x.chain, { sectionId: s.id, bars: 2 }], [...x.sections, s]) }));
    // Saving a section also drops it into the chain, so this one action is both events.
    onSectionSaved?.(); onChained?.();
    say(`Saved "${name}" — added to the song`);
  };
  const setChain = (fn: (c: SongChain) => SongChain) => onSongChange((x) => ({ ...x, chain: fn(x.chain) }));
  /** MUSIC-SUITE P3 FIX PASS: song mode shows a section; the working grid these two snapshot is hidden under it. */
  const gridHidden = songMode;
  const HIDDEN_GRID_LINE = 'Turn SONG MODE off first — your own grid is hidden under the section that is playing';

  // MUSIC-SUITE P3: the section edits (studioEdit.ts). Each goes through onSongChange, so each is an undo step.
  const commitRename = (): void => {
    if (!renaming) return;
    const was = sections.find((s) => s.id === renaming.id)?.name;
    onSongChange((x) => renameSection(x, renaming.id, renaming.name));
    setRenaming(null);
    if (was && renaming.name.trim() && renaming.name.trim() !== was) say(`"${was}" is now "${renaming.name.replace(/\s+/g, ' ').trim().slice(0, SECTION_NAME_MAX)}"`);
  };
  const updateFromGrid = (s: ProjectSection): void => {
    if (gridHidden) { say(HIDDEN_GRID_LINE); return; }
    onSongChange((x) => updateSectionFromGrid(x, s.id, tracks, swing));
    say(`"${s.name}" now plays your grid (swing ${Math.round(swing * 100)} %) — UNDO puts the old one back`);
  };
  const addToChain = (s: ProjectSection): void => {
    setChain((c) => normalizeChain([...c, { sectionId: s.id, bars: 2 }], sectionsRef.current));
    onChained?.();
  };
  const doDelete = (id: string): void => {
    const s = sections.find((x) => x.id === id);
    onSongChange((x) => deleteSection(x, id));
    setConfirmDelete(null);
    if (s) say(`Deleted "${s.name}" — UNDO brings it back`);
  };

  const exportSong = async () => {
    if (!engine || rendering || !caps.mixdown) return;
    const bars = expandChain(chain, sections); if (!bars.length) { say('Chain some sections first'); return; }
    setRendering(true);
    try {
      // MUSIC-SUITE P4: the takes the song plays — each best-of-N group's pick, on its bar of the song, muted ones left
      // out, the trim-in as a gate (the render's playTake starts it that far after the bar line, that far in: it keeps its
      // place — MUSIC-SUITE P4 FIX PASS: no gated copy of the buffer, the engine never slid it) and the trim-out / the
      // region's end as the engine's end position; stems are named "take 1", "take 2" … by position (a take's id is only a key)
      const heard = engineTakeList(takes, buffers, { songMode: true, songBars: bars.length, bpm, stepsPerBar: steps }).filter((t) => !t.muted);
      const shots = heard.map((t) => ({
        id: String(takes.findIndex((x) => x.id === t.id) + 1),
        buffer: t.buffer,
        atBar: t.startBar, gain: t.gain, trimStart: t.trimStart, trimEnd: t.trimEnd,
      }));
      const len = renderLengthSec(bars.length, bpm, steps, heard.map((t) => ({ id: t.id, atBar: t.startBar, gain: t.gain, durationSec: t.trimEnd })));
      const barSwing = expandChainSwing(chain, sections, swing);   // MUSIC-SUITE P2: each bar at its section's swing
      // MUSIC-SUITE P5 FIX PASS (2026-09-25): …and each bar's Flip rows play its section's own chops, as live song mode does
      // (the renders read the engine's sounds: the last section song mode swapped in, for every bar)
      const sounds = barSounds ? await barSounds(bars.length) : undefined;
      const mix = await engine.renderSong(bars, shots, len, barSwing, sounds);
      const st = await engine.renderSongStems(bars, shots, len, barSwing, sounds);
      if (mixUrl) URL.revokeObjectURL(mixUrl); for (const s of stems) URL.revokeObjectURL(s.url);
      setMixUrl(URL.createObjectURL(mix)); setStems(st.map((s) => ({ name: s.name, url: URL.createObjectURL(s.blob) })));
      const gone = takes.length - playable.length;
      say(`Rendered ${bars.length} bars · ${st.length} stems${shots.length ? ` · ${shots.length} take${shots.length === 1 ? '' : 's'}` : ''}${gone ? ` · ${gone} take${gone === 1 ? '' : 's'} left out (audio missing)` : ''}`);
      onRendered?.();
    } finally { setRendering(false); }
  };

  const total = songBars(chain);
  const mini: React.CSSProperties = { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11, padding: '0 3px' };
  const delSection = confirmDelete ? sections.find((s) => s.id === confirmDelete) ?? null : null;
  return (
    <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.22)' }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>SONG — sections, chain{caps.takes ? ', takes' : ''}{caps.mixdown ? ', stems' : ''}</div>
      <div style={S.row}>
        <select value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 6, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }}>{SECTION_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <button style={{ ...S.btnAlt, ...(gridHidden ? { opacity: 0.5 } : {}) }} data-qa="save-section" onClick={saveSection} title={gridHidden ? HIDDEN_GRID_LINE : undefined}>SAVE GRID AS SECTION</button>
        <button data-qa="song-mode" style={{ ...S.btnAlt, ...(songMode ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => onSongMode(!songMode)} disabled={!chain.length}>SONG MODE {songMode ? 'ON' : 'OFF'}</button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{total} bars{playing && songMode ? ` · bar ${bar + 1}${sectionNow ? ` · ${sectionNow}` : ''}` : ''}{songMode ? ' · your grid is kept; song mode off plays it again' : ''}</span>
      </div>

      {/* MUSIC-SUITE P3: each section can be renamed, updated from the grid, added to the chain again, or deleted (asked
          first). Every one of these is an undo step. */}
      {sections.length > 0 && (
        <div data-qa="song-sections" style={S.row}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>SECTIONS:</span>
          {sections.map((s) => {
            const now = songMode && nowId === s.id;
            return (
              <span key={s.id} data-qa="song-section" data-section={s.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: now ? '#ffb347' : '#2b1f40', color: now ? '#2a1a10' : '#e8d9c2', fontSize: 12, border: '1px solid #5a4470' }}>
                {renaming?.id === s.id ? (
                  <>
                    <input aria-label={`new name for ${s.name}`} data-qa="section-rename-input" autoFocus value={renaming.name} maxLength={SECTION_NAME_MAX}
                      onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                      style={{ width: 110, padding: '2px 6px', borderRadius: 6, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }} />
                    <button style={mini} onClick={commitRename}>OK</button>
                    <button style={{ ...mini, opacity: 0.7 }} onClick={() => setRenaming(null)}>CANCEL</button>
                  </>
                ) : (
                  <>
                    <b>{s.name}</b>
                    <span style={{ opacity: 0.65, fontSize: 11 }}>· {Math.round(s.swing * 100)}% swing · in chain ×{chainUses(chain, s.id)}</span>
                    <button style={mini} onClick={() => setRenaming({ id: s.id, name: s.name })}>RENAME</button>
                    <button style={{ ...mini, ...(gridHidden ? { opacity: 0.5 } : {}) }} data-qa="section-update" title={gridHidden ? HIDDEN_GRID_LINE : undefined} onClick={() => updateFromGrid(s)}>UPDATE FROM GRID</button>
                    <button style={mini} onClick={() => addToChain(s)}>+ CHAIN</button>
                    <button style={{ ...mini, color: now ? '#7a1d10' : '#ffb4a2' }} onClick={() => setConfirmDelete(s.id)}>DELETE</button>
                  </>
                )}
              </span>
            );
          })}
        </div>
      )}
      {delSection && (
        <div data-qa="section-delete-confirm" role="group" aria-label={`Delete ${delSection.name}?`} style={{ ...S.card, border: '1px solid #ffb4a2' }}>
          <span style={{ fontWeight: 700 }}>Delete &quot;{delSection.name}&quot;?</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {chainUses(chain, delSection.id) ? `Its ${chainUses(chain, delSection.id)} place${chainUses(chain, delSection.id) === 1 ? '' : 's'} in the chain go${chainUses(chain, delSection.id) === 1 ? 'es' : ''} too. ` : ''}UNDO brings it back.
          </span>
          <button data-qa="section-delete-yes" style={S.btn} onClick={() => doDelete(delSection.id)}>DELETE</button>
          <button style={S.btnAlt} onClick={() => setConfirmDelete(null)}>KEEP</button>
        </div>
      )}

      {chain.length > 0 && (
        <div data-qa="song-chain" style={S.row}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>CHAIN:</span>
          {chain.map((e, i) => {
            const s = sections.find((x) => x.id === e.sectionId);
            const lit = !!s && nowId === s.id && playing && songMode;
            return (
              <span key={i} data-qa="chain-entry" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: lit ? '#ffb347' : '#33244a', color: lit ? '#2a1a10' : '#e8d9c2', fontSize: 12 }}>
                {/* MUSIC-SUITE P3: reorder the chain */}
                <button aria-label="move earlier" style={mini} disabled={i === 0} onClick={() => setChain((c) => moveChainEntry(c, i, i - 1))}>◀</button>
                {s?.name ?? '?'}
                <button onClick={() => setChain((c) => c.map((x, j) => (j === i ? { ...x, bars: Math.max(1, x.bars - 1) } : x)))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>−</button>
                {e.bars}
                <button onClick={() => setChain((c) => c.map((x, j) => (j === i ? { ...x, bars: Math.min(8, x.bars + 1) } : x)))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>+</button>
                <button aria-label="move later" style={mini} disabled={i === chain.length - 1} onClick={() => setChain((c) => moveChainEntry(c, i, i + 1))}>▶</button>
                <button aria-label="remove from the chain" onClick={() => setChain((c) => c.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>×</button>
              </span>
            );
          })}
        </div>
      )}

      {/* MUSIC-SUITE P3: takes are a STUDIO feature (MusicTiers `takes`). A take already in the project is listed (and
          plays) whatever the tier — nothing is hidden that is heard. MUSIC-SUITE P4: the recording booth (arm, meter,
          count-in, bar-aligned takes that loop and stop, gain / trim / mute / delete, best of N). */}
      {(caps.takes || takes.length > 0) && (
        <RecordBooth
          engine={engine} bpm={bpm} steps={steps} songMode={songMode} songBars={total} takes={takes} projectId={song.id}
          canRecord={caps.takes} buffers={buffers} missing={missing} addBuffer={addBuffer}
          onSongChange={onSongChange} onTake={onTake} saveAudio={saveAudio} say={say} S={S}
          onRecording={onRecording} stopRef={stopRef} onTransport={onTransport}
        />
      )}
      {/* MUSIC-SUITE P3: the song render + stems are a STUDIO feature (MusicTiers `mixdown`). */}
      {caps.mixdown && (
        <div style={S.row}>
          <button style={S.btn} disabled={rendering || !chain.length} onClick={() => void exportSong()}>{rendering ? 'RENDERING…' : 'RENDER SONG + STEMS'}</button>
          {mixUrl && <a href={mixUrl} download="fel-song-mix.wav" style={{ ...S.btnAlt, textDecoration: 'none' }}>⬇ MIX</a>}
          {stems.map((s) => <a key={s.name} href={s.url} download={`fel-stem-${s.name.replace(/\s+/g, '_')}.wav`} style={{ ...S.btnAlt, textDecoration: 'none', fontSize: 11 }}>⬇ {s.name}</a>)}
        </div>
      )}
    </div>
  );
}
