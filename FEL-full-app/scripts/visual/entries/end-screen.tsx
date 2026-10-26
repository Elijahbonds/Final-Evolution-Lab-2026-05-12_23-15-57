// Visual rig entry: the end screen on its own fixture cases (app/dev/end-screen/fixture.tsx), case from window.__RIG.case.
import { createRoot } from 'react-dom/client';
import { EndScreenFixture } from '@/app/dev/end-screen/fixture';

const rig = (window as unknown as { __RIG: { case: string } }).__RIG;
createRoot(document.getElementById('root')!).render(<EndScreenFixture name={rig.case} />);
