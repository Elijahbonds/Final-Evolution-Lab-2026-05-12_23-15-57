'use client';
// SongPanel — arrangement, vocals and stems in the Academy (lane 2 M2/M3/M4). Save the grid as a named section, chain
// sections into a song, play the song (the engine swaps patterns at every bar line), record a take that starts on the next
// bar, export the mixdown and per-track stems as WAV links. Pure math lives in Song.ts; audio in AudioEngine.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { exportSongToDance, saveExportedTrack } from './DanceExport';
import type { AudioEngine, TrackState } from './AudioEngine';
import { MAX_SONG_BARS, SECTION_NAMES, expandChain, newSectionId, normalizeChain, renderLengthSec, sectionAtBar, snapshotTracks, songBars, type Section, type SongChain, type Take } from './Song';

declare global { interface Window { __FEL_SONG__?: { sections: number; chain: SongChain; bars: number; songMode: boolean; bar: number; section: string | null; takes: number; stems: number } } }

/**
 * MUSIC-SUITE P2 (2026-09-25): a section keeps the swing it was saved at. The song-mode swap (was :52) handed the engine
 * `swing: 0.15` on EVERY bar line, whatever the player had set, so a straight section played swung and a hard-swung one
 * lost its swing at the first swap; the song render used one swing for every bar. `swing` is optional so a section from
 * before this change plays at the room's swing.
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
  engine: AudioEngine | null; tracks: TrackState[]; setTracks: (t: TrackState[]) => void; playing: boolean; bpm: number; steps: number; say: (m: string) => void;
  /** MUSIC-SUITE P2: the room's swing (saved into each section) and its setter (song mode moves the slider to the section's). */
  swing: number; setSwing?: (s: number) => void;
  S: Record<string, React.CSSProperties>;
  /** Told when a section is saved and when one is put in the chain — the two gates on the studio tier. */
  onSectionSaved?: () => void;
  onChained?: () => void;
}

export default function SongPanel({ engine, tracks, setTracks, playing, bpm, steps, say, S, onSectionSaved, onChained, swing, setSwing }: SongPanelProps) {
  const [sections, setSections] = useState<SwungSection[]>([]);
  const swingRef = useRef(swing); useEffect(() => { swingRef.current = swing; }, [swing]);
  /** Has this song been sent to the dance floor? Resets when the arrangement changes under it. */
  const [danced, setDanced] = useState(false);
  /** Stable per mount, so re-exporting the same song overwrites its slot instead of piling up. */
  const songId = useRef(`s${Date.now().toString(36)}`).current;
  const [chain, setChain] = useState<SongChain>([]);
  const [songMode, setSongMode] = useState(false);
  const [bar, setBar] = useState(0);
  const [sectionNow, setSectionNow] = useState<string | null>(null);
  const [name, setName] = useState<string>('verse');
  const [takes, setTakes] = useState<(Take & { buffer: AudioBuffer })[]>([]);
  const [armed, setArmed] = useState(false); const [recording, setRecording] = useState(false);
  const [stems, setStems] = useState<{ name: string; url: string }[]>([]);
  const [mixUrl, setMixUrl] = useState<string | null>(null); const [rendering, setRendering] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null); const streamRef = useRef<MediaStream | null>(null);
  const armedRef = useRef(armed); useEffect(() => { armedRef.current = armed; }, [armed]);
  const chainRef = useRef(chain); useEffect(() => { chainRef.current = chain; }, [chain]);
  // an arrangement edited after an export no longer matches what the dance floor holds — the tick would be a lie
  useEffect(() => { setDanced(false); }, [chain, sections]);
  const sectionsRef = useRef(sections); useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const songModeRef = useRef(songMode); useEffect(() => { songModeRef.current = songMode; }, [songMode]);

  // the engine crosses a bar line → swap in that bar's section (song mode) and start an armed take
  useEffect(() => {
    if (!engine) return;
    engine.onBar = (b) => {
      setBar(b);
      if (songModeRef.current) {
        const at = sectionAtBar(chainRef.current, b);
        const sec = at ? sectionsRef.current.find((s) => s.id === at.sectionId) : null;
        setSectionNow(sec?.name ?? null);
        if (sec) {
          const sw = sec.swing ?? swingRef.current;   // MUSIC-SUITE P2: the section's own swing, never a forced 0.15
          engine.setState({ bpm, steps, tracks: snapshotTracks(sec.tracks), swing: sw }); setTracks(snapshotTracks(sec.tracks));
          if (sw !== swingRef.current) setSwing?.(sw);   // the slider follows, so the room's next setState keeps it
        }
      }
      if (armedRef.current && !recRef.current) void beginTake(b);
    };
    return () => { engine.onBar = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, bpm, steps]);

  useEffect(() => { engine?.setOneShots(takes.map((t) => ({ id: t.id, buffer: t.buffer, atBar: t.atBar, gain: t.gain }))); }, [engine, takes]);
  useEffect(() => { window.__FEL_SONG__ = { sections: sections.length, chain, bars: songBars(chain), songMode, bar, section: sectionNow, takes: takes.length, stems: stems.length }; }, [sections, chain, songMode, bar, sectionNow, takes, stems]);

  const saveSection = () => {
    const s: SwungSection = { id: newSectionId(name), name, tracks: snapshotTracks(tracks), swing };
    setSections((a) => [...a, s]); setChain((c) => normalizeChain([...c, { sectionId: s.id, bars: 2 }], [...sections, s]));
    // Saving a section also drops it into the chain, so this one action is both events.
    onSectionSaved?.(); onChained?.();
    say(`Saved "${name}" — added to the song`);
  };
  const beginTake = useCallback(async (atBar: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      const chunks: BlobPart[] = []; const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); recRef.current = null; setRecording(false); setArmed(false);
        if (!engine) return;
        const buf = await engine.context.decodeAudioData(await new Blob(chunks).arrayBuffer());
        setTakes((a) => [...a, { id: `${a.length + 1}`, atBar, gain: 0.9, durationSec: buf.duration, buffer: buf }]);
        say(`Take ${takes.length + 1} on bar ${atBar + 1} — ${buf.duration.toFixed(1)} s`);
      };
      recRef.current = rec; rec.start(); setRecording(true); say(`Recording from bar ${atBar + 1}…`);
    } catch { setArmed(false); say('Microphone not available'); }
  }, [engine, say, takes.length]);
  const stopTake = () => recRef.current?.stop();

  const exportSong = async () => {
    if (!engine || rendering) return;
    const bars = expandChain(chain, sections); if (!bars.length) { say('Chain some sections first'); return; }
    setRendering(true);
    try {
      const len = renderLengthSec(bars.length, bpm, steps, takes);
      const shots = takes.map((t) => ({ id: t.id, buffer: t.buffer, atBar: t.atBar, gain: t.gain }));
      const barSwing = expandChainSwing(chain, sections, swing);   // MUSIC-SUITE P2: each bar at its section's swing
      const mix = await engine.renderSong(bars, shots, len, barSwing);
      const st = await engine.renderSongStems(bars, shots, len, barSwing);
      if (mixUrl) URL.revokeObjectURL(mixUrl); for (const s of stems) URL.revokeObjectURL(s.url);
      setMixUrl(URL.createObjectURL(mix)); setStems(st.map((s) => ({ name: s.name, url: URL.createObjectURL(s.blob) })));
      say(`Rendered ${bars.length} bars · ${st.length} stems`);
    } finally { setRendering(false); }
  };

  const total = songBars(chain);
  return (
    <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.22)' }}>
      <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>SONG — sections, chain, take, stems</div>
      <div style={S.row}>
        <select value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 6, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }}>{SECTION_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <button style={S.btnAlt} onClick={saveSection}>SAVE GRID AS SECTION</button>
        <button style={{ ...S.btnAlt, ...(songMode ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setSongMode((m) => !m)} disabled={!chain.length}>SONG MODE {songMode ? 'ON' : 'OFF'}</button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{total} bars{playing && songMode ? ` · bar ${bar + 1}${sectionNow ? ` · ${sectionNow}` : ''}` : ''}</span>
      </div>
      {chain.length > 0 && (
        <div style={S.row}>
          {chain.map((e, i) => {
            const s = sections.find((x) => x.id === e.sectionId);
            return (
              <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: sectionNow === s?.name && playing && songMode ? '#ffb347' : '#33244a', color: sectionNow === s?.name && playing && songMode ? '#2a1a10' : '#e8d9c2', fontSize: 12 }}>
                {s?.name ?? '?'}
                <button onClick={() => setChain((c) => c.map((x, j) => (j === i ? { ...x, bars: Math.max(1, x.bars - 1) } : x)))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>−</button>
                {e.bars}
                <button onClick={() => setChain((c) => c.map((x, j) => (j === i ? { ...x, bars: Math.min(8, x.bars + 1) } : x)))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>+</button>
                <button onClick={() => setChain((c) => c.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>×</button>
              </span>
            );
          })}
          {sections.map((s) => <button key={s.id} style={{ ...S.btnAlt, fontSize: 11 }} onClick={() => { setChain((c) => normalizeChain([...c, { sectionId: s.id, bars: 2 }], sections)); onChained?.(); }}>+ {s.name}</button>)}
        </div>
      )}
      <div style={S.row}>
        <button style={{ ...S.btnAlt, ...(armed || recording ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={() => (recording ? stopTake() : setArmed((a) => !a))}>{recording ? '■ STOP TAKE' : armed ? '● ARMED — starts next bar' : '● RECORD TAKE'}</button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{playing ? 'the take starts on the next bar line and rides the song' : 'press PLAY first — the take punches in on a bar'}</span>
        {takes.map((t) => <span key={t.id} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 8, background: '#33244a' }}>take {t.id} · bar {t.atBar + 1} · {t.durationSec.toFixed(1)}s <button onClick={() => setTakes((a) => a.filter((x) => x.id !== t.id))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>×</button></span>)}
      </div>
      <div style={S.row}>
        {/* DANCE RHYTHM EXPORT. The chart is built from the song's own drums (music/DanceExport.ts), not from a
            seed, so the routine lands on the hits the player wrote. Available whenever there is something to
            dance to — a single bar of kicks is already a chart, which is the point of putting it at the grid
            tier rather than behind the arrangement. */}
        <button
          style={{ ...S.btnAlt, ...(danced ? { background: '#4FD1E8', color: '#101018', borderColor: '#4FD1E8' } : {}) }}
          disabled={!chain.length}
          onClick={() => {
            const out = exportSongToDance({ id: songId, name: 'My Track', bpm, steps, chain, sections });
            if (!out) { say('nothing to dance to yet — put a hit in the grid first'); return; }
            saveExportedTrack(out);
            setDanced(true);
            say(`sent to the dance floor · ${out.summary.hits} hits · ${out.track.bars} bars · ${'●'.repeat(out.track.difficulty)}`);
          }}
        >{danced ? '✓ ON THE DANCE FLOOR' : '♪ SEND TO THE DANCE FLOOR'}</button>
        <button style={S.btn} disabled={rendering || !chain.length} onClick={() => void exportSong()}>{rendering ? 'RENDERING…' : 'RENDER SONG + STEMS'}</button>
        {mixUrl && <a href={mixUrl} download="fel-song-mix.wav" style={{ ...S.btnAlt, textDecoration: 'none' }}>⬇ MIX</a>}
        {stems.map((s) => <a key={s.name} href={s.url} download={`fel-stem-${s.name.replace(/\s+/g, '_')}.wav`} style={{ ...S.btnAlt, textDecoration: 'none', fontSize: 11 }}>⬇ {s.name}</a>)}
      </div>
    </div>
  );
}
