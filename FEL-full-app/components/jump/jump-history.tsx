'use client';

// JumpHistory — the athlete's own jump history on this phone, and its CSV (JUMP-TESTS, 2026-10-25). Adults only: renders
// nothing unless `adult` (mounted on an adult's jump result). Lists what the athlete kept (lib/jump/historyStore.ts),
// keeps today's live jump check on a tap, exports the list as a CSV made on the phone (lib/csv: formula-safe cells), and
// forgets it all. Nothing is sent: the file is handed to the person by the browser (lib/csv/download.ts).
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { T5Extra } from '@/lib/assess/scoring';
import { forgetJumps, historyFileName, historyId, HISTORY_TEST_NAMES, jumpHistoryCsv, keepJump, loadJumps, type JumpHistoryEntry } from '@/lib/jump/historyStore';
import { bestJumpRecord } from '@/lib/jump/seam';
import { takeoffVelocity } from '@/lib/jump/velocity';
import { downloadCsv } from '@/lib/csv/download';
import type { ReachStorage } from '@/lib/jump/reachStore';

const IN = 2.54;

/** Today's live check as a history entry: the verified best when one verifies (the seam's rule), else the best. */
export function liveEntry(t5: T5Extra, id: string, at: Date = new Date()): JumpHistoryEntry | null {
  const rec = bestJumpRecord(t5, { source: 'live' });
  if (!rec) return null;
  return {
    id, at: at.toISOString(), test: 'check', bestCm: rec.heightCm, plusMinusCm: rec.plusMinusCm, jumps: t5.jumps.filter((j) => j.valid).length,
    verified: rec.verified, manualFrames: false, source: 'live', fps: Math.round(t5.poseFps), rsi: null, contactMs: null,
    v0Mps: takeoffVelocity(rec.heightCm).v0Mps, rsiMod: null,
  };
}

export function JumpHistory({ adult, storage, liveT5 = null, onExport }: { adult: boolean; storage: ReachStorage | null; liveT5?: T5Extra | null; onExport?: (name: string, text: string) => void }) {
  const [list, setList] = useState<JumpHistoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [liveId] = useState(() => historyId());
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (open) setList(loadJumps(storage)); }, [open, storage]);
  if (!adult) return null;
  if (!open) {
    return (
      <button type="button" data-history-open onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        My jump history on this phone
      </button>
    );
  }
  const live = liveT5 ? liveEntry(liveT5, liveId) : null;
  const liveKept = list.some((e) => e.id === liveId);
  const exportCsv = () => {
    const name = historyFileName(), text = jumpHistoryCsv(list);
    if (onExport) onExport(name, text); else if (!downloadCsv(name, text)) { setNote('This browser could not save the file.'); return; }
    setNote(`Saved ${name}.`);
  };
  return (
    <section data-history className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">My jump history</h2>
      <p className="text-[16px] leading-snug text-white/70">Kept on this phone only, numbers only. Not sent anywhere.</p>
      {live && !liveKept ? (
        <button type="button" data-history-keep-live disabled={!storage} onClick={() => { if (keepJump(storage, live, { adult })) setList(loadJumps(storage)); }}
          className="min-h-12 w-full rounded-2xl bg-white px-4 text-[16px] font-black text-black disabled:opacity-40">
          Keep today&apos;s jump check ({(live.bestCm! / IN).toFixed(1)} in)
        </button>
      ) : null}
      {list.length ? (
        <ul data-history-list className="space-y-1.5">
          {list.slice(0, 20).map((e) => (
            <li key={e.id} data-history-row={e.test} className="flex flex-wrap justify-between gap-x-3 text-[16px] text-white/85">
              <span>{e.at.slice(0, 10)} · {HISTORY_TEST_NAMES[e.test]}</span>
              <span className="font-bold text-white">
                {e.test === 'rj105' ? (e.rsi !== null ? `RSI ${e.rsi.toFixed(2)}` : 'no result') : e.bestCm !== null ? `${(e.bestCm / IN).toFixed(1)} in` : 'no jump'}
                <span className="font-normal text-white/60">{e.verified ? ' · verified' : ''}{e.manualFrames ? ' · manual frames' : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : <p data-history-empty className="text-[16px] text-white/70">Nothing kept yet. Tap &quot;Keep&quot; on a result to add it.</p>}
      {list.length > 20 ? <p className="text-[16px] text-white/60">And {list.length - 20} more in the file.</p> : null}
      <div className="flex gap-2">
        <button type="button" data-history-export disabled={!list.length} onClick={exportCsv}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/25 px-4 text-[16px] font-bold text-white disabled:opacity-40">
          <Download aria-hidden className="h-5 w-5" /> Export CSV
        </button>
        <button type="button" data-history-forget disabled={!list.length} onClick={() => { forgetJumps(storage); setList([]); setNote('Forgotten on this phone.'); }}
          className="min-h-12 flex-1 rounded-2xl border border-white/15 px-4 text-[16px] font-bold text-white/80 disabled:opacity-40">
          Forget all
        </button>
      </div>
      {note ? <p data-history-note className="text-[16px] text-white/70">{note}</p> : null}
    </section>
  );
}
