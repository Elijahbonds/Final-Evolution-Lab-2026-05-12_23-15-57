// SCREEN-FIXES-2 (2026-11-11): the Play shelf (components/shell/play-shelf.tsx) on a bare page with the app's CSS and fonts
// (scripts/a11y/rig.mts buildRig), for scripts/probes/screen-fixes/shelf-rows.mts. The first family open, as /play shows it.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayShelf } from '@/components/shell/play-shelf';

(window as unknown as { __PATH: string }).__PATH = '/play';
createRoot(document.getElementById('root')!).render(h('main', { style: { padding: 16, maxWidth: 1100, margin: '0 auto' } }, h(PlayShelf, {})));
