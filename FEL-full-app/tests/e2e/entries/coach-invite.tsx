// E2E entry: the coach's "Add an athlete" panel, as app/coach/_components/clients-view.tsx mounts it on /coach.
import { createRoot } from 'react-dom/client';
import { InvitePanel } from '@/components/coach/invite-panel';
import { Toaster } from '@/components/ui/sonner';

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-xl p-4">
    <InvitePanel />
    <Toaster theme="dark" position="top-center" />
  </main>,
);
