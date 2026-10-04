'use client';

// A dunk session on the phone camera. The video stays in this page's memory. PoseService, which loads
// the model from /pose, reads the body. The picture is shown by SelfView, the one place the camera
// picture is drawn. Jump times are cut into a review reel. Share and export go through the same path
// as a game clip, and only after the grown-up step when the player is under 18 or did not give an age.

import { useEffect, useRef, useState } from 'react';
import { AgeStep, GrownUpStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { SelfView } from '@/components/games/body-play';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { pickCodec } from '@/lib/capture/codecs';
import { exportFramed } from '@/lib/capture/exportVideo';
import { cameraMayStart, selfVideoMayLeave } from '@/lib/capture/privacy';
import { downloadBlob, deliverClip, extForMime, shareFileName } from '@/lib/capture/shareClip';
import { needsGrownUp, type AgeBand } from '@/lib/screen/age';
import { lockAge, resetAge } from '@/lib/screen/store';
import { deviceNumbers, dunkHistoryBody } from '@/lib/dunk-film/history';
import { jumpLines, readJumps, type JumpRead } from '@/lib/dunk-film/jumpDetect';
import { buildReel, type Reel } from '@/lib/dunk-film/reel';
import { DunkReelView } from './dunk-reel-view';

type Phase = 'age' | 'grownUp' | 'ready' | 'live' | 'review';

const DEVICE_KEY = 'fel.dunk-film.numbers';

function parseHeight(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 80 || n > 230) return null;
  return Math.round(n);
}

export function DunkFilm(props: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('age');
  const [age, setAge] = useState<AgeBand | null>(null);
  const [grownUp, setGrownUp] = useState(false);
  const [height, setHeight] = useState('');
  const [liveCount, setLiveCount] = useState(0);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [codecNote, setCodecNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reel, setReel] = useState<Reel | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const frames = useRef<PoseFrame[]>([]);
  const startedHere = useRef(false);
  const unsub = useRef<(() => void) | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordStart = useRef(0);
  const blobRef = useRef<Blob | null>(null);
  const clipUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // AGE-RESET (audit 2.2, 2026-10-03): a new Film dunk session is maybe a new athlete on a shared phone — the last
    // session's stored age (and with it the grown-up tick) is cleared, so the age question is asked again. The answer
    // then stays locked for this session (lockAge): no changing to a looser band mid-session.
    resetAge(typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    return () => { teardown(); };
    // teardown on leave only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardown() {
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* already */ }
    }
    recorder.current = null;
    unsub.current?.();
    unsub.current = null;
    if (startedHere.current) {
      try { poseService().stop(); } catch { /* not started */ }
      startedHere.current = false;
    }
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = null;
    }
  }

  function onAge(band: AgeBand) {
    const locked = lockAge(typeof sessionStorage !== 'undefined' ? sessionStorage : null, band);
    setAge(locked);
    setPhase(needsGrownUp(locked) ? 'grownUp' : 'ready');
  }

  async function startCamera() {
    if (!cameraMayStart(age, grownUp)) {
      setError('The camera stays off until a grown-up is with you.');
      return;
    }
    setError(null);
    const svc = poseService();
    startedHere.current = svc.state === 'idle' || svc.state === 'error';
    const ok = await svc.start({ facingMode: 'user' });
    if (!ok) { setError(svc.why ?? 'The camera did not start.'); return; }
    frames.current = [];
    unsub.current = svc.onFrame((f) => {
      frames.current.push(f);
      if (frames.current.length % 6 === 0) {
        const jumps = readJumps(frames.current, { heightCm: parseHeight(height) });
        setLiveCount(jumps.length);
        setLiveLines(jumps.length ? jumpLines(jumps[jumps.length - 1]).slice(0, 3) : []);
      }
    });
    const stream = svc.video?.srcObject;
    if (stream instanceof MediaStream) startRecorder(stream);
    else setCodecNote('The picture is on, but this browser did not hand back a stream to record.');
    setPhase('live');
  }

  function startRecorder(stream: MediaStream) {
    if (typeof MediaRecorder === 'undefined') {
      setCodecNote('Recording is not supported in this browser. The jump numbers can still be read.');
      return;
    }
    const codec = pickCodec(
      (mime) => (typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(mime) : false),
      navigator.userAgent,
    );
    setCodecNote(codec.fallbackNote);
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, codec.mime ? { mimeType: codec.mime } : undefined); }
    catch {
      try { rec = new MediaRecorder(stream); }
      catch { setCodecNote('Recording is not supported in this browser. The jump numbers can still be read.'); return; }
    }
    chunks.current = [];
    recordStart.current = performance.now();
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
    rec.start(200);
    recorder.current = rec;
  }

  async function finish() {
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') {
      const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
      try { rec.stop(); } catch { /* already */ }
      await stopped;
    }
    recorder.current = null;
    const blob = chunks.current.length
      ? new Blob(chunks.current, { type: chunks.current[0].type || 'video/webm' })
      : null;
    blobRef.current = blob;
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = blob ? URL.createObjectURL(blob) : null;
    setClipUrl(clipUrlRef.current);
    const heightCm = parseHeight(height);
    const start = recordStart.current || frames.current[0]?.t || 0;
    const jumps: JumpRead[] = readJumps(frames.current, { heightCm }).map((j) => ({
      ...j,
      takeoffMs: j.takeoffMs - start,
      landingMs: j.landingMs - start,
    })).filter((j) => j.landingMs > 0 && j.takeoffMs < j.landingMs);
    const duration = Math.max(0, performance.now() - start);
    setReel(buildReel(jumps, duration));
    unsub.current?.();
    unsub.current = null;
    if (startedHere.current) { poseService().stop(); startedHere.current = false; }
    setPhase('review');
  }

  async function exportReel(aspect: '9:16' | '16:9') {
    if (!reel || !blobRef.current || !selfVideoMayLeave(age, grownUp)) return;
    setBusy(true);
    try {
      const framed = await exportFramed(reel.clips.map((c) => ({
        blob: blobRef.current!,
        startSec: c.startMs / 1000,
        endSec: c.endMs / 1000,
        lines: [...c.lines.slice(0, 4), ...reel.summaryLines],
      })), aspect, location.origin);
      const blob = framed ?? blobRef.current;
      const name = shareFileName('dunk', aspect, extForMime(blob.type));
      downloadBlob(blob, name);
      setNote(framed
        ? `Exported ${name} on this device, with the jump numbers on the picture.`
        : `Downloaded the full session as ${name}. This browser could not cut the shorter reel.`);
    } finally {
      setBusy(false);
    }
  }

  async function shareReel() {
    if (!reel || !blobRef.current || !selfVideoMayLeave(age, grownUp) || busy) return;
    setBusy(true);
    try {
      const aspect = '9:16' as const;
      const framed = await exportFramed(reel.clips.map((c) => ({
        blob: blobRef.current!,
        startSec: c.startMs / 1000,
        endSec: c.endMs / 1000,
        lines: c.lines.slice(0, 4),
      })), aspect, location.origin);
      const blob = framed ?? blobRef.current;
      const name = shareFileName('dunk', aspect, extForMime(blob.type));
      const plan = await deliverClip(blob, name, 'FEL dunk session', {
        share: navigator.share ? (data) => navigator.share(data) : undefined,
        canShare: navigator.canShare ? (data) => navigator.canShare!(data) : undefined,
        download: downloadBlob,
      });
      setNote(plan.kind === 'sheet'
        ? 'Share sheet opened. Nothing is posted until you send it.'
        : `Downloaded ${name}. This browser could not open a share sheet for a video file.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Share did not finish.');
    } finally {
      setBusy(false);
    }
  }

  function saveNumbers() {
    if (!reel) return;
    const heightCm = parseHeight(height);
    const record = deviceNumbers(reel, heightCm);
    try { sessionStorage.setItem(DEVICE_KEY, JSON.stringify(record)); } catch { /* private mode */ }
    if (age !== '18+') {
      setNote('These numbers stay on this device. A jump is saved to your history only for a verified adult account.');
      return;
    }
    const bodies = reel.clips.map((c) => dunkHistoryBody(c.jump)).filter((b): b is NonNullable<typeof b> => b != null);
    if (!bodies.length) { setNote('Nothing in this session was a jump the history can store. The card stays on this device.'); return; }
    void (async () => {
      let kept = 0;
      let refused = '';
      for (const body of bodies) {
        try {
          const res = await fetch('/api/mirror/dunks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          if (res.ok) kept += 1;
          else refused = refused || `The history did not keep it (${res.status}). The card stays on this device.`;
        } catch {
          refused = 'The history could not be reached. The card stays on this device.';
        }
      }
      setNote(kept
        ? `Saved ${kept} jump ${kept === 1 ? 'number' : 'numbers'} to your history. The video stayed here.${refused ? ` ${refused}` : ''}`
        : refused);
    })();
  }

  const canLeave = selfVideoMayLeave(age, grownUp);

  return (
    <div data-testid="dunk-film" style={{
      position: 'fixed', inset: 0, zIndex: 70, overflow: 'auto', background: '#050505', color: '#fff',
      padding: 16, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }}>
      <button type="button" onClick={() => { teardown(); props.onClose(); }} style={{
        border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff',
        borderRadius: 8, padding: '6px 10px', marginBottom: 12,
      }}>Close</button>

      {phase === 'age' ? <AgeStep onAnswer={onAge} /> : null}
      {phase === 'grownUp' ? <GrownUpStep onContinue={() => { setGrownUp(true); setPhase('ready'); }} /> : null}

      {phase === 'ready' ? (
        <div data-testid="dunk-ready" style={{ maxWidth: 480 }}>
          <h2 style={{ fontSize: 22 }}>Film a dunk session</h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>
            The camera stays on this device. The video is recorded here and is not sent anywhere unless you tap
            Share or Export. It is never used for training. The pose model already on this device reads each jump.
          </p>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            Your height in centimetres, optional
            <input
              data-testid="dunk-height"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="for example 178"
              style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: '#111', color: '#fff' }}
            />
          </label>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Without a height, the air-time estimate still shows. The hip-rise estimate needs the height, and it stays an estimate.
          </p>
          {error ? <p style={{ color: '#FF3366' }}>{error}</p> : null}
          <button type="button" data-testid="dunk-camera" onClick={() => { void startCamera(); }} style={{
            marginTop: 8, border: 0, background: '#00E5FF', color: '#041016', fontWeight: 800, borderRadius: 10, padding: '10px 14px',
          }}>Turn on the camera</button>
        </div>
      ) : null}

      {phase === 'live' ? (
        <div data-testid="dunk-live">
          <SelfView style={{ width: 'min(100%, 420px)', aspectRatio: '3 / 4', borderRadius: 12 }} />
          <p data-testid="dunk-live-count" style={{ fontWeight: 800 }}>Jumps read: {liveCount}</p>
          {liveLines.map((line) => <p key={line} style={{ margin: '2px 0', fontSize: 14 }}>{line}</p>)}
          {codecNote ? <p style={{ color: '#FFD700', fontSize: 12 }}>{codecNote}</p> : null}
          <button type="button" data-testid="dunk-stop" onClick={() => { void finish(); }} style={{
            border: 0, background: '#FF3366', color: '#fff', fontWeight: 800, borderRadius: 10, padding: '10px 14px',
          }}>Stop and review</button>
        </div>
      ) : null}

      {phase === 'review' && reel ? (
        <DunkReelView
          reel={reel}
          canLeave={canLeave}
          note={note}
          onExport={(aspect) => { void exportReel(aspect); }}
          onShare={() => { void shareReel(); }}
          onSaveNumbers={saveNumbers}
          video={clipUrl ? (
            <video
              ref={videoRef}
              data-testid="dunk-playback"
              src={clipUrl}
              controls
              playsInline
              style={{ width: 'min(100%, 360px)', borderRadius: 12, background: '#000', transform: 'scaleX(-1)' }}
            />
          ) : <p>No video was recorded. The numbers below are from the camera while it was on.</p>}
        />
      ) : null}
    </div>
  );
}
