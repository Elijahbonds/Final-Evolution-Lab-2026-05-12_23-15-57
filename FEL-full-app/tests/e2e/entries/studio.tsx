// E2E entry: /studio for a signed-in person with NEXUS_STUDIO_ENABLED on — app/studio/layout.tsx lets them through and
// app/studio/page.tsx renders <NexusStudioApp />.
import { createRoot } from 'react-dom/client';
import { NexusStudioApp } from '@/components/nexus-studio/studio-app';

createRoot(document.getElementById('root')!).render(<NexusStudioApp />);
