// E2E entry: /play/who-scene-it for a signed-in player — app/play/who-scene-it/page.tsx renders <WhoSceneItLoader /> once
// the session check passes. The rig builds it with NEXT_PUBLIC_DISABLE_3D=1, production's own 3D kill switch
// (components/three/flags.ts), so the loader picks the 2D deck: the real GameShell, the real game, the real end screen.
import { createRoot } from 'react-dom/client';
import { SessionProvider } from 'next-auth/react';
import { WhoSceneItLoader } from '@/app/play/who-scene-it/_components/loader';
import { Toaster } from '@/components/ui/sonner';

createRoot(document.getElementById('root')!).render(
  <SessionProvider>
    <WhoSceneItLoader />
    <Toaster theme="dark" position="top-center" />
  </SessionProvider>,
);
