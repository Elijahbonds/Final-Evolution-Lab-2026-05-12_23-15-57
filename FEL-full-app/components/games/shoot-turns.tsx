'use client';
// The couch shootout's screens (lane/hoops-couch, 2026-10-24): the SHOOTERS picker on READY, the hand-over card between two
// runs, the couch board, and the final board. The rules are lib/hoops/couchTurns.ts; the 3PT host (three-point-babylon.tsx)
// owns the state. On the TV HUD scale and palette, like the host's own readouts.

import React from 'react';
import { HudPlate, HudText, hudColor, hudType } from './tv-hud';
import { MAX_SHOOTERS, shooterName, type CouchRow, type Shooter } from '@/lib/hoops/couchTurns';

/** A pill (the options' own look): gold when on, a hairline when off. */
const pill = (on: boolean): { className: string; style: React.CSSProperties } => ({
  className: 'rounded-full border px-3 py-1 transition',
  style: { ...hudType('label'), letterSpacing: '0.08em', fontWeight: 800, ...(on ? { borderColor: hudColor('score'), background: hudColor('score'), color: hudColor('ink') } : { borderColor: hudColor('text', 0.3), color: hudColor('text', 0.8) }) },
});
/** A click never leaves focus on a pill: Space is SHOOT, and a focused button answers Space with a click. */
const noFocus = (e: React.MouseEvent): void => e.preventDefault();

/** READY: how many take turns, and who they are. A tap here never starts the run (the splash's layer is under it). */
export function TurnsPicker({ want, lineup, camera, onPick }: { want: number; lineup: Shooter[]; camera: boolean; onPick: (n: number) => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5" data-couch-picker onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <HudText as="div" size="caption" alpha={0.6} style={{ fontWeight: 800, letterSpacing: '0.3em' }}>TAKE TURNS</HudText>
      <div className="flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Shooters">
        {Array.from({ length: MAX_SHOOTERS }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={want === n} onMouseDown={noFocus}
            onClick={(e) => { e.currentTarget.blur(); onPick(n); }} aria-label={n === 1 ? 'One shooter' : `${n} shooters`} {...pill(want === n)}>
            {n === 1 ? 'SOLO' : `${n} SHOOTERS`}
          </button>
        ))}
      </div>
      {lineup.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5" data-couch-lineup>
          {lineup.map((s) => (
            <HudText key={s.seat} size="label" style={{ color: s.color, fontWeight: 800 }}>
              {shooterName(s)}{s.kind === 'pad' ? ' · PAD' : s.kind === 'phone' ? ' · PHONE' : ''}
            </HudText>
          ))}
        </div>
      )}
      {lineup.length > 1 && (
        <HudText as="div" size="caption" alpha={0.7}>
          {camera ? 'One run each. One shooter in the picture at a time.' : 'One run each, best score wins. Practice only: no rewards.'}
        </HudText>
      )}
    </div>
  );
}

/** The couch board: every shooter by name, best first; who is up is lit. */
export function CouchBoard({ rows }: { rows: CouchRow[] }) {
  return (
    <div className="flex flex-col" data-couch-board>
      {rows.map((r) => (
        <div key={r.seat} className="flex items-baseline gap-3 py-0.5">
          <HudText size="body" className="w-6 text-right" alpha={0.6}>{r.score === null ? '' : r.place}</HudText>
          <HudText size="body" className="min-w-[6.5em] truncate" style={{ color: r.color, fontWeight: 800 }}>{r.display}</HudText>
          <HudText size="value" tone={r.up ? 'you' : 'text'} className="w-10 text-right">{r.score === null ? (r.up ? 'UP' : '—') : r.score}</HudText>
        </div>
      ))}
    </div>
  );
}

/** Between two runs: who is up, what to do, and the board so far. */
export function TurnsHandoff({ title, sub, rows }: { title: string; sub: string; rows: CouchRow[] }) {
  return (
    <HudPlate className="pointer-events-none mx-auto my-2 flex max-w-[min(92vw,560px)] flex-col items-center gap-2 px-5 py-3 text-center" data-couch-handoff>
      <HudText as="div" size="banner" tone="you">{title}</HudText>
      <HudText as="div" size="body">{sub}</HudText>
      <CouchBoard rows={rows} />
    </HudPlate>
  );
}

/** Everyone has shot: the winner, the board, and again / done. */
export function TurnsFinal({ line, rows, onAgain, onDone }: { line: string; rows: CouchRow[]; onAgain: () => void; onDone: () => void }) {
  return (
    <HudPlate className="pointer-events-auto flex max-w-[min(92vw,560px)] flex-col items-center gap-3 px-6 py-4 text-center" data-couch-final>
      <HudText as="div" size="caption" alpha={0.6} style={{ fontWeight: 800, letterSpacing: '0.3em' }}>COUCH SHOOTOUT</HudText>
      <HudText as="div" size="banner" tone="score">{line}</HudText>
      <CouchBoard rows={rows} />
      <HudText as="div" size="caption" alpha={0.7}>Practice only: a couch shootout earns no rewards and sets no records.</HudText>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onMouseDown={noFocus} onClick={(e) => { e.currentTarget.blur(); onAgain(); }} {...pill(true)}>SHOOT AGAIN</button>
        <button type="button" onMouseDown={noFocus} onClick={(e) => { e.currentTarget.blur(); onDone(); }} {...pill(false)}>BACK TO SOLO</button>
      </div>
    </HudPlate>
  );
}
