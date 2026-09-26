// MUSIC-SUITE P3 (2026-09-25): how the Academy is wired to its project — FlipPad's pure helpers, and source pins for the
// parts that are React + Web Audio (driven for real in scripts/probes/_music-p3-autosave.mts, 28/28 in a browser).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chopBuffer, monoOf, sliceAtRate, slicesFor, sourceKey } from './FlipPad';

const ROOT = join(__dirname, '..', '..', '..');
/** The code, not the prose: comments out, so a comment NAMING the old bug never trips a pin. */
const code = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const fakeBuffer = (channels: number[][], sampleRate = 8000) => ({
  numberOfChannels: channels.length, length: channels[0].length, sampleRate,
  getChannelData: (c: number) => Float32Array.from(channels[c]),
});

describe('FlipPad helpers', () => {
  it('monoOf averages the channels', () => {
    expect([...monoOf(fakeBuffer([[1, 0, -1], [0, 0, 1]]))]).toEqual([0.5, 0, 0]);
    expect([...monoOf(fakeBuffer([[0.25, 0.5]]))]).toEqual([0.25, 0.5]);
  });

  it('a source is cached by its saved bytes first, then its first-party path, then its id', () => {
    expect(sourceKey({ id: 'mic_1', audio: { key: 'aud_x', mime: 'audio/webm', bytes: 3 } })).toBe('aud_x');
    expect(sourceKey({ id: 'fel_808_bass', url: '/audio/kits/808/bass.wav' })).toBe('/audio/kits/808/bass.wav');
    expect(sourceKey({ id: 'x' })).toBe('x');
  });

  it('slicesFor: GRID cuts n equal slices; chopBuffer is the slice (reversed when asked) at the source\'s rate', () => {
    const mono = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const d = { buffer: { sampleRate: 8000 } as AudioBuffer, mono };
    expect(slicesFor(d, 'grid', 4)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }, { start: 6, end: 8 }]);
    let made: { ch: number; len: number; sr: number; data?: Float32Array } | null = null;
    const ctx = {
      createBuffer: (ch: number, len: number, sr: number) => {
        made = { ch, len, sr };
        return { copyToChannel: (s: Float32Array) => { made!.data = Float32Array.from(s); } };
      },
    } as unknown as BaseAudioContext;
    chopBuffer(ctx, d, { start: 2, end: 5 }, true);
    expect(made).toMatchObject({ ch: 1, len: 3, sr: 8000 });
    expect([...made!.data!]).toEqual([4, 3, 2]);
    // MUSIC-SUITE P3 FIX PASS: a slice cut at 4 kHz, on a source decoded at 8 kHz, is the same moment — twice the samples
    chopBuffer(ctx, d, { start: 1, end: 2 }, false, 4000);
    expect([...made!.data!]).toEqual([2, 3]);
  });

  // MUSIC-SUITE P3 FIX PASS (2026-09-25): slice points are samples at the rate the source was decoded at, which follows
  // the output device (assumption: 48 kHz speakers, 44.1 kHz on some headsets); saved at one and reopened at the other, a
  // chop cut ~8.8 % late and long.
  it('sliceAtRate: a 48 kHz slice on a 44.1 kHz decode is the same stretch of sound; equal or unknown rates change nothing', () => {
    expect(sliceAtRate({ start: 48000, end: 96000 }, 48000, 44100)).toEqual({ start: 44100, end: 88200 });
    expect(sliceAtRate({ start: 10, end: 20 }, undefined, 44100)).toEqual({ start: 10, end: 20 });
    expect(sliceAtRate({ start: 10, end: 20 }, 44100, 44100)).toEqual({ start: 10, end: 20 });
    expect(sliceAtRate({ start: 0, end: 1 }, 96000, 8000)).toEqual({ start: 0, end: 1 });   // never an empty chop
  });
});

describe('the room keeps its work in the project (source pins)', () => {
  const studio = code('lib/babylon/music/StudioMode.tsx');
  const songPanel = code('lib/babylon/music/SongPanel.tsx');
  const flipPad = code('lib/babylon/music/FlipPad.tsx');
  const hook = code('lib/babylon/music/useStudioProject.ts');

  it('StudioMode: the grid, tempo, swing, kit, MASTER and credit are the project, not useState', () => {
    expect(studio).toContain('const room = useStudioProject(');
    expect(studio).toContain('const { bpm, swing, tracks, kit, remixOf } = project;');
    expect(studio).not.toMatch(/useState\(92\)|useState\(0\.15\)|useState<TrackState\[\]>/);
    // MUSIC-SUITE P3 FIX PASS: the project's kit is never useState — `playingKit` is the ENGINE's (what plays), by design
    expect(studio).not.toMatch(/const \[kit, setKit\] = useState/);
    expect(studio).toContain("const [playingKit, setPlayingKit] = useState<KitId>('street');");
    expect(studio).toContain('if (!ready || !room.restored || !started)');   // nothing is built on a grid a restore replaces
  });

  it('StudioMode: SongPanel stays mounted off the STUDIO tab; FlipPad restores from the project (and stays FLIP-only)', () => {
    expect(studio).toContain("<div data-qa=\"song-panel\" style={view === 'studio' ? undefined : { display: 'none' }}>");
    expect(studio).toMatch(/<SongPanel key=\{room\.generation\}/);
    expect(studio).toMatch(/\{view === 'flip' && \(\s*<>[\s\S]*?<FlipPad /);   // P2's pin: the pad keys never fire on STUDIO
    expect(studio).toContain('flip={project.flip} onFlipChange={flipChange} loadSource={loadFlipSource}');
  });

  it('a remix opens as its own project (it wrote over the open grid, which autosave would then have saved)', () => {
    const i = studio.indexOf('const startRemix = ');
    const body = studio.slice(i, studio.indexOf('\n  };', i));
    expect(body).toContain('room.ops.create({');
    expect(body).not.toMatch(/setTracks\(|setBpm\(|setSwing\(/);
  });

  it('SongPanel and FlipPad hold no persistent state of their own', () => {
    expect(songPanel).not.toMatch(/useState<SwungSection\[\]>|useState<SongChain>|useState<\(Take/);
    expect(songPanel).toContain('const { sections, chain, takes } = song;');
    expect(flipPad).not.toMatch(/useState<FlipSource \| null>|useState<Pad\[\]>|useState<'transient' \| 'grid'>/);
    expect(flipPad).toContain('const { source, slicing: mode, gridN, chops: pads } = flip;');
    // a restored source is never resliced by an effect (that would wipe its edited chops)
    expect(flipPad).not.toMatch(/useEffect\(\(\) => \{ if \(mono && buffer\) reslice/);
  });

  it('the dance export keeps the project\'s id and title (was \'My Track\' and a fresh id per mount)', () => {
    // MUSIC-SUITE P3 (tier-honesty-editing): the button moved to the room — the ladder opens it at the GRID, where the
    // song panel is not mounted — and the song it sends is decided per tier (DanceExport.danceSongAtTier)
    expect(studio).toContain('exportSongToDance({ id: project.id, name: project.title, bpm, steps: STEPS, ...danceSong })');
    expect(songPanel).not.toContain('exportSongToDance');
    expect(studio + songPanel).not.toContain("'My Track'");
    expect(songPanel).not.toMatch(/useRef\(`s\$\{Date\.now\(\)/);
  });

  it('the streak post is on only inside GameShell (the one host with ReplayInPlaceContext); /dev/music has none', () => {
    expect(hook).toContain('const canPost = useContext(ReplayInPlaceContext) !== null;');
    expect(hook).toContain('new CreationLog({ enabled: canPost && player !== GUEST_PLAYER,');   // P3 FIX PASS: and a known player
    expect(code('components/games/game-shell.tsx')).toContain('<ReplayInPlaceContext.Provider value={registerReplay}>');
    expect(code('app/dev/music/loader.tsx')).not.toContain('ReplayInPlaceContext');
  });

  it('a save, a song render and a publish render each count toward the day\'s creation session', () => {
    expect(hook).toMatch(/if \(s\.phase === 'saved'\) \{[^}]*creationRef\.current\?\.note\(\)/);
    expect(studio).toContain('onRendered={room.noteCreation}');
    // P3: the working grid — P3 FIX PASS: at the project's swing (studioEdit.publishRender)
    expect(studio).toMatch(/const render = publishRender\(project\);\s*const blob = await eng\.renderMixdown\(2, render\.tracks, render\.swing\);\s*room\.noteCreation\(\);/);
    expect(songPanel).toMatch(/say\(`Rendered[\s\S]*?onRendered\?\.\(\);/);
  });

  it('the tab going away, the room unmounting and another project opening all write what is pending', () => {
    expect(hook).toContain("document.addEventListener('visibilitychange', onVis);");
    expect(hook).toContain("window.addEventListener('pagehide', flush);");
    expect(hook).toMatch(/if \(a\) \{ void a\.flush\(\)/);
    // MUSIC-SUITE P3 FIX PASS: create, open and duplicate (of another project) go through readyToSwitch, which flushes
    // (a refused save included) and refuses the switch while the open project is still unsaved
    expect(hook).toMatch(/const readyToSwitch = useCallback\(async[\s\S]*?await a\.flush\(\);[\s\S]*?if \(a\.current\.phase !== 'error'\) return true;/);
    expect(hook.match(/await readyToSwitch\(sw, /g)?.length).toBe(3);
    // the tab coming back re-checks the open project; another tab's save is heard
    expect(hook).toContain("else void recheckRef.current();");
    expect(hook).toContain("window.addEventListener('pageshow', onShow);");
    expect(hook).toContain('new BroadcastChannel(STUDIO_CHANNEL)');
  });

  it('the unload rescue: pagehide keeps the unsaved tail synchronously; a restore reads it; a confirmed save spends it', () => {
    // MUSIC-SUITE P3 FIX PASS: the player's slot, with the base it was made on and what was in flight
    expect(hook).toContain("if (u) writeRescue(rescueStorage(persistentNow), u, Date.now(), { key: slot, base: a.storedAt ?? null, inflightAt: a.inflightAt, store: persistentNow ? 'indexeddb' : 'memory' });");
    // both slots are read (a memory-fallback page's sessionStorage rescue, on a load that got IndexedDB)
    expect(hook).toContain('const rescues = allRescueStorages().map((st) => readRescue(st, slot));');
    expect(hook).toContain("if (s.phase === 'saved') for (const st of allRescueStorages()) clearRescue(st, s.projectId, slot);");
    expect(hook).toContain('autosave.baseline(r.rescued ? null : r.project, r.storedAt);');   // a rescue is written at once, against its base
    expect(hook).toMatch(/await s\.deleteProject\(id, kept\(\)\);\s*dropRescue\(id\);/);   // a deleted project never comes back
  });

  it('MUSIC-SUITE P3 FIX PASS: the store is the player\'s, and a save carries its base', () => {
    expect(hook).toContain('const store = page.forPlayer(player);');
    expect(hook).toContain('save: (p, base) => store.saveProject(p, { open: true, base }),');
    expect(studio).toMatch(/useStudioProject\([^;]*playerId,\s*\}\);/);
  });
});

// MUSIC-SUITE P3 (2026-09-25), tier-honesty-editing: the wiring the pure rules (MusicTiers, studioEdit, DanceExport) and
// the engine selection (AudioEngine.selection.test.ts) depend on. Driven in a browser by scripts/probes/_music-p3-tiers.mts.
describe('what you hear is what you see, song mode, undo, tier gates (source pins)', () => {
  const studio = code('lib/babylon/music/StudioMode.tsx');
  const songPanel = code('lib/babylon/music/SongPanel.tsx');
  const flipPad = code('lib/babylon/music/FlipPad.tsx');

  it('the grid draws visibleRows (kit section + Flip section) and the engine plays the same rows', () => {
    expect(studio).not.toContain('tracks.slice(0, caps.tracks)');                       // the rule that hid the Flip rows
    expect(studio).toContain('const rows = visibleRows(gridTracks, caps);');
    expect(studio).toContain('data-qa="flip-grid"');
    expect(studio).toContain('useEffect(() => { engineRef.current?.setAudible(shownIds); }, [shownIds]);');
    expect(studio).toContain('eng.setAudible(shownIdsRef.current);');                   // the engine's first bar too
    expect(studio).toContain('onClick={() => toggleCell(t.sampleId, si)}');             // by row id, not by drawn index
  });

  it('song mode never writes the working grid; the room plays the grid again when it goes off', () => {
    expect(songPanel).not.toMatch(/setTracks|setSwing/);
    expect(songPanel).toContain('engine.setState({ bpm, steps, tracks: snapshotTracks(sec.tracks), swing: sw });');
    // MUSIC-SUITE P3 FIX PASS: the rule is studioEdit.playbackSource (tested by behaviour in studioEdit.test.ts)
    expect(studio).toMatch(/const src = playbackSource\(\{ preview: previewing, songMode, tracks, swing \}\);\s*if \(src\.tracks\) eng\.setState\(\{ bpm, steps: STEPS, tracks: src\.tracks, swing: src\.swing \}\);/);
    expect(studio).toContain('}, [bpm, tracks, swing, songMode, previewing]);');
    // and while song mode hides the working grid, the two buttons that snapshot it hold (they saved the hidden grid)
    expect(songPanel).toMatch(/const saveSection = \(\) => \{\s*if \(gridHidden\) \{ say\(HIDDEN_GRID_LINE\); return; \}/);
    expect(songPanel).toMatch(/const updateFromGrid = \(s: ProjectSection\): void => \{\s*if \(gridHidden\) \{ say\(HIDDEN_GRID_LINE\); return; \}/);
  });

  it('every grid, Flip-row, section and chain edit is an undo step; CLEAR asks first', () => {
    expect(studio).not.toMatch(/\bsetTracks\(/);                                        // every grid write goes through edit()
    expect(studio).toContain('edit((p) => ({ ...p, tracks: toggleStep(p.tracks, sampleId, si) }));');
    expect(studio).toContain("edit((p) => withFlipRow(p, row));");
    expect(studio).toMatch(/edit\(\(p\) => withFlipHit\([\s\S]*?'flip-rec'\);/);
    expect(studio).toContain('edit((p) => ({ ...p, ...fn({ sections: p.sections, chain: p.chain, takes: p.takes }) }))');
    expect(studio).toContain('data-qa="clear-confirm"');
    expect(studio).toContain("<button data-qa=\"clear\" style={S.btnAlt} disabled={!!gridLock || gridHitCount(tracks) === 0} onClick={() => setConfirmClear(true)}>CLEAR</button>");
  });

  it('CELL previews before the charge and lays exactly the preview', () => {
    expect(studio).toContain('setCellPreview(foundationPreview(cellFoundation(Date.now()), shownIds));');
    expect(studio).toContain('const preview = cellPreviewRef.current;');
    expect(studio).toContain('else layFoundation(preview);');
    expect(studio).toContain('data-qa="cell-preview"');
  });

  it('the tier gates follow MusicTiers: takes and the song render at `takes` / `mixdown`, the dance floor at `danceExport`', () => {
    expect(studio).toContain('caps={{ takes: caps.takes, mixdown: caps.mixdown }}');
    expect(songPanel).toContain('{caps.mixdown && (');
    expect(songPanel).toMatch(/\{\(caps\.takes \|\| takes\.length > 0\) && \(/);
    expect(studio).toContain('{caps.danceExport && danceSong && (');
    expect(studio).toContain('tierChips(progress)');
    expect(studio).toContain("if (patternCounts({ playing: playing && !hearPreview, tracks, def: caps })) noteProgress('pattern');");
  });

  it('publish and remix carry the Flip chops; the store keeps a published chop\'s audio', () => {
    expect(studio).toContain('const pub = publishTracks(tracks, project.flipRows, shownIds);');
    expect(studio).toContain('sequencer: { bpm, steps: STEPS, tracks: pub.tracks, swing },');
    expect(studio).toContain('const seed = remixSeed(r.sequencer.tracks);');
    expect(studio).toContain('flipRows: seed.flipRows,');
    // MUSIC-SUITE P3 FIX PASS: and the audio the undo history can bring back
    expect(studio).toContain('keepAudio: () => new Set([...publishedAudioKeys(StudioLibrary.list()), ...historyAudioKeys(historyRef.current.states())]),');
  });

  it('FlipPad marks a pad that already has a row, and says where the row is', () => {
    expect(flipPad).toContain("{rowPads?.has(i) ? ' · row' : ''}");
    expect(flipPad).toContain('in the STUDIO grid under the kit rows');
  });

  it('the kits cache is keyed to the player, and both loaders pass one', () => {
    expect(code('app/play/music/page.tsx')).toContain('<MusicLoader playerId={');
    expect(code('app/play/music/_components/loader.tsx')).toContain('gameProps={{ spendShards, readOwnedKits, arenaSet, playerId }}');
    expect(code('app/dev/music/loader.tsx')).toContain('playerId={playerId}');
  });
});

// MUSIC-SUITE P3 FIX PASS (2026-09-25): the room's wiring for the review's findings. The rules themselves are tested by
// behaviour (studioStore / studioEdit / flipRowSounds / AudioEngine.selection); these pin that the room uses them.
describe('the P3 fix pass wiring (source pins)', () => {
  const studio = code('lib/babylon/music/StudioMode.tsx');
  const songPanel = code('lib/babylon/music/SongPanel.tsx');
  const flipPad = code('lib/babylon/music/FlipPad.tsx');

  it('REMIX is held exactly when MY PROJECTS is (a take recording, a PERFORM set)', () => {
    expect(studio).toContain("const switchLock = mode === 'perform' ? 'End the set to switch projects' : takeRec || micRec ? 'Stop the recording first' : null;");
    expect(studio).toContain('locked={switchLock}');
    const i = studio.indexOf('const startRemix = ');
    expect(studio.slice(i, i + 400)).toMatch(/if \(switchLock\) \{ say\(/);
  });

  it('a take and a mic take land in the project they were recorded in', () => {
    expect(songPanel).toContain('const startedIn = songIdRef.current;');
    expect(songPanel).toContain('if (onTake) onTake(take, startedIn);');
    expect(studio).toContain('onTake={takeRecorded}');
    expect(studio).toMatch(/if \(room\.isOpen\(projectId\)\) songChange[\s\S]*?else void room\.ops\.amend\(projectId,/);
    expect(flipPad).toContain('const startedIn = projectId;');
    expect(studio).toMatch(/if \(o\.projectId && !room\.isOpen\(o\.projectId\)\) \{ void room\.ops\.amend\(o\.projectId,/);
  });

  it('a take\'s × and a new source over an own recording ask first; every FLIP change is an undo step', () => {
    expect(songPanel).toContain('onClick={() => setConfirmTake(t.id)}');
    expect(songPanel).toContain('data-qa="take-remove-confirm"');
    expect(flipPad).toContain('data-qa="flip-replace-confirm"');
    expect(flipPad).toMatch(/onClick=\{\(\) => guardReplace\(s\.label, \(\) => void loadFel\(s\)\)\}/);
    expect(studio).toContain('edit((p) => ({ ...p, flip: fn(p.flip) }), o.group);');
  });

  it('the kit is PLAYED from the owned list, never written into the project by a fallback; MASTER follows the project', () => {
    expect(studio).not.toMatch(/\bsetKit\(/);
    expect(studio).toContain('const want = shop.owned.includes(kit) ? kit : DEFAULT_KIT;');
    expect(studio).toContain('useEffect(() => { engineRef.current?.masterPolish(polished); }, [polished, ready]);');
    expect(studio).toContain('polish: r.polished }).then((id) => {');
  });

  it('a project opened drops the last one\'s Flip sounds; an undo\'s reload is generation-guarded', () => {
    expect(studio).toContain('void openFlipRowSounds(eng, projectRef.current.flipRows, chopFor, () => alive)');
    expect(studio).toContain('void reloadFlipRowSounds(eng, cur.flipRows, to.flipRows, chopFor, () => genRef.current === gen)');
  });

  it('LIBRARY DELETE is on your own songs only; the dance export says when it was not kept; the take STOP shows everywhere', () => {
    expect(studio).toMatch(/\{\(t\.authorId === me \|\| t\.authorId === 'me'\) && \(\s*<LibraryDelete /);
    expect(studio).toContain('if (!saveExportedTrack(out)) {');
    expect(studio).toContain('data-qa="take-recording-chip"');
    expect(songPanel).toContain('stopRef.current = () => { if (recRef.current) recRef.current.stop(); else setArmed(false); };');
  });

  it('ARM REC on a pad whose row holds ANOTHER chop replaces the row\'s chop (what the taps sound like is what the row plays)', () => {
    expect(studio).toMatch(/const differs = \(p: StudioProject\): boolean => \{[\s\S]*?chopSignature\(r\) !== chopSignature\(chop\.row\);/);
    expect(studio).toContain("edit((p) => withFlipHit(differs(p) ? withFlipRow(p, chop.row) : p, chop.row.sampleId, step), 'flip-rec');");
  });

  it('a room line is cleared only by its own timer (an older line\'s timer wiped a newer one early)', () => {
    expect(studio).toContain("setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2200);");
  });

  it('MY PROJECTS offers RELOAD / SAVE AS A COPY on a conflict and SWITCH ANYWAY / STAY on a refused switch', () => {
    const my = code('lib/babylon/music/MyProjects.tsx');
    expect(my).toContain('data-qa="project-save-copy"');
    expect(my).toContain('data-qa="project-reload"');
    expect(my).toContain('data-qa="switch-anyway"');
    expect(studio).toContain('conflict={room.conflict} onReload={() => void room.ops.reload()} onSaveCopy={() => void room.ops.saveCopy()}');
  });
});
