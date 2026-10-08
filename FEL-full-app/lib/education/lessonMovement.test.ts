import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CHAPTERS, chapterByNumber, lessonId, nextChapterHref } from './course';
import {
  LESSON_MOVEMENTS, MIRROR_PATH, MOVEMENT_LABEL, cameraHref, lessonsForMovement, movementForLesson, movementsForChapter,
} from './lessonMovement';
import { LEARN_PATH, PLAYBOOK_PATH, chapterHref, playbookCardChapter, playbookCardLinks } from './links';
import { MIRROR_PATTERNS } from '@/lib/mirror/patterns';
import { buildPlaybookPack } from '@/lib/knowledge/playbookPack';

// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5: the lesson→movement map, and every link the three education
// surfaces now carry — each one checked against what actually exists, not assumed.

/** The harness's own tabs that are not MIRROR_PATTERNS entries (mirror-harness.tsx `type Pattern`). */
const HARNESS_TABS = ['pressRow', 'jump', 'screen'];
const MIRROR_IDS = new Set([...MIRROR_PATTERNS.map((p) => p.id), ...HARNESS_TABS]);

/** A Next App Router path → is there a page.tsx that serves it? (dynamic segments match [param] folders) */
function pageExists(path: string): boolean {
  const clean = path.split('?')[0].replace(/^\//, '');
  const parts = clean ? clean.split('/') : [];
  const walk = (dir: string, i: number): boolean => {
    if (i === parts.length) return existsSync(`${dir}/page.tsx`);
    if (existsSync(`${dir}/${parts[i]}`) && walk(`${dir}/${parts[i]}`, i + 1)) return true;
    try {
      return readdirSync(dir).filter((d) => /^\[[^.\]]+\]$/.test(d)).some((d) => walk(`${dir}/${d}`, i + 1));
    } catch { return false; }
  };
  return walk('app', 0);
}

describe('the lesson → movement map', () => {
  it('every mapped lesson is a real lesson of the imported book', () => {
    for (const m of LESSON_MOVEMENTS) {
      const ch = chapterByNumber(m.chapter);
      expect(ch, `chapter ${m.chapter}`).toBeTruthy();
      expect(ch!.lessons.map((l) => l.key), `${m.chapter}:${m.lesson}`).toContain(m.lesson);
    }
  });

  it('every movement is one the Mirror knows (a MIRROR_PATTERNS id or a harness tab)', () => {
    for (const m of LESSON_MOVEMENTS) expect(MIRROR_IDS.has(m.movement), m.movement).toBe(true);
    for (const id of Object.keys(MOVEMENT_LABEL)) expect(MIRROR_IDS.has(id), id).toBe(true);
  });

  it('no lesson is mapped twice', () => {
    const ids = LESSON_MOVEMENTS.map((m) => `${m.chapter}:${m.lesson}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the book’s own movement lessons map to their Mirror checks', () => {
    const ch8 = chapterByNumber(8)!;
    const by = (title: RegExp) => lessonId(8, ch8.lessons.find((l) => title.test(l.title))!.key);
    expect(movementForLesson(by(/Hip Hinge/))).toBe('hinge');
    expect(movementForLesson(by(/Split Squat/))).toBe('lunge');
    expect(movementForLesson(by(/Push-Up with Scapular/))).toBe('pushup');
    expect(movementForLesson(by(/Glute Bridge$/))).toBeNull();      // no Mirror check for it: no link
    expect(movementsForChapter(3)).toEqual(['screen']);
    expect(movementsForChapter(6)).toEqual(['jump']);
    expect(movementsForChapter(8)).toEqual(['hinge', 'lunge', 'pushup']);
    expect(movementsForChapter(9)).toEqual([]);
    expect(lessonsForMovement('hinge')).toEqual(['8:the-hip-hinge']);
    expect(movementForLesson('nonsense')).toBeNull();
    expect(movementForLesson('8:not-a-lesson')).toBeNull();
  });
});

describe('LINKS RESOLVE', () => {
  it('"Check it on camera" is /play/mirror?pattern=<id>, and /play/mirror is a page today', () => {
    expect(cameraHref('hinge')).toBe('/play/mirror?pattern=hinge');
    for (const m of LESSON_MOVEMENTS) {
      const href = cameraHref(m.movement);
      expect(href.startsWith(`${MIRROR_PATH}?pattern=`)).toBe(true);
      expect(pageExists(href), href).toBe(true);
    }
  });

  it('every chapter href and every "Next chapter" href is a page that serves a real chapter', () => {
    for (const c of CHAPTERS) {
      expect(chapterHref(c.number)).toBe(`/education/playbook/${c.number}`);
      expect(pageExists(chapterHref(c.number))).toBe(true);
      const next = nextChapterHref(c.number);
      expect(pageExists(next), next).toBe(true);
    }
    expect(nextChapterHref(1)).toBe('/education/playbook/2');
    expect(nextChapterHref(9)).toBe('/education/playbook/10');
    expect(nextChapterHref(10)).toBe(PLAYBOOK_PATH);
    expect(chapterHref(99)).toBe(PLAYBOOK_PATH);
    expect(pageExists(PLAYBOOK_PATH) && pageExists(LEARN_PATH) && pageExists('/education')).toBe(true);
  });

  it('the probe itself: a path with no page is caught', () => {
    expect(pageExists('/education/nope/really')).toBe(false);
    expect(pageExists('/play/mirrors')).toBe(false);
  });

  it('every Knowledge Feed Playbook card links to its chapter (and the recap to the course)', () => {
    const pack = buildPlaybookPack();
    expect(pack.cards.length).toBeGreaterThan(10);
    for (const card of pack.cards) {
      const links = playbookCardLinks(card.id);
      expect(links, card.id).not.toBeNull();
      expect(pageExists(links!.chapter.href), links!.chapter.href).toBe(true);
      if (card.id !== 'playbook.recap') expect(links!.chapter.href).toBe(`/education/playbook/${playbookCardChapter(card.id)}`);
      if (links!.camera) expect(pageExists(links!.camera.href), links!.camera.href).toBe(true);
    }
    // the chapters that teach a movement carry the camera link
    expect(playbookCardLinks('playbook.ch8-remember-1')?.camera?.href).toBe('/play/mirror?pattern=hinge');
    expect(playbookCardLinks('playbook.ch6-remember-1')?.camera?.href).toBe('/play/mirror?pattern=jump');
    expect(playbookCardLinks('playbook.ch9-remember-1')?.camera).toBeNull();
    // not a Playbook card, or a chapter the book does not have: nothing
    expect(playbookCardLinks('science.atoms')).toBeNull();
    expect(playbookCardLinks('playbook.ch42-remember-1')).toBeNull();
  });
});

describe('the neuro-mirror module no longer stubs the lesson hook', () => {
  it('the EDUCATION-PILLAR-HOOK stubs are gone, and loadLessonConfig resolves through the map', () => {
    const src = readFileSync('lib/babylon/nexus/neuro-mirror/index.ts', 'utf8');
    expect(src).not.toMatch(/EDUCATION-PILLAR-HOOK: (swap|wire)/);
    expect(src).not.toMatch(/returning that pattern/);
    expect(src).toMatch(/from '@\/lib\/education\/lessonMovement'/);
    expect(src).toMatch(/movementForLesson,/);
  });
});
