'use client';
// MotionPlayer — EDU-05 motion lessons, phase B (2026-11-10): one recorded movement, on the student's own athlete.
// docs/PLATFORM-ROADMAP.md §2.3 item 3, the PLAYER half: speed, mirror, loop a phrase, turn the camera (a sideways drag).
//
// A do-this screen: the body moving is the lesson. Under it, the cue for this moment (the teacher's, at most five words),
// then three toggles a thumb reaches (Pause, Slow, Mirror) and the phrases to loop. Every control is a 44 px chip in the
// teacher platform's look (components/teach/look.ts); text is the type scale's label, small and heading only.
//
// The 3D loads only here (next/dynamic, ssr:false). Until the body is drawn and measured off its bind pose the box says
// it is loading; if 3D fails it says so and the controls stay off. Nothing is stored and nothing is sent.
import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { TYPE } from '@/lib/design/type';
import { TEACH_LOOK as L } from '@/components/teach/look';
import type { MotionLesson } from '@/lib/motion-lesson/format';
import { cueAt, phraseAt, weakAt, wholeOf, type ClipAsk, type Speed } from '@/lib/motion-lesson/playback';
import { MOTION_COPY as T } from './copy';
import type { MotionStageState } from './motion-stage';

const MotionStage = dynamic(() => import('./motion-stage'), { ssr: false, loading: () => null });
/** 3D switched off for this build (the same switch the library's demos read): the box says so, and no stage loads. */
const NO_3D = process.env.NEXT_PUBLIC_DISABLE_3D === '1';

export function MotionPlayer({ lessonId, lesson }: { lessonId: string; lesson: MotionLesson }) {
  const [state, setState] = useState<MotionStageState>(NO_3D ? 'failed' : 'loading');
  /** -1: the whole lesson */
  const [phrase, setPhrase] = useState(-1);
  const [mirror, setMirror] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(true);
  /** what the moment on screen says: the cue, the phrase it is in, and whether the camera saw it poorly */
  const [now, setNow] = useState<{ cue: string | null; phrase: number; weak: boolean }>({ cue: null, phrase: -1, weak: false });
  const last = useRef(now);
  // a new lesson on the same player (the stage and its body are kept): the controls start over
  const [forLesson, setForLesson] = useState(lessonId);
  if (forLesson !== lessonId) {
    setForLesson(lessonId); setPhrase(-1); setMirror(false); setSpeed(1); setPlaying(true);
    last.current = { cue: null, phrase: -1, weak: false }; setNow(last.current);
  }

  const onTime = useCallback((sec: number, returning: boolean) => {
    const next = returning ? { cue: null, phrase: -1, weak: false } : { cue: cueAt(lesson, sec), phrase: phraseAt(lesson, sec), weak: weakAt(lesson, sec) };
    const was = last.current;
    if (next.cue === was.cue && next.phrase === was.phrase && next.weak === was.weak) return;
    last.current = next;
    setNow(next);
  }, [lesson]);

  const p = phrase >= 0 ? lesson.phrases[phrase] ?? null : null;
  const ask: ClipAsk = p ? { from: p.from, to: p.to, mirror } : { ...wholeOf(lesson), mirror };
  const ready = state === 'ready';
  const chip = (on: boolean) => `${L.chip} ${on ? L.chipOn : ''}`;
  const line = now.weak ? T.weak : now.cue ?? lesson.phrases[now.phrase]?.label ?? lesson.title;

  return (
    <section className="space-y-3" data-motion-player={lessonId} data-motion-state={state}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#0b0b12] to-[#05050a] sm:aspect-video">
        <div className={`h-full w-full transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          {!NO_3D && <MotionStage lessonId={lessonId} keys={lesson.keys} ask={ask} speed={speed} playing={playing} onState={setState} onTime={onTime} />}
        </div>
        {!ready && (
          <p className={`${TYPE.small} absolute inset-0 flex items-center justify-center px-4 text-center text-white/60`} role="status">
            {state === 'failed' ? T.failed : T.loading}
          </p>
        )}
        {ready && <span className={`${TYPE.label} pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-fel-cyan`} data-motion-badge>{T.badge}</span>}
      </div>

      {/* the cue for this moment; between cues, where in the lesson the body is */}
      <p className={`${TYPE.heading} min-h-[22px] ${now.cue && !now.weak ? 'text-white' : 'text-white/60'}`} role="status" data-motion-cue={now.cue ? 'cue' : now.weak ? 'weak' : 'place'}>{line}</p>

      <div className={L.chips} role="group" aria-label={T.title}>
        <button type="button" className={chip(!playing)} aria-pressed={!playing} disabled={!ready} onClick={() => setPlaying((v) => !v)} data-motion-pause>{playing ? T.pause : T.play}</button>
        <button type="button" className={chip(speed !== 1)} aria-pressed={speed !== 1} disabled={!ready} onClick={() => { setSpeed((s) => (s === 1 ? 0.5 : 1)); setPlaying(true); }} data-motion-slow>{T.slow}</button>
        <button type="button" className={chip(mirror)} aria-pressed={mirror} disabled={!ready} onClick={() => { setMirror((v) => !v); setPlaying(true); }} data-motion-mirror>{T.mirror}</button>
      </div>

      {lesson.phrases.length > 1 && (
        <div className={L.chips} role="group" aria-label={T.loop} data-motion-phrases>
          <button type="button" className={chip(phrase < 0)} aria-pressed={phrase < 0} disabled={!ready} onClick={() => { setPhrase(-1); setPlaying(true); }} data-motion-phrase="all">{T.all}</button>
          {lesson.phrases.map((ph, i) => (
            <button key={`${ph.from}-${ph.label}`} type="button" className={chip(phrase === i)} aria-pressed={phrase === i} disabled={!ready} onClick={() => { setPhrase(i); setPlaying(true); }} data-motion-phrase={i}>{ph.label}</button>
          ))}
        </div>
      )}
      <p className={`${TYPE.small} text-white/60`} data-motion-guide>{T.guide}</p>
    </section>
  );
}
