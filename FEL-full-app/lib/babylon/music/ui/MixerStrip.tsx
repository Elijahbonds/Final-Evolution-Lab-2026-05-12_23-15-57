'use client';
// MixerStrip — THE ACADEMY'S DESK ON SCREEN (MUSIC-SUITE P4, "Pocket studio + melody", 2026-09-25).
//
// There was no mixer (understand-wf_3a55346f-032.json problems[16]: TrackState carried volume / muted / pan with no UI, and
// nothing could solo a row); the engine lane built the desk (mixGraph.ts, PHASE-4 ENGINE CONTRACT (1) and (5)). This is its
// face: a collapsible MIXER with one strip per drawn row (+ the TAKES strip once the booth has takes) and the MASTER.
//   * A STRIP: M (mute), S (solo), a peak meter with a clip light, and — opened with its ▸ — VOL (fader, 0 … +3.5 dB),
//     PAN, ROOM (send A: the generated room) and DELAY (send B: the slap). Every move is an edit of the project's mixer
//     (StudioProject.withChannel through the room's `edit`: an undo step, one per slider drag, autosaved like everything
//     else — P3), and the engine follows the project (AudioEngine.setMixer), live now and in every render after.
//   * THE MASTER: its fader (the bus), L / R peak meters, the clip light (the ceiling is working — mixerMath), and the
//     limiter's pull ("LIMIT −3.1 dB").
//   * THE METERS read AudioEngine.meters() on animation frames (≤ 30 a second) only while the MIXER is open, and write the
//     bars straight into the DOM — the room does not re-render 30 times a second for a meter.
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25):
//   * A PHONE SCROLL NEVER MOVES A FADER (ui/mixerMath dragIntent / faderValueAt): on the phone layout a fader moves only
//     from a sideways drag on its track; a vertical drag is the page's scroll (it set VOL 1 → 0.26 on the way past).
//   * M / S are ≥ 40 × 40 px on the phone (30.9 × 32 measured).
//   * MUTE / SOLO AT EVERY TIER (`full` false): owner decision #4 lists the mixer in the pocket studio, and the lane had put
//     the WHOLE desk behind THE STUDIO as its own assumption — a first visit had no mute or solo, while Okta's tip says
//     "mute everything but two tracks". Below THE STUDIO the MIXER shows each row's M / S and meter and the master's meters;
//     VOL / PAN / ROOM / DELAY and the master LEVEL (the ladder's "mix it", THE STUDIO's blurb since 2026-09-13) open there.
import React, { useEffect, useRef, useState } from 'react';
import { CHANNEL_GAIN_MAX, MASTER_FADER_MAX, channelMix, type ChannelMix, type MeterReadout, type MixerState } from '../mixGraph';
import {
  STRIP_CLIP_DB, clipLit, clipUntil, dbLabel, dragIntent, faderLabel, faderValueAt, limiterLabel, masterOver, meterFill, overUntil, panLabel, sendLabel,
} from './mixerMath';

export interface MixerRow { id: string; label: string }

export interface MixerPanelProps {
  rows: readonly MixerRow[];
  mixer: MixerState;
  engine: { meters(): MeterReadout } | null;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** A strip moved: the patch, and a group for a slider drag (one undo step per drag). */
  onStrip: (id: string, patch: Partial<ChannelMix>, group?: string) => void;
  onMaster: (level: number, group?: string) => void;
  compact: boolean;
  S: Record<string, React.CSSProperties>;
  /**
   * MUSIC-SUITE P4 FIX PASS: the whole desk (THE STUDIO: VOL / PAN / ROOM / DELAY and the master LEVEL). false = mute / solo
   * and the meters only (every tier below). Absent = the whole desk.
   */
  full?: boolean;
  /** What opens the rest of the desk (said under a mute / solo desk). */
  fullNeeds?: string;
}

interface MeterEl { bar: HTMLDivElement | null; clip: HTMLSpanElement | null; label: HTMLSpanElement | null; until: number }

/** A meter the loop writes into: `id` is a strip id, 'master:l' or 'master:r'. */
function Meter({ id, reg, wide }: { id: string; reg: (id: string, part: keyof Omit<MeterEl, 'until'>, el: HTMLElement | null) => void; wide?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: wide ? 1 : '0 0 72px', minWidth: 0 }}>
      <span style={{ position: 'relative', flex: 1, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.45)', overflow: 'hidden', minWidth: 36 }}>
        <div ref={(el) => reg(id, 'bar', el)} data-qa="meter-bar" data-meter={id} data-fill="0"
          style={{ position: 'absolute', inset: 0, width: '0%', background: 'linear-gradient(90deg,#4ade80 0%,#4ade80 70%,#ffd75e 88%,#ff5c5c 100%)', transition: 'width 60ms linear' }} />
      </span>
      <span ref={(el) => reg(id, 'clip', el)} data-qa="clip-light" data-meter={id} data-lit="0" title="clip light"
        style={{ width: 10, height: 10, borderRadius: 5, background: '#3a2b52', border: '1px solid #5a4470', flex: '0 0 auto' }} />
    </span>
  );
}

export default function MixerPanel({ rows, mixer, engine, open, onOpen, onStrip, onMaster, compact, S, full = true, fullNeeds }: MixerPanelProps) {
  const meters = useRef(new Map<string, MeterEl>());
  const [expanded, setExpanded] = useState<string | null>(null);
  const reg = (id: string, part: keyof Omit<MeterEl, 'until'>, el: HTMLElement | null): void => {
    const m = meters.current.get(id) ?? { bar: null, clip: null, label: null, until: 0 };
    (m as unknown as Record<string, HTMLElement | null>)[part] = el;
    meters.current.set(id, m);
  };
  const limitRef = useRef<HTMLSpanElement | null>(null);
  const rowsRef = useRef(rows); rowsRef.current = rows;   // the loop reads the latest rows without restarting

  // THE METER LOOP: only while the desk is open; ≤ 30 reads a second; straight into the DOM
  useEffect(() => {
    if (!open || !engine) return;
    let raf = 0, last = 0;
    /** `over`: the master's rule (masterOver), else a strip's true over at its tap. */
    const paint = (id: string, peak: number, now: number, over?: boolean): void => {
      const m = meters.current.get(id);
      if (!m) return;
      const fill = meterFill(peak);
      if (m.bar) { m.bar.style.width = `${(fill * 100).toFixed(1)}%`; m.bar.dataset.fill = fill.toFixed(3); m.bar.title = dbLabel(peak); }
      m.until = over === undefined ? clipUntil(m.until, peak, now, STRIP_CLIP_DB) : overUntil(m.until, over, now);
      const lit = clipLit(m.until, now);
      if (m.clip) { m.clip.dataset.lit = lit ? '1' : '0'; m.clip.style.background = lit ? '#ff3b3b' : '#3a2b52'; }
    };
    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick);
      if (t - last < 33) return;
      last = t;
      let r: MeterReadout;
      try { r = engine.meters(); } catch { return; }
      const now = performance.now();
      paint('master:l', r.master.l.peak, now, masterOver(r.master.l.peak, r.limiterDb));
      paint('master:r', r.master.r.peak, now, masterOver(r.master.r.peak, r.limiterDb));
      for (const row of rowsRef.current) paint(row.id, r.channels[row.id]?.peak ?? 0, now);
      if (limitRef.current) limitRef.current.textContent = limiterLabel(r.limiterDb);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, engine]);

  /**
   * A fader. On the phone layout (MUSIC-SUITE P4 FIX PASS) the panel drives it: a touch moves it only once it is a sideways
   * drag (mixerMath dragIntent), a vertical touch is left to the page's scroll (touch-action pan-y — the browser cancels
   * it), and a mouse or pen drags at once; the value follows x on the track (faderValueAt). The input stays for the keys
   * (Tab + arrows) and assistive tech. Desktop: the plain input. (Drawn inline, no child component: one ref for all.)
   */
  const drags = useRef(new Map<string, { id: number; x: number; y: number; active: boolean; rect: { left: number; width: number } }>());
  const fader = (key: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, qa: string): React.ReactNode => {
    const input = (
      <input type="range" data-qa={qa} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', minWidth: 0, ...(compact ? { pointerEvents: 'none' as const } : {}) }} />
    );
    if (!compact) return input;
    const at = (x: number): number => faderValueAt(x, drags.current.get(key)?.rect ?? { left: 0, width: 1 }, min, max, step);
    const capture = (el: Element, id: number): void => { try { el.setPointerCapture(id); } catch { /* not capturable */ } };
    return (
      <div data-qa={`${qa}-track`} style={{ touchAction: 'pan-y', padding: '10px 0', minWidth: 0 }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          const active = e.pointerType !== 'touch';
          drags.current.set(key, { id: e.pointerId, x: e.clientX, y: e.clientY, active, rect: { left: r.left, width: r.width } });
          if (active) { capture(e.currentTarget, e.pointerId); onChange(at(e.clientX)); }
        }}
        onPointerMove={(e) => {
          const d = drags.current.get(key);
          if (!d || d.id !== e.pointerId) return;
          if (!d.active) {
            const intent = dragIntent(e.clientX - d.x, e.clientY - d.y);
            if (intent === 'scroll') { drags.current.delete(key); return; }
            if (intent === 'wait') return;
            d.active = true;
            capture(e.currentTarget, e.pointerId);
          }
          onChange(at(e.clientX));
        }}
        onPointerUp={() => { drags.current.delete(key); }}
        onPointerCancel={() => { drags.current.delete(key); }}>
        {input}
      </div>
    );
  };
  const small: React.CSSProperties = { ...S.btnAlt, padding: '4px 10px', fontSize: 11, minHeight: compact ? 40 : 26 };
  // MUSIC-SUITE P4 FIX PASS: M / S are 40 × 40 on the phone
  const ms: React.CSSProperties = { ...small, ...(compact ? { minWidth: 40, padding: '4px 0' } : {}) };
  const toggle = (on: boolean, color: string): React.CSSProperties => (on ? { background: color, color: '#101018', border: `1px solid ${color}`, fontWeight: 800 } : {});
  const slider = (label: string, value: number, min: number, max: number, step: number, words: string, onChange: (v: number) => void, qa: string, key: string): React.ReactNode => (
    <label style={{ display: 'grid', gridTemplateColumns: '44px 1fr 64px', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      {fader(key, value, min, max, step, onChange, qa)}
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{words}</span>
    </label>
  );

  return (
    <div data-qa="mixer" data-open={open ? '1' : '0'} style={{ marginTop: 10 }}>
      <button type="button" data-qa="mixer-toggle" aria-expanded={open} style={{ ...S.btnAlt, ...(open ? { background: '#7a5c9e', color: '#fff', border: '1px solid #7a5c9e' } : {}) }}
        onClick={() => onOpen(!open)}>
        {open ? '▾ MIXER' : '▸ MIXER'}{full ? '' : ' · mute / solo'}
      </button>
      {open && !full && (
        <div data-qa="mixer-more" style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
          VOL · PAN · ROOM · DELAY and the master LEVEL open at THE STUDIO{fullNeeds ? ` — ${fullNeeds}` : ''}
        </div>
      )}
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginTop: 8 }}>
          {/* the MASTER first: the level the player hears and the render gets */}
          <div data-qa="master-strip" style={{ padding: 8, borderRadius: 10, background: 'rgba(255,215,94,0.08)', border: '1px solid #ffd75e', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800 }}>
              <span>MASTER</span>
              <span ref={limitRef} data-qa="limiter-label" style={{ fontSize: 10, color: '#ffd75e', fontWeight: 700 }} />
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}><span style={{ width: 10 }}>L</span><Meter id="master:l" reg={reg} wide /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}><span style={{ width: 10 }}>R</span><Meter id="master:r" reg={reg} wide /></div>
            </div>
            {full && slider('LEVEL', mixer.master, 0, MASTER_FADER_MAX, 0.01, faderLabel(mixer.master), (v) => onMaster(v, 'mix:master'), 'master-fader', 'master')}
          </div>
          {rows.map((r) => {
            const c = channelMix(mixer, r.id);
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} data-qa="mixer-strip" data-row={r.id} data-mute={c.mute ? '1' : '0'} data-solo={c.solo ? '1' : '0'}
                style={{ padding: 8, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid #5a4470', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {full ? (
                    <button type="button" data-qa="strip-expand" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : r.id)}
                      style={{ ...small, border: 'none', padding: '4px 6px', flex: '1 1 auto', textAlign: 'left', color: '#f5ead9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {isOpen ? '▾' : '▸'} {r.label}
                    </button>
                  ) : (
                    <span data-qa="strip-name" style={{ flex: '1 1 auto', fontSize: 11, padding: '4px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.label}</span>
                  )}
                  <button type="button" data-qa="strip-mute" aria-pressed={c.mute} title="mute" style={{ ...ms, ...toggle(c.mute, '#ff8a5c') }}
                    onClick={() => onStrip(r.id, { mute: !c.mute })}>M</button>
                  <button type="button" data-qa="strip-solo" aria-pressed={c.solo} title="solo" style={{ ...ms, ...toggle(c.solo, '#ffd75e') }}
                    onClick={() => onStrip(r.id, { solo: !c.solo })}>S</button>
                  <Meter id={r.id} reg={reg} />
                </div>
                {full && isOpen && (
                  <div data-qa="strip-body" style={{ display: 'grid', gap: 4 }}>
                    {slider('VOL', c.gain, 0, CHANNEL_GAIN_MAX, 0.01, faderLabel(c.gain), (v) => onStrip(r.id, { gain: v }, `mix:${r.id}:gain`), 'strip-gain', `${r.id}:gain`)}
                    {slider('PAN', c.pan, -1, 1, 0.01, panLabel(c.pan), (v) => onStrip(r.id, { pan: Math.abs(v) < 0.03 ? 0 : v }, `mix:${r.id}:pan`), 'strip-pan', `${r.id}:pan`)}
                    {slider('ROOM', c.sendA, 0, 1, 0.01, sendLabel(c.sendA), (v) => onStrip(r.id, { sendA: v }, `mix:${r.id}:sendA`), 'strip-room', `${r.id}:sendA`)}
                    {slider('DELAY', c.sendB, 0, 1, 0.01, sendLabel(c.sendB), (v) => onStrip(r.id, { sendB: v }, `mix:${r.id}:sendB`), 'strip-delay', `${r.id}:sendB`)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
