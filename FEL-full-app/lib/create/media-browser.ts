// lib/create/media-browser.ts — CREATE HUB: the Web Audio half of media.ts. Browser only (the flow imports it from
// client components). Every function returns a PreparedTrack the music step can preview and the submit step can upload.

import { encodeMixWav, measureLufs, mixStemsLooped, peakOf, trackProblem, uploadMime, academyBars, UPLOAD_LIMITS } from './media';
import type { MusicOrigin } from '@/lib/creator/creative-card-types';

export interface PreparedTrack {
  blob: Blob;
  mime: 'audio/mpeg' | 'audio/mp4' | 'audio/x-m4a' | 'audio/wav' | 'audio/webm';
  durationSec: number;
  loudnessLufs: number;
  origin: Exclude<MusicOrigin, 'house'>;
  /** A gap-free loop region, when the render made one. */
  loop?: { startSec: number; endSec: number };
  bars?: number;
  bpm?: number;
  fileName: string;
  /** For the preview's <audio>; revoke with URL.revokeObjectURL when done. */
  objectUrl: string;
}

const channelsOf = (b: AudioBuffer): Float32Array[] => Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));

/** Decode without a user gesture: an OfflineAudioContext can decode at any time, an AudioContext may be suspended. */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const Ctx = (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  const ctx = new Ctx(1, 1, 44_100);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

function wavTrack(channels: Float32Array[], sampleRate: number, extra: Omit<PreparedTrack, 'blob' | 'mime' | 'durationSec' | 'loudnessLufs' | 'objectUrl'>): PreparedTrack {
  const enc = encodeMixWav(channels, sampleRate);
  const blob = new Blob([enc.bytes], { type: 'audio/wav' });
  return { blob, mime: 'audio/wav', durationSec: Math.round(enc.durationSec * 100) / 100, loudnessLufs: measureLufs(channels, sampleRate), objectUrl: URL.createObjectURL(blob), ...extra };
}

/** A player's own file: kept as it is when it fits, re-encoded to WAV when it does not. Throws a readable Error. */
export async function prepareUpload(file: File): Promise<PreparedTrack> {
  const mime = uploadMime(file.type, file.name);
  let buf: AudioBuffer;
  try { buf = await decodeBlob(file); } catch { throw new Error('This browser cannot read that file. Try an mp3, m4a or wav.'); }
  const channels = channelsOf(buf);
  const durationSec = Math.round(buf.duration * 100) / 100;
  const problem = trackProblem({ bytes: Math.min(file.size, UPLOAD_LIMITS.bytes), durationSec, peak: peakOf(channels) });
  if (problem) throw new Error(problem);
  if (mime && file.size <= UPLOAD_LIMITS.bytes) {
    return { blob: file, mime, durationSec, loudnessLufs: measureLufs(channels, buf.sampleRate), origin: 'upload', fileName: file.name, objectUrl: URL.createObjectURL(file) };
  }
  const t = wavTrack(channels, buf.sampleRate, { origin: 'upload', fileName: file.name.replace(/\.[^.]+$/, '') + '.wav' });
  if (t.blob.size > UPLOAD_LIMITS.bytes) { URL.revokeObjectURL(t.objectUrl); throw new Error('Tracks can be up to 8 MB. Try a shorter cut.'); }
  return t;
}

/** An Academy library song, rendered as a gap-free loop of about 30 seconds (loopRender, the walk-out's renderer). */
export async function renderAcademySong(rec: {
  id: string; title: string; kit: import('@/lib/babylon/music/SynthKit').KitId; bpm: number; swing: number; polished: boolean;
  sequencer: { steps: number; tracks: import('@/lib/babylon/music/AudioEngine').TrackState[] };
}): Promise<PreparedTrack> {
  const { renderWalkOutLoopBuffer } = await import('@/lib/babylon/music/loopRender');
  const bars = academyBars(rec.bpm);
  const { buffer, loopSec } = await renderWalkOutLoopBuffer({
    tracks: rec.sequencer.tracks, kit: rec.kit, bpm: rec.bpm, swing: rec.swing, steps: rec.sequencer.steps, bars, polished: rec.polished,
  });
  const channels = channelsOf(buffer);
  if (peakOf(channels) < 1e-4) throw new Error('That song rendered silent. Open it in the Academy and check its rows.');
  const end = Math.round(loopSec * 100) / 100;
  return wavTrack(channels, buffer.sampleRate, { origin: 'academy', loop: { startSec: 0, endSec: end }, bars, bpm: rec.bpm, fileName: `${rec.id}.wav` });
}

/** The beat maker's 2-bar stems, mixed and looped four times (8 bars). */
export async function renderMakerBeat(stemBlobs: Blob[], bpm: number): Promise<PreparedTrack> {
  const decoded = await Promise.all(stemBlobs.map(decodeBlob));
  if (!decoded.length) throw new Error('Build a beat first.');
  const rate = decoded[0].sampleRate;
  const mixed = mixStemsLooped(decoded.map(channelsOf), 4);
  if (peakOf(mixed) < 1e-4) throw new Error('That beat is silent. Turn some steps on first.');
  const sec = Math.round((mixed[0].length / rate) * 100) / 100;
  return wavTrack(mixed, rate, { origin: 'maker', loop: { startSec: 0, endSec: sec }, bars: 8, bpm, fileName: `beat_${bpm}.wav` });
}

/** A recorded voice line's length, for the upload route's audio check. Falls back to an estimate from its size. */
export async function audioSeconds(blob: Blob): Promise<number> {
  try { return Math.max(0.1, Math.round((await decodeBlob(blob)).duration * 100) / 100); }
  catch { return Math.max(1, Math.min(60, Math.round(blob.size / 16_000))); }   // assumption: ~128 kbps opus-in-webm
}
