// lib/teach/apply.ts — EDU-01 (platform phase 10, 2026-11-03): a teacher's application, checked before it reaches the
// owner's queue.
//
// The owner, 2026-10-20: "One teacher role granted by owner approval (Camp-certified qualify automatically)". So an
// application is the way in for everyone but a Camp-certified facilitator: a discipline, a short bio, a sample of how
// they teach, and up to three links. Every word goes through the safety text screen before the queue (the claims screen,
// lib/share/screen.ts, and the cue style's medical words): an application that names a condition, promises an outcome or
// reads as treatment comes back with the screen's own line, and never reaches the owner. Teachers are adults (18+).
//
// Pure. Client-safe.
import { claimProblems } from './course';

export const DISCIPLINES = [
  { id: 'strength', label: 'Strength' }, { id: 'speed', label: 'Speed and agility' }, { id: 'jump', label: 'Jumping' },
  { id: 'sport', label: 'Sport skills' }, { id: 'mobility', label: 'Mobility' }, { id: 'dance', label: 'Dance' },
  { id: 'martial', label: 'Martial arts' }, { id: 'pe', label: 'PE teaching' }, { id: 'other', label: 'Something else' },
] as const;
export type DisciplineId = (typeof DISCIPLINES)[number]['id'];

/** (new) Lengths, in characters. */
export const APPLY_LIMITS = { bio: 600, sample: 1500, links: 3, link: 200 } as const;

export interface TeacherApplicationInput { discipline: DisciplineId; bio: string; sample: string; links: string[] }

export type ApplyCheck = { ok: true; value: TeacherApplicationInput } | { ok: false; errors: string[] };

/** Check an application as the route receives it. Every problem at once (a teacher fixing one at a time gives up). */
export function checkApplication(raw: unknown): ApplyCheck {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const discipline = DISCIPLINES.find((d) => d.id === r.discipline)?.id;
  if (!discipline) errors.push('discipline: pick one');
  const text = (k: 'bio' | 'sample', min: number) => {
    const v = typeof r[k] === 'string' ? (r[k] as string).trim() : '';
    if (v.length < min) errors.push(`${k}: a little more, please (at least ${min} characters)`);
    if (v.length > APPLY_LIMITS[k]) errors.push(`${k}: ${v.length} characters > ${APPLY_LIMITS[k]}`);
    if (v) errors.push(...claimProblems(v, k));
    return v;
  };
  const bio = text('bio', 40);
  const sample = text('sample', 80);
  const rawLinks = Array.isArray(r.links) ? r.links : [];
  const links = rawLinks.map((l) => (typeof l === 'string' ? l.trim() : '')).filter(Boolean);
  if (links.length > APPLY_LIMITS.links) errors.push(`links: ${links.length} > ${APPLY_LIMITS.links}`);
  for (const l of links) {
    let ok = false;
    try { const u = new URL(l); ok = u.protocol === 'https:' && l.length <= APPLY_LIMITS.link; } catch { ok = false; }
    if (!ok) errors.push(`links: "${l.slice(0, 60)}" is not an https link`);
  }
  if (errors.length || !discipline) return { ok: false, errors };
  return { ok: true, value: { discipline, bio, sample, links } };
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export interface TeacherApplication extends TeacherApplicationInput {
  id: string; userId: string; status: ApplicationStatus; note: string | null; createdAt: string; decidedAt: string | null;
}
