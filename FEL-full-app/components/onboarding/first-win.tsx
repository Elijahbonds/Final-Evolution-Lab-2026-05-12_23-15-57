'use client';

// FirstWin — ONB-02 / ONB-03: the guided first win on /welcome, one per path (lib/onboarding/firstWin.ts says what each
// one is and why). The page shows the chosen path's win, the moment it is done, and the door onward; a different path is
// one tap away in the picker under it.
//
// What leaves this page: the invite (teach) is the coach's own POST /api/coach/invite, the same call the coach page
// makes; the first-win timing is the first-party analytics bus (lib/analytics.ts, our own table). The breathing and the
// card send nothing (the card is recorded on this device the way /learn records it). No camera, anywhere here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Link2, Loader2, Share2 } from 'lucide-react';
import { track } from '@/lib/analytics';
import type { Card } from '@/lib/knowledge/types';
import { loadState, saveState } from '@/lib/knowledge/storage';
import { recordView } from '@/lib/knowledge/state';
import { localDay } from '@/lib/knowledge/day';
import { inviteUrl } from '@/lib/coach/invite';
import { codeOfToken, formatCode } from '@/lib/coach/inviteCode';
import { pathFor, type OnboardingPath } from '@/lib/onboarding/firstRun';
import { CARD_COUNT_SEC, FIRST_WINS, breathAt, breathPhase, breathSeconds, BREATH_LEAD_SEC } from '@/lib/onboarding/firstWin';
import { PathPicker } from './path-picker';
import { CoachFirstRun } from './coach-first-run';

type LessonCard = Extract<Card, { type: 'lesson' }>;

export interface FirstWinProps {
  path: OnboardingPath;
  adult: boolean;
  /** The Playbook card for learn (picked on the server, so the catalogue stays off this bundle). */
  card: LessonCard | null;
  /** Play's game: the creator's, the athlete's saved pick, or the dunk (lib/onboarding/firstRun.ts). */
  gameHref: string;
  gameName: string;
}

export function FirstWin(props: FirstWinProps) {
  const [path, setPath] = useState<OnboardingPath>(pathFor(props.path, { adult: props.adult }));
  const [done, setDone] = useState(false);
  const started = useRef(Date.now());

  const choose = (p: OnboardingPath) => {
    const next = pathFor(p, { adult: props.adult });
    setPath(next);
    setDone(false);
    started.current = Date.now();
    track('path_chosen', { path: next, where: 'welcome' });
    try { window.history.replaceState(null, '', `?path=${next}`); } catch { /* the URL is a convenience */ }
  };

  const win = useCallback((p: OnboardingPath) => {
    setDone(true);
    track('first_win', { path: p, sec: Math.round((Date.now() - started.current) / 100) / 10 });
  }, []);

  const w = FIRST_WINS[path];

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 pb-28" data-first-win={path} data-first-win-done={done ? 'true' : 'false'}>
      <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em]" style={{ color: w.accent }}>
        Your first win · about {w.aboutSec} seconds
      </p>
      <h1 className="fel-heading mt-1 text-3xl font-black leading-tight text-white">{w.title}</h1>

      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-live="polite">
        {done ? (
          <Done path={path} />
        ) : (
          <>
            <ol className="space-y-1.5">
              {w.steps.map((s, i) => (
                <li key={s.text} className="flex gap-2 text-[13.5px] leading-snug text-white/75">
                  <span className="font-mono text-[11px] font-bold" style={{ color: w.accent }}>{i + 1}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              {w.kind === 'breath' && <Breath onDone={() => win('train')} accent={w.accent} />}
              {w.kind === 'card' && <PlaybookCard card={props.card} onDone={() => win('learn')} accent={w.accent} />}
              {w.kind === 'invite' && <Invite onDone={() => win('teach')} accent={w.accent} />}
              {w.kind === 'closet' && <Door href={w.next.href} label={w.next.label} accent={w.accent} />}
              {w.kind === 'game' && <Door href={props.gameHref} label={`Play ${props.gameName}`} accent={w.accent} />}
            </div>
          </>
        )}
      </section>

      {path === 'teach' && <CoachFirstRun invited={done} />}

      <section className="mt-8">
        <PathPicker value={path} onChange={choose} adult={props.adult} />
      </section>
    </div>
  );
}

function Done({ path }: { path: OnboardingPath }) {
  const w = FIRST_WINS[path];
  return (
    <div data-you-did-it>
      <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: `${w.accent}22` }}>
        <Check aria-hidden className="h-6 w-6" style={{ color: w.accent }} strokeWidth={3} />
      </span>
      <p className="fel-heading mt-3 text-2xl font-black text-white">{w.doneTitle}</p>
      <p className="mt-1 text-sm text-white/70">{w.doneLine}</p>
      <Door href={w.next.href} label={w.next.label} accent={w.accent} />
    </div>
  );
}

function Door({ href, label, accent }: { href: string; label: string; accent: string }) {
  return (
    <Link
      href={href}
      data-first-win-next
      className="mt-4 inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-black"
      style={{ background: accent }}
    >
      {label}
    </Link>
  );
}

// ── train: the Wake-Up's breathing phase, paced ──────────────────────────────────────────────────────────────────

const BEAT_WORD = { ready: 'Get ready', in: 'Breathe in', hold: 'Hold', out: 'Breathe out', done: 'Done' } as const;

function Breath({ onDone, accent }: { onDone: () => void; accent: string }) {
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const total = BREATH_LEAD_SEC + breathSeconds();
  const { rounds, inSec, outSec } = breathPhase().pacer;
  const fired = useRef(false);

  useEffect(() => {
    if (t0 === null) return;
    const id = window.setInterval(() => setNow((Date.now() - t0) / 1000), 100);
    return () => window.clearInterval(id);
  }, [t0]);

  const at = t0 === null ? null : breathAt(now);
  useEffect(() => {
    if (at?.beat === 'done' && !fired.current) { fired.current = true; onDone(); }
  }, [at?.beat, onDone]);

  if (t0 === null) {
    return (
      <button type="button" data-breath-start onClick={() => { setT0(Date.now()); setNow(0); }}
        className="inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-black" style={{ background: accent }}>
        Start · {Math.round(total)} seconds
      </button>
    );
  }
  // the ring grows on the in-breath, holds, and shrinks on the out-breath
  const scale = !at || at.beat === 'ready' ? 0.55
    : at.beat === 'in' ? 0.55 + 0.45 * (1 - at.left / inSec)
      : at.beat === 'hold' ? 1
        : 0.55 + 0.45 * (at.left / outSec);
  return (
    <div className="flex flex-col items-center py-2" data-breath={at?.beat}>
      <div className="relative grid h-44 w-44 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-full border-2 opacity-30" style={{ borderColor: accent }} />
        <span aria-hidden className="absolute inset-0 rounded-full transition-transform duration-100 ease-linear"
          style={{ background: `${accent}26`, transform: `scale(${scale})` }} />
        <span className="relative text-center">
          <span className="fel-heading block text-xl font-black text-white">{at ? BEAT_WORD[at.beat] : ''}</span>
          <span className="font-mono text-sm text-white/70">{at && at.beat !== 'done' ? Math.ceil(at.left) : ''}</span>
        </span>
      </div>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
        {at && at.round > 0 ? `Breath ${Math.min(at.round, rounds)} of ${rounds}` : `${rounds} breaths`}
      </p>
    </div>
  );
}

// ── learn: one Playbook card ────────────────────────────────────────────────────────────────────────────────────

function PlaybookCard({ card, onDone, accent }: { card: LessonCard | null; onDone: () => void; accent: string }) {
  const shownAt = useRef(Date.now());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), CARD_COUNT_SEC * 1000);
    return () => window.clearTimeout(id);
  }, []);
  if (!card) return <Door href="/learn" label="Open the feed" accent={accent} />;
  const gotIt = () => {
    const now = Date.now();
    try { saveState(recordView(loadState(), card, localDay(now), now, now - shownAt.current)); } catch { /* device-only progress */ }
    onDone();
  };
  return (
    <div>
      <article className="rounded-xl border p-4" style={{ borderColor: `${accent}40`, background: `${accent}0D` }} data-playbook-card={card.id}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>The Playbook</p>
        <h2 className="fel-heading mt-1 text-xl font-bold text-white">{card.headline}</h2>
        {card.lines.map((l) => <p key={l} className="mt-2 text-[14px] leading-relaxed text-white/80">{l}</p>)}
        <p className="mt-3 text-[11px] leading-snug text-white/45">{card.source}</p>
      </article>
      <button type="button" onClick={gotIt} disabled={!ready} data-card-got-it
        className="mt-4 inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-black disabled:opacity-50" style={{ background: accent }}>
        Got it
      </button>
    </div>
  );
}

// ── teach: the first invite ─────────────────────────────────────────────────────────────────────────────────────

function Invite({ onDone, accent }: { onDone: () => void; accent: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(() => (token && typeof window !== 'undefined' ? inviteUrl(window.location.origin, token) : null), [token]);
  const code = token ? codeOfToken(token) : null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/coach/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ use: 'once' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j?.invite?.token !== 'string') {
        setError(j?.error === 'too_many_invites' ? 'You have too many open invites. Close one on your coach page first.' : 'Could not make a link just now. Try again.');
        return;
      }
      setToken(j.invite.token);
    } catch {
      setError('Could not make a link just now. Try again.');
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); onDone(); }
    catch { setError('Copying is blocked here. Hold the link to copy it by hand, then tap Sent.'); }
  };
  const share = async () => {
    if (!url) return;
    try { await navigator.share({ title: 'Train with me on FEL', url }); onDone(); }
    catch { /* closed the sheet: not sent */ }
  };

  if (!token) {
    return (
      <div>
        <button type="button" onClick={make} disabled={busy} data-invite-make
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-black disabled:opacity-60" style={{ background: accent }}>
          {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Link2 aria-hidden className="h-4 w-4" />}
          Make my invite link
        </button>
        {error && <p role="alert" className="mt-3 text-xs text-[#FF8FA8]">{error}</p>}
      </div>
    );
  }
  return (
    <div data-invite-ready>
      <p className="break-all rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-white/85" data-invite-url>{url}</p>
      {code && <p className="mt-2 text-[12px] text-white/60">Or they type the code <span className="font-mono font-bold tracking-[0.15em] text-white">{formatCode(code)}</span></p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copy} data-invite-copy
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-black" style={{ background: accent }}>
          <Copy aria-hidden className="h-4 w-4" /> Copy link
        </button>
        {canShare && (
          <button type="button" onClick={share} data-invite-share
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-bold text-white">
            <Share2 aria-hidden className="h-4 w-4" /> Share
          </button>
        )}
        {error && (
          <button type="button" onClick={onDone} className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-5 text-sm font-bold text-white">Sent</button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-[#FF8FA8]">{error}</p>}
    </div>
  );
}
