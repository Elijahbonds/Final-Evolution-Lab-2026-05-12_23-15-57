'use client';
// LibraryDelete — the LIBRARY tab's DELETE, which asks first (MUSIC-SUITE P3, 2026-09-25).
//
// What was wrong: the library had no delete at all. P1 measured the 4th publish failing on a full localStorage, and a
// full library then stayed full forever — the only way out was clearing site data, which also took the player's
// settings, calibration and walk-out. P3 moved the audio into IndexedDB (StudioLibrary.ts), so "full" is now rare, but
// the refusal line it can still say is 'Your library is full — delete a song to publish', and that line is a lie
// unless there is a delete to press.
//
// The ask is inline, like the room's shard confirm (P2 purchases.ts), never window.confirm: a blocking browser dialog
// stops the main thread, and with it AudioEngine's 25 ms scheduler (LOOKAHEAD_MS), so a beat playing under the LIBRARY
// runs dry while the dialog is open (assumption: not measured here; it follows from the scheduler being a
// setInterval). The wording comes from
// deleteConfirmText (tested), which names the walk-out when this song is it — deleting it silences the Dunk Contest,
// and the player should hear that before, not after.
//
// A separate file so the gate step can mount it in StudioMode's library card with one line while the project lane
// edits that file; the mount is:
//   <LibraryDelete track={t} btnStyle={S.btnAlt} onDone={(line) => { setLibraryRev((r) => r + 1); say(line); }} />

import React, { useState } from 'react';
import { StudioLibrary, deleteConfirmText, type RemoveResult, type TrackRecord } from './StudioLibrary';

export interface LibraryDeleteProps {
  track: Pick<TrackRecord, 'id' | 'title' | 'isWalkOut'>;
  /** Called with the line to show (success or failure) once the delete has run. */
  onDone: (line: string, ok: boolean) => void;
  btnStyle?: React.CSSProperties;
  /** The delete itself — StudioLibrary.remove; a test hands in its own. */
  remove?: (id: string) => Promise<RemoveResult>;
}

export default function LibraryDelete({ track, onDone, btnStyle, remove = (id) => StudioLibrary.remove(id) }: LibraryDeleteProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button type="button" style={btnStyle} aria-label={`Delete ${track.title}`} onClick={() => setAsking(true)}>
        DELETE
      </button>
    );
  }

  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await remove(track.id);
      onDone(r.line, r.ok);
    } catch (e) {
      // remove() reports its own failures as lines; this is only a throw from somewhere it did not expect
      onDone(`Could not delete "${track.title}" (${e instanceof Error ? e.name : 'error'}) — it is still in the library`, false);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <div role="alertdialog" aria-label={`Delete ${track.title}?`}
      style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: '#ffd75e' }}>{deleteConfirmText(track)}</span>
      <button type="button" disabled={busy} onClick={() => { void confirm(); }}
        style={{ ...btnStyle, borderColor: '#ff6b6b', color: '#ff6b6b', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'DELETING…' : 'YES, DELETE'}
      </button>
      <button type="button" disabled={busy} style={btnStyle} onClick={() => setAsking(false)}>KEEP IT</button>
    </div>
  );
}
