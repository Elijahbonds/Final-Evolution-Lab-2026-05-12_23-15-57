// move-feel / phone-stick-entry — the hoops touch deck alone, on a stage the shape GameShell gives a phone (bundled by phone-stick.mjs).
//   ?mode=onevone&float=1|0&w=390&h=844   the stage: 16:10 under a 56 px header and a 12 px pad (portrait), full bleed (sideways)
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { InputBus } from '@/lib/babylon/core/InputBus';
import { setFeelUser, setFeelSession, setFeelOverride } from '@/lib/feel-panel/feel';

const q = new URLSearchParams(location.search);
const W = window as unknown as Record<string, unknown>;
if (q.get('float') === '0') { setFeelUser(true); setFeelSession(null); setFeelOverride('touch.floatStick', 0); }
const bus = new InputBus(); const sent: unknown[] = (W.__sent = []);
const emit = bus.emit.bind(bus); bus.emit = (e) => { if (e.t === 'stick') sent.push(e); emit(e); };
const portrait = innerHeight > innerWidth;
const stage = document.getElementById('stage')!;
if (portrait) { const sw = innerWidth - 16, sh = Math.round(sw * 10 / 16); Object.assign(stage.style, { left: '8px', top: '68px', width: `${sw}px`, height: `${sh}px` }); }
else Object.assign(stage.style, { left: '0', top: '0', width: `${innerWidth}px`, height: `${Math.round(innerWidth * 10 / 16)}px` });
createRoot(document.getElementById('deck')!).render(<TouchOverlay bus={bus} modeId={q.get('mode') ?? 'onevone'} visible />);
W.__ready = true;
