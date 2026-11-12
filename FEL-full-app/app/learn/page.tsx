import { LearnHome } from '@/components/learn/learn-home';

// /learn — Learn, the one home (PLAT-P04, 2026-10-27): Continue, the Playbook course, Practice, the feed (/learn/feed) and
// the Academy, in that order (components/learn/learn-home.tsx). Open to guests: the course's own pages ask for sign-in,
// the feed and the place-marker live on the device.
export const metadata = {
  title: 'Learn · Final Evolution Lab',
  description: 'The Playbook course, a lesson at a time: watch it, do it, then check it on camera.',
};

export default function LearnPage() {
  return <LearnHome />;
}
