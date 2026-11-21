// STORY rig bundle (lane/story, 2026-11-21): the REAL /play/adventure stage (app/play/adventure/stage.tsx, AdventureStoryStage:
// the partner picker, the start screen, the HUD, the dialogue box, the pause screen and, from this lane, the chapter's end card),
// rendered with React into a plain page — no Next — so ./story-rig.mts can play the story as a guest and take its pictures.
// It is served at /play/adventure/index.html so AdventureMode's adventureFace() picks the story face, as on the real route.
// The page's Tailwind is compiled by the rig from the app's own config. Probe seam: window.__FEL_DEV__.scene.metadata.adventure.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';
import { AdventureStoryStage } from '@/app/play/adventure/stage';

setAgentRunHooksAllowed(true);
createRoot(document.getElementById('root')!).render(createElement(AdventureStoryStage, { signedIn: false }));
