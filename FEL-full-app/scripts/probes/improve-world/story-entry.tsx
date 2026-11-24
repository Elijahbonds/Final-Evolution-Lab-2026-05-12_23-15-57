// lane C (improve-world, 2026-11-22) rig bundle: the REAL /play/adventure stage (app/play/adventure/stage.tsx), as
// scripts/probes/story/story-entry.tsx mounts it, plus `?feel=<json>`: feel-panel values for an A/B run (the panel's own gates opened
// in the bundle, the way scripts/probes/coast-islands/zone-entry.ts does), e.g. {"story.sfxOn":0}.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { AdventureStoryStage } from '@/app/play/adventure/stage';

setAgentRunHooksAllowed(true);
const q = new URLSearchParams(window.location.search);
if (q.get('feel')) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(q.get('feel')!))) setFeelOverride(k, Number(v)); }
createRoot(document.getElementById('root')!).render(createElement(AdventureStoryStage, { signedIn: false }));
