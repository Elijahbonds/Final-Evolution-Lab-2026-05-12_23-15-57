'use client';

// FaceScanCapture (M31) — client-only face capture that NEVER uploads an image.
// Uses MediaPipe FaceLandmarker (WASM, in-browser) to derive 478 landmarks from
// either a live camera frame or a chosen photo, samples cheek/iris color from the
// same frame on a canvas, maps everything to the FLAT Closet FaceConfig via
// faceFromLandmarks, and hands the result back to the parent. The pixels stay in
// the browser — only the derived option strings ever leave.

import { useCallback, useEffect, useRef, useState } from 'react';
import { faceFromLandmarks, type Landmark } from '@/lib/facescan/faceFromLandmarks';
import type { FaceConfig } from '@/lib/closet/wearable-catalog';

type Status = 'idle' | 'loading-model' | 'camera' | 'analyzing' | 'error';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// cheek + iris sample indices (canonical FaceMesh)
const CHEEK_L = 234, CHEEK_R = 454, IRIS_L = 468, IRIS_R = 473;

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Average a small box of pixels around a normalized point on the source frame. */
function sampleColor(
  ctx: CanvasRenderingContext2D, w: number, h: number, nx: number, ny: number,
): string | undefined {
  const px = Math.round(nx * w), py = Math.round(ny * h);
  const r = 4;
  try {
    const data = ctx.getImageData(Math.max(0, px - r), Math.max(0, py - r), r * 2, r * 2).data;
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++; }
    if (!n) return undefined;
    return rgbToHex(Math.round(sr / n), Math.round(sg / n), Math.round(sb / n));
  } catch { return undefined; }
}

export function FaceScanCapture({
  onResult, onClose,
}: {
  onResult: (partial: Partial<FaceConfig>) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  // Lazy-load the MediaPipe model (dynamic import keeps it off the main bundle).
  const ensureLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setStatus('loading-model');
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
    const lm = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'IMAGE',
      numFaces: 1,
    });
    landmarkerRef.current = lm;
    return lm;
  }, []);

  const analyzeSource = useCallback(async (
    source: HTMLVideoElement | HTMLImageElement, w: number, h: number,
  ) => {
    setStatus('analyzing');
    try {
      const lm = await ensureLandmarker();
      const result = lm.detect(source);
      const faces = result?.faceLandmarks;
      if (!faces || !faces.length) {
        setError('No face detected — center your face, ensure good lighting, and try again.');
        setStatus('error');
        return;
      }
      const pts: Landmark[] = faces[0];
      // sample skin/iris color from the same frame
      const canvas = canvasRef.current!;
      canvas.width = w; canvas.height = h;
      const cctx = canvas.getContext('2d', { willReadFrequently: true })!;
      cctx.drawImage(source, 0, 0, w, h);
      const skinHex = pts[CHEEK_L] && pts[CHEEK_R]
        ? sampleColor(cctx, w, h, (pts[CHEEK_L].x + pts[CHEEK_R].x) / 2, (pts[CHEEK_L].y + pts[CHEEK_R].y) / 2)
        : undefined;
      const eyeHex = pts[IRIS_L]
        ? sampleColor(cctx, w, h, pts[IRIS_L].x, pts[IRIS_L].y)
        : (pts[IRIS_R] ? sampleColor(cctx, w, h, pts[IRIS_R].x, pts[IRIS_R].y) : undefined);
      const partial = faceFromLandmarks(pts, skinHex, eyeHex);
      stopCamera();
      onResult(partial);
    } catch (e) {
      console.error('[FEL-FACESCAN] analyze failed', e);
      setError('Face scan failed to run in this browser. You can still customize your look manually.');
      setStatus('error');
    }
  }, [ensureLandmarker, onResult, stopCamera]);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      await ensureLandmarker();
      setStatus('camera');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
    } catch (e) {
      console.error('[FEL-FACESCAN] camera failed', e);
      setError('Camera unavailable or permission denied. Try “Use a photo” instead.');
      setStatus('error');
    }
  }, [ensureLandmarker]);

  const captureFrame = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    await analyzeSource(v, v.videoWidth, v.videoHeight);
  }, [analyzeSource]);

  const onPhotoChosen = useCallback(async (file: File) => {
    setError('');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      await analyzeSource(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setError('Could not read that image.'); setStatus('error'); URL.revokeObjectURL(url); };
    img.src = url;
  }, [analyzeSource]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0f] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Scan My Face</h3>
          <button onClick={() => { stopCamera(); onClose(); }} className="rounded-lg px-2 py-1 text-sm text-white/60 hover:bg-white/10">Close</button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-white/50">
          Everything runs in your browser — your photo is never uploaded. We only derive avatar options (face shape, eyes, nose, skin tone) and save those.
        </p>

        <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ display: status === 'camera' ? 'block' : 'none' }} />
          {status !== 'camera' && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/40">
              {status === 'loading-model' ? 'Loading face model…'
                : status === 'analyzing' ? 'Analyzing…'
                : status === 'error' ? '—'
                : 'Use your camera or a photo to auto-build your avatar.'}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="flex flex-col gap-2">
          {status !== 'camera' ? (
            <button onClick={startCamera} disabled={status === 'loading-model' || status === 'analyzing'}
              className="w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-300 disabled:opacity-60">
              Use Camera
            </button>
          ) : (
            <button onClick={captureFrame}
              className="w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-300">
              Capture &amp; Build Avatar
            </button>
          )}
          <button onClick={() => fileInputRef.current?.click()} disabled={status === 'analyzing'}
            className="w-full rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-60">
            Use a Photo
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoChosen(f); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
}
