// E2E entry: /coach/join/<token> for a signed-in athlete and an open invite. app/coach/join/[token]/page.tsx is a server
// component (it reads the invite row); this is the markup it renders in that state, with the server's answer (the coach's
// name) handed over as window.__RIG — and the real client JoinButton, which is the part a person touches.
import { createRoot } from 'react-dom/client';
import { JoinButton } from '@/app/coach/join/[token]/join-button';

const rig = (window as unknown as { __RIG: { coachName: string } }).__RIG;
const token = decodeURIComponent(window.location.pathname.split('/').pop() ?? '');

createRoot(document.getElementById('root')!).render(
  <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
    <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Coach invite</p>
    <h1 className="fel-heading mt-3 text-2xl font-bold text-white">{rig.coachName} wants to coach you</h1>
    <JoinButton token={token} coachName={rig.coachName} already={false} />
  </main>,
);
