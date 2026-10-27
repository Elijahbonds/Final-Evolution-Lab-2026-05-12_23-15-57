'use client';
// useSessionPlayer — PLAT-P01 (2026-10-27): drives the pure step machine (lib/session-player/machine.ts) on the real
// clock, and does the things a screen does around it: the voice (behind a mute the device remembers), the screen wake
// lock (held while playing; let go on pause, the finish and close), the "How to set up" sheet (opens by itself before the
// first set of an exercise this device has never run, closes by itself when the set starts) and the finish callback.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { back as backOf, pause as pauseOf, primary as primaryOf, resume as resumeOf, startState, tick, type Effect, type Out, type PlayerState } from '@/lib/session-player/machine';
import type { Session } from '@/lib/session-player/model';
import { markSeen, playerStorage, readSeen } from '@/lib/session-player/seen';
import { browserVoice } from '@/lib/session-player/speaker';
import { startTicker, type Clock, realClock } from '@/lib/session-player/ticker';
import { SessionVoice, type VoiceOut } from '@/lib/session-player/voice';
import { screenLock, type WakeLockNav } from '@/lib/session-player/wakeLock';

export interface PlayerOptions {
  /** Open on this state instead of the ready count (the rig's scenes; a resumed session). */
  initial?: PlayerState;
  onFinish?: (s: PlayerState) => void;
  clock?: Clock;
  /** Stand-ins for the browser's voice (tests). */
  voice?: VoiceOut;
}

export function useSessionPlayer(session: Session, o: PlayerOptions = {}) {
  const first = useMemo<Out>(() => (o.initial ? { state: o.initial, effects: [] } : startState(session)), []);   // the player opens once
  const [state, setState] = useState<PlayerState>(first.state);
  const ref = useRef(state);
  const storage = useMemo(() => playerStorage(), []);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(storage));
  const seenRef = useRef(seen);
  const [sheet, setSheet] = useState(false);
  const voice = useMemo(() => {
    const b = o.voice ? { out: o.voice, take: () => null } : browserVoice();
    return new SessionVoice(b.out, storage, b.take);
  }, []);   // one voice per player
  const [muted, setMutedState] = useState(voice.isMuted);
  const onFinish = useRef(o.onFinish);
  onFinish.current = o.onFinish;
  const lock = useMemo(() => screenLock(typeof navigator !== 'undefined' ? navigator as unknown as WakeLockNav : null, typeof document !== 'undefined' ? document : null), []);

  /** The sheet opens by itself before the first set of an exercise this device has never run (and that has a set-up). */
  const autoSheet = useCallback((effects: readonly Effect[]) => {
    for (const e of effects) {
      if (e.kind !== 'enter') continue;
      const st = session.steps[e.step];
      if (e.phase === 'work') setSheet(false);
      else if ((e.phase === 'ready' || (e.phase === 'rest' && e.fresh)) && e.set === 1 && st?.setup && !seenRef.current.has(st.exId)) setSheet(true);
      else if (e.phase === 'finish') setSheet(false);
    }
  }, [session]);

  const apply = useCallback((out: Out) => {
    const prev = ref.current;
    const next = out.state;
    if (next === prev && !out.effects.length) return;
    ref.current = next;
    setState(next);
    // a set was done: this device has now run the exercise
    if (next.setsDone > prev.setsDone && prev.phase === 'work') {
      const ex = session.steps[prev.step]?.exId;
      if (ex && !seenRef.current.has(ex)) { seenRef.current = markSeen(storage, ex); setSeen(seenRef.current); }
    }
    voice.play(out.effects, session);
    autoSheet(out.effects);
    if (next.phase === 'finish' && prev.phase !== 'finish') onFinish.current?.(next);
  }, [session, storage, voice, autoSheet]);

  // the opening: say the first exercise, open its set-up if it is new here
  useEffect(() => {
    voice.play(first.effects, session);
    autoSheet(first.effects);
    if (first.state.phase === 'finish') onFinish.current?.(first.state);
    return () => { voice.stop(); };
  }, []);   // once, on open

  // the clock
  useEffect(() => startTicker((dt) => apply(tick(session, ref.current, dt)), o.clock ?? realClock), [apply, session, o.clock]);

  // the screen stays on while playing
  const playing = state.phase !== 'finish' && !state.paused;
  useEffect(() => { if (playing) lock.hold(); else lock.release(); }, [playing, lock]);
  useEffect(() => () => lock.dispose(), [lock]);

  return {
    state, seen, sheet, muted,
    primary: () => apply(ref.current.paused ? { state: resumeOf(ref.current), effects: [] } : primaryOf(session, ref.current)),
    back: () => apply(backOf(session, ref.current)),
    pause: () => apply({ state: pauseOf(ref.current), effects: [] }),
    resume: () => apply({ state: resumeOf(ref.current), effects: [] }),
    togglePause: () => apply({ state: ref.current.paused ? resumeOf(ref.current) : pauseOf(ref.current), effects: [] }),
    setSheet,
    toggleMute: () => { voice.setMuted(!voice.isMuted); setMutedState(voice.isMuted); },
    wakeLockHeld: () => lock.held,
  };
}
