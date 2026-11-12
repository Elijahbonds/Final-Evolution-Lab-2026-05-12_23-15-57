// slowmoDecode — a video file → pose frames, every frame, in the browser (JUMP-PRO, 2026-10-24).
//
// The file is opened with an object URL in a muted, detached <video>; it is never uploaded, copied or kept, and the URL
// is revoked when the read ends. Its frame rate is measured by playing the first second and reading
// requestVideoFrameCallback's mediaTime gaps (the file's own clock; lib/jump/slowmo.ts then works out from gravity
// whether that clock was stretched). Then every frame is seeked to (its middle, so a boundary never rounds to the
// neighbour) and read by the app's own landmarker (MediaPipePoseAdapter, VIDEO mode, the 'full' model: an upload is
// not live, so it can afford the better model). Nothing here is pure; the decoding has no test in Node — the probe
// scripts/probes/_jump-pro-phone.mts drives the component around it with a stand-in decoder.
import { MediaPipePoseAdapter, type PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { LANDMARK_COUNT, emptyFrame, type PoseFrame } from '@/lib/pose/landmarks';
import type { PoseModel } from '@/lib/pose/assets';

/** The longest file read (s of the file's own time): a stretched 240 fps clip of ~6 s of jumping. */
export const MAX_FILE_S = 60;
/** The most frames read in one file. */
export const MAX_FRAMES = 4000;

export interface DecodedClip { frames: PoseFrame[]; aspect: number; fileFps: number }
export type Decoder = (file: File, onProgress: (done: number, total: number) => void, signal: AbortSignal) => Promise<DecodedClip>;

const once = (el: HTMLMediaElement, ev: string, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const fail = () => rej(new Error(ev === 'loadedmetadata' ? 'This video could not be opened here. Try the original file from your camera.' : 'The video stopped loading.'));
  el.addEventListener(ev, () => res(), { once: true });
  el.addEventListener('error', fail, { once: true });
  signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')), { once: true });
});

type RvfcVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };

/** The file's frame rate from its own presented frames (median gap of the first second); 30 when it cannot be read. */
async function probeFps(video: RvfcVideo, signal: AbortSignal): Promise<number> {
  if (!video.requestVideoFrameCallback) return 30;
  const times: number[] = [];
  await new Promise<void>((res) => {
    const stop = () => { video.pause(); res(); };
    const tick = (_: number, meta: { mediaTime: number }) => {
      times.push(meta.mediaTime);
      if (signal.aborted || times.length >= 40 || meta.mediaTime > 1.2) stop(); else video.requestVideoFrameCallback!(tick);
    };
    video.requestVideoFrameCallback!(tick);
    video.playbackRate = 1;
    video.play().catch(stop);
    setTimeout(stop, 2500);
  });
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 1e-4).sort((a, b) => a - b);
  if (gaps.length < 3) return 30;
  // the smaller gaps are the file's frame; a skipped frame only ever makes a gap longer
  const g = gaps[Math.floor(gaps.length * 0.25)];
  return Math.min(1000, Math.max(1, 1 / g));
}

const seek = (video: HTMLVideoElement, t: number, signal: AbortSignal) => {
  const done = once(video, 'seeked', signal);
  video.currentTime = t;
  return done;
};

const toFrame = (raw: AdapterFrame, t: number): PoseFrame => {
  if (!raw.present || raw.landmarks.length < LANDMARK_COUNT) return emptyFrame(t);
  const image = raw.landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.visibility }));
  return raw.world?.length === LANDMARK_COUNT ? { t, present: true, image, world: raw.world } : { t, present: true, image };
};

/** The real decoder: every frame of the file through the landmarker. */
export function poseDecoder(model: PoseModel = 'full'): Decoder {
  return async (file, onProgress, signal) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video') as RvfcVideo;
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
    const adapter = new MediaPipePoseAdapter({ world: true, model });
    try {
      await once(video, 'loadedmetadata', signal);
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('This video has no length we can read.');
      if (video.duration > MAX_FILE_S) throw new Error(`Trim the video to under ${MAX_FILE_S} seconds: just the stand and the jumps.`);
      const [fileFps] = await Promise.all([probeFps(video, signal), adapter.init()]);
      const total = Math.min(MAX_FRAMES, Math.floor(video.duration * fileFps));
      const frames: PoseFrame[] = [];
      for (let k = 0; k < total; k++) {
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        const t = (k + 0.5) / fileFps;
        await seek(video, t, signal);
        frames.push(toFrame(adapter.detect(video, (k / fileFps) * 1000), (k / fileFps) * 1000));
        if (k % 10 === 0) onProgress(k, total);
      }
      onProgress(total, total);
      return { frames, aspect: (video.videoWidth || 3) / (video.videoHeight || 4), fileFps };
    } finally {
      adapter.dispose();
      video.removeAttribute('src'); video.load();
      URL.revokeObjectURL(url);
    }
  };
}
