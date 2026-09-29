'use client';
// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — what the FLIP tab's shelf offers, and its YOUR FILE door.
//
// THE SHELF. It was one row of eight buttons, "808 kick" … "808 fx", each a one-shot the finder cut into 8 slivers of a
// single hit. It is FEL's Flip pack now (Flip.ts FEL_SOURCES, grouped by kind — FlipPad draws one group at a time), and
// shelfSources() adds the public-domain entries the owner has signed (pdShelf.ts; none today) as a PUBLIC DOMAIN group.
//
// YOUR FILE (owner decision #15): loading your own file needs the tick "I made this or I own the rights" first — the
// file picker is disabled until it is ticked, and the tick clears after each file, so every upload is its own
// statement. The source records it in its note (the project keeps it) and carries P3's `upload: true` mark, which keeps
// the song on this device (uploadPrivacy.ts) until FEL can review uploads online — said here, before the pick.
// MUSIC-SUITE P5 FIX PASS (2026-09-25): "on this device" means never shared off it — the library, the dance floor and the
// walk-out are on the device (uploadPrivacy.ts says why, and holds the one-line switch back to the stricter reading).
import React, { useEffect, useState } from 'react';
import { FEL_SOURCES, type FlipSource } from './Flip';
import { loadFlipPack, type FlipPackIndex } from './flipPack';
import { pdSources } from './pdShelf';
import { OWN_RIGHTS_TICK, UPLOAD_DOORS, closedDoors, tickedUploadNote } from './uploadPrivacy';

/** Everything the shelf offers: FEL's pack, then the owner-signed public-domain entries (none today). */
export function shelfSources(pd: FlipSource[] = pdSources()): FlipSource[] { return [...FEL_SOURCES, ...pd]; }

/** pack.json for this page (the lesson reads it; the room's decoder shares the same fetch). */
export function useFlipPack(): { pack: FlipPackIndex | null; error: string | null } {
  const [state, setState] = useState<{ pack: FlipPackIndex | null; error: string | null }>({ pack: null, error: null });
  useEffect(() => {
    let alive = true;
    loadFlipPack().then((pack) => { if (alive) setState({ pack, error: null }); }, (e: unknown) => { if (alive) setState({ pack: null, error: (e as Error)?.message ?? 'unreadable' }); });
    return () => { alive = false; };
  }, []);
  return state;
}

// MUSIC-SUITE P5 FIX PASS (2026-09-25): the tick's words and the note live in uploadPrivacy.ts (the library and the room
// read the same statement — uploadNeedsTick), re-exported here for every importer.
export { OWN_RIGHTS_TICK } from './uploadPrivacy';
/**
 * Said beside the picker: why the tick, and what an upload means for the song. MUSIC-SUITE P5 FIX PASS: in the words of
 * the doors the build keeps shut (uploadPrivacy.UPLOAD_DOORS — only sharing off the device, until the owner says otherwise).
 */
export function uploadHint(doors = UPLOAD_DOORS): string {
  const onDevice = closedDoors(doors).filter((d) => d !== 'offDevice').length === 0;
  return onDevice
    ? 'Your own file only. A song with an upload stays on this device — your library, the dance floor and your walk-out work here; sharing it online waits until FEL can review uploads.'
    : 'Your own file only. A song with an upload stays on this device (no publish, walk-out or dance floor) until FEL can review uploads online.';
}
export const UPLOAD_HINT = uploadHint();

/** The source an upload becomes: the player's statement in its note (the project keeps it), and decision #15's mark. */
export function uploadSourceMeta(fileName: string, now: number): { id: string; label: string; note: string; upload: true } {
  return { id: `own_${now}`, label: fileName.slice(0, 32) || 'your file', note: tickedUploadNote(now), upload: true };
}

/** YOUR FILE behind the tick. `style` = the room's button look. */
export function UploadPicker({ onFile, style }: { onFile: (f: File) => void; style?: React.CSSProperties }) {
  const [ticked, setTicked] = useState(false);
  return (
    <span data-qa="upload-picker" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexBasis: '100%' }}>
      <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 36 }}>
        <input type="checkbox" data-qa="own-rights" checked={ticked} onChange={(e) => setTicked(e.target.checked)} style={{ width: 18, height: 18 }} />
        {OWN_RIGHTS_TICK}
      </label>
      <label data-qa="upload-label" aria-disabled={!ticked} title={ticked ? undefined : `Tick "${OWN_RIGHTS_TICK}" first`}
        style={{ ...style, ...(ticked ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}>
        YOUR FILE
        <input type="file" accept="audio/*" data-qa="upload-file" disabled={!ticked} style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f || !ticked) return;
            setTicked(false);   // every upload is its own statement
            onFile(f);
          }} />
      </label>
      <span data-qa="upload-hint" style={{ fontSize: 11, opacity: 0.7, flexBasis: '100%' }}>{UPLOAD_HINT}</span>
    </span>
  );
}
