'use client';
// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — the first lesson: CHOP THE FEL THEME.
//
// Owner decisions #15 and #25: a "FEL theme" first lesson, the way a producer chops a theme on an MPC — three FEL-made
// themes ship as lessons, Sunday Tape the default (pack.json themeDefault). The card shows on the FLIP tab's first visit
// for each player (flipPack lessonDismissed, per player id), on one screen:
//   1. the theme on the pads — FlipPad loads the default on a first visit with an empty Flip; LOAD otherwise;
//   2. "pads 1 → N in order play it back" — ▶ PLAY 1 → N plays them at their own cuts (lessonInOrder): the theme, whole;
//   3. the re-flip — the lesson's 16-step pattern written out as pad numbers, ▶ HEAR THE FLIP plays it two bars at the
//      theme's tempo and swing (lessonFlip), and the lesson's tip in FEL's own words (pack.json lesson.tip).
// A picker switches to the other two themes. GOT IT closes it for good for this player (THEME LESSON reopens it).
// The demo taps go to the pads as plain hits — never recorded into the grid, even with ARM REC on (FlipPad play(i, true)).
// Timing: setTimeout from the press (a demo, not the sequencer; a few ms of timer jitter is inaudible at 90–100 BPM).
import React, { useEffect, useRef, useState } from 'react';
import { flipPatternCells, lessonFlip, lessonInOrder, type FlipPackIndex, type LessonHit } from './flipPack';

export interface FlipLessonProps {
  pack: FlipPackIndex | null;
  /** why pack.json could not be read, if it could not */
  packError: string | null;
  /** the Flip's loaded source id, and whether its audio is on the pads yet */
  loadedId: string | null;
  ready: boolean;
  /** put a theme on the pads (through the Flip's replace guard) */
  onLoad: (themeId: string) => void;
  /** play one pad as a demo hit */
  onPad: (pad: number) => void;
  /** GOT IT: close, remembered for this player */
  onClose: () => void;
}

const S: Record<string, React.CSSProperties> = {
  card: { marginTop: 10, padding: 12, borderRadius: 12, border: '1px solid #ffb347', background: 'rgba(42,26,16,0.55)', maxWidth: 560 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  row: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  chip: { padding: '6px 10px', borderRadius: 8, border: '1px solid #7a5c9e', background: 'transparent', color: '#e8d9c2', cursor: 'pointer', fontSize: 12, minHeight: 36 },
  chipOn: { background: '#7a5c9e', color: '#fff' },
  btn: { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#2a1a10', fontWeight: 700, cursor: 'pointer', fontSize: 12, minHeight: 36 },
  off: { opacity: 0.45, cursor: 'not-allowed' },
  step: { fontSize: 13, marginTop: 8 },
  cells: { display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', gap: 2, marginTop: 6 },
  cell: { textAlign: 'center', fontSize: 11, padding: '4px 0', borderRadius: 4, background: 'rgba(255,255,255,0.06)' },
  cellHit: { background: '#ffb347', color: '#2a1a10', fontWeight: 800 },
};

export default function FlipLesson({ pack, packError, loadedId, ready, onLoad, onPad, onClose }: FlipLessonProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [demo, setDemo] = useState<'order' | 'flip' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onPadRef = useRef(onPad); onPadRef.current = onPad;
  const stop = (): void => { for (const t of timers.current) clearTimeout(t); timers.current = []; setDemo(null); };
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);

  const themes = pack?.themes ?? [];
  const pickId = chosen ?? (themes.some((t) => t.id === loadedId) ? loadedId : pack?.themeDefault ?? null);
  const theme = themes.find((t) => t.id === pickId) ?? null;
  const onPads = !!theme && loadedId === theme.id;
  const playable = onPads && ready;

  const run = (what: 'order' | 'flip', hits: LessonHit[]): void => {
    stop();
    if (!hits.length) return;
    setDemo(what);
    const end = hits[hits.length - 1].at;
    timers.current = hits.map((h) => setTimeout(() => onPadRef.current(h.pad), h.at * 1000));
    timers.current.push(setTimeout(() => setDemo(null), end * 1000 + 400));
  };

  if (!pack || !theme || !theme.lesson) {
    return (
      <div data-qa="flip-lesson" role="region" aria-label="Chop the FEL theme" style={S.card}>
        <div style={S.head}>
          <strong>CHOP THE FEL THEME</strong>
          <button style={S.chip} onClick={onClose}>GOT IT</button>
        </div>
        <div style={S.step}>{packError ? `The FEL pack didn't load (${packError}) — the 808 kit is on the KITS tab.` : 'Loading the FEL pack…'}</div>
      </div>
    );
  }
  const n = theme.lesson.playInOrder.length;
  const cells = flipPatternCells(theme.lesson);
  return (
    <div data-qa="flip-lesson" role="region" aria-label="Chop the FEL theme" style={S.card}>
      <div style={S.head}>
        <strong>CHOP THE FEL THEME</strong>
        <button data-qa="lesson-close" style={S.chip} onClick={() => { stop(); onClose(); }}>GOT IT</button>
      </div>
      <div style={S.row} role="group" aria-label="FEL themes">
        {themes.map((t) => (
          <button key={t.id} data-qa="lesson-theme" aria-pressed={t.id === theme.id} style={{ ...S.chip, ...(t.id === theme.id ? S.chipOn : {}) }}
            onClick={() => { stop(); setChosen(t.id); if (loadedId !== t.id) onLoad(t.id); }}>
            {t.title}{t.id === pack.themeDefault ? ' ★' : ''}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>{theme.bpm} BPM · {theme.key} · {theme.character}</div>

      <div style={S.step}>
        <strong>1.</strong>{' '}
        {onPads
          ? (ready ? <>{theme.title} is on the pads, cut where FEL cut it.</> : <>Putting {theme.title} on the pads…</>)
          : <button data-qa="lesson-load" style={S.btn} onClick={() => onLoad(theme.id)}>LOAD {theme.title.toUpperCase()}</button>}
      </div>
      <div style={S.step}>
        <strong>2.</strong> Pads 1 → {n} in order play it back.{' '}
        <button data-qa="lesson-order" style={{ ...S.btn, ...(playable ? {} : S.off) }} disabled={!playable}
          onClick={() => (demo === 'order' ? stop() : run('order', lessonInOrder(theme)))}>{demo === 'order' ? '■ STOP' : `▶ PADS 1 → ${n}`}</button>
      </div>
      <div style={S.step}>
        <strong>3.</strong> Now flip it — one bar, pad numbers on the steps:
        <div data-qa="lesson-pattern" style={S.cells} aria-label={`the flip: ${cells.join(' ')}`}>
          {cells.map((c, i) => <span key={i} style={{ ...S.cell, ...(c !== '·' ? S.cellHit : {}) }}>{c}</span>)}
        </div>
        <div style={S.row}>
          <button data-qa="lesson-flip" style={{ ...S.btn, ...(playable ? {} : S.off) }} disabled={!playable}
            onClick={() => (demo === 'flip' ? stop() : run('flip', lessonFlip(theme, 2)))}>{demo === 'flip' ? '■ STOP' : '▶ HEAR THE FLIP'}</button>
          <span data-qa="lesson-tip" style={{ fontSize: 12 }}>{theme.lesson.tip}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Your turn: ARM REC, press PLAY and tap the flip in — your hits land in the STUDIO grid.</div>
    </div>
  );
}
