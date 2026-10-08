'use client';
// PIPELINES (owner, 2026-10-06, plan K4: "board runs pick a track via the dock"): one control in the dock's open card.
// "Play this under my games" pins the track now playing for the in-game bed (lib/soundtrack/runTrack.ts): every board
// run, and every other game with the soundtrack bed, plays it until the player clears it or it leaves the catalogue.
// On this device only.

import { useState } from 'react';
import { readRunTrack, setRunTrack } from '@/lib/soundtrack/runTrack';

export function RunTrackPick({ trackId, title }: { trackId: string; title: string }) {
  const [pinned, setPinned] = useState<string | null>(() => readRunTrack());
  const isThis = pinned === trackId;
  const pick = (id: string | null) => { setRunTrack(id); setPinned(readRunTrack()); };
  return (
    <div className="mt-2 flex items-center gap-2 text-xs" data-qa="run-track-pick">
      {isThis ? (
        <>
          <span className="flex-1 truncate text-[#00E5FF]">Plays under your games and board runs</span>
          <button type="button" onClick={() => pick(null)} className="rounded-lg bg-white/5 px-2 py-1 text-white/70 hover:bg-white/10">Clear</button>
        </>
      ) : (
        <button type="button" onClick={() => pick(trackId)} aria-label={`Play ${title} under my games`}
          className="w-full rounded-lg bg-white/5 py-1.5 text-white/80 hover:bg-white/10">
          Play this under my games{pinned ? ' (replaces your pick)' : ''}
        </button>
      )}
    </div>
  );
}
