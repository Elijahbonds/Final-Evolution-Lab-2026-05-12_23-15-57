// StudioMode v2 — REPLACES the M57 file. Phase 8 additions on top of the
// Academy: a LISTEN tab (StreamingDeck — official Spotify/Apple embeds +
// connect seams), an optional "your Spotify/Apple link" field on publish,
// and per-track streaming chips in the library that expand the official
// embed player inline. Everything else byte-identical to M57.
//
// THE FEL MUSIC ACADEMY — the creation studio, template: the loop that
// makes in-browser music tools sticky (multi-track groovebox, unlockable
// sound kits, one-tap mastering, remix-with-attribution, per-creator song
// pages). Presentation: a warm, vibrant music-school hub with an ORIGINAL
// mentor cast (Professor Okta — no real-person likeness, no franchise
// characters, no show references; original name/design per the standing
// IP rule).
//
// What's real vs. seamed (honest boundaries, stated in-code where they live):
//   REAL: synthesis (zero asset files — fixes M28's missing-WAV dependency),
//         sequencing, mastering chain, mixdown render, save/library/remix,
//         per-creator pages, perform-mode scoring.
//   SEAM: Shards spend (spendShards prop — wire to the real economy),
//         Cell/Nexus generation (local musical generator today, labeled as
//         the LLM integration point), backend sync (StudioLibrary's four
//         SYNC SEAMs), external streaming (Phase 8, not faked here).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine, type SequencerState, type TrackState } from './AudioEngine';
import { synthesizeKit, KIT_SLOTS, KIT_META, type KitId } from './SynthKit';
import { StudioLibrary, blobToDataUrl, type TrackRecord } from './StudioLibrary';
import { parseStreamingUrl, PROVIDER_META } from './StreamingBridge';
import StreamingDeck from './StreamingDeck';

const STEPS = 16;
const EXPIRE_S = 0.25;
const CELL_ASSIST_COST = 50;

const OKTA_TIPS = [
  'Okta: a beat is a conversation — leave space for the answer.',
  'Okta: kick and bass are one instrument. Make them agree.',
  'Okta: swing is confidence. Nudge it and listen again.',
  'Okta: mute everything but two tracks. If that grooves, you have a song.',
  'Okta: steal from yourself — remix your old tracks.',
  'Okta: the MASTER button is polish, not rescue. Fix the pattern first.',
];

function emptyTracks(): TrackState[] {
  return KIT_SLOTS.map((k) => ({
    sampleId: k.id, pattern: new Array<boolean>(STEPS).fill(false),
    volume: 0.8, muted: false, pan: 0,
  }));
}

/** CELL SEAM — today: a real local generator that writes a musically
 *  sensible foundation (kick/snare/hat/bass locked to each other). This
 *  function is exactly where a real Cell/Nexus LLM call plugs in: same
 *  input (current state), same output (a new pattern set). */
function cellFoundation(seed = Date.now()): Record<string, boolean[]> {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const P = (): boolean[] => new Array<boolean>(STEPS).fill(false);
  const kick = P(), snare = P(), hat = P(), open = P(), clap = P(), bass = P(), lead = P(), fx = P();
  for (const i of [0, 4, 8, 12]) kick[i] = true;
  if (rnd() < 0.5) kick[10] = true; else kick[14] = true;             // one syncopated push
  snare[4] = true; snare[12] = true;
  if (rnd() < 0.35) clap[12] = true;                                  // layered backbeat sometimes
  for (let i = 0; i < STEPS; i += 2) hat[i] = true;
  hat[Math.floor(rnd() * 8) * 2] = false;                             // one gap breathes
  if (rnd() < 0.5) open[14] = true;
  for (const i of [0, 3, 8, 11]) if (rnd() < 0.85) bass[i] = true;    // follows the kick's pocket
  const leadHits = 2 + Math.floor(rnd() * 2);
  for (let n = 0; n < leadHits; n++) lead[(2 + Math.floor(rnd() * 6) * 2 + 1) % STEPS] = true;
  if (rnd() < 0.4) fx[15] = true;
  return { kick, snare, hat, open, clap, bass, lead, fx };
}

type View = 'studio' | 'library' | 'creator' | 'listen';
type Mode = 'build' | 'perform';

export default function StudioMode({
  onPublish,
  profile = { id: 'me', name: 'You' },
  spendShards,
}: {
  onPublish?: (payload: unknown) => void;
  profile?: { id: string; name: string };
  /** SHARDS SEAM — wire to the real economy; absent = allowed + logged. */
  spendShards?: (cost: number, reason: string) => Promise<boolean>;
}) {
  const engineRef = useRef<AudioEngine | null>(null);
  const modeRef = useRef<Mode>('build');
  const expectedRef = useRef<{ step: number; time: number }[]>([]);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('studio');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>('build');
  const [playhead, setPlayhead] = useState(-1);
  const [bpm, setBpm] = useState(92);
  const [swing, setSwing] = useState(0.15);
  const [tracks, setTracks] = useState<TrackState[]>(emptyTracks());
  const [kit, setKit] = useState<KitId>('street');
  const [unlockedKits, setUnlockedKits] = useState<KitId[]>(() => {
    try { return JSON.parse(localStorage.getItem('fel_studio_kits_v1') ?? '["street"]') as KitId[]; }
    catch { return ['street']; }
  });
  const [polished, setPolished] = useState(false);
  const [title, setTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [openEmbed, setOpenEmbed] = useState<string | null>(null);   // trackId whose embed is expanded
  const [remixOf, setRemixOf] = useState<TrackRecord['remixOf']>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [tip, setTip] = useState(OKTA_TIPS[0]);
  const [libraryRev, setLibraryRev] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [judgement, setJudgement] = useState('');

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const t = setInterval(() => setTip(OKTA_TIPS[Math.floor(Math.random() * OKTA_TIPS.length)]), 14000);
    return () => clearInterval(t);
  }, []);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    const eng = new AudioEngine({ bpm, steps: STEPS, tracks, swing });
    engineRef.current = eng;
    void (async () => {
      const buffers = await synthesizeKit('street');           // zero asset files
      for (const slot of KIT_SLOTS) {
        const b = buffers.get(slot.id);
        if (b) eng.loadBuffer(slot.id, slot.name, b, slot.category);
      }
      setReady(true);
    })();
    eng.onStep = (s) => setPlayhead(s);
    eng.onStepAudible = (s, t) => {
      if (modeRef.current !== 'perform') return;
      const exp = expectedRef.current;
      exp.push({ step: s, time: t });
      const cutoff = eng.context.currentTime - EXPIRE_S;
      while (exp.length && exp[0].time < cutoff) {
        exp.shift();
        setCombo(0);
        setJudgement('MISS');
      }
    };
    return () => eng.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setState({ bpm, steps: STEPS, tracks, swing });
  }, [bpm, tracks, swing]);

  const trySpend = useCallback(async (cost: number, reason: string): Promise<boolean> => {
    if (spendShards) return spendShards(cost, reason);
    console.info(`[FEL-STUDIO] SHARDS SEAM not wired — allowing "${reason}" (${cost}) for free`);
    return true;
  }, [spendShards]);

  const pickKit = async (id: KitId): Promise<void> => {
    if (!unlockedKits.includes(id)) {
      const ok = await trySpend(KIT_META[id].unlockShards, `unlock kit ${id}`);
      if (!ok) { say('Not enough Shards'); return; }
      const next = [...unlockedKits, id];
      setUnlockedKits(next);
      localStorage.setItem('fel_studio_kits_v1', JSON.stringify(next));
    }
    const buffers = await synthesizeKit(id);
    engineRef.current?.swapKit(buffers);
    setKit(id);
    say(`${KIT_META[id].label} kit loaded`);
  };

  const cellAssist = async (): Promise<void> => {
    const ok = await trySpend(CELL_ASSIST_COST, 'cell foundation');
    if (!ok) { say('Not enough Shards'); return; }
    const gen = cellFoundation();
    setTracks((prev) => prev.map((t) => ({ ...t, pattern: gen[t.sampleId] ?? t.pattern })));
    say('Cell laid a foundation — make it yours');
  };

  const toggleCell = (ti: number, si: number) =>
    setTracks((prev) => prev.map((t, i) =>
      i !== ti ? t : { ...t, pattern: t.pattern.map((v, j) => (j === si ? !v : v)) }));

  const togglePlay = (): void => {
    const eng = engineRef.current;
    if (!eng) return;
    if (playing) { eng.stop(); setPlaying(false); setPlayhead(-1); }
    else { eng.start(); setPlaying(true); }
  };

  const performTap = (): void => {
    const eng = engineRef.current;
    if (!eng || mode !== 'perform') return;
    const now = eng.context.currentTime;
    const exp = expectedRef.current;
    let best = -1, bestDt = EXPIRE_S;
    for (let i = 0; i < exp.length; i++) {
      const dt = Math.abs(now - exp[i].time);
      if (dt < bestDt) { bestDt = dt; best = i; }
    }
    if (best >= 0) {
      exp.splice(best, 1);
      const perfect = bestDt < 0.08;
      setScore((s) => s + (perfect ? 100 : 50) * (1 + Math.floor(combo / 5)));
      setCombo((c) => c + 1);
      setJudgement(perfect ? 'PERFECT' : 'GOOD');
    } else {
      setCombo(0);
      setJudgement('EARLY');
    }
  };

  const publishTrack = async (): Promise<void> => {
    const eng = engineRef.current;
    if (!eng || saving) return;
    if (!title.trim()) { say('Name your track first'); return; }
    setSaving(true);
    try {
      const blob = await eng.renderMixdown(2);
      const dataUrl = await blobToDataUrl(blob);
      // optional: the creator's own authorized Spotify/Apple version rides
      // along and plays via the OFFICIAL embed in the library
      const link = streamUrl.trim() ? parseStreamingUrl(streamUrl) : null;
      if (streamUrl.trim() && !link) { say('Streaming link not recognized — publish without it or fix the URL'); setSaving(false); return; }
      const rec = StudioLibrary.publish({
        title: title.trim(), authorId: profile.id, authorName: profile.name,
        kit, bpm, swing, polished,
        sequencer: { bpm, steps: STEPS, tracks, swing },
        mixdownDataUrl: dataUrl, remixOf,
        streamingLinks: link ? [link] : [],
      });
      onPublish?.(rec);                       // Creator Card pipeline hook (M28 contract)
      setLibraryRev((r) => r + 1);
      say(`"${rec.title}" published to the Academy library`);
      setTitle(''); setStreamUrl('');
    } finally {
      setSaving(false);
    }
  };

  const playRecord = (t: TrackRecord): void => {
    playerRef.current?.pause();
    const el = new Audio(t.mixdownDataUrl);
    playerRef.current = el;
    void el.play();
    StudioLibrary.countPlay(t.id);
    setLibraryRev((r) => r + 1);
  };

  const startRemix = (t: TrackRecord): void => {
    const r = StudioLibrary.beginRemix(t.id);
    if (!r) return;
    setTracks(r.sequencer.tracks);
    setBpm(r.bpm); setSwing(r.swing); setRemixOf(r.remixOf);
    void pickKit(r.kit);
    setView('studio');
    say(`Remixing "${t.title}" — credit stays with ${t.authorName}`);
  };

  // ── styles (warm music-school palette; deliberately NOT the neon bezel) ──
  const S: Record<string, React.CSSProperties> = {
    root: { fontFamily: 'inherit', color: '#f5ead9', background: 'linear-gradient(165deg,#2a1a3a 0%,#3a1f2e 55%,#402a18 100%)', minHeight: '100%', padding: 16, borderRadius: 12 },
    header: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 },
    h1: { fontSize: 22, fontWeight: 800, letterSpacing: 1, color: '#ffd75e' },
    tabs: { display: 'flex', gap: 8, margin: '10px 0' },
    tab: { padding: '6px 14px', borderRadius: 20, border: '1px solid #7a5c9e', background: 'transparent', color: '#e8d9c2', cursor: 'pointer' },
    tabOn: { background: '#7a5c9e', color: '#fff' },
    grid: { display: 'grid', gridTemplateColumns: `90px repeat(${STEPS}, 1fr)`, gap: 3, marginTop: 8 },
    cell: { aspectRatio: '1', borderRadius: 4, border: '1px solid #5a4470', background: '#33244a', cursor: 'pointer' },
    cellOn: { background: '#ffb347', borderColor: '#ffd75e' },
    cellHead: { outline: '2px solid #22d3ee' },
    label: { fontSize: 11, alignSelf: 'center', opacity: 0.9 },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ffb347', color: '#2a1a10', fontWeight: 700, cursor: 'pointer' },
    btnAlt: { padding: '8px 14px', borderRadius: 8, border: '1px solid #ffb347', background: 'transparent', color: '#ffd75e', cursor: 'pointer' },
    mentor: { marginTop: 12, padding: '8px 12px', borderLeft: '3px solid #ffd75e', background: 'rgba(255,215,94,0.08)', fontStyle: 'italic', fontSize: 13 },
    card: { padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.25)', marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    toast: { position: 'sticky', bottom: 8, marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#7a5c9e', color: '#fff', width: 'fit-content' },
  };

  const allTracks = StudioLibrary.list();
  const creators = [...new Map(allTracks.map((t) => [t.authorId, t.authorName])).entries()];
  void libraryRev;                                        // read to re-render on library writes

  if (!ready) return <div style={S.root}>Tuning the Academy's instruments…</div>;

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.h1}>FEL MUSIC ACADEMY</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>the studio floor is yours</div>
      </div>

      <div style={S.tabs}>
        {(['studio', 'library', 'listen'] as View[]).map((v) => (
          <button key={v} style={{ ...S.tab, ...(view === v ? S.tabOn : {}) }}
            onClick={() => { setView(v); setCreatorId(null); }}>
            {v === 'studio' ? 'STUDIO' : v === 'library' ? 'LIBRARY' : 'LISTEN'}
          </button>
        ))}
        {view === 'creator' && creatorId && (
          <span style={{ ...S.tab, ...S.tabOn }}>CREATOR</span>
        )}
      </div>

      {view === 'listen' && <StreamingDeck />}

      {view === 'studio' && (
        <>
          {remixOf && (
            <div style={{ fontSize: 12, color: '#22d3ee', marginBottom: 6 }}>
              remixing "{remixOf.title}" by {remixOf.authorName}
            </div>
          )}
          <div style={S.grid}>
            {tracks.map((t, ti) => (
              <React.Fragment key={t.sampleId}>
                <div style={S.label}>{KIT_SLOTS[ti]?.name ?? t.sampleId}</div>
                {t.pattern.map((on, si) => (
                  <div key={si}
                    style={{ ...S.cell, ...(on ? S.cellOn : {}), ...(playhead === si ? S.cellHead : {}) }}
                    onClick={() => toggleCell(ti, si)} />
                ))}
              </React.Fragment>
            ))}
          </div>

          <div style={S.row}>
            <button style={S.btn} onClick={togglePlay}>{playing ? 'STOP' : 'PLAY'}</button>
            <button style={{ ...S.btnAlt, ...(polished ? { background: '#ffb347', color: '#2a1a10' } : {}) }}
              onClick={() => { const on = !polished; setPolished(on); engineRef.current?.masterPolish(on); }}>
              MASTER {polished ? 'ON' : 'OFF'}
            </button>
            <label style={{ fontSize: 12 }}>BPM {bpm}
              <input type="range" min={60} max={160} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
            </label>
            <label style={{ fontSize: 12 }}>SWING {(swing * 100) | 0}%
              <input type="range" min={0} max={40} value={swing * 100} onChange={(e) => setSwing(Number(e.target.value) / 100)} />
            </label>
            <button style={S.btnAlt} onClick={() => void cellAssist()}>
              ✦ CELL: LAY A FOUNDATION ({CELL_ASSIST_COST} Shards)
            </button>
          </div>

          <div style={S.row}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>KITS:</span>
            {(Object.keys(KIT_META) as KitId[]).map((k) => (
              <button key={k}
                style={{ ...S.btnAlt, ...(kit === k ? { background: '#7a5c9e', color: '#fff', borderColor: '#7a5c9e' } : {}) }}
                onClick={() => void pickKit(k)}>
                {KIT_META[k].label}{unlockedKits.includes(k) ? '' : ` · ${KIT_META[k].unlockShards}◈`}
              </button>
            ))}
          </div>

          <div style={S.row}>
            <button style={{ ...S.tab, ...(mode === 'build' ? S.tabOn : {}) }} onClick={() => setMode('build')}>BUILD</button>
            <button style={{ ...S.tab, ...(mode === 'perform' ? S.tabOn : {}) }} onClick={() => { setMode('perform'); setScore(0); setCombo(0); }}>PERFORM</button>
            {mode === 'perform' && (
              <>
                <button style={S.btn} onClick={performTap}>TAP</button>
                <span style={{ fontSize: 13 }}>score {score} · combo x{combo} · {judgement}</span>
              </>
            )}
          </div>

          <div style={S.row}>
            <input placeholder="track title…" value={title} onChange={(e) => setTitle(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }} />
            <input placeholder="your Spotify/Apple link (optional)…" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9', minWidth: 220 }} />
            <button style={S.btn} disabled={saving} onClick={() => void publishTrack()}>
              {saving ? 'RENDERING…' : 'PUBLISH TO LIBRARY'}
            </button>
          </div>

          <div style={S.mentor}>{tip}</div>
        </>
      )}

      {(view === 'library' || view === 'creator') && (
        <>
          {view === 'library' && (
            <div style={S.row}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>CREATORS:</span>
              {creators.length === 0 && <span style={{ fontSize: 12, opacity: 0.6 }}>nothing published yet — be first</span>}
              {creators.map(([id, name]) => (
                <button key={id} style={S.btnAlt} onClick={() => { setCreatorId(id); setView('creator'); }}>
                  {name} ({StudioLibrary.byAuthor(id).length})
                </button>
              ))}
            </div>
          )}
          {(view === 'creator' && creatorId ? StudioLibrary.byAuthor(creatorId) : allTracks).map((t) => (
            <div key={t.id} style={S.card}>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700 }}>{t.title}</div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  {t.authorName} · {KIT_META[t.kit].label} · {t.bpm}bpm{t.polished ? ' · mastered' : ''}
                  {t.remixOf ? ` · remix of "${t.remixOf.title}"` : ''}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{t.plays} plays · {t.saves} saves</div>
              </div>
              <button style={S.btn} onClick={() => playRecord(t)}>▶ PLAY</button>
              <button style={S.btnAlt} onClick={() => { StudioLibrary.saveToMyLibrary(t.id); setLibraryRev((r) => r + 1); say('Saved to your library'); }}>
                {StudioLibrary.mySavedIds().includes(t.id) ? 'SAVED ✓' : '+ SAVE'}
              </button>
              <button style={S.btnAlt} onClick={() => startRemix(t)}>REMIX</button>
              {(t.streamingLinks ?? []).map((l) => (
                <button key={l.url}
                  style={{ ...S.btnAlt, borderColor: PROVIDER_META[l.provider].color, color: PROVIDER_META[l.provider].color }}
                  onClick={() => setOpenEmbed(openEmbed === t.id ? null : t.id)}>
                  ▶ {PROVIDER_META[l.provider].label.toUpperCase()}
                </button>
              ))}
              {openEmbed === t.id && (t.streamingLinks ?? []).length > 0 && (
                <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden' }}>
                  <iframe
                    title={`${t.title} — streaming`}
                    src={t.streamingLinks[0].embedUrl}
                    width="100%" height={152} frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy" style={{ display: 'block' }} />
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}
