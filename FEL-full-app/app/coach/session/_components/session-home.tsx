'use client';

// Court session home. Big buttons, readable from across a gym.
// Under 18 and unknown age are nickname-only, held in page memory, cleared when
// the session ends. Verified adults may be written through writeAdults. Nothing
// here posts jump numbers; Prove It does that, and only after the opt-in gate.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_DUNKS, MAX_DUNKS, MAX_PLAYERS, MIN_DUNKS, rosterReady, sealRoster, type ClaimedAge, type RosterRow } from '@/lib/session-setup/roster';
import { endSession, readSession, rememberSession } from '@/lib/session-setup/memory';
import { DRILL_CARDS, drillByLane, drillPhase, type TrainingLane } from '@/lib/session-setup/drills';
import { PROGRAM_LANES_HEADER } from '@/lib/screen/PROPOSED-program-lanes';

const CLAIMS: { id: ClaimedAge; label: string }[] = [
  { id: '13-17', label: '13–17' },
  { id: '18+', label: '18+' },
  { id: 'unknown', label: 'Rather not say' },
];

export function SessionHome({ serverVerified, optedIn }: { serverVerified: boolean; optedIn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'home' | 'roster' | 'train'>('home');
  const [rows, setRows] = useState<RosterRow[]>([{ name: '', claimed: 'unknown' }]);
  const [dunksEach, setDunksEach] = useState(DEFAULT_DUNKS);
  const [blocked, setBlocked] = useState(false);
  const [lane, setLane] = useState<TrainingLane | null>(null);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [hurt, setHurt] = useState<boolean | null>(null);

  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const ready = rosterReady(rows, dunksEach) && !blocked;
  const sealed = sealRoster(rows, serverVerified);

  function beginDunk() {
    if (!ready || sealed.blocked || sealed.athletes.length === 0) return;
    const store = typeof localStorage === 'undefined' ? undefined : localStorage;
    rememberSession(sealed.athletes, serverVerified, dunksEach, store);
    router.push('/play/dunkduel');
  }

  function beginTrain() {
    if (!ready || sealed.blocked || sealed.athletes.length === 0) return;
    const store = typeof localStorage === 'undefined' ? undefined : localStorage;
    rememberSession(sealed.athletes, serverVerified, dunksEach, store);
    setAthleteId(sealed.athletes[0].id);
    setMode('train');
    setHurt(null);
    setLane(null);
    setStartedAt(null);
  }

  function finish() {
    endSession();
    setMode('home');
    setRows([{ name: '', claimed: 'unknown' }]);
    setLane(null);
    setStartedAt(null);
  }

  const held = readSession();
  const athletes = held?.athletes ?? sealed.athletes;
  const card = lane ? drillByLane(lane) : null;
  const clock = card && startedAt != null ? drillPhase(now - startedAt, card.workSec, card.restSec) : null;

  return (
    <main className="mx-auto max-w-[720px] overflow-x-hidden px-4 py-6 text-base text-white">
      <h1 className="text-4xl font-black">Court session</h1>
      <p className="mt-2 text-base text-white/70">
        Nicknames only for anyone under 18 or who would rather not say. Those names stay in this session and leave when it ends.
        {optedIn ? ' This account can keep adult jump numbers.' : ' Jump numbers are not sent anywhere.'}
      </p>

      {mode === 'home' && (
        <div className="mt-6 grid gap-3">
          <button type="button" onClick={() => setMode('roster')} className="min-h-16 rounded-2xl bg-[#FF2D95] px-4 text-2xl font-black text-black">
            Dunk session
          </button>
          <button type="button" onClick={() => setMode('roster')} className="min-h-16 rounded-2xl bg-[#00E5FF] px-4 text-2xl font-black text-black">
            Training session
          </button>
        </div>
      )}

      {mode === 'roster' && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: MAX_PLAYERS }, (_, n) => n + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRows((prev) => {
                  const next = prev.slice(0, n);
                  while (next.length < n) next.push({ name: '', claimed: 'unknown' });
                  return next;
                })}
                className="min-h-12 min-w-12 rounded-lg border border-white/20 text-base font-bold"
                style={{ background: rows.length === n ? '#00E5FF' : 'transparent', color: rows.length === n ? '#000' : '#fff' }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: MAX_DUNKS }, (_, n) => n + MIN_DUNKS).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDunksEach(n)}
                className="min-h-12 min-w-12 rounded-lg border border-white/20 text-base font-bold"
                style={{ background: dunksEach === n ? '#FF2D95' : 'transparent', color: dunksEach === n ? '#000' : '#fff' }}
              >
                {n} dunks
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-3">
                <label className="text-sm text-white/70" htmlFor={`coach-name-${i}`}>Name or nickname</label>
                <input
                  id={`coach-name-${i}`}
                  value={row.name}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                  className="mt-1 min-h-12 w-full rounded-lg border border-white/20 bg-black px-3 text-base"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {CLAIMS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setBlocked(false); setRows((prev) => prev.map((r, j) => j === i ? { ...r, claimed: c.id } : r)); }}
                      className="min-h-12 rounded-lg border border-white/20 px-3 text-base"
                      style={{ background: row.claimed === c.id ? '#00FF9D' : 'transparent', color: row.claimed === c.id ? '#000' : '#fff' }}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setBlocked(true)} className="min-h-12 rounded-lg border border-white/20 px-3 text-base">
                    Under 13
                  </button>
                </div>
              </div>
            ))}
          </div>
          {blocked && <p className="mt-3 text-base text-[#FF3366]">Under 13 can&apos;t be added.</p>}
          <div className="mt-4 grid gap-3">
            <button type="button" disabled={!ready} onClick={beginDunk} className="min-h-14 rounded-xl bg-[#FF2D95] text-xl font-black text-black disabled:opacity-40">
              Start dunk session
            </button>
            <button type="button" disabled={!ready} onClick={beginTrain} className="min-h-14 rounded-xl bg-[#00E5FF] text-xl font-black text-black disabled:opacity-40">
              Start training
            </button>
            <button type="button" onClick={() => setMode('home')} className="min-h-12 text-base text-white/70">Back</button>
          </div>
        </div>
      )}

      {mode === 'train' && (
        <div className="mt-6">
          <p className="text-sm text-white/60">{PROGRAM_LANES_HEADER}</p>
          {hurt == null && (
            <div className="mt-4">
              <p className="text-xl font-bold">Does anything hurt?</p>
              <div className="mt-3 grid gap-2">
                <button type="button" className="min-h-12 rounded-lg border border-white/20 text-base" onClick={() => setHurt(false)}>No, nothing hurts</button>
                <button type="button" className="min-h-12 rounded-lg border border-white/20 text-base" onClick={() => setHurt(true)}>Yes — stop</button>
              </div>
            </div>
          )}
          {hurt === true && (
            <p className="mt-4 text-base">Stop. Don&apos;t train through pain. Talk to a coach or a medical pro before going on.</p>
          )}
          {hurt === false && !lane && (
            <div className="mt-4 grid gap-2">
              {DRILL_CARDS.map((d) => (
                <button key={d.lane} type="button" onClick={() => setLane(d.lane)} className="min-h-14 rounded-xl border border-white/15 px-4 text-left text-xl font-bold">
                  {d.name}
                </button>
              ))}
            </div>
          )}
          {hurt === false && card && (
            <div className="mt-4 rounded-xl border border-white/10 p-4">
              <label className="text-sm text-white/70" htmlFor="train-athlete">Athlete</label>
              <select
                id="train-athlete"
                className="mt-1 min-h-12 w-full rounded-lg border border-white/20 bg-black px-3 text-base"
                value={athleteId ?? athletes[0]?.id ?? ''}
                onChange={(e) => setAthleteId(e.target.value)}
              >
                {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <h2 className="mt-4 text-2xl font-black">{card.name}</h2>
              <p className="mt-2 text-base">{card.cue}</p>
              <p className="mt-2 text-base">{card.reps} reps · {card.workSec}s work · {card.restSec}s rest</p>
              {clock && (
                <p className="mt-4 text-4xl font-black">
                  {clock.phase === 'done' ? 'Done' : `${clock.phase} ${clock.remainingSec}s`}
                </p>
              )}
              {startedAt == null && (
                <button type="button" className="mt-4 min-h-14 w-full rounded-xl bg-[#00FF9D] text-xl font-black text-black" onClick={() => { setStartedAt(Date.now()); setNow(Date.now()); }}>
                  Start drill
                </button>
              )}
              {clock?.phase === 'done' && (
                <div className="mt-4">
                  <p className="text-base">Re-screen: one jump, same phone, same spot.</p>
                  <button
                    type="button"
                    className="mt-2 min-h-12 rounded-lg bg-[#FF2D95] px-4 text-base font-bold text-black"
                    onClick={() => {
                      const one = athletes.filter((a) => a.id === (athleteId ?? athletes[0]?.id));
                      const store = typeof localStorage === 'undefined' ? undefined : localStorage;
                      rememberSession(one.length ? one : athletes.slice(0, 1), serverVerified, 1, store);
                      router.push('/play/dunkduel');
                    }}
                  >
                    Re-screen jump
                  </button>
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={finish} className="mt-6 min-h-12 rounded-lg border border-white/20 px-4 text-base font-bold">
            End session
          </button>
        </div>
      )}
    </main>
  );
}
