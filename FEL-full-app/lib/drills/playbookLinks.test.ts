import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHAPTERS, chapterByNumber, lessonId } from '../education/course';
import { WAKE_UP, COUNTERMOVEMENT_GEOMETRY, POGO_BILATERAL, POGO_UNILATERAL, SAFE_LANDING } from './drills';
import { DRILLS_PATH, ROUTE_DRILLS, drillChapterHref, drillHref, routeDrill, drillMinutes, drillSourceLine } from './route';
import { bookLessonsFor, drillLessonIds, drillsForLesson, lessonDrillLinks, sourceLessonId } from './playbookLinks';
import { DrillVoice } from './drillVoice';

const APP = join(__dirname, '..', '..', 'app');

describe('the route\'s addresses', () => {
  it('/play/drills is a real page, and a drill opens as ?drill=<id>', () => {
    expect(DRILLS_PATH).toBe('/play/drills');
    expect(existsSync(join(APP, 'play', 'drills', 'page.tsx'))).toBe(true);
    expect(drillHref('safe-landing')).toBe('/play/drills?drill=safe-landing');
    expect(routeDrill('safe-landing')).toBe(SAFE_LANDING);
  });

  it('?drill= opens only a drill on the route: an unknown id, an off-route chart or nothing is the shelf', () => {
    expect(routeDrill(null)).toBeNull();
    expect(routeDrill('')).toBeNull();
    expect(routeDrill('wall-drive')).toBeNull();          // charted (ch. 7), not on the route yet
    expect(routeDrill('<script>')).toBeNull();
  });

  it('each drill\'s chapter link is a real Playbook chapter page', () => {
    expect(existsSync(join(APP, 'education', 'playbook', '[chapter]', 'page.tsx'))).toBe(true);
    for (const d of ROUTE_DRILLS) {
      const href = drillChapterHref(d)!;
      expect(href).toBe(`/education/playbook/${d.source.chapter}`);
      expect(chapterByNumber(d.source.chapter)).not.toBeNull();
    }
    expect(drillSourceLine(SAFE_LANDING)).toBe('Playbook ch. 6 · Drill 3: The Safe Landing Check');
    expect(drillMinutes(WAKE_UP)).toBe(10);                // the book's ten-minute protocol
  });
});

describe('lessons ↔ drills, derived from each drill\'s own source (no table)', () => {
  it('every drill on the route names at least one real lesson; the Wake-Up names its protocol and all six phases', () => {
    for (const d of ROUTE_DRILLS) expect(drillLessonIds(d).length, d.id).toBeGreaterThan(0);
    expect(drillLessonIds(WAKE_UP)).toEqual([
      '5:the-10-minute-pre-game-protocol', '5:release-the-locks', '5:pressurize-the-system', '5:wake-up-the-tripod',
      '5:open-the-joints', '5:build-the-rhythm', '5:prime-the-launch',
    ]);
    expect(drillLessonIds(COUNTERMOVEMENT_GEOMETRY)).toEqual(['6:the-countermovement-geometry-check']);
    expect(drillLessonIds(POGO_BILATERAL)).toEqual(['6:the-oscillatory-pogo-progression']);
    expect(drillLessonIds(POGO_UNILATERAL)).toEqual(['6:weeks-3-4-unilateral-pogos']);
    expect(drillLessonIds(SAFE_LANDING)).toEqual(['6:the-safe-landing-check']);
  });

  it('every id is a lesson the chapter reader shows (course.ts lessonId of a real lesson)', () => {
    const real = new Set(CHAPTERS.flatMap((c) => c.lessons.map((l) => lessonId(c.number, l.key))));
    for (const d of ROUTE_DRILLS) for (const id of drillLessonIds(d)) expect(real.has(id), id).toBe(true);
  });

  it('a lesson links its drill, by the drill\'s page address; a lesson with no drill links nothing', () => {
    expect(lessonDrillLinks('6:the-safe-landing-check')).toEqual([
      { href: '/play/drills?drill=safe-landing', label: 'Run it on camera: Safe Landing Check', drillId: 'safe-landing' },
    ]);
    expect(drillsForLesson('5:build-the-rhythm')).toEqual([WAKE_UP]);
    expect(drillsForLesson('6:how-a-jump-actually-works')).toEqual([]);
    expect(drillsForLesson('7:the-wall-drive')).toEqual([]);        // ch. 7 is charted but not on the route
    expect(sourceLessonId({ book: 'art-of-dunking', chapter: 7, section: 'x' })).toBeNull();
  });

  it('every chapter 5 and 6 drill lesson the book teaches with steps reaches a drill (the ones the route runs)', () => {
    const linked = new Set(ROUTE_DRILLS.flatMap(drillLessonIds));
    for (const n of [5, 6]) {
      for (const l of chapterByNumber(n)!.lessons) {
        if (l.kind !== 'drill') continue;
        expect(linked.has(lessonId(n, l.key)), `${n}:${l.key}`).toBe(true);
      }
    }
  });

  it('the book\'s words for a drill are the book\'s, verbatim', () => {
    const [l] = bookLessonsFor(SAFE_LANDING);
    const src = chapterByNumber(6)!.lessons.find((x) => x.key === 'the-safe-landing-check')!;
    expect(l.title).toBe(src.title);
    expect(l.purpose).toBe(src.purpose);
    expect(l.steps).toEqual(src.steps);
    expect(l.steps[0]).toMatch(/12-inch box/);               // the book's own set-up; the drill says how the camera adapts it
    expect(SAFE_LANDING.source.adapted).toMatch(/low hop/);
  });
});

describe('the Coach\'s takes for a drill line', () => {
  const bank = [
    { id: 'coach.drill.go.01', moment: 'coach.drill.go', text: 'Go.' },
    { id: 'coach.drill.go.02', moment: 'coach.drill.go', text: 'Now.' },
    { id: 'coach.space.back.01', moment: 'coach.space.back', text: 'Step back.' },
  ];
  it('takes turns, never the same take twice in a row when there are two; a line with no take is silence', () => {
    const v = new DrillVoice(bank);
    expect(v.pick('coach.drill.go')).toEqual({ clip: 'coach/coach.drill.go.01', text: 'Go.' });
    expect(v.pick('coach.drill.go')).toEqual({ clip: 'coach/coach.drill.go.02', text: 'Now.' });
    expect(v.pick('coach.drill.go')!.clip).toBe('coach/coach.drill.go.01');
    expect(v.pick('coach.drill.hold')).toBeNull();
    expect(new DrillVoice().pick('coach.drill.go')).toBeNull();
  });
});
