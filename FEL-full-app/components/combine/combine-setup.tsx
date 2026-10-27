'use client';

// CombineSetup — pick who tests and which stations (COMBINE-DAY, 2026-10-25). The athletes are the coach's live roster as
// the server read it, each with what the gates allow (lib/combine/gate.ts): held athletes are shown and cannot be picked;
// an athlete who may only do the hand-timed stations says so. A typed name is held (age unknown) and kept on this phone.
import { useMemo, useState } from 'react';
import { Minus, Plus, UserPlus, X } from 'lucide-react';
import { MAX_ATTEMPTS, MAX_STATIONS, STATIONS, STATION_KINDS, parseStation, stationName, type StationConfig, type StationKind } from '@/lib/combine/catalogue';
import { CAMERA_STATION_HOW, timingChoices } from '@/lib/sprint/cameraSprint';
import { CAMERA_ADULTS_LINE, HELD_LINES, HELD_TODAY_LINE, say } from '@/lib/combine/copy';
import { adhocAthlete, defaultEventName, newEvent } from '@/lib/combine/draft';
import type { CombineAthlete, CombineEvent } from '@/lib/combine/types';

export interface CombineCtx {
  available: boolean;
  athletes: CombineAthlete[];
  teams: { id: string; name: string; athleteIds: string[] }[];
  events: { id: string; name: string; createdAt: number; athletes: number }[];
}

/** (new) The stations a new combine starts with: the brief's jump, agility and sprint. */
export const DEFAULT_STATIONS: readonly StationConfig[] = [
  parseStation({ kind: 'cmj', variant: 'standing' })!,
  parseStation({ kind: 'agility', variant: 'pro-agility' })!,
  parseStation({ kind: 'sprint', variant: '40yd' })!,
];

export function athleteNote(a: CombineAthlete): string | null {
  if (a.access.held) return say(HELD_LINES[a.access.held]);
  if (!a.access.camera) return say(CAMERA_ADULTS_LINE);
  if (a.access.today.jump) return `${say(HELD_TODAY_LINE)}: jump stations`;
  return null;
}

export function CombineSetup({ ctx, onStart, onCancel }: { ctx: CombineCtx; onStart: (ev: CombineEvent) => void; onCancel: () => void }) {
  const [name, setName] = useState(() => defaultEventName());
  const [team, setTeam] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ctx.athletes.filter((a) => a.access.testable).map((a) => a.id)));
  const [adhoc, setAdhoc] = useState<CombineAthlete[]>([]);
  const [typed, setTyped] = useState('');
  const [stations, setStations] = useState<StationConfig[]>([...DEFAULT_STATIONS]);
  const [addKind, setAddKind] = useState<StationKind>('skill');
  const [addVariant, setAddVariant] = useState<string>(STATIONS.skill.variants[0]?.id ?? '');

  const shown = useMemo(() => {
    const ids = team ? new Set(ctx.teams.find((t) => t.id === team)?.athleteIds ?? []) : null;
    return ctx.athletes.filter((a) => !ids || ids.has(a.id));
  }, [ctx, team]);
  const chosen = [...shown.filter((a) => a.access.testable && picked.has(a.id)), ...adhoc];
  const ready = chosen.some((a) => a.access.testable) && stations.length > 0;

  const pickTeam = (id: string | null) => {
    setTeam(id);
    const ids = id ? new Set(ctx.teams.find((t) => t.id === id)?.athleteIds ?? []) : null;
    setPicked(new Set(ctx.athletes.filter((a) => a.access.testable && (!ids || ids.has(a.id))).map((a) => a.id)));
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setTiming = (id: string) => setStations((s) => s.map((x) => (x.id === id ? (x.timing === 'camera' ? { id: x.id, kind: x.kind, variant: x.variant, attempts: x.attempts } : { ...x, timing: 'camera' as const }) : x)));
  const setAttempts = (id: string, d: number) => setStations((s) => s.map((x) => (x.id === id ? { ...x, attempts: Math.min(MAX_ATTEMPTS, Math.max(1, x.attempts + d)) } : x)));
  const add = () => {
    const s = parseStation({ kind: addKind, variant: addVariant });
    if (s && !stations.some((x) => x.id === s.id) && stations.length < MAX_STATIONS) setStations([...stations, s]);
  };
  const start = () => {
    const teamName = team ? ctx.teams.find((t) => t.id === team)?.name ?? null : null;
    onStart(newEvent({ name, athletes: chosen, stations, teamId: team, teamName }));
  };

  return (
    <div className="space-y-5" data-combine-setup>
      <section className="fel-card space-y-2 rounded-xl p-4">
        <label htmlFor="combine-name" className="text-[11px] uppercase tracking-wider text-white/45">Combine name</label>
        <input id="combine-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-combine-name
          className="min-h-12 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-lg font-bold text-white" />
      </section>

      <section className="fel-card space-y-3 rounded-xl p-4" data-combine-athletes>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Athletes</h2>
          <span className="text-xs text-white/50" data-combine-picked={chosen.filter((a) => a.access.testable).length}>{chosen.filter((a) => a.access.testable).length} testing</span>
        </div>
        {ctx.teams.length > 0 && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team">
            {[{ id: null as string | null, name: 'Whole roster' }, ...ctx.teams].map((t) => (
              <button key={t.id ?? 'all'} type="button" role="radio" aria-checked={team === t.id} onClick={() => pickTeam(t.id)}
                className={`min-h-11 rounded-full border px-4 text-sm font-bold ${team === t.id ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/15 text-white/70'}`}>{t.name}</button>
            ))}
          </div>
        )}
        {shown.length === 0 && <p className="text-sm text-white/55">No athletes on your roster yet. Invite them from your coach page, then come back.</p>}
        <ul className="divide-y divide-white/5">
          {shown.map((a) => {
            const note = athleteNote(a);
            return (
              <li key={a.id} className="flex min-h-12 items-center gap-3 py-2" data-combine-athlete={a.id} data-held={a.access.held ?? undefined}>
                <input type="checkbox" className="h-5 w-5 accent-[#00E5FF]" checked={a.access.testable && picked.has(a.id)} disabled={!a.access.testable} onChange={() => toggle(a.id)} aria-label={a.name} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-bold ${a.access.testable ? 'text-white' : 'text-white/40'}`}>{a.name}</span>
                  {note && <span className="block text-xs text-white/45">{note}</span>}
                </span>
              </li>
            );
          })}
          {adhoc.map((a) => (
            <li key={a.id} className="flex min-h-12 items-center gap-3 py-2" data-combine-athlete={a.id} data-held={a.access.held ?? undefined}>
              <button type="button" onClick={() => setAdhoc(adhoc.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/60"><X className="h-4 w-4" /></button>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-white/40">{a.name}</span>
                <span className="block text-xs text-white/45">{athleteNote(a)}</span>
              </span>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { setAdhoc([...adhoc, adhocAthlete(typed, [...ctx.athletes, ...adhoc])]); setTyped(''); } }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Add someone not on your roster" maxLength={60} aria-label="Add a name"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-white/30" />
          <button type="submit" className="flex min-h-11 items-center gap-1 rounded-xl border border-white/20 px-3 text-sm font-bold text-white/80"><UserPlus className="h-4 w-4" /> Add</button>
        </form>
      </section>

      <section className="fel-card space-y-3 rounded-xl p-4" data-combine-stations>
        <h2 className="text-sm font-bold uppercase tracking-wide text-white">Stations</h2>
        <ul className="space-y-2">
          {stations.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 p-3" data-combine-station={s.id}>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-white">{stationName(s)}</span>
                <span className="block text-xs text-white/45">{s.timing === 'camera' ? CAMERA_STATION_HOW : STATIONS[s.kind].how}</span>
                {/* SPRINT-SPEED (2026-10-25): the coach picks hand or camera for a sprint or 5-10-5 station */}
                {(s.kind === 'sprint' || s.kind === 'agility') && timingChoices(s.kind, s.variant).includes('camera') && (
                  <button type="button" onClick={() => setTiming(s.id)} data-combine-timing={s.timing ?? 'hand'}
                    className="mt-1.5 min-h-9 rounded-lg border border-white/15 px-2.5 text-xs font-bold text-white/80">
                    Timed by: <span className="text-[#00E5FF]">{s.timing === 'camera' ? 'camera' : 'hand'}</span> · switch
                  </button>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1" aria-label={`Best of ${s.attempts}`}>
                <button type="button" onClick={() => setAttempts(s.id, -1)} aria-label="Fewer attempts" className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/70"><Minus className="h-4 w-4" /></button>
                <span className="w-12 text-center text-xs text-white/70">best of <b className="block text-base text-white">{s.attempts}</b></span>
                <button type="button" onClick={() => setAttempts(s.id, 1)} aria-label="More attempts" className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/70"><Plus className="h-4 w-4" /></button>
              </span>
              <button type="button" onClick={() => setStations(stations.filter((x) => x.id !== s.id))} aria-label={`Remove ${stationName(s)}`} className="grid h-9 w-9 place-items-center rounded-lg text-white/50"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        {stations.length < MAX_STATIONS && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select value={addKind} onChange={(e) => { const k = e.target.value as StationKind; setAddKind(k); setAddVariant(STATIONS[k].variants[0]?.id ?? ''); }} aria-label="Station"
              className="min-h-11 min-w-0 rounded-xl border border-white/15 bg-black/60 px-2 text-sm text-white">
              {STATION_KINDS.map((k) => <option key={k} value={k}>{STATIONS[k].label}</option>)}
            </select>
            {STATIONS[addKind].variants.length > 1 && (
              <select value={addVariant} onChange={(e) => setAddVariant(e.target.value)} aria-label="Which one" className="col-span-2 row-start-2 min-h-11 w-full min-w-0 rounded-xl border border-white/15 bg-black/60 px-2 text-sm text-white">
                {STATIONS[addKind].variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            )}
            <button type="button" onClick={add} data-combine-add-station className="flex min-h-11 items-center gap-1 rounded-xl border border-white/20 px-3 text-sm font-bold text-white/80"><Plus className="h-4 w-4" /> Add station</button>
          </div>
        )}
      </section>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl border border-white/20 px-4 font-bold text-white/70">Cancel</button>
        <button type="button" onClick={start} disabled={!ready} data-combine-begin className="min-h-12 flex-1 rounded-xl bg-[#00E5FF] px-4 font-black text-black disabled:opacity-40">Start the combine</button>
      </div>
    </div>
  );
}
