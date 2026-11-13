// hoops-builder: the builder screen alone, in the a11y rig's page (the app's Tailwind, theme and fonts), with the route answered here.
// The scene is the URL's hash: #fresh (a new player, no points), #earned (a guard with points to spend and a scanned speed ceiling).
import { createRoot } from 'react-dom/client';
import HoopsBuilder from '@/app/creator/hoops/_components/hoops-builder';
import { defaultHoopsBuild, viewOf, type HoopsBuild } from '@/lib/creator/hoops/hoopsBuild';

const NOW = new Date('2026-11-12T18:00:00.000Z');
const scene = location.hash.slice(1) || 'fresh';
const earned: HoopsBuild = {
  ...defaultHoopsBuild(), position: 'guard', heightIn: 74,
  steps: { speed: 0, handle: 6, shooting: 12, finishing: 0, defense: 3 },
  points: { earned: 38, through: NOW.toISOString(), day: '2026-11-12', dayEarned: 8 },
};
const build = scene === 'earned' ? earned : defaultHoopsBuild();
const prq = scene === 'earned' ? { speed: 36 } : null;   // a scanned speed: ceiling 58
const gained = scene === 'earned' ? 8 : 0;
window.fetch = (async (_url: string, init?: RequestInit) => {
  if (init?.method === 'POST') {
    const b = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ saved: true, hoops: viewOf({ ...build, ...b }, prq, NOW) }), { status: 200 });
  }
  return new Response(JSON.stringify({ hoops: viewOf(build, prq, NOW), gained, readOnly: false }), { status: 200 });
}) as typeof fetch;
createRoot(document.getElementById('root')!).render(<div className="min-h-screen bg-[#050505] pb-40 text-white md:pb-20"><HoopsBuilder /></div>);
