'use client';
// The full party panel (PARTY-CHAT lane, 2026-10-13): tap the floating bar → this. Who is here, the invite, the host's
// controls, and (in their own sections) chat, voice and "Start together". A sheet from the right on a desktop, from the
// bottom on a phone, over whatever page or pause menu is underneath; Escape or the close button puts it away.
import { useEffect, useRef, useState } from 'react';
import { Crown, LogOut, MoreHorizontal, UserCheck, UserX, X } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { isHost, type PartyMember, type PartyState } from '@/lib/party/social/state';
import { REPORT_REASONS } from '@/server/netd/src/partyRules';
import { Avatar, InviteBlock } from './party-bits';
import { ChatSection } from './party-chat';
import { VoiceSection, useVoice } from './party-voice';

export function PartyPanel({ s, onClose }: { s: PartyState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const host = isHost(s);
  const c = partyClient();
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/40 md:items-stretch" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Party"
        data-testid="party-panel"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0b0e13] text-white shadow-2xl outline-none md:h-full md:max-h-none md:w-[400px] md:rounded-none md:rounded-l-2xl"
      >
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="fel-heading text-lg font-black tracking-wide">Party</h2>
          <span className="font-mono text-xs text-white/45">{s.members.length}/{6}</span>
          {s.status === 'reconnecting' ? <span className="rounded bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300" role="status">Reconnecting…</span> : null}
          <button type="button" onClick={onClose} aria-label="Close party panel" className="ml-auto rounded-md p-1.5 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {s.notice ? (
            <p role="status" className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              {s.notice}
              <button type="button" className="ml-2 underline" onClick={() => c.patch({ notice: null })}>OK</button>
            </p>
          ) : null}

          {s.code ? <InviteBlock code={s.code} /> : null}
          {s.inviteOnly ? <p className="text-xs text-white/50">Invite-only: new people wait for the host to let them in.</p> : null}

          {host && s.knocking.length ? (
            <section aria-label="Waiting to join" className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.25em] text-white/45">WAITING TO JOIN</h3>
              {s.knocking.map((k) => (
                <div key={k.peer} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2" data-testid="party-knock">
                  <span className="flex-1 text-sm font-bold">{k.name}</span>
                  <button type="button" onClick={() => c.admit(k.peer)} className="inline-flex items-center gap-1 rounded-md bg-[#00FF9D] px-2 py-1 text-xs font-bold text-black" aria-label={`Let ${k.name} in`}>
                    <UserCheck className="h-3.5 w-3.5" /> Let in
                  </button>
                  <button type="button" onClick={() => c.deny(k.peer)} className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs" aria-label={`Turn ${k.name} away`}>
                    <UserX className="h-3.5 w-3.5" /> No
                  </button>
                </div>
              ))}
            </section>
          ) : null}

          <Members s={s} host={host} />
          <VoiceSection s={s} />
          <ChatSection s={s} />
        </div>

        <footer className="border-t border-white/10 px-4 py-3">
          <button type="button" data-testid="party-leave" onClick={() => { c.leave(); onClose(); }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-400/40 py-2 text-sm font-bold text-rose-300 hover:bg-rose-400/10">
            <LogOut className="h-4 w-4" /> Leave party
          </button>
        </footer>
      </div>
    </div>
  );
}

function Members({ s, host }: { s: PartyState; host: boolean }) {
  const voice = useVoice();
  return (
    <section aria-label="Members" className="space-y-1.5">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-white/45">IN THE PARTY</h3>
      <ul className="space-y-1.5">
        {s.members.map((m) => (
          <MemberRow key={m.peer} m={m} you={m.peer === s.you} host={host} speaking={!!voice.speaking[m.peer]} conn={voice.peers[m.peer]} />
        ))}
      </ul>
    </section>
  );
}

function MemberRow({ m, you, host, speaking, conn }: { m: PartyMember; you: boolean; host: boolean; speaking: boolean; conn?: string }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const c = partyClient();
  const voice = useVoice();
  const muted = voice.mutedPubs.includes(m.pub);
  const voiceLine = !m.voice ? null : m.deafened ? 'Deafened' : m.muted ? 'Mic muted' : conn === 'failed' ? "Voice couldn't connect" : speaking ? 'Speaking' : 'In voice';
  const label = [m.name, you ? '(you)' : '', m.host ? 'host' : '', m.connected ? '' : 'reconnecting', m.activity ?? '', voiceLine ?? ''].filter(Boolean).join(', ');
  return (
    <li className="rounded-lg bg-white/[0.04] px-3 py-2" data-testid="party-member" data-name={m.name} data-voice-link={conn ?? ''} aria-label={label}>
      <div className="flex items-center gap-2.5">
        <Avatar name={m.name} pub={m.pub} speaking={speaking} dim={!m.connected} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            {m.name}{you ? <span className="text-white/40">(you)</span> : null}
            {m.host ? <Crown className="h-3.5 w-3.5 text-[#facc15]" aria-label="Host" /> : null}
          </p>
          <p className="truncate text-xs text-white/50">
            {!m.connected ? 'Reconnecting…' : m.activity ?? 'In the menus'}
            {voiceLine ? <span className={conn === 'failed' ? 'text-amber-300' : 'text-[#00FF9D]'}> · {voiceLine}</span> : null}
            {muted ? <span className="text-white/40"> · muted for you</span> : null}
          </p>
        </div>
        {!you ? (
          <button type="button" aria-label={`Options for ${m.name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-md p-1.5 text-white/60 hover:bg-white/10">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open && !you ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" data-testid="party-mute-for-me" className="rounded-md border border-white/20 px-2 py-1 text-xs" aria-pressed={muted} onClick={() => voice.toggleMutePub(m.pub)}>{muted ? 'Unmute' : 'Mute'} for me</button>
          <button type="button" data-testid="party-block" className="rounded-md border border-white/20 px-2 py-1 text-xs" onClick={() => { c.block(m); setOpen(false); }}>Block</button>
          <button type="button" data-testid="party-report" className="rounded-md border border-white/20 px-2 py-1 text-xs" aria-expanded={reporting} onClick={() => setReporting((r) => !r)}>Report</button>
          {host ? <button type="button" className="rounded-md border border-white/20 px-2 py-1 text-xs" onClick={() => { c.makeHost(m.peer); setOpen(false); }}>Make host</button> : null}
          {host ? <button type="button" data-testid="party-kick" className="rounded-md border border-rose-400/40 px-2 py-1 text-xs text-rose-300" onClick={() => { c.kick(m.peer); setOpen(false); }}>Remove from party</button> : null}
        </div>
      ) : null}
      {reporting && !you ? (
        <div className="mt-2 rounded-md bg-black/30 p-2" role="group" aria-label={`Report ${m.name}`}>
          <p className="mb-1 text-xs text-white/60">Why are you reporting {m.name}? They won&apos;t be told. Reporting also blocks them for you.</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_REASONS.map((r) => (
              <button key={r.id} type="button" className="rounded-md border border-white/20 px-2 py-1 text-xs"
                onClick={() => { c.report(m.peer, r.id); c.block(m); setReporting(false); setOpen(false); }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
