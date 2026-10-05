'use client';

import { useEffect, useRef, useState } from 'react';

type Ice = { urls: string[]; username?: string; credential?: string };

/**
 * The live room. Native RTCPeerConnection. No recorder lives in this folder:
 * lib/coach-store/call/no-recording.scan.test.ts fails the build if one appears.
 */
export function CallRoom({ bookingId }: { bookingId: string }) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<MediaStreamTrack | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<'lobby' | 'connecting' | 'live' | 'failed'>('lobby');
  const [message, setMessage] = useState('Not recorded.');
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator.mediaDevices?.getDisplayMedia === 'function');
    return () => stopRef.current?.();
  }, []);

  const start = async () => {
    setPhase('connecting');
    const infoRes = await fetch(`/api/coach-store/call/${bookingId}`);
    const info = await infoRes.json();
    if (!infoRes.ok) { setMessage(info.error || 'Could not join'); setPhase('failed'); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    streamRef.current = stream;
    cameraRef.current = stream.getVideoTracks()[0] ?? null;
    if (localRef.current) localRef.current.srcObject = stream;
    const pc = new RTCPeerConnection({ iceServers: info.iceServers as Ice[] });
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (ev) => { if (remoteRef.current) remoteRef.current.srcObject = ev.streams[0]; };
    const channel = pc.createDataChannel('fel-call');
    void channel;
    let last = 0;
    let connected = false;
    const started = Date.now();
    const send = async (kind: string, payload: unknown) => {
      await fetch(`/api/coach-store/call/${bookingId}/signal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, payload: JSON.stringify(payload), epoch: 0 }),
      });
    };
    pc.onicecandidate = (ev) => { if (ev.candidate) void send('ice', ev.candidate); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'connected') return;
      connected = true;
      setPhase('live');
      void pc.getStats().then((stats) => {
        let via = 'host';
        stats.forEach((report) => {
          const row = report as { type?: string; state?: string; nominated?: boolean; localCandidateId?: string };
          if (row.type === 'candidate-pair' && row.state === 'succeeded' && row.nominated && row.localCandidateId) {
            const local = stats.get(row.localCandidateId) as { candidateType?: string } | undefined;
            if (local?.candidateType === 'srflx' || local?.candidateType === 'relay' || local?.candidateType === 'host') via = local.candidateType;
          }
        });
        console.warn(`[coach-store] connected via ${via}`);
      });
    };
    if (!info.polite) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send('offer', offer);
    }
    const poll = async () => {
      const res = await fetch(`/api/coach-store/call/${bookingId}/signal?after=${last}`);
      const json = await res.json();
      for (const row of json.signals ?? []) {
        last = row.id;
        const payload = JSON.parse(row.payload);
        if (row.kind === 'offer' && info.polite) {
          await pc.setRemoteDescription(payload);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await send('answer', answer);
        } else if (row.kind === 'answer') await pc.setRemoteDescription(payload);
        else if (row.kind === 'ice') await pc.addIceCandidate(payload);
      }
      if (!connected && Date.now() - started > 20000) setPhase('failed');
    };
    let timer = 0;
    let stopped = false;
    const loop = () => {
      const wait = document.hidden ? 10000 : connected ? 5000 : 1000;
      timer = window.setTimeout(() => {
        void poll().finally(() => { if (!stopped) loop(); });
      }, wait);
    };
    loop();
    stopRef.current = () => {
      stopped = true;
      window.clearTimeout(timer);
      pc.close();
      stream.getTracks().forEach((track) => track.stop());
    };
  };

  const fail = async (toReview: boolean) => {
    await fetch(`/api/coach-store/bookings/${bookingId}/connection-failed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toReview }),
    });
    setMessage(toReview ? 'Switched to video review. You will not be charged again.' : 'Reschedule is free and does not use your one change.');
  };

  const setEnabled = (kind: 'audio' | 'video', on: boolean) => {
    streamRef.current?.getTracks().filter((track) => track.kind === kind).forEach((track) => { track.enabled = on; });
    if (kind === 'audio') setAudioOn(on);
    else setVideoOn(on);
  };

  const shareScreen = async () => {
    const pc = pcRef.current;
    if (!pc || !navigator.mediaDevices?.getDisplayMedia) return;
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = display.getVideoTracks()[0];
    const sender = pc.getSenders().find((row) => row.track?.kind === 'video');
    if (!track || !sender) return;
    await sender.replaceTrack(track);
    track.onended = () => {
      const camera = cameraRef.current;
      if (camera) void sender.replaceTrack(camera);
    };
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 text-white">
      <p className="text-sm">Not recorded</p>
      {phase === 'lobby' ? <button className="mt-4 rounded-xl bg-cyan-300 px-4 py-2 font-bold text-black" type="button" onClick={() => { void start(); }}>Join</button> : null}
      <video ref={localRef} autoPlay muted playsInline className="mt-4 w-full rounded-xl bg-black" />
      <video ref={remoteRef} autoPlay playsInline className="mt-4 w-full rounded-xl bg-black" />
      {phase === 'connecting' || phase === 'live' ? (
        <div className="mt-3 space-x-2">
          <button type="button" className="rounded-xl border px-3 py-2" onClick={() => setEnabled('audio', !audioOn)}>{audioOn ? 'Mute' : 'Unmute'}</button>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={() => setEnabled('video', !videoOn)}>{videoOn ? 'Camera off' : 'Camera on'}</button>
          {canShare ? <button type="button" className="rounded-xl border px-3 py-2" onClick={() => { void shareScreen(); }}>Share screen</button> : null}
        </div>
      ) : null}
      {phase === 'failed' ? (
        <div className="mt-4 space-x-2">
          <button type="button" className="rounded-xl border px-3 py-2" onClick={() => { void fail(false); }}>Reschedule</button>
          <button type="button" className="rounded-xl border px-3 py-2" onClick={() => { void fail(true); }}>Switch to video review</button>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-white/70">{message}</p>
    </main>
  );
}
