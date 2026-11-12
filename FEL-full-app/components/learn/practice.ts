// practice — Learn's "Practice" shelf: the Playbook lessons that open the camera or a drill (PLAT-P04, 2026-10-27).
// Derived, never hand-listed: the Mirror movements a lesson teaches (lib/education/lessonMovement.ts) and the drills on the
// camera route that run a lesson (lib/drills/playbookLinks.ts). One row per thing you can do, opening the lesson that
// teaches it — where the demo plays, then the camera link.

import { CHAPTERS, lessonId } from '@/lib/education/course';
import { LESSON_MOVEMENTS, MOVEMENT_LABEL } from '@/lib/education/lessonMovement';
import { ROUTE_DRILLS } from '@/lib/drills/route';
import { drillLessonIds } from '@/lib/drills/playbookLinks';
import { lessonHref } from './continue';

export interface PracticeRow { id: string; title: string; chapter: number; href: string; camera: boolean; drill: boolean }

/** Book order: the chapter, then the lesson's place in it. */
function order(id: string): number {
  const [n, key] = id.split(':');
  const ch = CHAPTERS.find((c) => c.number === Number(n));
  return Number(n) * 1000 + (ch ? ch.lessons.findIndex((l) => l.key === key) : 999);
}

export function practiceRows(): PracticeRow[] {
  const rows = new Map<string, PracticeRow>();
  const add = (id: string, title: string, kind: 'camera' | 'drill') => {
    const [n, key] = id.split(':');
    const row = rows.get(id) ?? { id, title, chapter: Number(n), href: lessonHref(Number(n), key), camera: false, drill: false };
    row[kind] = true;
    rows.set(id, row);
  };
  // a drill: the lesson it comes from first (the Wake-Up's own lesson is its protocol, not one phase)
  for (const d of ROUTE_DRILLS) {
    const id = drillLessonIds(d)[0];
    if (id) add(id, d.name, 'drill');
  }
  // a camera movement: the first lesson that teaches it — unless a drill row already opens a lesson for that movement
  const taken = new Set([...rows.keys()]);
  const seen = new Set<string>();
  for (const m of LESSON_MOVEMENTS) {
    if (seen.has(m.movement)) continue;
    const all = LESSON_MOVEMENTS.filter((x) => x.movement === m.movement).map((x) => lessonId(x.chapter, x.lesson));
    seen.add(m.movement);
    const already = all.find((id) => taken.has(id));
    if (already) { rows.get(already)!.camera = true; continue; }
    add(all[0], MOVEMENT_LABEL[m.movement], 'camera');
  }
  return [...rows.values()].sort((a, b) => order(a.id) - order(b.id));
}
