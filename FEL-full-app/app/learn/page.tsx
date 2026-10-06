import { LearnFeed } from '@/components/learn/learn-feed';

// /learn — the Knowledge Feed (docs/KNOWLEDGE-FEED.md). Open to guests: it writes nothing to the server, and its
// progress stays on the device. The Playbook topic appears only when signed in, as it does at /education.
export const metadata = {
  title: 'Learn · Final Evolution Lab',
  description: 'Bite-sized lessons, quick quizzes and spaced reviews — a learning feed for your idle time.',
};

export default function LearnPage() {
  return <LearnFeed />;
}
