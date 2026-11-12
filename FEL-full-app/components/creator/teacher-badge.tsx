// TeacherBadge — PLAT-P10 (EDU-01, 2026-11-03): the Teacher badge, shown for an approved teacher (the owner-granted role
// or a Camp-certified facilitator: lib/teach/role.ts) and never for an applicant.
import { GraduationCap } from 'lucide-react';
import { TYPE } from '@/lib/design/type';

export function TeacherBadge() {
  return (
    <span data-teacher-badge className={`${TYPE.label} inline-flex items-center gap-1.5 rounded-full border border-fel-gold/40 bg-fel-gold/[0.08] px-3 py-1 text-fel-gold`}>
      <GraduationCap aria-hidden className="h-3.5 w-3.5" />Teacher
    </span>
  );
}
