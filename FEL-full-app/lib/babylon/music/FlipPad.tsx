'use client';
// FlipPad — the chop pad (lane 2 M1). Load a source (FEL stem, your own file, or a mic take), slice it on transients or a
// grid, play the 16 pads by touch or keyboard (1234 / qwer / asdf / zxcv), tune pitch and reverse per pad, send a pad to
// a groovebox track, and record taps live into the running pattern. Web Audio only — no dependency.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioEngine } from './AudioEngine';
import { FEL_SOURCES, PAD_COUNT, PAD_KEYS, onsetSlices, gridSlices, padForKey, padsFromSlices, quantizeTap, rateForPitch, sliceSamples, type FlipSource, type Pad } from './Flip';

export interface FlipPadProps {
  engine: AudioEngine | null;
  playing: boolean;
  playhead: number;
  steps: number;
  /** a pad's slice becomes (or replaces) the groovebox track `flip_<pad>` */
  onAssign: (pad: number, buffer: AudioBuffer, label: string) => void;
  /** a live tap while playing: toggle the step under the playhead on that pad's track */
  onRecordHit: (pad: number, step: number) => void;
  say: (msg: string) => void;
  /** filled with `play(pad)` so a paired phone (controller link) can hit the pads */
  triggerRef?: React.MutableRefObject<((pad: number) => void) | null>;
}

declare global { interface Window { __FEL_FLIP__?: { source: string | null; slices: number; pads: number; lastPlayed: number | null; mode: string } } }

export default function FlipPad({ engine, playing, playhead, steps, onAssign, onRecordHit, say, triggerRef }: FlipPadProps) {
  const [source, setSource] = useState<FlipSource | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [mono, setMono] = useState<Float32Array | null>(null);
  const [mode, setMode] = useState<'transient' | 'grid'>('transient');
  const [gridN, setGridN] = useState(8);
  const [pads, setPads] = useState<Pad[]>(padsFromSlices([]));
  const [lit, setLit] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recArm, setRecArm] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const playheadRef = useRef(playhead); useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  const playingRef = useRef(playing); useEffect(() => { playingRef.current = playing; }, [playing]);
  const recArmRef = useRef(recArm); useEffect(() => { recArmRef.current = recArm; }, [recArm]);

  const reslice = useCallback((m: Float32Array, sr: number, md: 'transient' | 'grid', n: number) => {
    const slices = md === 'transient' ? onsetSlices(m, sr) : gridSlices(m.length, n);
    setPads(padsFromSlices(slices));
    return slices.length;
  }, []);

  const decode = useCallback(async (data: ArrayBuffer, src: FlipSource) => {
    if (!engine) return;
    const buf = await engine.context.decodeAudioData(data.slice(0));
    const m = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < m.length; i++) m[i] += ch[i] / buf.numberOfChannels; }
    setBuffer(buf); setMono(m); setSource(src); setSelected(null);
    const n = reslice(m, buf.sampleRate, mode, gridN);
    say(`${src.label}: ${n} slice${n === 1 ? '' : 's'} on the pads`);
  }, [engine, reslice, mode, gridN, say]);

  const loadFel = async (src: FlipSource) => {
    if (!src.url) return;
    try { const r = await fetch(src.url); if (!r.ok) throw new Error(String(r.status)); await decode(await r.arrayBuffer(), src); }
    catch (e) { say(`Could not load ${src.label} (${(e as Error).message})`); }
  };
  const loadOwn = async (f: File) => { await decode(await f.arrayBuffer(), { id: `own_${Date.now()}`, label: f.name.slice(0, 32), kind: 'own', note: 'Uploaded by the player — their own recording.' }); };
  const toggleMic = async () => {
    if (recording) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = []; const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); setRecording(false); const blob = new Blob(chunks); await decode(await blob.arrayBuffer(), { id: `mic_${Date.now()}`, label: 'mic take', kind: 'own', note: 'Recorded in the room — the player\'s own take.' }); };
      recRef.current = rec; rec.start(); setRecording(true); say('Recording… tap again to stop (8 s max)');
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 8000);
    } catch { say('Microphone not available'); }
  };

  useEffect(() => { if (mono && buffer) reslice(mono, buffer.sampleRate, mode, gridN); }, [mode, gridN, mono, buffer, reslice]);

  const padBuffer = useCallback((i: number): AudioBuffer | null => {
    if (!engine || !buffer || !mono) return null;
    const p = pads[i]; if (!p?.slice) return null;
    const s = sliceSamples(mono, p.slice, p.reverse);
    const out = engine.context.createBuffer(1, Math.max(1, s.length), buffer.sampleRate);
    out.copyToChannel(s, 0);
    return out;
  }, [engine, buffer, mono, pads]);

  const play = useCallback((i: number) => {
    if (!engine) return;
    const b = padBuffer(i); if (!b) return;
    const ctx = engine.context; if (ctx.state === 'suspended') void ctx.resume();
    const node = ctx.createBufferSource(); node.buffer = b; node.playbackRate.value = rateForPitch(pads[i].pitch);
    const g = ctx.createGain(); g.gain.value = 0.9; node.connect(g).connect(ctx.destination); node.start();
    if (pads[i].gate) node.stop(ctx.currentTime + Math.min(b.duration / node.playbackRate.value, 1.2));
    setLit(i); setTimeout(() => setLit((l) => (l === i ? null : l)), 120);
    if (recArmRef.current && playingRef.current) onRecordHit(i, quantizeTap(playheadRef.current, steps));
    window.__FEL_FLIP__ = { source: source?.id ?? null, slices: pads.filter((p) => p.slice).length, pads: PAD_COUNT, lastPlayed: i, mode };
  }, [engine, padBuffer, pads, onRecordHit, steps, source, mode]);

  useEffect(() => { if (triggerRef) triggerRef.current = play; return () => { if (triggerRef) triggerRef.current = null; }; }, [play, triggerRef]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; const i = padForKey(e.key); if (i >= 0 && !e.repeat) { e.preventDefault(); play(i); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [play]);
  useEffect(() => { window.__FEL_FLIP__ = { source: source?.id ?? null, slices: pads.filter((p) => p.slice).length, pads: PAD_COUNT, lastPlayed: null, mode }; }, [source, pads, mode]);

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
        {FEL_SOURCES.map((s) => <button key={s.id} style={{ ...S.alt, ...(source?.id === s.id ? { background: '#7a5c9e', color: '#fff', borderColor: '#7a5c9e' } : {}) }} onClick={() => void loadFel(s)}>{s.label}</button>)}
      </div>
      <div style={S.row}>
        <label style={S.alt}>YOUR FILE <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadOwn(f); }} /></label>
        <button style={{ ...S.alt, ...(recording ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={() => void toggleMic()}>{recording ? '■ STOP' : '● MIC TAKE'}</button>
        <button style={{ ...S.alt, ...(mode === 'transient' ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setMode('transient')}>TRANSIENTS</button>
        <button style={{ ...S.alt, ...(mode === 'grid' ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setMode('grid')}>GRID</button>
        {mode === 'grid' && <label style={{ fontSize: 12 }}>{gridN} <input type="range" min={2} max={16} value={gridN} onChange={(e) => setGridN(Number(e.target.value))} /></label>}
        <span style={{ fontSize: 12, opacity: 0.75 }}>{source ? `${source.label} · ${filled} slices · ${source.kind}` : 'no source loaded'}</span>
      </div>
      <div style={S.grid}>
        {pads.map((p, i) => (
          <button key={i} style={{ ...S.pad, ...(p.slice ? {} : S.padEmpty), ...(lit === i ? S.padOn : {}), ...(selected === i ? S.padSel : {}) }}
            onPointerDown={(e) => { e.preventDefault(); if (p.slice) { play(i); setSelected(i); } }} disabled={!p.slice} aria-label={`pad ${i + 1}`}>
            <span style={{ fontWeight: 800 }}>{i + 1}</span>
            <span style={{ fontSize: 10, opacity: 0.8 }}>{PAD_KEYS[i]}{p.pitch ? ` · ${p.pitch > 0 ? '+' : ''}${p.pitch}` : ''}{p.reverse ? ' · rev' : ''}</span>
          </button>
        ))}
      </div>
      {selected !== null && pads[selected]?.slice && (
        <div style={S.row}>
          <span style={{ fontSize: 12 }}>PAD {selected + 1}</span>
          <label style={{ fontSize: 12 }}>pitch {pads[selected].pitch > 0 ? '+' : ''}{pads[selected].pitch}
            <input type="range" min={-12} max={12} value={pads[selected].pitch} onChange={(e) => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, pitch: Number(e.target.value) } : p)))} />
          </label>
          <button style={{ ...S.alt, ...(pads[selected].reverse ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, reverse: !p.reverse } : p)))}>REVERSE</button>
          <button style={{ ...S.alt, ...(pads[selected].gate ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => setPads((ps) => ps.map((p, j) => (j === selected ? { ...p, gate: !p.gate } : p)))}>GATE</button>
          <button style={S.btn} onClick={() => { const b = padBuffer(selected); if (b) { onAssign(selected, b, `FLIP ${selected + 1}`); say(`Pad ${selected + 1} → track FLIP ${selected + 1}`); } }}>SEND TO TRACK</button>
        </div>
      )}
      <div style={S.row}>
        <button style={{ ...S.alt, ...(recArm ? { background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' } : {}) }} onClick={() => setRecArm((a) => !a)}>{recArm ? '● REC ARMED' : 'ARM REC'}</button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{recArm ? (playing ? 'taps land on the step under the playhead' : 'press PLAY in the studio, then tap pads') : 'arm, play, tap — your hits write into the pattern'}</span>
      </div>
    </div>
  );
}
