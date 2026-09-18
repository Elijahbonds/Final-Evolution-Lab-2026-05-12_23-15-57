// StreamingDeck — the Academy's LISTEN floor (M58). Route suggestion:
// a "LISTEN" tab inside the Music Academy or `/play/music/listen`.
// What it does, honestly:
//   - paste any Spotify / Apple Music share link → the OFFICIAL embed
//     player renders and plays right here (no credentials involved; full
//     tracks when the listener is signed into that service in-browser)
//   - a persistent "shelf" of saved links (localStorage + SYNC SEAM)
//   - per-provider CONNECT cards that report exactly what full in-app
//     control needs (credential seams) — never a fake connected state

import React, { useState } from 'react';
import {
  parseStreamingUrl, StreamingShelf, StreamingConnect, PROVIDER_META,
  type StreamingLink, type Provider,
} from './StreamingBridge';

export default function StreamingDeck() {
  const [input, setInput] = useState('');
  const [active, setActive] = useState<StreamingLink | null>(null);
  const [shelfRev, setShelfRev] = useState(0);
  const [note, setNote] = useState('');
  void shelfRev;

  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 3500); };

  const addLink = (): void => {
    const link = parseStreamingUrl(input);
    if (!link) { say('That is not a Spotify or Apple Music link'); return; }
    StreamingShelf.add(link);
    setActive(link);
    setInput('');
    setShelfRev((r) => r + 1);
  };

  const connect = (p: Provider): void => {
    const res = StreamingConnect.requestConnect(p);
    say(`${PROVIDER_META[p].label}: full in-app control needs ${res.needs}. The embed player below works today.`);
  };

  const S: Record<string, React.CSSProperties> = {
    root: { color: '#f5ead9', background: 'linear-gradient(165deg,#1a2a3a 0%,#241f3a 60%,#18303a 100%)', padding: 16, borderRadius: 12 },
    h1: { fontSize: 20, fontWeight: 800, color: '#22d3ee', marginBottom: 4 },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    input: { flex: 1, minWidth: 220, padding: 9, borderRadius: 8, border: '1px solid #3a5a7a', background: '#122030', color: '#f5ead9' },
    btn: { padding: '9px 14px', borderRadius: 8, border: 'none', background: '#22d3ee', color: '#06202a', fontWeight: 700, cursor: 'pointer' },
    chip: { padding: '6px 12px', borderRadius: 16, border: '1px solid #3a5a7a', background: 'transparent', color: '#cfe6f2', cursor: 'pointer', fontSize: 12 },
    conn: { padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.28)', marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    frameWrap: { marginTop: 12, borderRadius: 12, overflow: 'hidden', background: '#0c141c' },
    note: { marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#3a5a7a', color: '#fff', fontSize: 13, width: 'fit-content' },
  };

  const conn = StreamingConnect.state();
  const shelf = StreamingShelf.list();

  return (
    <div style={S.root}>
      <div style={S.h1}>THE LISTEN FLOOR</div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Spotify & Apple Music, inside the Academy — official players, artists get their plays.
      </div>

      <div style={S.row}>
        <input style={S.input} value={input} placeholder="paste a Spotify or Apple Music link…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} />
        <button style={S.btn} onClick={addLink}>ADD & PLAY</button>
      </div>

      {shelf.length > 0 && (
        <div style={S.row}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>SHELF:</span>
          {shelf.map((l) => (
            <button key={l.url}
              style={{ ...S.chip, ...(active?.url === l.url ? { background: '#3a5a7a', color: '#fff' } : {}) }}
              onClick={() => setActive(l)}>
              {PROVIDER_META[l.provider].label} · {l.kind}
            </button>
          ))}
          {active && (
            <button style={S.chip} onClick={() => { StreamingShelf.remove(active.url); setActive(null); setShelfRev((r) => r + 1); }}>
              ✕ remove
            </button>
          )}
        </div>
      )}

      {active && (
        <div style={S.frameWrap}>
          <iframe
            title={`${PROVIDER_META[active.provider].label} player`}
            src={active.embedUrl}
            width="100%"
            height={active.kind === 'track' ? 152 : 380}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ display: 'block' }}
          />
        </div>
      )}

      {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
        <div key={p} style={S.conn}>
          <span style={{ fontWeight: 700, color: PROVIDER_META[p].color }}>{PROVIDER_META[p].label}</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {conn[p] === 'awaiting-credentials'
              ? 'connection requested — waiting on developer credentials'
              : 'embeds live now · full in-app control needs a connection'}
          </span>
          <button style={S.chip} onClick={() => connect(p)}>CONNECT</button>
        </div>
      ))}

      {note && <div style={S.note}>{note}</div>}
    </div>
  );
}
