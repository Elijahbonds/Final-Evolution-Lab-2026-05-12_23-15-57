'use client';

// /play/coast — the Coast & Islands on the real ModeHarness (phases A and B). Mounts MODES.coast_zone and starts it as soon as it is
// ready (a place to walk, not a match: no START screen). Over the scene: the way back to Venice (the corner link, always), the creature
// log (its button in the other corner, its panel on a tap), a short note when a creature goes in the log, the boat's card when the
// player stands at the boat on the dock, the touch deck with the floating stick on a phone, and the party bar (the root layout's).

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Play, ScrollText, Ship, X } from 'lucide-react';
import { runMode, InputBus, type ModePhase } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { zoneUi } from '@/lib/adventure/coast/zoneUi';
import { logCount } from '@/lib/adventure/coast/creatureLog';
import { launchHref, writeReturn } from '@/lib/adventure/coast/spotReturn';
import { questById } from '@/lib/adventure/coast/zoneQuests';
import type { SportSpot, Townsperson } from '@/lib/adventure/coast/zoneTown';

/** How long the "new in your log" note stays up (ms). */
const NOTE_MS = 3500;

const MODE_KEY = 'coast_zone';
/** The probe mark Venice's page sets (app/play/venice/stage.tsx AGENT_MARK): the same tab's probe seam on the coast too. */
const AGENT_MARK = 'fel-venice-agent';

export function CoastStage({ signedIn, back }: { signedIn: boolean; back: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const ui = useSyncExternalStore(zoneUi.subscribe, zoneUi.getSnapshot, zoneUi.getSnapshot);
  const [logOpen, setLogOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [questNote, setQuestNote] = useState<typeof ui.questNote>(null);
  useEffect(() => {
    if (!ui.questNote) return;
    setQuestNote(ui.questNote);
    const t = setTimeout(() => setQuestNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [ui.questNote]);
  const [note, setNote] = useState<typeof ui.sighting>(null);
  useEffect(() => {
    if (!ui.sighting) return;
    setNote(ui.sighting);
    const t = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [ui.sighting]);

  useEffect(() => {
    try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); }
  }, []);
  // a probe's run (?agent=1, or a tab a Venice probe marked: the round trip Venice → coast → Venice by the app's own links):
  // the zone's walk seam (window.__COAST__). lib/agentRunHooks honours it on a loopback host only, as Venice's does.
  useEffect(() => {
    try {
      const probe = new URLSearchParams(window.location.search).get('agent') === '1' || sessionStorage.getItem(AGENT_MARK) === '1';
      if (!probe) return;
      sessionStorage.setItem(AGENT_MARK, '1');
      void Promise.all([import('@/lib/agentRunHooks'), import('@/lib/babylon/modes/CoastZoneMode')]).then(([h, m]) => {
        h.setAgentRunHooksAllowed(true);
        (window as unknown as { __COAST__?: unknown }).__COAST__ = { state: m.coastProbe, drive: m.coastProbeDrive, spot: () => zoneUi.getSnapshot().spot?.id ?? null };
      });
    } catch { /* not a probe */ }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[MODE_KEY];
    if (!canvas) return;
    if (!def) { setErr('the Coast is not registered'); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;
    runMode(def, {
      canvas,
      input: bus,
      onPhase: (p, d) => {
        if (disposed) return;
        setPhase(p);
        if (p === 'error') setErr(String(d));
        // a place, not a match: walk in at once (next tick: the harness takes a press only once it is in 'ready')
        if (p === 'ready') setTimeout(() => { if (!disposed) bus.emit({ t: 'button', btn: 'START', pressed: true }); }, 50);
      },
      onHud: () => {},
      guest: !signedIn,
      resultSink: async () => {},   // the zone posts no session
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    return () => { disposed = true; stop?.(); };
  }, [signedIn]);

  const spot = ui.spot;
  const count = logCount(ui.log);
  const sport = spot?.kind === 'sport' ? (spot as SportSpot) : null;
  const person = spot?.kind === 'person' ? (spot as Townsperson) : null;
  const personQuest = person?.questId ? ui.quests.find((q) => q.id === person.questId) ?? null : null;
  const questsDone = ui.quests.filter((q) => q.state === 2).length, questsTaken = ui.quests.filter((q) => q.state >= 1).length;
  const playSport = () => { if (!sport) return; writeReturn(sport, Date.now()); router.push(launchHref(sport)); };
  const panelOpen = logOpen || questsOpen;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" aria-label="The Coast: walk the beach and the islands" tabIndex={0} />
      {/* the way back to Venice is the loader's (loader.tsx): on screen before this stage has loaded */}
      {err && <p role="alert" className="absolute inset-x-4 top-[7.25rem] rounded-lg bg-black/80 p-3 text-base">The coast did not load. {err}</p>}
      {phase === 'loading' && !err && <p className="absolute inset-x-0 top-1/2 text-center text-base text-white/80">Sailing to the coast…</p>}
      {phase === 'playing' && ui.log.length > 0 && (
        <button type="button" data-testid="coast-log-open" onClick={() => { setQuestsOpen(false); setLogOpen(true); }} aria-label={`Creature log, ${count.seen} of ${count.total} found`}
          className="absolute right-3 top-3 z-10 inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full bg-black/60 px-3 text-base font-bold text-white">
          <BookOpen aria-hidden className="h-5 w-5" /> Log {count.seen}/{count.total}
        </button>
      )}
      {phase === 'playing' && ui.quests.length > 0 && (
        <button type="button" data-testid="coast-quests-open" onClick={() => { setLogOpen(false); setQuestsOpen(true); }} aria-label={`Quests, ${questsDone} of ${questsTaken} taken done`}
          className="absolute right-3 top-[3.75rem] z-10 inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full bg-black/60 px-3 text-base font-bold text-white">
          <ScrollText aria-hidden className="h-5 w-5" /> Quests {questsDone}/{questsTaken}
        </button>
      )}
      {questNote && !spot && !panelOpen && phase === 'playing' && (
        <p role="status" data-testid="coast-quest-note" className="absolute inset-x-4 top-[17rem] mx-auto max-w-sm rounded-2xl bg-black/75 p-3 text-center text-base text-white">
          Quest done: <b>{questNote.title.replace('[PLACEHOLDER] ', '')}</b>
        </p>
      )}
      {questsOpen && (
        <section role="dialog" aria-label="Quests" data-testid="coast-quests"
          className="absolute inset-x-4 top-[4.25rem] z-20 mx-auto max-h-[calc(100dvh-9rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/15 bg-black/85 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Quests</h2>
            <button type="button" data-testid="coast-quests-close" onClick={() => setQuestsOpen(false)} aria-label="Close the quests"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white">
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1 text-base text-white/80">{questsTaken ? `${questsDone} of ${questsTaken} done.` : 'Talk to the people in town to take a quest.'}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {ui.quests.map((q) => (
              <li key={q.id} data-testid={`coast-quest-${q.id}`} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold">{q.state > 0 ? q.title.replace('[PLACEHOLDER] ', '') : 'Not taken yet'}</span>
                  {q.state > 0 && <span className="rounded-full bg-[#facc15] px-2 py-0.5 text-sm font-bold text-black">{q.state === 2 ? 'Done' : 'Taken'}</span>}
                </div>
                <p className="text-base text-white/75">{q.state > 0 ? q.ask : 'Someone in town has a job for you.'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {note && !spot && !panelOpen && phase === 'playing' && (
        <p role="status" data-testid="coast-log-note" className="absolute inset-x-4 top-[7.25rem] mx-auto max-w-sm rounded-2xl bg-black/75 p-3 text-center text-base text-white">
          {note.level === 2 ? 'You met' : 'New in your log:'} <b>{note.name.replace('[PLACEHOLDER] ', '')}</b>
        </p>
      )}
      {logOpen && (
        <section role="dialog" aria-label="Creature log" data-testid="coast-log"
          className="absolute inset-x-4 top-[4.25rem] z-20 mx-auto max-h-[calc(100dvh-9rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/15 bg-black/85 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Creature log</h2>
            <button type="button" data-testid="coast-log-close" onClick={() => setLogOpen(false)} aria-label="Close the log"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white">
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-1 text-base text-white/80">{count.seen} of {count.total} found, {count.met} met. Walk close to a creature to log it.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {ui.log.map((e) => (
              <li key={e.id} data-testid={`coast-log-${e.id}`} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold">{e.level > 0 ? e.name.replace('[PLACEHOLDER] ', '') : 'Not found yet'}</span>
                  {e.level > 0 && <span className="rounded-full bg-[#facc15] px-2 py-0.5 text-sm font-bold text-black">{e.level === 2 ? 'Met' : 'Seen'}</span>}
                </div>
                <p className="text-base text-white/75">{e.where}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sport && phase === 'playing' && !panelOpen && (
        <div data-testid="coast-sport" className="absolute inset-x-4 top-[7.25rem] mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur">
          <p className="text-base font-bold">{sport.label.replace('[PLACEHOLDER] ', '')}</p>
          <button type="button" data-testid="coast-play" onClick={playSport}
            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 text-base font-bold text-black">
            <Play aria-hidden className="h-4 w-4" /> Play {sport.game}
          </button>
        </div>
      )}
      {person && phase === 'playing' && !panelOpen && (
        <div data-testid="coast-person" className="absolute inset-x-4 top-[7.25rem] mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur">
          <p className="text-base font-bold">{person.name.replace('[PLACEHOLDER] ', '')}</p>
          <p className="mt-1 text-base text-white/85">{personQuest?.state === 2 ? questById(personQuest.id)?.thanks : personQuest?.state === 1 ? personQuest.ask : person.hello}</p>
          {personQuest && personQuest.state === 0 && (
            <button type="button" data-testid="coast-take-quest" onClick={() => zoneUi.takeQuest(personQuest.id)}
              className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 text-base font-bold text-black">
              <ScrollText aria-hidden className="h-4 w-4" /> Take the quest
            </button>
          )}
        </div>
      )}
      {spot?.kind === 'venice' && phase === 'playing' && !panelOpen && (
        <div data-testid="coast-boat" className="absolute inset-x-4 top-[7.25rem] mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur">
          <p className="text-base font-bold">{spot.label.replace('[PLACEHOLDER] ', '')}</p>
          <button type="button" data-testid="coast-to-venice" onClick={() => router.push(back)}
            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 text-base font-bold text-black">
            <Ship aria-hidden className="h-4 w-4" /> Back to Venice
          </button>
        </div>
      )}
      {touch && busRef.current && phase === 'playing' && <TouchOverlay bus={busRef.current} modeId={MODE_KEY} visible />}
    </div>
  );
}
