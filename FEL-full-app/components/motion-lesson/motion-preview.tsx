'use client';
// MotionPreview — EDU-05 phase B (2026-11-10): the preview page's body. A row of lessons to pick (the owner's own takes,
// lib/motion-lesson/samples.ts) and the player on the one picked. Each lesson is opened from its FILE in the browser
// (decodeLesson: the platform's own gunzip), the way a stored lesson will be.
import { useEffect, useState } from 'react';
import { TYPE } from '@/lib/design/type';
import { TEACH_LOOK as L } from '@/components/teach/look';
import type { MotionLesson } from '@/lib/motion-lesson/format';
import { SAMPLE_LESSONS, loadSample } from '@/lib/motion-lesson/samples';
import { MOTION_COPY as T } from './copy';
import { MotionPlayer } from './motion-player';

export function MotionPreview() {
  const [id, setId] = useState(SAMPLE_LESSONS[0].id);
  const [opened, setOpened] = useState<{ id: string; lesson: MotionLesson | null } | null>(null);
  useEffect(() => {
    let live = true;
    void loadSample(id).then((lesson) => { if (live) setOpened({ id, lesson }); }, () => { if (live) setOpened({ id, lesson: null }); });
    return () => { live = false; };
  }, [id]);
  // the last lesson that opened stays on the player while the next one opens (the stage is never torn down between them)
  const failed = opened?.id === id && opened.lesson === null;
  return (
    <div className="space-y-4" data-motion-preview>
      <div className={L.chips} role="group" aria-label={T.pick}>
        {SAMPLE_LESSONS.map((s) => (
          <button key={s.id} type="button" className={`${L.chip} ${s.id === id ? L.chipOn : ''}`} aria-pressed={s.id === id} onClick={() => setId(s.id)} data-motion-sample={s.id}>{s.chip}</button>
        ))}
      </div>
      {failed && <p className={`${TYPE.small} text-white/60`} role="status" data-motion-nolesson>{T.noLesson}</p>}
      {/* one player, kept across lessons (its stage and body are built once); its controls start over with the lesson */}
      {opened?.lesson && <MotionPlayer lessonId={opened.id} lesson={opened.lesson} />}
    </div>
  );
}
