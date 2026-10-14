import { NexusStudioApp } from '@/components/nexus-studio/studio-app';

export const dynamic = 'force-dynamic';

/** Nexus Studio: the venue editor, the AI builder (CELL), characters and scripts. Gated in ./layout.tsx. */
export default function StudioPage() {
  return <NexusStudioApp />;
}
