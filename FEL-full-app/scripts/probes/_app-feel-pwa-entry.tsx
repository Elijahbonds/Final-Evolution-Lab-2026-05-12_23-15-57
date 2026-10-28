// The app-feel rig's page (app-feel, round 7): the real ServiceWorkerRegistrar and InstallPrompt, mounted the way the
// root layout mounts them. Bundled by scripts/probes/_app-feel-pwa.mts, which swaps next/navigation for a shim that
// reads location.pathname (and follows pushState), and sets NODE_ENV / NEXT_PUBLIC_SW_ENABLED at bundle time.
import { createRoot } from 'react-dom/client';
import { ServiceWorkerRegistrar } from '@/components/pwa/sw-register';
import { InstallPrompt } from '@/components/pwa/install-prompt';

createRoot(document.getElementById('root')!).render(
  <>
    <ServiceWorkerRegistrar />
    <InstallPrompt />
  </>,
);
