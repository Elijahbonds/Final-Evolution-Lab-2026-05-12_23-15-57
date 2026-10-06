import { LearnFeed } from '@/components/learn/learn-feed';

// /learn — the Knowledge Feed (docs/KNOWLEDGE-FEED.md). Open to guests, whose progress stays on the device. A signed-in
// verified adult's progress also syncs to the account (KNOWLEDGE-FEED v2, /api/learn/*); under 18 stays on the device.
// Guests see the first 5 Playbook cards and sign in for the rest (lib/knowledge/access.ts).
export const metadata = {
  title: 'Learn · Final Evolution Lab',
  description: 'Bite-sized lessons, quick quizzes and spaced reviews — a learning feed for your idle time.',
};

export default function LearnPage() {
  return <LearnFeed />;
}
