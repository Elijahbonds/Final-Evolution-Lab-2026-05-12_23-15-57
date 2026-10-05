'use client';

// lib/audio/ui/VolumeMixer.tsx — MUSIC-SUITE P7 (2026-09-29), room-mix-ux, task 2 of 3.
//
// ONE control, TWO homes: "reachable from the dance room's pause menu and the Academy settings" (the task's own
// words) means the same three sliders in both places, not two components that can drift apart. It is deliberately
// styled with inline styles only, never a Tailwind className — the dance room's host (components/games/
// timing-babylon.tsx) is Tailwind-utility markup and the Academy (lib/babylon/music/StudioMode.tsx) is a raw
// React.CSSProperties `S` object with no Tailwind in the file at all, and this needs to drop into both unchanged.
//
// SoundKit owns the actual audio: getVolumes()/setVolume() persist (lib/audio/volumes.ts) and ramp the live gain
// node (SoundKit.ts). This component only reads the current settings once (SoundKit is the source of truth for the
// running tab; another tab's change does not push here, same as every other on-device preference in this app: the
// calibration screen's own reading only syncs via a storage event listener it installs itself) and writes through on
// every drag.

import { useState } from 'react';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import type { VolumeBus, VolumeSettings } from '../volumes';

const BUSES: readonly { id: VolumeBus; label: string; hint: string }[] = [
  { id: 'music', label: 'MUSIC', hint: 'the song — your stems, and FEL’s band filling what yours does not have' },
  { id: 'sfx', label: 'SFX', hint: 'hit sounds and UI ticks' },
  { id: 'voice', label: 'VOICE', hint: 'the host and Professor Okta' },
];

export interface VolumeMixerProps {
  className?: string;
  style?: React.CSSProperties;
  /** A short line above the sliders naming where this is (e.g. "MIX — this device"). Omit for no heading. */
  heading?: string;
}

/** MUSIC / SFX / VOICE, three sliders on the one graph. Renders identically wherever it is mounted; the two mount
 *  sites decide layout around it (a floating card over the paused dance room, an inline settings row in the Academy). */
export function VolumeMixer({ className, style, heading }: VolumeMixerProps) {
  const [levels, setLevels] = useState<VolumeSettings>(() => SoundKit.getVolumes());

  const move = (bus: VolumeBus, pct: number): void => {
    const v = Math.max(0, Math.min(1, pct / 100));
    SoundKit.setVolume(bus, v);           // persists (lib/audio/volumes.ts) and ramps the live gain (SoundKit.ts)
    setLevels((prev) => ({ ...prev, [bus]: v }));
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#fff', ...style }}
    >
      {heading && <span style={{ opacity: 0.7, letterSpacing: '0.08em', fontSize: 10 }}>{heading}</span>}
      {BUSES.map((b) => (
        <label key={b.id} title={b.hint} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 48, letterSpacing: '0.06em', opacity: 0.85, fontWeight: 700 }}>{b.label}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(levels[b.id] * 100)}
            onChange={(e) => move(b.id, Number(e.target.value))}
            aria-label={`${b.label} volume`}
            data-qa={`volume-${b.id}`}
            style={{ flex: 1, minWidth: 80 }}
          />
          <span style={{ width: 34, textAlign: 'right', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(levels[b.id] * 100)}%
          </span>
        </label>
      ))}
    </div>
  );
}
