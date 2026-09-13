'use client';
// CONTROLLER SETTINGS — see your pad, rebind it, and be told the truth about it (2026-09-13).
//
// Mission Phase A.7. Three jobs, and the third is the one that matters most:
//   1. show which controller we think you have, and which profile it got;
//   2. let you rebind any action, stored per profile;
//   3. SAY SO when your controller will not work on this device, instead of letting you discover it by
//      pressing buttons that do nothing.
//
// The pad is polled while this panel is open and nowhere else — a settings screen is a foreground, explicit
// place, which is exactly where a "press the button you want" flow belongs.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  profileFor, supportCheck, readPad, anyPressed,
  type ControllerProfile, type PadButton, type PadLike,
} from '@/lib/input/profiles';
import { REMAPPABLE, readRemap, writeRemap, clearRemap, validRemap, canRumble, rumble, type Remap } from '@/lib/input/remap';

const LABEL: Record<PadButton, string> = {
  A: 'A — confirm / jump', B: 'B — back / trick', X: 'X', Y: 'Y',
  L1: 'L1 — shoulder', R1: 'R1 — shoulder', SELECT: 'SELECT', START: 'START — pause',
  LS: 'L3 — stick click', RS: 'R3 — stick click',
};

export function ControllerSettings() {
  const [pad, setPad] = useState<Gamepad | null>(null);
  const [profile, setProfile] = useState<ControllerProfile | null>(null);
  const [remap, setRemap] = useState<Remap>({});
  const [listening, setListening] = useState<PadButton | null>(null);
  const raf = useRef<number | null>(null);

  const poll = useCallback(() => {
    let live: Gamepad | null = null;
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected !== false) { live = p; break; }
    } catch { /* permissions policy can deny the API outright */ }
    setPad(live);
    if (live) {
      const prof = profileFor(live);
      setProfile((cur) => (cur?.id === prof.id ? cur : prof));
      // "press the button you want" — while listening, the first canonical button down becomes the binding
      if (listening) {
        const c = readPad(live as unknown as PadLike, prof);
        const hit = REMAPPABLE.find((b) => c.buttons[b]);
        if (hit) {
          const next = { ...remap, [listening]: hit };
          if (validRemap(next)) { setRemap(next); writeRemap(prof.id, next); rumble(live, 0.4, 90); }
          setListening(null);
        }
      }
    }
    raf.current = requestAnimationFrame(poll);
  }, [listening, remap]);

  useEffect(() => {
    raf.current = requestAnimationFrame(poll);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, [poll]);

  useEffect(() => { if (profile) setRemap(readRemap(profile.id) ?? {}); }, [profile?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const support = profile ? supportCheck(profile, typeof navigator === 'undefined' ? '' : navigator.userAgent) : { ok: true as const };
  const box: React.CSSProperties = { color: '#cfd6e4', font: '400 13px/1.5 system-ui, sans-serif', maxWidth: 520 };

  if (!pad || !profile) {
    return (
      <div style={box}>
        <h3 style={{ margin: '0 0 8px', font: '600 15px system-ui' }}>CONTROLLER</h3>
        <p style={{ margin: 0, color: '#8A94A6' }}>
          No controller detected. A gamepad is invisible to the browser until you press a button on it —
          press any button now and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={box}>
      <h3 style={{ margin: '0 0 8px', font: '600 15px system-ui' }}>CONTROLLER</h3>
      <p style={{ margin: '0 0 4px' }}>{profile.name}</p>
      <p style={{ margin: '0 0 12px', color: '#8A94A6', font: '400 11px/1.4 system-ui' }}>
        {pad.id} · profile <code>{profile.id}</code> · reported mapping “{pad.mapping || 'none'}”
        {canRumble(pad) ? ' · rumble supported' : ' · no rumble on this browser'}
      </p>

      {!support.ok && (
        // the mission's instruction: show a notice rather than failing silently
        <p style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 8, background: '#3a2a12', color: '#ffd75e' }}>
          {support.why}
        </p>
      )}

      {profile.id === 'generic-fallback' && (
        <p style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 8, background: '#1e2a3a', color: '#9fd6e8' }}>
          We do not recognise this controller, so we are using the standard layout. If a button does the wrong
          thing, rebind it below — that will fix it for this controller everywhere in the game.
        </p>
      )}

      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {REMAPPABLE.map((b) => (
          <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
            <span style={{ flex: 1 }}>{LABEL[b]}</span>
            <span style={{ color: '#8A94A6', minWidth: 42, textAlign: 'right' }}>{remap[b] ?? b}</span>
            <button
              type="button"
              onClick={() => setListening(listening === b ? null : b)}
              style={{
                padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${listening === b ? '#ffd75e' : '#33384a'}`,
                background: 'transparent', color: listening === b ? '#ffd75e' : '#cfd6e4',
                font: '600 11px system-ui',
              }}
            >{listening === b ? 'PRESS A BUTTON…' : 'REBIND'}</button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => { setRemap({}); clearRemap(profile.id); }}
        style={{ marginTop: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #33384a', background: 'transparent', color: '#8A94A6', cursor: 'pointer', font: '600 11px system-ui' }}
      >RESET TO DEFAULT</button>

      <p style={{ margin: '12px 0 0', color: '#6b7280', font: '400 11px/1.5 system-ui' }}>
        Bindings are saved for this controller only, on this device. A different pad keeps its own.
        {anyPressed(pad as unknown as PadLike) ? ' (button down)' : ''}
      </p>
    </div>
  );
}
