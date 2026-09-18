// MarketplaceHub — the storefront UI (M60). Three floors: SHOP (browse &
// buy with Shards, read/listen/view what you own), SELL (list art/
// audiobooks/music; write books in the AUTHOR desk with the 20-chapter
// engine), and MY SHELF (everything purchased). KDP export on any book you
// authored — see Marketplace.exportForKdp for why export-not-API is the
// correct Amazon design.

import React, { useState } from 'react';
import {
  Marketplace, exportForKdp, downloadPackage,
  type ListingKind, type MarketListing,
} from './Marketplace';
import {
  draftOutline, draftChapterScaffold,
  OUTLINE_COST_SHARDS, CHAPTER_DRAFT_COST_SHARDS, type BookOutline,
} from './AuthorStudio';
import { hasAllAccess, type PassState } from '../shared/allAccessPass';

type Floor = 'shop' | 'sell' | 'shelf' | 'author';
const KINDS: { id: ListingKind; label: string }[] = [
  { id: 'book', label: 'BOOKS' }, { id: 'audiobook', label: 'AUDIOBOOKS' },
  { id: 'art', label: 'ART' }, { id: 'music', label: 'MUSIC' },
];

export default function MarketplaceHub({
  profile = { id: 'me', name: 'You' },
  pass = null,
  spendShards,
  playStudioTrack,
}: {
  profile?: { id: string; name: string };
  pass?: PassState | null;
  /** ECONOMY SEAM — same contract as the Studio's. Absent = allowed + logged. */
  spendShards?: (cost: number, reason: string) => Promise<boolean>;
  /** Optional bridge to StudioLibrary playback for music listings. */
  playStudioTrack?: (trackId: string) => void;
}) {
  const [floor, setFloor] = useState<Floor>('shop');
  const [kind, setKind] = useState<ListingKind>('book');
  const [rev, setRev] = useState(0);
  const [note, setNote] = useState('');
  const [reading, setReading] = useState<MarketListing | null>(null);
  // sell form
  const [title, setTitle] = useState('');
  const [blurb, setBlurb] = useState('');
  const [price, setPrice] = useState(150);
  const [fileData, setFileData] = useState<string | null>(null);
  const [trackId, setTrackId] = useState('');
  // author desk
  const [topic, setTopic] = useState('');
  const [outline, setOutline] = useState<BookOutline | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  void rev;

  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 2600); };
  const trySpend = async (cost: number, reason: string): Promise<boolean> => {
    if (spendShards) return spendShards(cost, reason);
    console.info(`[FEL-MARKET] SHARDS SEAM not wired — allowing "${reason}" (${cost}) for free`);
    return true;
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setFileData(r.result as string);
    r.readAsDataURL(f);
  };

  const publishListing = (): void => {
    if (!title.trim()) { say('Title first'); return; }
    if (kind === 'book') { say('Books publish from the AUTHOR desk'); return; }
    if ((kind === 'art' || kind === 'audiobook') && !fileData) { say('Attach your file'); return; }
    if (kind === 'music' && !trackId.trim()) { say('Paste a Studio track id (from the Academy library)'); return; }
    Marketplace.publish({
      kind, title: title.trim(), blurb: blurb.trim(),
      sellerId: profile.id, sellerName: profile.name, sellerHasPass: hasAllAccess(pass),
      creatorCardId: null,
      priceShards: Math.max(10, price | 0),
      payload: kind === 'art' ? { imageDataUrl: fileData! }
        : kind === 'audiobook' ? { audioDataUrl: fileData! }
        : { studioTrackId: trackId.trim() },
    });
    setTitle(''); setBlurb(''); setFileData(null); setTrackId(''); setRev((r) => r + 1);
    say('Listed!');
  };

  const publishBook = (): void => {
    if (!outline) return;
    const done = outline.chapters.filter((c) => c.text.trim().length > 0);
    if (done.length < 3) { say('Write at least 3 chapters before listing'); return; }
    Marketplace.publish({
      kind: 'book', title: title.trim() || `The ${outline.topic} Book`, blurb: blurb.trim() || outline.topic,
      sellerId: profile.id, sellerName: profile.name, sellerHasPass: hasAllAccess(pass),
      creatorCardId: null, priceShards: Math.max(10, price | 0),
      payload: { chapters: outline.chapters.filter((c) => c.text.trim()) },
    });
    setRev((r) => r + 1);
    say(`Listed with ${done.length} chapters — KDP export is on the card`);
  };

  const buy = async (l: MarketListing): Promise<void> => {
    const receipt = await Marketplace.buy(l.id, trySpend, l.sellerHasPass ? { active: true, currentPeriodEnd: null, cancelAtPeriodEnd: false } : null);
    if (!receipt) { say('Purchase failed'); return; }
    setRev((r) => r + 1);
    say(`Yours! Seller nets ${receipt.sellerNetShards}◈`);
  };

  const startOutline = async (): Promise<void> => {
    if (!topic.trim()) { say('Give Cell a topic'); return; }
    const ok = await trySpend(OUTLINE_COST_SHARDS, 'book outline');
    if (!ok) { say('Not enough Shards'); return; }
    setOutline(draftOutline(topic));
    setChapterIdx(0);
    say('20 chapters, structured — now make them yours');
  };

  const scaffoldChapter = async (): Promise<void> => {
    if (!outline) return;
    const ok = await trySpend(CHAPTER_DRAFT_COST_SHARDS, `chapter ${chapterIdx + 1} scaffold`);
    if (!ok) { say('Not enough Shards'); return; }
    const text = draftChapterScaffold(outline, chapterIdx);
    setOutline({
      ...outline,
      chapters: outline.chapters.map((c, i) => (i === chapterIdx && !c.text.trim() ? { ...c, text } : c)),
    });
  };

  const S: Record<string, React.CSSProperties> = {
    root: { color: '#f2ecdf', background: 'linear-gradient(160deg,#231a2e 0%,#2e2417 60%,#1c2430 100%)', padding: 16, borderRadius: 12 },
    h1: { fontSize: 20, fontWeight: 800, color: '#e8b84a' },
    tabs: { display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' },
    tab: { padding: '6px 14px', borderRadius: 20, border: '1px solid #8a6d3a', background: 'transparent', color: '#e8dcc2', cursor: 'pointer' },
    tabOn: { background: '#8a6d3a', color: '#fff' },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
    input: { padding: 8, borderRadius: 8, border: '1px solid #8a6d3a', background: '#1c1526', color: '#f2ecdf' },
    btn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#e8b84a', color: '#241a08', fontWeight: 700, cursor: 'pointer' },
    btnAlt: { padding: '8px 14px', borderRadius: 8, border: '1px solid #e8b84a', background: 'transparent', color: '#e8b84a', cursor: 'pointer' },
    card: { padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.28)', marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    reader: { marginTop: 10, padding: 14, borderRadius: 10, background: '#171220', maxHeight: 380, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 14, width: '100%' },
    area: { width: '100%', minHeight: 160, padding: 10, borderRadius: 8, border: '1px solid #8a6d3a', background: '#1c1526', color: '#f2ecdf', fontFamily: 'inherit' },
    note: { marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#8a6d3a', color: '#fff', width: 'fit-content' },
  };

  const listings = Marketplace.list(floor === 'shop' ? kind : undefined);

  return (
    <div style={S.root}>
      <div style={S.h1}>THE FEL MARKETPLACE</div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>books · audiobooks · art · music — creator to creator, priced in Shards</div>

      <div style={S.tabs}>
        {([['shop', 'SHOP'], ['sell', 'SELL'], ['author', 'AUTHOR DESK'], ['shelf', 'MY SHELF']] as [Floor, string][]).map(([f, label]) => (
          <button key={f} style={{ ...S.tab, ...(floor === f ? S.tabOn : {}) }} onClick={() => { setFloor(f); setReading(null); }}>
            {label}
          </button>
        ))}
      </div>

      {floor === 'shop' && (
        <>
          <div style={S.tabs}>
            {KINDS.map((k) => (
              <button key={k.id} style={{ ...S.tab, ...(kind === k.id ? S.tabOn : {}) }} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
          </div>
          {listings.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>nothing listed yet — the SELL floor awaits</div>}
          {listings.map((l) => (
            <div key={l.id} style={S.card}>
              {l.payload.imageDataUrl && <img src={l.payload.imageDataUrl} alt={l.title} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />}
              <div style={{ minWidth: 150 }}>
                <div style={{ fontWeight: 700 }}>{l.title}{l.sellerHasPass ? ' ✦' : ''}</div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>{l.sellerName} · {l.kind} · {l.sales} sold</div>
                <div style={{ fontSize: 12 }}>{l.blurb}</div>
              </div>
              <div style={{ fontWeight: 800, color: '#e8b84a' }}>{l.priceShards}◈</div>
              {Marketplace.owned(l.id) || l.sellerId === profile.id ? (
                <>
                  {l.kind === 'book' && <button style={S.btn} onClick={() => setReading(reading?.id === l.id ? null : l)}>READ</button>}
                  {l.kind === 'audiobook' && l.payload.audioDataUrl && <audio controls src={l.payload.audioDataUrl} style={{ height: 32 }} />}
                  {l.kind === 'music' && l.payload.studioTrackId && (
                    <button style={S.btn} onClick={() => playStudioTrack?.(l.payload.studioTrackId!)}>▶ PLAY</button>
                  )}
                  {l.kind === 'book' && l.sellerId === profile.id && (
                    <button style={S.btnAlt} onClick={() => { const f = exportForKdp(l); if (f) { downloadPackage(f); say('KDP package downloaded — see the checklist'); } }}>
                      ⇩ KDP EXPORT
                    </button>
                  )}
                </>
              ) : (
                <button style={S.btn} onClick={() => void buy(l)}>BUY</button>
              )}
            </div>
          ))}
          {reading?.payload.chapters && (
            <div style={S.reader}>
              {reading.payload.chapters.map((c, i) => `CHAPTER ${i + 1}: ${c.title}\n\n${c.text}\n\n`).join('')}
            </div>
          )}
        </>
      )}

      {floor === 'sell' && (
        <>
          <div style={S.tabs}>
            {KINDS.filter((k) => k.id !== 'book').map((k) => (
              <button key={k.id} style={{ ...S.tab, ...(kind === k.id ? S.tabOn : {}) }} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
            <span style={{ fontSize: 12, opacity: 0.7, alignSelf: 'center' }}>books → AUTHOR DESK</span>
          </div>
          <div style={S.row}>
            <input style={S.input} placeholder="title…" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input style={{ ...S.input, minWidth: 220 }} placeholder="one-line blurb…" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
            <label style={{ fontSize: 12 }}>price ◈
              <input style={{ ...S.input, width: 80, marginLeft: 6 }} type="number" min={10} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </label>
          </div>
          <div style={S.row}>
            {(kind === 'art' || kind === 'audiobook') && (
              <label style={S.btnAlt}>
                {fileData ? 'FILE ATTACHED ✓' : kind === 'art' ? 'ATTACH IMAGE' : 'ATTACH AUDIO'}
                <input type="file" accept={kind === 'art' ? 'image/*' : 'audio/*'} hidden onChange={pickFile} />
              </label>
            )}
            {kind === 'music' && (
              <input style={{ ...S.input, minWidth: 240 }} placeholder="Studio track id (trk_…)" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
            )}
            <button style={S.btn} onClick={publishListing}>LIST IT</button>
          </div>
        </>
      )}

      {floor === 'author' && (
        <>
          {!outline ? (
            <div style={S.row}>
              <input style={{ ...S.input, minWidth: 240 }} placeholder="what's the book about?" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <button style={S.btn} onClick={() => void startOutline()}>
                ✦ CELL: 20-CHAPTER OUTLINE ({OUTLINE_COST_SHARDS}◈)
              </button>
            </div>
          ) : (
            <>
              <div style={S.row}>
                <select style={S.input} value={chapterIdx} onChange={(e) => setChapterIdx(Number(e.target.value))}>
                  {outline.chapters.map((c, i) => (
                    <option key={i} value={i}>{i + 1}. {c.title}{c.text.trim() ? ' ✓' : ''}</option>
                  ))}
                </select>
                <button style={S.btnAlt} onClick={() => void scaffoldChapter()}>
                  ✦ SCAFFOLD THIS CHAPTER ({CHAPTER_DRAFT_COST_SHARDS}◈)
                </button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                BEAT: {outline.chapters[chapterIdx]?.beat}
              </div>
              <textarea style={S.area} value={outline.chapters[chapterIdx]?.text ?? ''}
                placeholder="write here — the beat above is this chapter's job…"
                onChange={(e) => setOutline({
                  ...outline,
                  chapters: outline.chapters.map((c, i) => (i === chapterIdx ? { ...c, text: e.target.value } : c)),
                })} />
              <div style={S.row}>
                <input style={S.input} placeholder="book title…" value={title} onChange={(e) => setTitle(e.target.value)} />
                <input style={{ ...S.input, minWidth: 200 }} placeholder="blurb…" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
                <label style={{ fontSize: 12 }}>price ◈
                  <input style={{ ...S.input, width: 80, marginLeft: 6 }} type="number" min={10} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
                </label>
                <button style={S.btn} onClick={publishBook}>LIST THE BOOK</button>
              </div>
            </>
          )}
        </>
      )}

      {floor === 'shelf' && (
        <>
          {Marketplace.myPurchases().length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>nothing yet — the SHOP floor awaits</div>}
          {Marketplace.myPurchases().map((p) => {
            const l = Marketplace.get(p.listingId);
            if (!l) return null;
            return (
              <div key={p.listingId + p.at} style={S.card}>
                <div style={{ minWidth: 150 }}>
                  <div style={{ fontWeight: 700 }}>{l.title}</div>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{l.kind} · bought for {p.paidShards}◈</div>
                </div>
                {l.kind === 'book' && <button style={S.btn} onClick={() => setReading(reading?.id === l.id ? null : l)}>READ</button>}
                {l.kind === 'audiobook' && l.payload.audioDataUrl && <audio controls src={l.payload.audioDataUrl} style={{ height: 32 }} />}
                {l.kind === 'art' && l.payload.imageDataUrl && <img src={l.payload.imageDataUrl} alt={l.title} style={{ width: 96, borderRadius: 8 }} />}
                {l.kind === 'music' && l.payload.studioTrackId && (
                  <button style={S.btn} onClick={() => playStudioTrack?.(l.payload.studioTrackId!)}>▶ PLAY</button>
                )}
              </div>
            );
          })}
          {reading?.payload.chapters && (
            <div style={S.reader}>
              {reading.payload.chapters.map((c, i) => `CHAPTER ${i + 1}: ${c.title}\n\n${c.text}\n\n`).join('')}
            </div>
          )}
        </>
      )}

      {note && <div style={S.note}>{note}</div>}
    </div>
  );
}
