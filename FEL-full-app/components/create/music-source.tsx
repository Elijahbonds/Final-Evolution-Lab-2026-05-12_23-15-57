'use client';
// components/create/music-source.tsx — CREATE HUB step 1 for music: bring a song in from the Academy library, upload
// your own file, or build a beat. Whatever the source, the result is one playable mix (music payload v2) measured for
// loudness, uploaded only when you submit.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MUSIC_LIMITS, type ArtPayloadBody, type DanceStep } from '@/lib/creator/creative-card-types';
import { pendingUrl, type PublishEntry } from '@/lib/create/flow';
import type { MadeThing } from './types';
import type { MusicPublishPayload } from '@/components/creator/modes/music-mode';
import { readExportedTrack } from '@/lib/babylon/music/DanceExport';

const MusicMode = dynamic(() => import('@/components/creator/modes/music-mode'), { ssr: false });

type Tab = 'academy' | 'upload' | 'maker';
interface LibraryRow { id: string; title: string; bpm: number; kit: string; createdAt: number; hasUpload: boolean; usesFlip: boolean }
type Prepared = import('@/lib/create/media-browser').PreparedTrack;

/** The Dance chart from the Academy's dance export, when the player sent one and it matches this tempo. Only the four
 *  fields the card contract carries are kept (a body-target move or limb is the Dance room's own detail). */
function chartFor(bpm: number | undefined): DanceStep[] | null {
  const ex = readExportedTrack();
  if (!ex || ex.track.bpm !== bpm) return null;
  return ex.steps.slice(0, MUSIC_LIMITS.chartSteps).map((s) => ({ clipId: s.clipId, beat: s.beat, holdBeats: s.holdBeats, mirrored: s.mirrored }));
}

export function musicPayloadOf(t: Prepared, chart: DanceStep[] | null): ArtPayloadBody {
  return {
    kind: 'music', trackId: `trk_${Date.now()}`, stemUrls: [], coverArtUrl: '', bpm: Math.max(40, Math.min(300, Math.round(t.bpm ?? 100))), keySignature: '',
    mixUrl: pendingUrl('mixUrl'), mime: t.mime, bytes: t.blob.size, durationSec: t.durationSec, loudnessLufs: t.loudnessLufs, origin: t.origin,
    ...(t.loop ? { loop: t.loop } : {}), ...(t.bars ? { bars: t.bars } : {}), ...(chart ? { chart } : {}),
  };
}

export default function MusicSource({ entry, userId, publicCreator, onMade }: {
  entry: PublishEntry; userId: string; publicCreator: boolean; onMade: (m: MadeThing) => void;
}) {
  const [tab, setTab] = useState<Tab>(entry.from === 'flipshelf' || entry.from === 'song-render' ? 'upload' : entry.from === 'maker' ? 'maker' : 'academy');
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [track, setTrack] = useState<Prepared | null>(null);
  const [title, setTitle] = useState(entry.title ?? '');
  const [withChart, setWithChart] = useState(!!entry.chart || entry.from === 'dance-export');
  const auto = useRef(false);

  useEffect(() => {
    let live = true;
    void import('@/lib/babylon/music/StudioLibrary').then(async ({ StudioLibrary }) => {
      const { tracksHaveUpload } = await import('@/lib/babylon/music/uploadPrivacy');
      const mine = StudioLibrary.list().filter((t) => t.authorId === userId || t.authorId === 'me');
      if (live) setRows(mine.map((t) => ({
        id: t.id, title: t.title, bpm: t.bpm, kit: String(t.kit), createdAt: t.createdAt,
        hasUpload: tracksHaveUpload(t.sequencer.tracks),
        usesFlip: t.sequencer.tracks.some((r) => !!(r as { chop?: unknown }).chop),
      })));
    }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [userId]);

  const take = useCallback((t: Prepared, name: string) => {
    setTrack((old) => { if (old) URL.revokeObjectURL(old.objectUrl); return t; });
    setTitle((cur) => cur || name);
  }, []);

  const fromLibrary = useCallback(async (id: string) => {
    setErr(null); setBusy('Rendering your song as a loop…');
    try {
      const [{ StudioLibrary }, { UPLOAD_DOORS, tracksHaveUpload, uploadPrivateLine }, { renderAcademySong }] = await Promise.all([
        import('@/lib/babylon/music/StudioLibrary'), import('@/lib/babylon/music/uploadPrivacy'), import('@/lib/create/media-browser'),
      ]);
      const rec = StudioLibrary.get(id);
      if (!rec) throw new Error('That song is not in this device’s library any more.');
      // owner decision #15's switch: a song that plays an uploaded file leaves the device only when FEL reviews it online
      if (!UPLOAD_DOORS.offDevice && tracksHaveUpload(rec.sequencer.tracks)) throw new Error(uploadPrivateLine(['your file']));
      take(await renderAcademySong(rec), rec.title);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not render that song.'); }
    finally { setBusy(null); }
  }, [take]);

  useEffect(() => {
    if (auto.current || !entry.song || !rows || !publicCreator) return;
    if (rows.some((r) => r.id === entry.song)) { auto.current = true; void fromLibrary(entry.song); }
  }, [entry.song, rows, fromLibrary, publicCreator]);

  // A rendered song (SongPanel) or a file (FlipShelf) handed over on this device (lib/create/handoff.ts). Without one
  // (another browser, older than 30 minutes) the upload tab asks for the file.
  const [handoffMissing, setHandoffMissing] = useState(false);
  useEffect(() => {
    if (!publicCreator || (entry.from !== 'song-render' && entry.from !== 'flipshelf')) return;
    let live = true;
    void (async () => {
      const { takeHandoff } = await import('@/lib/create/handoff');
      const got = await takeHandoff(entry.from!);
      if (!live) return;
      if (!got) { setHandoffMissing(true); setTab('upload'); return; }
      setBusy('Reading your song…');
      try {
        const { prepareUpload } = await import('@/lib/create/media-browser');
        const t = await prepareUpload(new File([got.blob], got.meta.fileName, { type: got.meta.mime }));
        take(entry.from === 'song-render' ? { ...t, origin: 'academy', ...(got.meta.bpm ? { bpm: got.meta.bpm } : {}) } : t, got.meta.title ?? got.meta.fileName.replace(/\.[^.]+$/, ''));
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that song.'); setTab('upload'); }
      finally { if (live) setBusy(null); }
    })();
    return () => { live = false; };
  }, [entry.from, publicCreator, take]);

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null); setBusy('Reading your file…');
    try {
      const { prepareUpload } = await import('@/lib/create/media-browser');
      take(await prepareUpload(file), file.name.replace(/\.[^.]+$/, ''));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that file.'); }
    finally { setBusy(null); }
  };

  const fromMaker = async (p: MusicPublishPayload) => {
    setErr(null); setBusy('Mixing your beat…');
    try {
      const { renderMakerBeat } = await import('@/lib/create/media-browser');
      take(await renderMakerBeat(p.stemBlobs, p.bpm), `${p.bpm} BPM beat`);
      setTab('academy');   // back to the result panel
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not mix that beat.'); }
    finally { setBusy(null); }
  };

  const chart = useMemo(() => (track && withChart ? chartFor(track.bpm) : null), [track, withChart]);
  const chartAvailable = useMemo(() => (track ? !!chartFor(track.bpm) : false), [track]);

  if (!publicCreator) {
    return (
      <div className="rounded-2xl bg-neutral-900 p-5 text-sm text-neutral-300" data-qa="teen-audio-note">
        <p className="font-bold text-neutral-100">Your songs stay on this device for now.</p>
        <p className="mt-2">Tracks upload to FEL only for creators confirmed 18+. Until then, everything you make in the Academy keeps playing here: your library, the dance floor and your walk-out.</p>
        <Link href="/play/music" className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 font-bold text-black">Open the Academy</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {([['academy', 'From my Academy library'], ['upload', 'Upload a file'], ['maker', 'Quick beat maker']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === id ? 'bg-emerald-400 text-black' : 'bg-neutral-800 text-neutral-200'}`}>{label}</button>
        ))}
        <Link href="/play/music" className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-200">Open the Academy ↗</Link>
      </div>

      {tab === 'academy' && !track && (
        <div className="rounded-2xl bg-neutral-900 p-4">
          {rows === null && <p className="text-sm text-neutral-500">Reading your library…</p>}
          {rows?.length === 0 && (
            <p className="text-sm text-neutral-400">No songs of yours on this device yet. Make one in the Academy and press <b>PUBLISH TO LIBRARY</b>, then come back, or upload a file.</p>
          )}
          <ul className="divide-y divide-neutral-800">
            {rows?.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-neutral-100">{r.title || 'Untitled'}</div>
                  <div className="text-[11px] text-neutral-500">{r.bpm} BPM · {r.kit}{r.usesFlip ? ' · Flip rows are not in this render' : ''}</div>
                </div>
                <button disabled={!!busy} onClick={() => void fromLibrary(r.id)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40">Use this song</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'upload' && !track && (
        <label className="block rounded-2xl border border-dashed border-neutral-700 bg-neutral-900 p-6 text-center text-sm text-neutral-300">
          {handoffMissing && <span className="mb-2 block text-xs text-amber-300">{entry.from === 'song-render' ? 'Your render is not on this page any more: choose the mix you downloaded (⬇ MIX).' : 'Choose the file again.'}</span>}
          <span className="block font-bold text-neutral-100">Choose an audio file</span>
          <span className="mt-1 block text-xs text-neutral-500">mp3, m4a, wav or webm · up to 4 minutes and 8 MB · only music you made or own every right to</span>
          <input type="file" accept="audio/*,.mp3,.m4a,.wav,.webm" className="mt-3 block w-full text-xs" onChange={(e) => void fromFile(e.target.files?.[0])} />
        </label>
      )}

      {tab === 'maker' && !track && <MusicMode onPublish={(p) => void fromMaker(p)} submitLabel="Use this beat →" />}

      {busy && <p className="text-sm text-emerald-300" role="status">{busy}</p>}
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}

      {track && (
        <div className="space-y-3 rounded-2xl bg-neutral-900 p-4" data-qa="music-ready">
          <audio src={track.objectUrl} controls loop className="w-full" />
          <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
            <span>{Math.round(track.durationSec)} s</span>
            {track.bars && <span>{track.bars} bars</span>}
            {track.bpm && <span>{track.bpm} BPM</span>}
            <span>{track.loudnessLufs} LUFS (FEL evens out the volume)</span>
            <span>{(track.blob.size / 1_048_576).toFixed(1)} MB</span>
            {track.loop && <span>loops seamlessly</span>}
          </div>
          {chartAvailable && (
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input type="checkbox" checked={withChart} onChange={(e) => setWithChart(e.target.checked)} />
              Publish my Dance chart with it (from SEND TO THE DANCE FLOOR)
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { URL.revokeObjectURL(track.objectUrl); setTrack(null); }} className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-bold">Pick another</button>
            <button data-qa="music-next" onClick={() => onMade({
              art: musicPayloadOf(track, chart), title,
              media: { mixUrl: { blob: track.blob, fileName: track.fileName, contentType: track.mime, durationSec: track.durationSec } },
              previewUrl: track.objectUrl,
            })} className="rounded-lg bg-emerald-400 px-5 py-2 text-sm font-black text-black">Next: details →</button>
          </div>
        </div>
      )}
    </div>
  );
}
