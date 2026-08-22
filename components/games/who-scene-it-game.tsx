'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { QUIZ_BANK, QUIZ_CATEGORIES, type QuizQuestion } from '@/lib/quiz-data';
import { SessionRecorder } from '@/lib/game-systems';
import { QuizCore } from '@/lib/feel/quiz-core';
import { reportEarn, newIdempotencyKey } from '@/lib/wallet/client';
import { FREE_USE_QUESTIONS } from '@/lib/wallet/sceneit-freeuse';

// M10 Row 3 retrofit — Who-Scene-It keeps its own rapid-fire deck UI and this
// app's richer QUIZ_BANK, but the deck order, per-question clock, streak and
// scoring are now the shared M9 QuizCore (speed-scaled points, streak ×3 cap,
// single-consume timeouts). Original-content IP screen enforced in the harness
// (scripts/who-scene-it-retrofit-tests.ts). Feel numbers // TUNE(elijah).

const TOTAL_Q = 15;
const Q_TIME = 8;
const WIN_SCORE = 1500; // TUNE(elijah) — retuned for QuizCore scoring magnitudes
const BASE_POINTS = 100; // TUNE(elijah) — QuizCore base points per question

// The display meta rides ON the question objects; QuizCore keeps object
// references through its shuffle, so `qc.current` carries catLabel/catColor.
interface RoundQ extends QuizQuestion {
  points: number;
  catLabel: string;
  catColor: string;
  /** Free-use (public-domain) character identification — grants shards. */
  freeUse?: boolean;
}

// ORIGINAL-CONTENT IP SCREEN. Who-Scene-It is a "name the scene" archetype, so
// the standing IP screen applies: the live deck must never quiz third-party
// entertainment properties (fictional characters, franchise/title names). We
// screen by token so only original, factual/nominative content ships. Exported
// so the harness (scripts/who-scene-it-retrofit-tests.ts) pins the same list.
export const IP_BANNED_TOKENS: readonly string[] = [
  'minion', 'captain america', 'vibranium', 'adamantium', 'kryptonite', 'mithril',
  'minecraft', 'grand theft auto', 'gta', 'wii sports', 'tetris', 'playstation',
  'xbox', 'pokemon', 'pokémon', 'mario', 'zelda', 'star wars', 'marvel', 'disney',
  'harry potter', 'hogwarts', 'tolkien', 'pixar', 'batman', 'superman', 'spider-man',
];

/** True when the question (and its options) contains no third-party IP token. */
export function passesIpScreen(q: { q: string; options: string[] }): boolean {
  const hay = (q.q + ' ' + q.options.join(' ')).toLowerCase();
  return !IP_BANNED_TOKENS.some((tok) => hay.includes(tok));
}

function buildDeck(): RoundQ[] {
  const deck: RoundQ[] = [];
  const cats = [...QUIZ_CATEGORIES];
  for (const cat of cats) {
    const qs = [...(QUIZ_BANK[cat.key] ?? [])]
      .filter(passesIpScreen) // original-content IP screen — third-party IP never ships
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    for (const q of qs) deck.push({ ...q, points: BASE_POINTS, catLabel: cat.label, catColor: cat.color });
  }
  // Phase 2 — reserve slots for Free-Use Legends (public-domain characters).
  // Correctly identifying one grants shards (wired in `pick`). We keep the
  // total deck size stable by trimming ordinary questions to make room.
  const FREE_USE_SLOTS = 3;
  const freeUse: RoundQ[] = [...FREE_USE_QUESTIONS]
    .sort(() => Math.random() - 0.5)
    .slice(0, FREE_USE_SLOTS)
    .map((q) => ({
      q: q.q, options: q.options, answer: q.answer, difficulty: 'medium' as const, points: BASE_POINTS,
      catLabel: 'Free-Use Legends', catColor: '#FFD700', freeUse: true,
    }));
  const trimmed = deck.slice(0, Math.max(0, TOTAL_Q - freeUse.length));
  // QuizCore does the authoritative shuffle; we only cap the pool here.
  return [...trimmed, ...freeUse].slice(0, TOTAL_Q);
}

export default function WhoSceneItGame({ grade, prq, onEnd, gamepad }: GameProps) {
  const [started, setStarted] = useState(false);
  const [cur, setCur] = useState<RoundQ | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [total, setTotal] = useState(TOTAL_Q);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(Q_TIME);
  const [picked, setPicked] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | 'timeout' | null>(null);
  const [lastEarned, setLastEarned] = useState(0);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const startRef = useRef(0);
  const scoreRef = useRef(0);
  scoreRef.current = score;
  const recRef = useRef(new SessionRecorder());
  const qcRef = useRef<QuizCore | null>(null);
  // FEL wallet: stable run id so free-use shard grants are idempotent per run.
  const runIdRef = useRef<string>(newIdempotencyKey());

  const timeBonus = grade.key === 'ELITE' ? 2 : grade.key === 'PRIMED' ? 1 : 0;
  const qTotalTime = Q_TIME + timeBonus;

  // Start: build the deck and hand it to a QuizCore (the deck authority).
  useEffect(() => {
    if (!started) return;
    const qc = new QuizCore({
      questions: buildDeck(),
      questionTimeMs: qTotalTime * 1000,
      streakStep: 0.25, // TUNE(elijah)
      maxMultiplier: 3, // TUNE(elijah)
    });
    qcRef.current = qc;
    startRef.current = Date.now();
    const first = qc.next() as RoundQ | null;
    setCur(first);
    setTotal(qc.total);
    setQIndex(qc.index);
    setTimeLeft(qTotalTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const finalScore = scoreRef.current;
    onEndRef.current?.({
      score: finalScore,
      won: finalScore >= WIN_SCORE,
      duration: Math.round((Date.now() - startRef.current) / 1000),
      headline: finalScore >= WIN_SCORE ? 'SCENE STEALER — CULTURE CHAMPION' : 'REWATCH THE CLASSICS',
      tallies: recRef.current.tallies(), maxCombo: recRef.current.bestChain,
    });
  }, []);

  const pick = useCallback((i: number) => {
    const qc = qcRef.current;
    if (!qc || !qc.current || picked !== null || feedback !== null || endedRef.current) return;
    setPicked(i);
    const res = qc.answer(i);
    setScore(qc.score);
    setStreak(qc.streak);
    if (res.result === 'correct') {
      setLastEarned(res.earned);
      recRef.current.recordHit();
      recRef.current.recordChain(qc.streak);
      setFeedback('right');
      // Phase 2 — correctly identifying a free-use (public-domain) character
      // grants shards. Best-effort, keyed idempotently on run+question index.
      if ((qc.current as RoundQ | null)?.freeUse) {
        void reportEarn({
          idempotency_key: `sceneit:${runIdRef.current}:${qc.index}`,
          event_type: 'sceneit_freeuse_identified',
          payload: { run_id: runIdRef.current, q_index: qc.index },
        });
      }
    } else {
      setLastEarned(0);
      recRef.current.recordMiss();
      setFeedback('wrong');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, feedback]);

  // keyboard shortcuts 1-4 to pick answer
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') { e.preventDefault(); pick(parseInt(e.key) - 1); }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [pick]);

  // countdown → QuizCore-owned timeout
  useEffect(() => {
    if (!started || !cur || picked !== null || feedback !== null || endedRef.current) return;
    if (timeLeft <= 0) {
      qcRef.current?.timeout();
      setStreak(qcRef.current?.streak ?? 0);
      setFeedback('timeout');
      recRef.current.recordMiss();
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => Math.round((v - 0.1) * 10) / 10), 100);
    return () => clearTimeout(t);
  }, [started, cur, timeLeft, picked, feedback]);

  // advance after feedback
  useEffect(() => {
    if (feedback === null || endedRef.current) return;
    const t = setTimeout(() => {
      const qc = qcRef.current;
      const nextQ = qc?.next() as RoundQ | null;
      if (!qc || !nextQ) {
        finish();
      } else {
        setCur(nextQ);
        setQIndex(qc.index);
        setPicked(null);
        setFeedback(null);
        setTimeLeft(qTotalTime);
      }
    }, 1100);
    return () => clearTimeout(t);
  }, [feedback, finish, qTotalTime]);

  const q = cur;

  return (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0F0A1C] p-4 sm:p-6" style={{ minHeight: 420 }}>
        {!started ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center gap-4 text-center">
            <h2 className="fel-heading text-4xl text-white">WHO SCENE IT</h2>
            <p className="max-w-md text-sm text-gray-300">
              Rapid-fire recall across every category — {TOTAL_Q} questions, {qTotalTime} seconds each. Answer fast for speed points, chain streaks for a multiplier up to x3. Score {WIN_SCORE}+ to win.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] text-white/40">
              <span>1 / 2 / 3 / 4 — Pick answer</span>
              <span>Speed bonus: faster = more pts</span>
              <span>Streak builds a x3 multiplier</span>
              <span>Tap options on mobile</span>
            </div>
            <button onClick={() => setStarted(true)} className="rounded-lg bg-[#A855F7] px-8 py-3 font-bold text-white transition hover:bg-[#9333ea]">ROLL THE SCENE</button>
          </div>
        ) : !q ? (
          <div className="flex min-h-[380px] items-center justify-center text-white/60">Shuffling the reel...</div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between font-mono text-xs text-white/60">
              <span>Q{qIndex + 1}/{total}</span>
              <span className="rounded px-2 py-0.5 font-bold" style={{ color: q.catColor, background: `${q.catColor}22` }}>{q.catLabel}</span>
              <span>SCORE {score} · STREAK x{streak}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-full rounded transition-[width] duration-100"
                style={{ width: `${Math.max(0, (timeLeft / qTotalTime) * 100)}%`, background: timeLeft < 3 ? '#FF3366' : '#00E5FF' }}
              />
            </div>
            <h3 className="mt-6 min-h-[64px] text-center text-lg font-semibold text-white">{q.q}</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {q.options.map((opt, i) => {
                let cls = 'border-white/15 bg-white/5 text-white hover:border-[#A855F7]/60 hover:bg-[#A855F7]/10';
                if (feedback !== null) {
                  if (i === q.answer) cls = 'border-[#00FF9D] bg-[#00FF9D]/15 text-[#00FF9D]';
                  else if (picked === i) cls = 'border-[#FF3366] bg-[#FF3366]/15 text-[#FF3366]';
                  else cls = 'border-white/10 bg-white/5 text-white/40';
                }
                return (
                  <button key={i} onClick={() => pick(i)} disabled={feedback !== null} className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${cls}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 min-h-[28px] text-center font-bold">
              {feedback === 'right' && <span className="text-[#00FF9D]">CORRECT! +{lastEarned}{streak >= 3 ? ' · x' + Math.min(3, 1 + (streak - 1) * 0.25).toFixed(2) : ''}</span>}
              {feedback === 'wrong' && <span className="text-[#FF3366]">WRONG SCENE!</span>}
              {feedback === 'timeout' && <span className="text-[#FFD700]">TIME! MOVING ON...</span>}
            </div>
            <p className="text-center font-mono text-[10px] text-white/30">PRQ {prq.toFixed(0)} · {grade.label}</p>
          </div>
        )}
      </div>
    </div>
  );
}
