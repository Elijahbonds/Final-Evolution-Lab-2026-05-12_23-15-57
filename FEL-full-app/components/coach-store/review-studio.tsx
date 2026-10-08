'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DUNK_WEEKS } from '@/lib/coach-store/dunkProgram';

const MAX_BYTES = 209715200;
const DRILLS = DUNK_WEEKS.flatMap((week) => week.days.flatMap((day) => day.drills)).filter((drill, index, all) => all.findIndex((row) => row.id === drill.id) === index);

function putFile(url: string, headers: Record<string, string>, body: Blob, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('put')));
    xhr.onerror = () => reject(new Error('put'));
    xhr.send(body);
  });
}

/** Review studio. Recording lives here, outside the call folder, on purpose. */
export function ReviewStudio({ bookingId, coach }: { bookingId: string; coach?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState('');
  const [goal, setGoal] = useState('Dunk');
  const [pain, setPain] = useState<boolean | null>(null);
  const [message, setMessage] = useState('Your original clip is deleted 30 days after your review.');
  const [clips, setClips] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [drills, setDrills] = useState<string[]>([]);
  const [replyObject, setReplyObject] = useState('');
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (!coach) return;
    fetch(`/api/coach-store/reviews/${bookingId}/clip?which=original`)
      .then((res) => res.json())
      .then((json) => { if (json.url && videoRef.current) videoRef.current.src = json.url; })
      .catch(() => undefined);
  }, [bookingId, coach]);

  const onFile = async (file: File) => {
    if (clips.length >= 3) { setMessage('4th clip blocked'); return; }
    if (file.size > MAX_BYTES) { setMessage('Trim to 60 seconds or less.'); return; }
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.src = url;
    await new Promise((resolve) => { probe.onloadedmetadata = resolve; });
    if (probe.duration > 60) { setMessage('Trim to 60 seconds or less.'); URL.revokeObjectURL(url); return; }
    const signed = await fetch(`/api/coach-store/reviews/${bookingId}/upload-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bytes: file.size, mime: file.type, seconds: probe.duration }),
    });
    const json = await signed.json();
    if (!signed.ok) { setMessage(json.message || 'Upload failed'); URL.revokeObjectURL(url); return; }
    try {
      setProgress(0);
      await putFile(json.url, json.headers, file, setProgress);
      setClips((prev) => [...prev, json.objectName]);
      setMessage(`${clips.length + 1} clip ready.`);
    } catch {
      setMessage('That clip failed. The others stay.');
    } finally {
      setProgress(null);
      URL.revokeObjectURL(url);
    }
  };

  const submit = async () => {
    const res = await fetch(`/api/coach-store/reviews/${bookingId}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips, goal, painYes: pain, note }),
    });
    setMessage(res.ok ? 'Sent.' : 'Check the goal and the pain question.');
  };

  const paint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawing.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    ctx.fillStyle = '#7ef0ff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  };

  const record = async () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const drawFrame = () => {
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(drawFrame);
    };
    drawFrame();
    const stream = canvas.captureStream(30);
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getAudioTracks().forEach((track) => stream.addTrack(track));
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const started = Date.now();
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = async () => {
      setRecording(false);
      cancelAnimationFrame(raf);
      mic.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const signed = await fetch(`/api/coach-store/reviews/${bookingId}/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytes: blob.size, mime: 'video/webm', seconds, role: 'reply' }),
      });
      const json = await signed.json();
      if (!signed.ok) { setMessage('The voice-over did not upload. Try again.'); return; }
      await fetch(json.url, { method: 'PUT', headers: json.headers, body: blob });
      setReplyObject(json.objectName);
      setMessage('Voice-over saved. A new take replaces this one.');
    };
    recorder.start();
    setRecording(true);
  };

  const deliver = async () => {
    if (!replyObject || drills.length < 1) { setMessage('Record a voice-over and attach at least one drill.'); return; }
    const res = await fetch(`/api/coach-store/reviews/${bookingId}/deliver`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyText: 'See the drawing.', drills, replyObject }),
    });
    setMessage(res.ok ? 'Delivered. The original clip deletes in 30 days.' : 'Could not deliver yet.');
  };

  const step = (dir: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, video.currentTime + dir / 30);
  };

  return (
    <div className="space-y-3 text-white">
      <p className="text-sm">{message}</p>
      {coach ? (
        <>
          <video ref={videoRef} controls className="w-full rounded-xl bg-black" onRateChange={(e) => setRate(e.currentTarget.playbackRate)} />
          <div className="space-x-2 text-sm">
            {[0.25, 0.5, 1].map((value) => (
              <button key={value} type="button" className="rounded-lg border px-2 py-1" onClick={() => { if (videoRef.current) videoRef.current.playbackRate = value; setRate(value); }}>{value}x{rate === value ? ' on' : ''}</button>
            ))}
            <button type="button" className="rounded-lg border px-2 py-1" onClick={() => step(-1)}>Frame back</button>
            <button type="button" className="rounded-lg border px-2 py-1" onClick={() => step(1)}>Frame forward</button>
          </div>
          <canvas
            ref={canvasRef}
            width={640}
            height={360}
            className="w-full rounded-xl bg-black"
            onPointerDown={() => { drawing.current = true; }}
            onPointerUp={() => { drawing.current = false; }}
            onPointerLeave={() => { drawing.current = false; }}
            onPointerMove={paint}
          />
          <fieldset className="text-sm">
            <legend>Drills (1–3)</legend>
            {DRILLS.map((drill) => (
              <label key={drill.id} className="mr-3 inline-block">
                <input
                  type="checkbox"
                  checked={drills.includes(drill.id)}
                  onChange={() => setDrills((prev) => (prev.includes(drill.id) ? prev.filter((id) => id !== drill.id) : prev.length >= 3 ? prev : [...prev, drill.id]))}
                /> {drill.name}
              </label>
            ))}
          </fieldset>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={() => { void record(); }}>{recording ? 'Stop and save' : 'Record voice-over'}</button>
          <button type="button" className="rounded-xl bg-cyan-300 px-3 py-2 font-bold text-black" onClick={() => { void deliver(); }}>Deliver</button>
        </>
      ) : (
        <>
          <label className="block text-sm">Goal
            <select className="mt-1 w-full bg-black p-2" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {['Dunk', 'Vertical', 'Posture', 'Coming back from injury'].map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <p className="text-sm">Does anything hurt?</p>
          <label className="mr-3 text-sm"><input type="radio" name="pain" onChange={() => setPain(true)} /> Yes</label>
          <label className="text-sm"><input type="radio" name="pain" onChange={() => setPain(false)} /> No</label>
          <label className="block text-sm">Note ({note.length}/300)
            <textarea maxLength={300} className="mt-1 w-full bg-black p-2" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = ''; }} />
          {progress !== null ? <p className="text-sm">Upload {progress}%</p> : null}
          <button type="button" className="rounded-xl bg-cyan-300 px-3 py-2 font-bold text-black" onClick={() => { void submit(); }}>Send</button>
        </>
      )}
    </div>
  );
}
