import { redirect } from 'next/navigation';

// /education → /learn (PLAT-P04, 2026-10-27). Learn is one home now: the Playbook course, Practice, the feed and, at the
// bottom, the Academy that used to be this page (owner call §5.2 (a): moved, its Lab Credits unchanged). A redirect, so
// old links and bookmarks still land, and undoing it is restoring this file. /education/playbook/** stays the course's
// own address.
export default function EducationPage(): never {
  return redirect('/learn');
}
