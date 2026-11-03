// PLAT-P04 (2026-10-27): the lesson → loop map holds only loops that ARE the lesson's movement, through the library's own
// tables (read-only), and every loop is one the library stage can play.
import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterByNumber, lessonId } from './course';
import { LESSON_DEMOS, clipOf, demoForLesson } from './lessonDemo';
import { drillById } from '@/lib/drills/drills';
import { drillLessonIds } from '@/lib/drills/playbookLinks';
import { DEMO_CLIPS, demoClipFor } from '@/lib/library/demo';
import { LESSON_DEMO_LOOPS, WARMUP_DEMO_LOOPS } from '@/lib/library/surfaceDemo';
import { sourceLessonId } from '@/lib/drills/playbookLinks';
import { loadLibraryFiles } from '@/lib/library/files';

describe('lessonDemo', () => {
  it('every listed lesson is a lesson of the book, listed once', () => {
    const seen = new Set<string>();
    for (const d of LESSON_DEMOS) {
      const ch = chapterByNumber(d.chapter);
      expect(ch?.lessons.some((l) => l.key === d.lesson), `${d.chapter}:${d.lesson}`).toBe(true);
      const id = lessonId(d.chapter, d.lesson);
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });

  it('a drill source is a charted drill with a loop, taught by that lesson (or its own named sets: the bilateral weeks)', () => {
    for (const d of LESSON_DEMOS) {
      if (d.source.kind !== 'drill') continue;
      const drill = drillById(d.source.drill);
      expect(drill, d.source.drill).not.toBeNull();
      expect(clipOf(d.source), d.source.drill).not.toBeNull();
      const taught = drillLessonIds(drill!);
      const id = lessonId(d.chapter, d.lesson);
      // "Weeks 1–2: Bilateral Pogos (Both Feet)" is the sets of the progression the bilateral drill charts
      if (id !== '6:weeks-1-2-bilateral-pogos') expect(taught, id).toContain(id);
    }
  });

  it('a step source is a phase of a charted drill whose own source is this lesson, with the loop authored for it', () => {
    for (const d of LESSON_DEMOS) {
      if (d.source.kind !== 'step') continue;
      const drill = drillById(d.source.drill);
      expect(drill, d.source.drill).not.toBeNull();
      const step = d.source.step;
      const phase = drill!.phases.find((p) => p.id === step);
      expect(phase, step).toBeDefined();
      expect(phase!.source ? sourceLessonId(phase!.source) : null, step).toBe(lessonId(d.chapter, d.lesson));
      expect(WARMUP_DEMO_LOOPS[step], step).toBeTruthy();
    }
  });

  it('a lesson source names a sequence surfaceDemo has a loop for', () => {
    for (const d of LESSON_DEMOS) {
      if (d.source.kind !== 'lesson') continue;
      expect(LESSON_DEMO_LOOPS[d.source.loop], d.source.loop).toBeTruthy();
    }
  });

  it('a library source is a real entry, and the loop written here is the one the library plays for it', () => {
    const byId = new Map(loadLibraryFiles().map((e) => [e.id, e]));
    for (const d of LESSON_DEMOS) {
      if (d.source.kind !== 'library') continue;
      const e = byId.get(d.source.exercise);
      expect(e, d.source.exercise).toBeDefined();
      expect(demoClipFor(e!), d.source.exercise).toBe(d.source.clip);
    }
  });

  it('every loop is one the stage owns', () => {
    for (const d of LESSON_DEMOS) expect(DEMO_CLIPS, `${d.chapter}:${d.lesson}`).toContain(clipOf(d.source));
  });

  it('never borrows: a lesson opens on the loop that IS its movement, and a lesson with none opens on its cards', () => {
    // DEMO-LOOPS-8: the hip hinge (the bodyweight RDL), the ankle (both halves: the seated circles, then the knee-to-wall)
    // and the tripod phase each have their own loop now
    expect(demoForLesson('8:the-hip-hinge')).toBe('ex_bw_hinge');
    expect(demoForLesson('4:the-ankle')).toBe('ex_ankle_unlock');
    expect(demoForLesson('5:wake-up-the-tripod')).toBe('ex_tripod');
    expect(demoForLesson('9:supine-spinal-twist')).toBe('ex_knee_across');
    expect(demoForLesson('6:the-safe-landing-check')).toBe('ex_jump');
    expect(demoForLesson('6:the-countermovement-geometry-check')).toBe('ex_cmj_dip');
    // no loop is the partner-resisted march yet; the screen's checks are looked at, standing still
    expect(demoForLesson('7:the-resisted-march-to-sprint')).toBeNull();
    expect(demoForLesson('3:the-knee-window')).toBeNull();
    expect(demoForLesson('nonsense')).toBeNull();
  });

  it('coverage only goes up: 26 of the book\'s 42 drill lessons open on a demo (34 lessons in all)', () => {
    const drills = CHAPTERS.flatMap((c) => c.lessons.filter((l) => l.kind === 'drill').map((l) => lessonId(c.number, l.key)));
    const withDemo = drills.filter((id) => demoForLesson(id) !== null);
    expect(drills.length).toBe(42);
    expect(withDemo.length).toBeGreaterThanOrEqual(26);
    expect(LESSON_DEMOS.length).toBeGreaterThanOrEqual(34);
  });
});
