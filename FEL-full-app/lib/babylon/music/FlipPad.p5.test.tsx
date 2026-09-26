// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real": the chop editor as the player drives it — the banks, the kits, CLEAR
// BANK, QUANTIZE, where SEND goes — driven with the repo's no-DOM helpers (tests/helpers/driveRender.ts): the real FlipPad,
// its real handlers, every change handed to onFlipChange and applied here as the room applies it. The Web Audio half is
// FlipPad.bakedBuffer / slicedPads (a fake context), and what a browser adds (pointer capture on the waveform, the
// audio clock) is driven for real by scripts/probes/_music-p5-flip-editor.mts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import FlipPad, { bakedBuffer, slicedPads, tickUpload, type FlipPadProps } from './FlipPad';
import { tickedUploadNote } from './uploadPrivacy';
import { padsFromSlices } from './Flip';
import { bankOf, emptyFlip, flipSampleId, withBank, type ProjectFlip, type ProjectFlipBank, type ProjectFlipRow, type ProjectFlipSource } from './StudioProject';
import { bakeChop, msToSamples, SNAP_MS } from './chopEdit';
import { drive, findAll, textOf, type Found } from '@/tests/helpers/driveRender';

const fel = (id: string): ProjectFlipSource => ({ id, label: id, kind: 'fel', note: 'FEL', url: `/audio/flip/audio/${id}.mp3` });
const mic: ProjectFlipSource = { id: 'mic_1', label: 'mic take', kind: 'own', note: 'mine', audio: { key: 'aud_mic', mime: 'audio/webm', bytes: 9 } };
const bank = (source: ProjectFlipSource, n = 4): ProjectFlipBank => ({
  source, slicing: 'grid', gridN: n, chops: padsFromSlices(Array.from({ length: n }, (_, i) => ({ start: i * 100, end: (i + 1) * 100 }))), rate: 48000,
});
const row = (pad: number, over: Partial<ProjectFlipRow> = {}): ProjectFlipRow => ({
  sampleId: flipSampleId(pad), pad, label: `FLIP ${pad + 1}`, source: fel('loop_ep_soul'), slice: { start: 0, end: 100 }, reverse: false, pitch: 0, gate: true, ...over,
});
const qa = (tree: unknown, id: string): Found[] => findAll(tree as never, (el) => el.props['data-qa'] === id);
const btn = (tree: unknown, re: RegExp): Found => {
  const hits = findAll(tree as never, (el) => el.type === 'button' && re.test(textOf(el.props.children)));
  if (hits.length !== 1) throw new Error(`expected one button ${re}, found ${hits.length}`);
  return hits[0];
};

/** A FlipPad whose FLIP state lives here, changed the way the room changes it (onFlipChange's function applied). */
function harness(flip0: ProjectFlip, extra: Partial<FlipPadProps> = {}) {
  const box = { flip: flip0, said: [] as string[], changes: 0 };
  const props = (): FlipPadProps => ({
    engine: null, playing: false, playhead: -1, steps: 16, flip: box.flip, projectId: 'prj_t',
    onFlipChange: (fn) => { box.flip = fn(box.flip); box.changes++; },
    loadSource: () => new Promise(() => undefined), saveAudio: () => Promise.reject(new Error('no')),
    onAssign: () => undefined, onRecordHit: () => undefined, say: (m) => { box.said.push(m); },
    ...extra,
  });
  return { box, render: () => FlipPad(props()) as React.ReactElement };
}

describe('four banks on the FLIP tab', () => {
  const two = (): ProjectFlip => withBank(withBank(emptyFlip(), 0, bank(fel('theme_a_sunday_tape'))), 2, bank(mic, 3));
  it('A–D chips, a dot on the banks that hold a sound; the pads and the line show the bank picked', () => {
    const h = harness(two());
    const { html, tree } = drive(h.render);
    expect(['A', 'B', 'C', 'D'].map((l) => textOf(qa(tree, `flip-bank-${l}`)[0].props.children))).toEqual(['A •', 'B', 'C •', 'D']);
    expect(qa(tree, 'flip-bank-A')[0].props['aria-pressed']).toBe(true);
    expect(html).toContain('bank A · theme_a_sunday_tape · 4 slices');
    const c = drive(h.render, [(t) => qa(t, 'flip-bank-C')[0].props.onClick()]);
    expect(c.html).toContain('bank C · mic take · 3 slices');
    expect(qa(c.tree, 'flip-bank-C')[0].props['aria-pressed']).toBe(true);
    expect(h.box.changes).toBe(0);                                            // picking a bank is a view, not an edit
  });
  it('CLEAR BANK empties only the bank on the pads (an undo step); the others keep their sounds', () => {
    const h = harness(two());
    drive(h.render, [(t) => qa(t, 'flip-bank-C')[0].props.onClick(), (t) => qa(t, 'flip-clear-bank')[0].props.onClick()]);
    // bank C holds the player's own mic take, but nothing else keeps it → the replace guard asks first
    expect(h.box.changes).toBe(0);
    const asked = drive(h.render, [(t) => qa(t, 'flip-bank-C')[0].props.onClick(), (t) => qa(t, 'flip-clear-bank')[0].props.onClick(), (t) => qa(t, 'flip-replace-yes')[0].props.onClick()]);
    expect(asked.html).toContain('bank C · no source loaded');
    expect(bankOf(h.box.flip, 2).source).toBeNull();
    expect(bankOf(h.box.flip, 0).source?.id).toBe('theme_a_sunday_tape');
  });
});

describe('chop kits', () => {
  it('SAVE BANK AS KIT keeps the bank under a name; LOAD → B puts a copy on bank B; × deletes it', () => {
    const h = harness(withBank(emptyFlip(), 0, bank(fel('loop_bass_riff'), 5)));
    drive(h.render, [(t) => qa(t, 'flip-kit-name')[0].props.onChange({ target: { value: 'Pocket chops' } }), (t) => qa(t, 'flip-kit-save')[0].props.onClick()]);
    expect(h.box.flip.kits?.map((k) => k.name)).toEqual(['Pocket chops']);
    expect(h.box.said.at(-1)).toContain('Bank A saved as the kit "Pocket chops"');
    const loaded = drive(h.render, [(t) => qa(t, 'flip-bank-B')[0].props.onClick(), (t) => btn(t, /LOAD → B/).props.onClick()]);
    expect(bankOf(h.box.flip, 1).source?.id).toBe('loop_bass_riff');
    expect(bankOf(h.box.flip, 1).chops.filter((c) => c.slice)).toHaveLength(5);
    expect(loaded.html).toContain('bank B · loop_bass_riff · 5 slices');
    drive(h.render, [(t) => btn(t, /^×$/).props.onClick()]);
    expect(h.box.flip.kits).toBeUndefined();
  });
  it('an empty bank has nothing to save', () => {
    const h = harness(emptyFlip());
    const { tree } = drive(h.render);
    expect(qa(tree, 'flip-kit-save')[0].props.disabled).toBe(true);
  });
});

describe('where SEND goes, and QUANTIZE', () => {
  const flip = (): ProjectFlip => withBank(withBank(emptyFlip(), 0, bank(fel('a'))), 1, bank(fel('b')));
  const pressPad = (t: React.ReactElement, i: number) => findAll(t, (el) => el.props['aria-label'] === `pad ${i}` || el.props['aria-label'] === `pad ${i} (bank B)`)[0].props.onPointerDown({ preventDefault: () => undefined });
  it('bank A\'s pad 4 replaces the row it made; bank B\'s pad 4 gets its own row', () => {
    const h = harness(flip(), { flipRows: [row(3)], trackIds: new Set(['flip_3']) });
    const a = drive(h.render, [(t) => pressPad(t, 4)]);
    expect(textOf(qa(a.tree, 'flip-send')[0].props.children)).toBe('REPLACE ROW FLIP 4');
    const b = drive(h.render, [(t) => qa(t, 'flip-bank-B')[0].props.onClick(), (t) => pressPad(t, 4)]);
    expect(textOf(qa(b.tree, 'flip-send')[0].props.children)).toBe('SEND TO TRACK');
    expect(b.html).toContain('PAD B4');
  });
  it('QUANTIZE is on until the player turns it off', () => {
    const h = harness(flip());
    const on = drive(h.render);
    expect(textOf(qa(on.tree, 'flip-quantize')[0].props.children)).toBe('QUANTIZE ON');
    const off = drive(h.render, [(t) => qa(t, 'flip-quantize')[0].props.onClick()]);
    expect(textOf(qa(off.tree, 'flip-quantize')[0].props.children)).toBe('QUANTIZE OFF');
  });
});

describe('the Web Audio half', () => {
  const fakeCtx = () => {
    const made: { ch: number; len: number; sr: number; data?: Float32Array }[] = [];
    const ctx = { createBuffer: (ch: number, len: number, sr: number) => { const m = { ch, len, sr } as (typeof made)[number]; made.push(m); return { copyToChannel: (s: Float32Array) => { m.data = Float32Array.from(s); } }; } } as unknown as BaseAudioContext;
    return { ctx, made };
  };
  it('bakedBuffer is bakeChop in a mono buffer at the source\'s rate — the buffer a pad and its row both play', () => {
    const mono = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i / 7));
    const d = { buffer: { sampleRate: 8000 } as AudioBuffer, mono };
    const { ctx, made } = fakeCtx();
    const spec = { slice: { start: 100, end: 3100 }, pitch: 7, reverse: true, gate: true, rate: 8000 };
    bakedBuffer(ctx, d, spec);
    expect(made[0]).toMatchObject({ ch: 1, sr: 8000 });
    expect([...made[0].data!]).toEqual([...bakeChop(mono, spec, 8000)]);
  });
  it('slicedPads: a source with its own cuts (FEL cuts) is sliced on them, never the finder; the finder\'s cuts snap', () => {
    const mono = Float32Array.from({ length: 8000 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 8000));
    const cuts = [{ start: 0, end: 2000 }, null, { start: 2000, end: 8000 }];
    const d = { buffer: { sampleRate: 8000 } as AudioBuffer, mono, cuts };
    const p = slicedPads(d, 'cuts', 8);
    expect(p.slice(0, 3).map((x) => x.slice)).toEqual(cuts);
    const g = slicedPads({ ...d, cuts: undefined }, 'grid', 3);
    for (const s of g.filter((x) => x.slice).slice(1)) {
      expect(Math.abs(mono[s.slice!.start])).toBeLessThan(0.08);           // on (or beside) a zero crossing
      expect(Math.abs(s.slice!.start - [2666, 5333].reduce((a, b) => (Math.abs(b - s.slice!.start) < Math.abs(a - s.slice!.start) ? b : a)))).toBeLessThanOrEqual(msToSamples(SNAP_MS, 8000));
    }
  });
});

// The parts that are React + Web Audio, pinned where the room uses them (driven for real by the P5 probe).
describe('the room\'s wiring (source pins)', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const code = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const pad = code('lib/babylon/music/FlipPad.tsx');
  const room = code('lib/babylon/music/StudioMode.tsx');
  it('a pad plays its BAKED chop through its row\'s strip — no hard node.stop gate, no playbackRate pitch', () => {
    expect(pad).toContain('b = bakedBuffer(engine.context, live, spec);');
    expect(pad).toContain('node.connect(g).connect(engine.channelInput(flipSampleId(i)));');
    expect(pad).not.toContain('node.stop(');
    expect(pad).not.toContain('playbackRate');
    expect(pad).toContain('recordStep(clock.now - clock.latencySec, clock.marks,');
    expect(pad).toContain('<Waveform ');
  });
  it('a row is baked the same way after a reload; song mode swaps a section\'s own chops; sources the project no longer plays are let go', () => {
    expect(room).toContain('const b = bakedBuffer(eng.context, d, row);');
    expect(room).toContain('onSongNow={songNowChanged}');
    expect(room).toContain('next.sections = stampSectionChops(p.sections, next.sections, p.flipRows);');
    expect(room).toContain('pruneMap(sourceCache.current, liveSourceKeys(project));');
    // MUSIC-SUITE P5 FIX PASS: a retuned row reloads through reloadFlipRowSounds (chopSignature carries pitch and gate), and
    // then a playing section's own chops go back over the working ones
    expect(room).not.toContain('retunedRows');
    expect(room).toContain('resyncSection({ sections: to.sections, flipRows: to.flipRows });');
    expect(room).toContain('flipRows={project.flipRows} trackIds={flipTrackIds} stepClock={flipClock}');
    expect(room).not.toContain('chopBuffer(');
  });
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): PUBLISH rendered the grid with the section chops song mode swapped in last, and
  // RENDER SONG / STEMS gave every bar that section's — each render takes its Flip sounds now (studioEdit, AudioEngine)
  it('PUBLISH hands the render the working grid\'s chops; RENDER SONG / STEMS each bar\'s section\'s', () => {
    expect(room).toContain('const sounds = flipSoundMap(render.tracks, project.flipRows, (r) => chopCache.current.get(bakeKey(r)) ?? null);');
    expect(room).toContain('const blob = await eng.renderMixdown(2, render.tracks, render.swing, sounds);');
    expect(room).toContain('barSounds={songRenderSounds}');
    const song = code('lib/babylon/music/SongPanel.tsx');
    expect(song).toContain('const mix = await engine.renderSong(bars, shots, len, barSwing, sounds);');
    expect(song).toContain('const st = await engine.renderSongStems(bars, shots, len, barSwing, sounds);');
  });
  // MUSIC-SUITE P5 FIX PASS: the theme auto-loads once per PLAYER (flipPack.lessonAutoLoaded, tested there), and only into a
  // bank still empty when its decode lands (the probe caught it replacing the loop the player picked meanwhile)
  it('the lesson\'s theme auto-load: once per player, never over a sound picked while it decoded', () => {
    expect(pad).toContain('if (lessonAutoLoaded(lessonStore(), playerId)) return;');
    expect(pad).toContain('rememberLessonAutoLoaded(lessonStore(), playerId);');
    expect(pad).toContain('void loadFel(theme, true);');
    expect(pad).toContain('if (onlyIfEmpty && bankHasSound(bankOf(flipAllRef.current, startedBank))) return;');
  });
  it('song mode: a chop that can\'t be had leaves its row silent (never the chop before), and a SEND / recorded hit re-applies the section\'s own', () => {
    expect(room).toContain('const plan = planChopSwap(want, (k) => chopCache.current.get(k), swapFailed.current);');
    expect(room).toContain('for (const id of plan.silence) eng.unloadSample(id);');
    expect(room).toContain('resyncSection(withFlipRow(projectRef.current, chop.row));');
    expect(room).toContain('resyncSection(withFlipRow(projectRef.current, row));');
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): decision #15's tick for an upload from before it existed (P3 / P4 took YOUR FILE with
// no tick; the note was 'Uploaded by the player — their own recording.'), a public-domain source's credit, a long FEL cut.
describe('uploads from before the tick, public-domain credits, long FEL cuts', () => {
  const oldUpload: ProjectFlipSource = { id: 'own_1', label: 'beat.wav', kind: 'own', note: 'Uploaded by the player — their own recording.', audio: { key: 'aud_up', mime: 'audio/wav', bytes: 9 }, upload: true };
  const selectPad = (t: React.ReactElement) => findAll(t, (el) => el.props['aria-label'] === 'pad 1')[0].props.onPointerDown({ preventDefault: () => undefined });

  it('an old upload on the pads asks for the tick; SEND and SAVE KIT wait for it; the tick stamps every bank and kit that holds it', () => {
    const kitBank = bank(oldUpload, 2);
    const h = harness({ ...withBank(withBank(emptyFlip(), 0, bank(oldUpload)), 2, bank(oldUpload)), kits: [{ id: 'k1', name: 'mine', savedAt: 1, bank: kitBank }] });
    const before = drive(h.render, [selectPad]);
    expect(qa(before.tree, 'upload-tick-old')).toHaveLength(1);
    expect(before.html).toContain('was added before FEL asked');
    expect(qa(before.tree, 'flip-send')[0].props.disabled).toBe(true);
    drive(h.render, [(t) => qa(t, 'flip-kit-save')[0].props.onClick()]);
    expect(h.box.flip.kits).toHaveLength(1);                               // not saved
    expect(h.box.said.at(-1)).toMatch(/^Tick "I made this or I own the rights" for beat\.wav first/);
    drive(h.render, [(t) => qa(t, 'upload-tick-old-box')[0].props.onChange({ target: { checked: true } })]);
    expect(bankOf(h.box.flip, 0).source?.note).toMatch(/^Uploaded by the player, who ticked "I made this or I own the rights" \(\d{4}-\d{2}-\d{2}\)\.$/);
    expect(bankOf(h.box.flip, 2).source?.note).toBe(bankOf(h.box.flip, 0).source?.note);
    expect(h.box.flip.kits![0].bank.source?.note).toBe(bankOf(h.box.flip, 0).source?.note);
    expect(bankOf(h.box.flip, 0).source?.audio).toEqual(oldUpload.audio);  // the same bytes: its sound and its rows unchanged
    const after = drive(h.render, [selectPad]);
    expect(qa(after.tree, 'upload-tick-old')).toHaveLength(0);
    expect(qa(after.tree, 'flip-send')[0].props.disabled).toBe(false);
  });

  it('a new upload (made through the tick), a mic take or a FEL sound never asks', () => {
    for (const src of [{ ...oldUpload, note: tickedUploadNote(Date.UTC(2026, 8, 26)) }, mic, fel('loop_ep_soul')]) {
      expect(qa(drive(harness(withBank(emptyFlip(), 0, bank(src))).render).tree, 'upload-tick-old')).toHaveLength(0);
    }
  });

  it('tickUpload leaves other sources alone and hands back the same FLIP state when nothing needs it', () => {
    const f = withBank(withBank(emptyFlip(), 0, bank(oldUpload)), 1, bank(mic));
    const t = tickUpload(f, 'aud_up', Date.UTC(2026, 8, 26));
    expect(bankOf(t, 1)).toEqual(bankOf(f, 1));
    expect(tickUpload(t, 'aud_up', Date.UTC(2026, 8, 27))).toBe(t);
  });

  it('a public-domain source shows its performer, year and why it is free on the FLIP tab', () => {
    const pd: ProjectFlipSource = { id: 'pd_x', label: 'Livery Stable Blues', kind: 'public-domain', note: 'Original Dixieland Jass Band (1917), public domain in the US: a 1917 recording of a 1917 tune.', url: '/audio/pd/odjb_livery_1917.mp3' };
    const { tree, html } = drive(harness(withBank(emptyFlip(), 0, bank(pd))).render);
    expect(qa(tree, 'flip-pd-credit')).toHaveLength(1);
    expect(html).toContain('Original Dixieland Jass Band (1917), public domain in the US');
  });

  it('the source\'s key is on the FLIP line, and the selected pad\'s own key (moved by its pitch) beside it', () => {
    const b = bank({ ...fel('theme_a_sunday_tape'), key: 'Eb major' });
    const h = harness(withBank(emptyFlip(), 0, { ...b, chops: b.chops.map((c, i) => (i === 0 ? { ...c, pitch: 2 } : c)) }));
    const { tree, html } = drive(h.render, [selectPad]);
    expect(html).toContain('bank A · theme_a_sunday_tape · Eb major · 4 slices');
    expect(textOf(qa(tree, 'flip-chop-key')[0].props.children)).toContain('F major');
  });

  it('slicedPads on FEL cuts: a cut longer than the gate (1.2 s) starts gate-off, a short one gate-on', () => {
    const d = { buffer: { sampleRate: 8000 } as AudioBuffer, mono: new Float32Array(40000), cuts: [{ start: 0, end: 8000 }, { start: 8000, end: 40000 }] };
    expect(slicedPads(d, 'cuts', 8).slice(0, 2).map((p) => p.gate)).toEqual([true, false]);
  });
});
