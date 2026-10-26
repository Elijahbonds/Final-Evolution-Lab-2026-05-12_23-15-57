// Visual / perf rig entry: one registry mode mounted the way /dev/mode/<key> mounts it (app/dev/mode/[key]/loader.tsx):
// the real runMode, the real harness, the real venue, the canvas filling the viewport. The key is window.__RIG.mode.
// Built with NODE_ENV=development so the harness publishes window.__FEL_DEV__ (the scene and SceneInstrumentation the
// perf gate reads), exactly as the probes have always measured.
import { createRoot } from 'react-dom/client';
import { DevModeRunner } from '@/app/dev/mode/[key]/loader';

const rig = (window as unknown as { __RIG: { mode: string } }).__RIG;
createRoot(document.getElementById('root')!).render(<DevModeRunner modeKey={rig.mode} />);
