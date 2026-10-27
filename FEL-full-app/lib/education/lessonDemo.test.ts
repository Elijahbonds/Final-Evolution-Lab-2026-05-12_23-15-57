// PLAT-P04 (2026-10-27): the lesson → loop map holds only loops that ARE the lesson's movement, through the library's own
// tables (read-only), and every loop is one the library stage can play.
import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterByNumber, lessonId } from './course';
import { LESSON_DEMOS, clipOf, demoForLesson } from './lessonDemo';
import { drillById } from '@/lib/drills/drills';
import { drillLessonIds } from '@/lib/drills/playbookLinks';
import { DEMO_CLIPS, demoClipFor } from '@/lib/library/demo';
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

  it('never borrows: the hip hinge (no bodyweight hinge loop) and the ankle (half a loop) open on their cards', () => {
    expect(demoForLesson('8:the-hip-hinge')).toBeNull();
    expect(demoForLesson('4:the-ankle')).toBeNull();
    expect(demoForLesson('5:wake-up-the-tripod')).toBeNull();
    expect(demoForLesson('6:the-safe-landing-check')).toBe('ex_jump');
    expect(demoForLesson('6:the-countermovement-geometry-check')).toBe('ex_cmj_dip');
    expect(demoForLesson('nonsense')).toBeNull();
  });

  it('coverage only goes up: 13 of the book\'s 42 drill lessons open on a demo (19 lessons in all)', () => {
    const drills = CHAPTERS.flatMap((c) => c.lessons.filter((l) => l.kind === 'drill').map((l) => lessonId(c.number, l.key)));
    const withDemo = drills.filter((id) => demoForLesson(id) !== null);
    expect(drills.length).toBe(42);
    expect(withDemo.length).toBeGreaterThanOrEqual(13);
    expect(LESSON_DEMOS.length).toBeGreaterThanOrEqual(19);
  });
});
