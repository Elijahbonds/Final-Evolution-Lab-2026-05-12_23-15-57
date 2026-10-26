// Visual rig entry: /whats-new's list (app/whats-new/view.tsx). The gate photographs a FIXED release, so a new release
// in lib/release/releases.json does not change the baseline; window.__RIG.live = true shows the committed record instead.
import { createRoot } from 'react-dom/client';
import { WhatsNewView } from '@/app/whats-new/view';
import { buildRelease, publicReleases, type Release } from '@/lib/release/notes';
import data from '@/lib/release/releases.json';

const live = (window as unknown as { __RIG: { live?: boolean } }).__RIG.live === true;
const fixture: Release[] = [
  buildRelease([
    { number: 3, title: 'Hoops: pulling the stick back now reverses' },
    { number: 2, title: 'Coach parity: check-in forms, coach-assigned habits (pending SQL)' },
    { number: 1, title: 'App feel: installable FEL + offline service worker (OFF by default)' },
    { number: 0, title: 'Docs: owner runbook' },
  ], { version: 'Fixture release', date: '2026-10-25', sha: 'f'.repeat(40), fromSha: 'e'.repeat(40) }),
];
createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-[#050505] pb-20"><WhatsNewView releases={publicReleases(live ? (data as { releases: Release[] }).releases : fixture)} /></div>,
);
