'use client';
// Party voice controls (PARTY-CHAT lane, 2026-10-13). The mic is asked for only on "Join voice". Verified adults only:
// for anyone else this section explains, and nothing here can turn voice on (netd refuses their voice signaling).
import { useSyncExternalStore } from 'react';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Radio } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { voiceMesh, NO_VOICE, type VoiceView } from '@/lib/party/social/voice';
import type { PartyState } from '@/lib/party/social/state';

export interface VoiceApi extends VoiceView {
  join(): void; leave(): void; setMuted(b: boolean): void; setDeafened(b: boolean): void; setPtt(b: boolean): void;
  talk(down: boolean): void; toggleMutePub(pub: string): void;
}

const noop = () => {};
const SERVER_API: VoiceApi = { ...NO_VOICE, join: noop, leave: noop, setMuted: noop, setDeafened: noop, setPtt: noop, talk: noop, toggleMutePub: noop };

export function useVoice(): VoiceApi {
  const m = typeof window === 'undefined' ? null : voiceMesh(partyClient());
  const v = useSyncExternalStore(m ? m.subscribe : () => noop, m ? m.getView : () => NO_VOICE, () => NO_VOICE);
  if (!m) return SERVER_API;
  return {
    ...v,
    join: () => { void m.join(); },
    leave: () => m.leave(),
    setMuted: (b) => m.setMuted(b),
    setDeafened: (b) => m.setDeafened(b),
    setPtt: (b) => m.setPtt(b),
    talk: (d) => m.talk(d),
    toggleMutePub: m.toggleMutePub,
  };
}

export function VoiceSection({ s }: { s: PartyState }) {
  const v = useVoice();
  if (!s.rights.voice) {
    return <p data-testid="party-voice-locked" className="text-xs text-white/45">Voice chat is for verified 18+ accounts.</p>;
  }
  const inVoice = s.members.filter((m) => m.voice).length;
  return (
    <section aria-label="Voice" className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <h3 className="font-mono text-[10px] tracking-[0.25em] text-white/45">VOICE</h3>
        <span className="text-xs text-white/40">{inVoice} in voice · peer-to-peer · never recorded</span>
      </div>
      {v.problem ? <p role="alert" data-testid="party-voice-problem" className="rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-200">{v.problem}</p> : null}
      {!v.joined ? (
        <button type="button" data-testid="party-voice-join" onClick={v.join} disabled={v.mic === 'asking'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF9D] py-2 text-sm font-bold text-black disabled:opacity-60">
          <Mic className="h-4 w-4" /> {v.mic === 'asking' ? 'Allow the microphone…' : 'Join voice'}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="party-voice-mute" aria-pressed={v.muted} onClick={() => v.setMuted(!v.muted)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${v.muted ? 'border-rose-400/60 text-rose-300' : 'border-white/20'}`}>
              {v.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {v.muted ? 'Unmute mic' : 'Mute mic'}
            </button>
            <button type="button" data-testid="party-voice-deafen" aria-pressed={v.deafened} onClick={() => v.setDeafened(!v.deafened)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${v.deafened ? 'border-rose-400/60 text-rose-300' : 'border-white/20'}`}>
              {v.deafened ? <HeadphoneOff className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />} {v.deafened ? 'Undeafen' : 'Deafen'}
            </button>
            <button type="button" data-testid="party-voice-ptt" aria-pressed={v.ptt} onClick={() => v.setPtt(!v.ptt)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${v.ptt ? 'border-[#00E5FF]/60 text-[#00E5FF]' : 'border-white/20'}`}>
              <Radio className="h-3.5 w-3.5" /> Push to talk {v.ptt ? 'on' : 'off'}
            </button>
            <button type="button" data-testid="party-voice-leave" onClick={v.leave} className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1.5 text-xs">
              <PhoneOff className="h-3.5 w-3.5" /> Leave voice
            </button>
          </div>
          {v.ptt ? <TalkButton v={v} /> : null}
        </>
      )}
    </section>
  );
}

/** Hold to talk (or hold ` on a keyboard). */
export function TalkButton({ v, compact = false }: { v: VoiceApi; compact?: boolean }) {
  return (
    <button
      type="button"
      data-testid="party-voice-talk"
      aria-pressed={v.talking}
      aria-label="Hold to talk"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); v.talk(true); }}
      onPointerUp={() => v.talk(false)}
      onPointerCancel={() => v.talk(false)}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); v.talk(true); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') v.talk(false); }}
      className={`${compact ? 'h-8 px-3 text-xs' : 'w-full py-3 text-sm'} touch-none select-none rounded-lg font-bold ${v.talking ? 'bg-[#00FF9D] text-black' : 'bg-white/10 text-white/80'}`}
    >
      {v.talking ? 'Talking…' : compact ? 'Hold to talk' : 'Hold to talk (or hold ` on a keyboard)'}
    </button>
  );
}
