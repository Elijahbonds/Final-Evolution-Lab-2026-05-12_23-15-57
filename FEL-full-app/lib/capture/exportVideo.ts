// exportVideo — draw a clip into 9:16 or 16:9 with the FEL mark, in the browser.
//
// No server, no encoder package: a canvas plays the frames back through captureStream and MediaRecorder.
// Several short pieces (a replay, a jump reel) are drawn one after another into the one file.

import { pickCodec } from './codecs';
import { EXPORT_SIZE, fitRect, watermarkAt, type Aspect } from './exportLayout';

export interface DrawSegment {
  /** A playable file. */
  blob: Blob;
  /** Seek range inside that file. Omit to play the whole piece. */
  startSec?: number;
  endSec?: number;
  /** Lines burned in under the mark, for a jump reel. */
  lines?: readonly string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function once(el: HTMLVideoElement, ev: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('video')); };
    const cleanup = () => {
      el.removeEventListener(ev, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(ev, ok);
    el.addEventListener('error', bad);
  });
}

function paint(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  w: number,
  h: number,
  origin: string | null,
  lines: readonly string[],
): void {
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, w, h);
  if (video && video.videoWidth) {
    const box = fitRect(video.videoWidth, video.videoHeight, w, h);
    ctx.drawImage(video, box.x, box.y, box.w, box.h);
  }
  const mark = watermarkAt(w, h, origin);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(mark.x - 8, mark.y - mark.markPx - 6, Math.round(w * 0.55), mark.markPx + mark.linkPx + 18);
  ctx.fillStyle = '#00E5FF';
  ctx.font = `700 ${mark.markPx}px sans-serif`;
  ctx.fillText(mark.mark, mark.x, mark.y);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 ${mark.linkPx}px sans-serif`;
  ctx.fillText(mark.link, mark.x, mark.y + mark.linkPx + 2);
  ctx.font = `600 ${Math.max(14, mark.linkPx)}px sans-serif`;
  lines.slice(0, 6).forEach((line, i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const y = 28 + i * (mark.linkPx + 12);
    ctx.fillRect(12, y - mark.linkPx, Math.round(w * 0.86), mark.linkPx + 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 20, y);
  });
}

/**
 * Re-record `segments` into one file at `aspect`, with the mark and the app link.
 * Returns null when this browser cannot record a canvas. The caller keeps the original pieces.
 */
export async function exportFramed(
  segments: readonly DrawSegment[],
  aspect: Aspect,
  origin: string | null,
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return null;
  const { w, h } = EXPORT_SIZE[aspect];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let stream: MediaStream;
  try { stream = canvas.captureStream(30); }
  catch { return null; }
  const codec = pickCodec(
    (mime) => (typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(mime) : false),
    navigator.userAgent,
  );
  let rec: MediaRecorder;
  try { rec = new MediaRecorder(stream, codec.mime ? { mimeType: codec.mime } : undefined); }
  catch {
    try { rec = new MediaRecorder(stream); }
    catch { return null; }
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  try { rec.start(200); } catch { return null; }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  try {
    for (const seg of segments) {
      const url = URL.createObjectURL(seg.blob);
      video.src = url;
      try {
        await once(video, 'loadeddata');
        const start = seg.startSec ?? 0;
        const end = seg.endSec ?? (Number.isFinite(video.duration) ? video.duration : start + 1);
        if (start > 0) {
          video.currentTime = start;
          await once(video, 'seeked');
        }
        await video.play();
        const lines = seg.lines ?? [];
        while (video.currentTime < end && !video.ended) {
          paint(ctx, video, w, h, origin, lines);
          await sleep(33);
        }
        video.pause();
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    paint(ctx, null, w, h, origin, []);
    await sleep(120);
  } catch {
    try { rec.stop(); } catch { /* not started */ }
    return null;
  }
  try { rec.stop(); } catch { /* already */ }
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  if (!chunks.length) return null;
  return new Blob(chunks, { type: chunks[0].type || codec.mime || 'video/webm' });
}
