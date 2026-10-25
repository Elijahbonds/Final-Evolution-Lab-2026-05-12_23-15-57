'use client';

// The client's side of a live session (COACH-LIVE, 2026-10-25). The phone runs the app's own pose pipeline
// (lib/pose/PoseService, the one camera owner — started here the way the dunk film starts it) and:
//   · streams compact pose frames (lib/coach/live/wire.ts, ~20 a second) to the coach over the link's pose channel;
//   · counts the coach's set and flags each rep with the Mirror's audits (lib/coach/live/reader.ts), on every camera
//     frame, and sends each rep as it closes;
//   · shows the coach's cue on screen (looked up by its key: only the preset words can appear);
//   · sends its camera VIDEO only when the door allowed it (a verified adult) and the client chose it. A teen's phone
//     never hands its camera to the link: the coach sees a stick figure.
// The self-view is SelfView (components/games/body-play.tsx), the app's one way to show the camera picture.
// Nothing is recorded.

import { useEffect, useRef, useState } from 'react';
import { SelfView } from '@/components/games/body-play';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { VOICE_CONSTRAINTS } from '@/lib/party/social/voice';
import { HttpSignaller, LiveLink, type LinkMode } from '@/lib/coach/live/link';
import { encodePose, wireRep, type Ctl } from '@/lib/coach/live/wire';
import { PoseThinner, POSE_SEND_HZ, RELAY_POSE_HZ } from '@/lib/coach/live/timing';
import { createLiveReader, type LiveReader } from '@/lib/coach/live/reader';
import { cueText, LIVE_SPECS, setupLine, type LiveMovement } from '@/lib/coach/live/movements';
import { MODE_WORDS, NOT_RECORDED, type LiveJoin } from './live-words';

/** How long a cue stays on the client's screen. (new) */
export const CUE_SHOW_MS = 5000;

export function ClientLive({ room, join, signalApi = '/api/coach/live/signal' }: { room: string; join: LiveJoin; signalApi?: string }) {
  const [phase, setPhase] = useState<'lobby' | 'starting' | 'live' | 'ended'>('lobby');
  const [wantVideo, setWantVideo] = useState(join.clientVideo);
  const [mode, setMode] = useState<LinkMode>('connecting');
  const [coachHere, setCoachHere] = useState(false);
  const [movement, setMovement] = useState<LiveMovement | null>(null);
  const [set, setSet] = useState<{ id: number; movement: LiveMovement; reps: number; flagged: number } | null>(null);
  const [cue, setCue] = useState<{ id: number; text: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [sending, setSending] = useState<{ video: boolean; pose: boolean; voice: boolean }>({ video: false, pose: false, voice: false });

  const link = useRef<LiveLink | null>(null);
  const reader = useRef<{ id: number; movement: LiveMovement; r: LiveReader } | null>(null);
  const tracks = useRef<MediaStreamTrack[]>([]);
  const unsub = useRef<(() => void) | null>(null);
  const startedPose = useRef(false);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hello = useRef<Ctl | null>(null);

  const teardown = () => {
    unsub.current?.(); unsub.current = null;
    link.current?.close();
    tracks.current.forEach((t) => t.stop()); tracks.current = [];
    if (startedPose.current) { poseService().stop(); startedPose.current = false; }
    if (cueTimer.current) clearTimeout(cueTimer.current);
  };
  useEffect(() => () => teardown(), []);

  const onCtl = (m: Ctl) => {
    const l = link.current;
    switch (m.t) {
      case 'hello': if (m.role === 'coach') setCoachHere(true); return;
      case 'ping': l?.sendCtl({ t: 'pong', a: m.a, b: performance.now() }); return;
      case 'exercise': setMovement(m.movement); return;
      case 'set_start':
        reader.current = { id: m.set, movement: m.movement, r: createLiveReader(m.movement) };
        setMovement(m.movement);
        setSet({ id: m.set, movement: m.movement, reps: 0, flagged: 0 });
        return;
      case 'set_stop': {
        const cur = reader.current;
        if (!cur || cur.id !== m.set) return;
        l?.sendCtl({ t: 'set_done', set: cur.id, movement: cur.movement, reps: cur.r.reps().map(wireRep) });
        reader.current = null;
        setSet(null);
        return;
      }
      case 'cue': {
        const text = cueText(m.key);
        l?.sendCtl({ t: 'cue_ack', id: m.id });
        if (!text) return;
        setCue({ id: m.id, text });
        if (cueTimer.current) clearTimeout(cueTimer.current);
        cueTimer.current = setTimeout(() => setCue(null), CUE_SHOW_MS);
        return;
      }
      case 'end': setPhase('ended'); setTimeout(teardown, 300); return;
      default:
    }
  };
  const onCtlRef = useRef(onCtl);
  onCtlRef.current = onCtl;

  const start = async () => {
    setPhase('starting');
    const note = (s: string) => setNotes((n) => [...n, s]);
    const svc = poseService();
    startedPose.current = svc.state === 'idle' || svc.state === 'error';
    const poseOk = await svc.start({ facingMode: 'user' });
    if (!poseOk) note(`The pose tracker did not start${svc.why ? `: ${svc.why}` : ''}. Your coach will not see reps or form flags.`);
    let video: MediaStreamTrack | null = null;
    if (join.clientVideo && wantVideo) {
      const own = svc.video?.srcObject;
      if (poseOk && own instanceof MediaStream && own.getVideoTracks()[0]) video = own.getVideoTracks()[0].clone();
      else {
        try { video = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })).getVideoTracks()[0] ?? null; }
        catch { video = null; }
      }
      if (!video) note('Your camera video could not start. Your coach sees your pose only.');
    }
    let audio: MediaStreamTrack | null = null;
    try { audio = (await navigator.mediaDevices.getUserMedia({ audio: VOICE_CONSTRAINTS.audio, video: false })).getAudioTracks()[0] ?? null; }
    catch { note('Your microphone is off or blocked: your coach cannot hear you. Cues still show here.'); }
    tracks.current = [video, audio].filter((t): t is MediaStreamTrack => !!t);
    setSending({ video: !!video, pose: poseOk, voice: !!audio });
    // the camera's shape, for the coach's pose-only stage: the pose service's camera, else the video track's own
    const cam = svc.status.camera;
    const vs = video?.getSettings?.();
    const aspect = cam && cam.width && cam.height ? cam.width / cam.height : vs?.width && vs?.height ? vs.width / vs.height : 3 / 4;
    hello.current = { t: 'hello', role: 'client', video: !!video, aspect };
    const l = new LiveLink({
      role: 'client', iceServers: join.iceServers, signaller: new HttpSignaller(room, signalApi),
      local: { audio, video },
      onCtl: (m) => onCtlRef.current(m), onPose: () => {}, onRemote: (s) => playCoach(s),
      onMode: (m) => { setMode(m); if ((m === 'direct' || m === 'relay') && hello.current) l.sendCtl(hello.current); },
      onPeer: (here) => setCoachHere(here),
    });
    link.current = l;
    await l.start();
    const thin = new PoseThinner(POSE_SEND_HZ), relayThin = new PoseThinner(RELAY_POSE_HZ);
    let seq = 0;
    unsub.current = svc.onFrame((f: PoseFrame) => {
      const cur = reader.current;
      if (cur) {
        const rep = cur.r.step(f);
        if (rep) {
          l.sendCtl({ t: 'rep', set: cur.id, movement: cur.movement, rep: wireRep(rep) });
          setSet((s) => (s && s.id === cur.id ? { ...s, reps: rep.n, flagged: s.flagged + (rep.faults.length ? 1 : 0) } : s));
        }
      }
      if (!thin.take(f.t)) return;
      l.sendPose(encodePose(f, seq++, performance.now()), relayThin.take(f.t));
    });
    setPhase('live');
  };

  const audioEl = useRef<HTMLAudioElement | null>(null);
  const playCoach = (s: MediaStream) => {
    const a = audioEl.current;
    if (!a || a.srcObject === s) return;
    a.srcObject = s;
    void a.play().catch(() => {});
  };

  const leave = () => { teardown(); setPhase('ended'); };

  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-4 text-white" data-live-role="client" data-live-mode={mode}>
      <audio ref={audioEl} autoPlay className="hidden" data-live-coach-audio />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-black">Live session</h1>
        {phase !== 'lobby' && <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/70">{MODE_WORDS[mode]}</span>}
        <span className="text-xs text-white/50">{NOT_RECORDED}</span>
      </div>
      {phase === 'lobby' && (
        <div className="fel-card space-y-3 rounded-xl p-4" data-live-lobby>
          {join.clientVideo ? (
            <>
              <p className="text-sm text-white/75">Your coach sees your camera with your movement drawn over it, your rep count and form notes, and you can talk.</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={wantVideo} onChange={(e) => setWantVideo(e.target.checked)} data-live-want-video />
                Show my coach my camera video (off: they see a stick figure of your movement)
              </label>
            </>
          ) : (
            <p className="text-sm text-white/75" data-live-pose-only>
              Your coach sees your movement as a stick figure, your rep count and form notes, and you can talk. Your camera picture stays on this phone.
            </p>
          )}
          <p className="text-xs text-white/55">Prop your phone up so your whole body is in the picture.</p>
          <button type="button" data-live-join onClick={() => { void start(); }} className="rounded-xl bg-cyan-300 px-4 py-2 font-bold text-black">Join live session</button>
        </div>
      )}
      {phase !== 'lobby' && (
        <>
          {mode === 'relay' && (
            <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-2 text-sm text-amber-100" data-live-relay-note>
              No direct connection on this network. Your reps, form notes and cues still go through; voice and video need a direct connection.
            </p>
          )}
          {notes.map((n) => <p key={n} className="text-sm text-amber-200">{n}</p>)}
          {phase === 'live' && !coachHere && <p className="text-sm text-white/60" data-live-waiting>Waiting for your coach…</p>}
          <div className="relative">
            <SelfView className="w-full" />
            {cue && (
              <div className="absolute inset-x-2 top-2 rounded-xl bg-cyan-300 px-3 py-2 text-center text-lg font-black text-black shadow-lg" data-live-cue={cue.id} role="status">
                {cue.text}
              </div>
            )}
          </div>
          <div className="fel-card flex items-center gap-3 rounded-xl p-3">
            <div className="text-center">
              <div className="text-4xl font-black tabular-nums" data-client-rep-count>{set?.reps ?? 0}</div>
              <div className="text-[11px] uppercase tracking-wider text-white/50">{set ? `Set ${set.id}` : 'Between sets'}</div>
            </div>
            <div className="text-sm text-white/75">
              {movement ? <><div className="font-semibold">{LIVE_SPECS[movement].label}</div><div className="text-white/60">{setupLine(movement)}</div></> : 'Your coach picks the exercise.'}
            </div>
          </div>
          <p className="text-[11px] text-white/45" data-live-sending>
            Sending: {[sending.pose ? 'pose' : null, sending.video ? 'video' : null, sending.voice ? 'voice' : null].filter(Boolean).join(', ') || 'nothing yet'}. {NOT_RECORDED}
          </p>
          {phase === 'ended'
            ? <p className="text-sm text-white/70" data-live-ended>The session has ended. Your coach posts the summary to your thread.</p>
            : <button type="button" onClick={leave} className="w-full rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white/85">Leave</button>}
        </>
      )}
    </div>
  );
}
