'use client';

// The coach's side of a live session (COACH-LIVE, 2026-10-25). What a video-only remote session cannot give a coach,
// beside the video: the client's pose skeleton over it, a live rep count, and the form flags the Mirror's own audits
// raise — read on the client's phone and sent rep by rep. The coach picks the exercise, starts and stops each set,
// sends a preset cue to the client's screen, and ends the session with a summary posted to the program thread.
//
// Nothing is recorded. The page keeps the session in memory; End posts the summary (sets, reps, flags) and that is all.

import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_CONSTRAINTS } from '@/lib/party/social/voice';
import { HttpSignaller, LiveLink, type LinkMode } from '@/lib/coach/live/link';
import { decodePose, type Ctl, type WirePose } from '@/lib/coach/live/wire';
import { ClockSync, PING_EVERY_MS, RateMeter, percentiles } from '@/lib/coach/live/timing';
import { LIVE_MOVEMENTS, LIVE_SPECS, cuePresets, type LiveMovement } from '@/lib/coach/live/movements';
import {
  addRep, buildSummary, flaggedReps, initialCoachSession, liveSet, pickExercise, setFlagLines, settleSet, startSet, stopSet,
  type CoachSessionState,
} from '@/lib/coach/live/session';
import { PoseStage } from './pose-stage';
import { MODE_WORDS, NOT_RECORDED, type LiveJoin } from './live-words';

/** How long the skeleton shows the fault colour after a flagged rep. */
const FLAG_FLASH_MS = 1500;
/** Video that decodes no frame for this long is treated as stalled: the stage shows the skeleton alone. */
const VIDEO_STALL_MS = 3000;
const END_WAIT_MS = 1500;

export interface CoachStats {
  mode: LinkMode;
  path: string | null;
  poseHz: number;
  poseKbps: number;
  poseWireKbps: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  netP50: number | null;
  rttMs: number | null;
  videoFps: number | null;
  videoKbps: number | null;
  audioKbps: number | null;
  framesIn: number;
  relayFrames: number;
}

interface SentCue { id: number; key: string; text: string; at: number; seenMs: number | null }

export function CoachLive({ room, join, summaryApi = '/api/coach/live/summary', signalApi = '/api/coach/live/signal' }: {
  room: string; join: LiveJoin; summaryApi?: string; signalApi?: string;
}) {
  const [phase, setPhase] = useState<'ready' | 'live' | 'ended'>('ready');
  const [mode, setMode] = useState<LinkMode>('connecting');
  const [client, setClient] = useState<{ here: boolean; video: boolean; aspect: number }>({ here: false, video: false, aspect: 3 / 4 });
  const [session, setSessionState] = useState<CoachSessionState>(() => initialCoachSession('squat'));
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<CoachStats | null>(null);
  const [stalled, setStalled] = useState(false);
  const [cues, setCues] = useState<SentCue[]>([]);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ text: string; posted: boolean } | null>(null);

  const link = useRef<LiveLink | null>(null);
  const sessionRef = useRef(session);
  const latest = useRef<WirePose | null>(null);
  const flagUntil = useRef(0);
  const clock = useRef(new ClockSync());
  const meter = useRef(new RateMeter());
  const lat = useRef<number[]>([]);
  const net = useRef<number[]>([]);
  const counts = useRef({ framesIn: 0, relayFrames: 0 });
  const cueId = useRef(0);
  const mic = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const sessionId = useRef(`s${Math.random().toString(36).slice(2, 12)}`);
  const settled = useRef<Set<number>>(new Set());

  const setSession = useCallback((fn: (s: CoachSessionState) => CoachSessionState) => {
    sessionRef.current = fn(sessionRef.current);
    setSessionState(sessionRef.current);
  }, []);

  const onCtl = useCallback((m: Ctl) => {
    const now = performance.now();
    switch (m.t) {
      case 'hello':
        if (m.role !== 'client') return;
        setClient({ here: true, video: m.video, aspect: m.aspect ?? 3 / 4 });
        link.current?.sendCtl({ t: 'exercise', movement: sessionRef.current.movement });
        return;
      case 'pong': clock.current.pong(m.a, m.b, now); return;
      case 'rep':
        setSession((s) => addRep(s, m.set, m.movement, m.rep));
        if (m.rep.faults.length) flagUntil.current = now + FLAG_FLASH_MS;
        return;
      case 'set_done':
        settled.current.add(m.set);
        setSession((s) => settleSet(s, m.set, m.movement, m.reps));
        return;
      case 'cue_ack':
        setCues((cs) => cs.map((c) => (c.id === m.id && c.seenMs === null ? { ...c, seenMs: Math.round(now - c.at) } : c)));
        return;
      case 'end': setClient((c) => ({ ...c, here: false })); return;
      default:
    }
  }, [setSession]);

  const onPose = useCallback((buf: ArrayBuffer, via: 'direct' | 'relay') => {
    const p = decodePose(buf);
    if (!p) return;
    const now = performance.now();
    counts.current.framesIn++;
    if (via === 'relay') counts.current.relayFrames++;
    if (latest.current && p.seq === latest.current.seq) return;
    latest.current = p;
    meter.current.add(now, buf.byteLength);
    if (clock.current.ready) {
      const l = now - clock.current.toLocal(p.t, now);
      if (l > -50 && l < 10_000) {
        lat.current.push(l); net.current.push(l - p.lag);
        if (lat.current.length > 300) { lat.current.shift(); net.current.shift(); }
      }
    }
  }, []);

  const start = async () => {
    setPhase('live');
    started.current = Date.now();
    try { mic.current = await navigator.mediaDevices.getUserMedia({ audio: VOICE_CONSTRAINTS.audio, video: false }); }
    catch { mic.current = null; setMicNote('Your microphone is off or blocked: your client cannot hear you. Cues still show on their screen.'); }
    const l = new LiveLink({
      role: 'coach', iceServers: join.iceServers, signaller: new HttpSignaller(room, signalApi),
      local: { audio: mic.current?.getAudioTracks()[0] ?? null, video: null },
      onCtl, onPose, onRemote: (s) => setRemote(s), onMode: (m) => {
        setMode(m);
        if (m === 'direct' || m === 'relay') l.sendCtl({ t: 'hello', role: 'coach', video: false });
      },
      onPeer: (here) => { if (!here) setClient((c) => ({ ...c, here: false })); },
    });
    link.current = l;
    await l.start();
  };

  // the clock's ping, and the panel's numbers (with the peer connection's own counters)
  useEffect(() => {
    if (phase !== 'live') return;
    const ping = setInterval(() => link.current?.sendCtl({ t: 'ping', a: performance.now() }), PING_EVERY_MS);
    let prev: { t: number; video: number; audio: number; dc: number; frames: number } | null = null;
    let lastDecodeAt = performance.now();
    const tick = setInterval(async () => {
      const now = performance.now();
      const pc = link.current?.peer;
      let path: string | null = null, videoFps: number | null = null, video = 0, audio = 0, dc = 0, frames = 0;
      if (pc && pc.connectionState === 'connected') {
        try {
          const rep = await pc.getStats();
          rep.forEach((r: Record<string, unknown>) => {
            if (r.type === 'inbound-rtp' && r.kind === 'video') { video = Number(r.bytesReceived ?? 0); frames = Number(r.framesDecoded ?? 0); videoFps = typeof r.framesPerSecond === 'number' ? r.framesPerSecond : videoFps; }
            if (r.type === 'inbound-rtp' && r.kind === 'audio') audio = Number(r.bytesReceived ?? 0);
            if (r.type === 'data-channel' && r.label === 'pose') dc = Number(r.bytesReceived ?? 0);
            if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.localCandidateId === 'string') {
              const local = rep.get(r.localCandidateId) as { candidateType?: string } | undefined;
              path = local?.candidateType ?? null;
            }
          });
        } catch { /* stats are a nice-to-have */ }
      }
      const kbps = (b: number, a: number | undefined) => (prev && a !== undefined ? Math.max(0, ((b - a) * 8) / (now - prev.t)) : null);
      if (frames > (prev?.frames ?? 0)) lastDecodeAt = now;
      setStalled(now - lastDecodeAt > VIDEO_STALL_MS);
      const lp = percentiles(lat.current), np = percentiles(net.current);
      setStats({
        mode: link.current?.currentMode ?? 'connecting', path,
        poseHz: Math.round(meter.current.hz(now) * 10) / 10,
        poseKbps: Math.round(meter.current.bps(now) / 100) / 10,
        poseWireKbps: kbps(dc, prev?.dc),
        latencyP50: lp.p50 === null ? null : Math.round(lp.p50), latencyP95: lp.p95 === null ? null : Math.round(lp.p95),
        netP50: np.p50 === null ? null : Math.round(np.p50),
        rttMs: clock.current.rtt === null ? null : Math.round(clock.current.rtt),
        videoFps, videoKbps: kbps(video, prev?.video), audioKbps: kbps(audio, prev?.audio),
        framesIn: counts.current.framesIn, relayFrames: counts.current.relayFrames,
      });
      prev = { t: now, video, audio, dc, frames };
    }, 1000);
    return () => { clearInterval(ping); clearInterval(tick); };
  }, [phase]);

  useEffect(() => () => { link.current?.close(); mic.current?.getTracks().forEach((t) => t.stop()); }, []);

  const current = liveSet(session);
  const movement = session.movement;
  const choose = (m: LiveMovement) => {
    if (current) return;
    setSession((s) => pickExercise(s, m));
    link.current?.sendCtl({ t: 'exercise', movement: m });
  };
  const toggleSet = () => {
    if (current) {
      link.current?.sendCtl({ t: 'set_stop', set: current.id });
      setSession((s) => stopSet(s, current.id));
      return;
    }
    const r = startSet(sessionRef.current);
    if (r.id === null) return;
    setSession(() => r.state);
    link.current?.sendCtl({ t: 'set_start', set: r.id, movement: sessionRef.current.movement });
  };
  const cue = (key: string, text: string) => {
    const id = ++cueId.current;
    if (link.current?.sendCtl({ t: 'cue', id, key })) setCues((cs) => [{ id, key, text, at: performance.now(), seenMs: null }, ...cs].slice(0, 6));
  };
  const end = async () => {
    const live = liveSet(sessionRef.current);
    if (live) {
      link.current?.sendCtl({ t: 'set_stop', set: live.id });
      setSession((s) => stopSet(s, live.id));
      const until = performance.now() + END_WAIT_MS;
      while (!settled.current.has(live.id) && performance.now() < until) await new Promise((r) => setTimeout(r, 100));
    }
    const sum = buildSummary(sessionRef.current);
    link.current?.sendCtl({ t: 'end' });
    setPhase('ended');
    try {
      const r = await fetch(summaryApi, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room, sessionId: sessionId.current, minutes: Math.max(1, Math.round((Date.now() - started.current) / 60_000)), summary: sum }),
      });
      const j = await r.json();
      setSummary(r.ok ? { text: String(j.text ?? ''), posted: j.posted === true } : { text: 'The summary could not be saved.', posted: false });
    } catch {
      setSummary({ text: 'The summary could not be saved.', posted: false });
    }
    setTimeout(() => { link.current?.close(); mic.current?.getTracks().forEach((t) => t.stop()); }, 400);
  };

  const hasVideo = !!remote?.getVideoTracks().some((t) => t.readyState === 'live');
  const showVideo = join.clientVideo && client.video && hasVideo && mode === 'direct' && !stalled;
  const stageLabel = showVideo ? 'Video + pose' : join.clientBand === 'teen' ? 'Pose + voice (under 18: no video)' : !join.clientVideo || !client.video ? 'Pose + voice' : mode === 'relay' ? 'Pose only (no direct connection)' : stalled ? 'Pose + voice (video paused)' : 'Pose + voice';
  const lastSet = current ?? [...session.sets].reverse()[0] ?? null;
  const flags = lastSet ? setFlagLines(lastSet) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-4 text-white" data-live-role="coach" data-live-mode={mode} data-live-stats={stats ? JSON.stringify(stats) : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-black">Live session</h1>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/70" data-live-mode-chip>{MODE_WORDS[mode]}</span>
        <span className="text-xs text-white/50">{NOT_RECORDED}</span>
      </div>
      {phase === 'ready' && (
        <div className="fel-card space-y-3 rounded-xl p-4">
          <p className="text-sm text-white/75">
            You will see {join.clientBand === 'teen' ? 'your athlete\'s movement as a stick figure (no video for under-18s)' : 'your client\'s camera with their pose drawn over it'}, a live rep count and form flags, and you can talk.
          </p>
          <button type="button" data-live-start onClick={() => { void start(); }} className="rounded-xl bg-cyan-300 px-4 py-2 font-bold text-black">Start live session</button>
        </div>
      )}
      {phase !== 'ready' && (
        <>
          {mode === 'relay' && (
            <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-2 text-sm text-amber-100" data-live-relay-note>
              No direct connection on this network. Reps, form flags, cues and the stick figure come through our server; voice and video need a direct connection.
            </p>
          )}
          {micNote && <p className="text-sm text-amber-200">{micNote}</p>}
          {!client.here && phase === 'live' && <p className="text-sm text-white/60" data-live-waiting>Waiting for your client to join…</p>}
          <PoseStage stream={remote} showVideo={showVideo} latest={latest} flagUntil={flagUntil} aspect={client.aspect} label={stageLabel} />
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <div className="text-center">
              <div className="text-5xl font-black tabular-nums" data-rep-count>{lastSet?.reps.length ?? 0}</div>
              <div className="text-[11px] uppercase tracking-wider text-white/50">{current ? `Set ${current.id} · live` : lastSet ? `Set ${lastSet.id} · done` : 'No set yet'}</div>
            </div>
            <ul className="space-y-1 text-sm" data-live-flags>
              {flags.length ? flags.map((f) => <li key={f} className="text-amber-200">{f}</li>) : <li className="text-white/50">{lastSet ? 'No form flags on this set.' : 'Pick the exercise, then start a set.'}</li>}
            </ul>
          </div>
          {phase === 'live' && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Exercise">
                {LIVE_MOVEMENTS.map((m) => (
                  <button key={m} type="button" data-exercise={m} disabled={!!current} onClick={() => choose(m)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${m === movement ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100' : 'border-white/15 text-white/75'} disabled:opacity-50`}>
                    {LIVE_SPECS[m].label}
                  </button>
                ))}
              </div>
              <button type="button" data-set-toggle onClick={toggleSet}
                className={`w-full rounded-xl px-4 py-3 text-lg font-black ${current ? 'bg-rose-400 text-black' : 'bg-emerald-300 text-black'}`}>
                {current ? `Stop set ${current.id}` : `Start set ${session.nextId} · ${LIVE_SPECS[movement].label}`}
              </button>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-fel-dim">Send a cue to their screen</div>
                <div className="flex flex-wrap gap-2">
                  {cuePresets(movement).map((c) => (
                    <button key={c.key} type="button" data-cue-btn={c.key} onClick={() => cue(c.key, c.text)}
                      className="max-w-full rounded-lg border border-white/15 px-2.5 py-1.5 text-left text-xs text-white/85">{c.text}</button>
                  ))}
                </div>
                {cues.length > 0 && (
                  <ul className="text-xs text-white/60" data-cue-log>
                    {cues.map((c) => <li key={c.id} data-cue-sent={c.id} data-cue-seen={c.seenMs ?? undefined}>{c.seenMs === null ? 'Sent' : `Seen (${c.seenMs} ms)`}: {c.text}</li>)}
                  </ul>
                )}
              </div>
            </>
          )}
          <div className="fel-card rounded-xl p-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-fel-dim">Sets</div>
            {session.sets.length === 0 ? <p className="text-sm text-white/50">None yet.</p> : (
              <ul className="space-y-1 text-sm">
                {session.sets.map((s) => (
                  <li key={s.id} data-set-row={s.id} data-set-reps={s.reps.length} data-set-flagged={flaggedReps(s).length}>
                    <span className="font-semibold">Set {s.id} · {LIVE_SPECS[s.movement].label}</span>: {s.reps.length} reps{flaggedReps(s).length ? `, ${flaggedReps(s).length} flagged` : ', no flags'}{s.state === 'live' ? ' (live)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {stats && (
            <p className="text-[11px] text-fel-dim" data-live-numbers>
              {MODE_WORDS[stats.mode]}{stats.path ? ` (${stats.path})` : ''} · pose {stats.poseHz} Hz, {stats.poseKbps} kbps{stats.latencyP50 !== null ? `, ${stats.latencyP50} ms old` : ''}{stats.videoFps ? ` · video ${Math.round(stats.videoFps)} fps` : ''}
            </p>
          )}
          {phase === 'live' && (
            <button type="button" data-live-end onClick={() => { void end(); }} className="w-full rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-white/85">
              End session and post the summary
            </button>
          )}
          {summary && (
            <div className="fel-card space-y-1 rounded-xl p-3" data-summary data-summary-posted={summary.posted ? '1' : '0'}>
              <div className="text-[11px] uppercase tracking-wider text-fel-dim">{summary.posted ? 'Posted to your thread' : 'Not posted'}</div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-white/85">{summary.text}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
