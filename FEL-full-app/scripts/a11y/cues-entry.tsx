// The HUD's colour cues under each colour-vision setting (A11-03), for the rig's shots. The REAL tv-hud pieces: the hoops
// shot meter (GOOD band, PERFECT band inside it, the needle), the penalty-style zoned meter (a danger zone), a scorebug
// (your side and the rival's) and pips. The setting is read from the hash (#off, #deuteranopia, …) the way the app reads
// the stored choice: through setHudColorVision before the HUD renders.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { HoopsShotMeter } from '@/components/games/hoops-shot-meter';
import { HudMeter, HudPips, ScoreCell, ScoreDivider, Scorebug, setHudColorVision } from '@/components/games/tv-hud';
import { isColorVision } from '@/lib/a11y/colorVision';

const v = location.hash.slice(1);
setHudColorVision(isColorVision(v) ? v : 'off');

const row = (label: string, el: ReturnType<typeof h>) => h('div', { style: { display: 'flex', alignItems: 'center', gap: 16, margin: '22px 0' } },
  h('span', { style: { width: 150, color: '#8b97a5', font: '12px ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.12em' } }, label), el);

createRoot(document.getElementById('root')!).render(h('div', { style: { padding: 28, background: '#1d2a1f', minHeight: '100vh' }, 'data-cues': v || 'off' },
  h('p', { style: { color: '#f2f5f9', font: '700 15px ui-monospace, monospace', marginBottom: 6 } }, `HUD cues — ${v || 'off'}`),
  row('Shot meter', h(HoopsShotMeter, { t: 0.62, green: '0.66,0.12', perfect: '0.035' })),
  row('Zoned meter', h(HudMeter, { width: '16rem', height: 'tall', framed: true, segments: [
    { from: 0, to: 0.35, tone: 'info', alpha: 0.45, label: 'SOFT' }, { from: 0.35, to: 0.75, tone: 'good', alpha: 0.6, label: 'DRIVEN' },
    { from: 0.75, to: 0.88, tone: 'score', alpha: 0.9, label: 'TOP' }, { from: 0.88, to: 1, tone: 'danger', alpha: 0.7, label: 'OVER' },
  ], markers: [{ at: 0.8, tone: 'text', width: 3 }] })),
  row('Fill + heat', h('div', { style: { display: 'flex', gap: 12 } },
    h(HudMeter, { label: 'FLOW', value: 70, tone: 'heat', width: '7rem', glow: true }),
    h(HudMeter, { label: 'HEALTH', value: 25, tone: 'danger', width: '7rem' }),
    h(HudMeter, { label: 'READY', value: 100, tone: 'good', width: '7rem' }))),
  row('Scorebug', h(Scorebug, { accent: 'you', children: [
    h(ScoreCell, { key: 'y', label: 'YOU', value: 14, tone: 'you', labelTone: 'you' }), h(ScoreDivider, { key: 'd' }), h(ScoreCell, { key: 'r', label: 'RIVAL', value: 11, tone: 'them', labelTone: 'them' })] })),
  row('Pips', h(HudPips, { count: 3, of: 5, tones: ['good', 'good', 'score', 'danger', 'danger'] })),
));
document.body.dataset.ready = '1';
