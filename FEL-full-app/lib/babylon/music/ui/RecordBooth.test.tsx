// MUSIC-SUITE P4 (2026-09-25): the recording booth's controls — best of N (PICK), mute, delete (asked), the tier gate,
// and ARM before RECORD. Driven with the repo's no-DOM helpers (tests/helpers/driveRender.ts): the real component, its
// real buttons. The mic and the clock are takeCapture's (takeCapture.test.ts); effects do not run here.
import { describe, expect, it } from 'vitest';
import RecordBooth, { type RecordBoothProps } from './RecordBooth';
import type { ProjectTake, SongSlice } from '../StudioProject';
import { pickedTakeIds } from '../takeCapture';
import { button, buttons, drive, findAll } from '@/tests/helpers/driveRender';

const REF = { key: 'aud_x', mime: 'audio/wav', bytes: 1 };
const take = (id: string, o: Partial<ProjectTake> = {}): ProjectTake =>
  ({ id, atBar: 0, bars: 4, loopBars: 4, gain: 0.9, durationSec: 8, trimStart: 0, trimEnd: 0, muted: false, pickedAt: 0, audio: REF, ...o });
const buf = { duration: 8 } as unknown as AudioBuffer;

function props(o: Partial<RecordBoothProps> & { edits?: Array<(s: SongSlice) => SongSlice>; said?: string[] } = {}): RecordBoothProps {
  const takes = o.takes ?? [take('a', { pickedAt: 1 }), take('b', { pickedAt: 2 }), take('c', { atBar: 2, bars: 2, pickedAt: 3 })];
  return {
    engine: null, bpm: 120, steps: 16, songMode: false, songBars: 0, takes, projectId: 'prj_1', canRecord: true,
    buffers: new Map(takes.map((t) => [t.id, buf])), missing: new Set(), addBuffer: () => undefined,
    onSongChange: (fn) => o.edits?.push(fn), saveAudio: async () => REF, say: (m) => o.said?.push(m), S: {},
    ...o,
  };
}
const apply = (edits: Array<(s: SongSlice) => SongSlice>, takes: ProjectTake[]): ProjectTake[] =>
  edits.reduce((s, fn) => fn(s), { sections: [], chain: [], takes } as SongSlice).takes;

describe('the booth', () => {
  it('groups takes by their bars: BEST OF 2 over bars 1–4, the newest plays, only the others offer PICK', () => {
    const { html, tree } = drive(() => RecordBooth(props()));
    expect(html).toContain('BARS 1–4 · BEST OF 2');
    expect(html).toContain('BARS 3–4');
    const rows = findAll(tree, (el) => el.props['data-qa'] === 'song-take');
    expect(rows.map((r) => [r.props['data-take'], r.props['data-picked']])).toEqual([['a', '0'], ['b', '1'], ['c', '1']]);
    expect(buttons(tree, /^PICK$/)).toHaveLength(1);
    expect(html).toContain('kept (not picked)');
  });

  it('PICK hands the bars to that take (one undo step) and says the others are kept', () => {
    const edits: Array<(s: SongSlice) => SongSlice> = []; const said: string[] = [];
    const p = props({ edits, said });
    const { tree } = drive(() => RecordBooth(p));
    button(tree, /^PICK$/).props.onClick();
    expect(edits).toHaveLength(1);
    expect([...pickedTakeIds(apply(edits, p.takes))].sort()).toEqual(['a', 'c']);
    expect(said[0]).toMatch(/Take 1 plays bars 1–4 now — the other 1 is kept/);
  });

  it('MUTE is a toggle on that take only', () => {
    const edits: Array<(s: SongSlice) => SongSlice> = [];
    const p = props({ edits });
    const { tree } = drive(() => RecordBooth(p));
    findAll(tree, (el) => el.props['data-qa'] === 'take-mute')[2].props.onClick();
    expect(apply(edits, p.takes).map((t) => t.muted)).toEqual([false, false, true]);
  });

  it('DELETE asks first (naming the take and its bars); REMOVE is one undo step; KEEP removes nothing', () => {
    const edits: Array<(s: SongSlice) => SongSlice> = [];
    const p = props({ edits });
    const asked = drive(() => RecordBooth(p), [(t) => findAll(t, (el) => el.props['data-qa'] === 'take-remove')[1].props.onClick()]);
    expect(asked.html).toContain('Remove take 2 (bars 1–4, 8.0 s)?');
    expect(edits).toHaveLength(0);
    button(asked.tree, /^REMOVE$/).props.onClick();
    expect(apply(edits, p.takes).map((t) => t.id)).toEqual(['a', 'c']);
    // with b gone, a plays bars 1–4 again (the pick before it)
    expect(pickedTakeIds(apply(edits, p.takes)).has('a')).toBe(true);
  });

  it('a gain / trim drag is ONE undo step: drafts while dragging, committed on release', () => {
    const edits: Array<(s: SongSlice) => SongSlice> = [];
    const p = props({ edits, takes: [take('a')] });
    const r = drive(() => RecordBooth(p), [
      (t) => findAll(t, (el) => el.props['data-qa'] === 'take-gain')[0].props.onChange({ target: { value: '1.2' } }),
      (t) => findAll(t, (el) => el.props['data-qa'] === 'take-gain')[0].props.onChange({ target: { value: '1.4' } }),
      (t) => findAll(t, (el) => el.props['data-qa'] === 'take-trim-start')[0].props.onChange({ target: { value: '0.3' } }),
    ]);
    expect(edits).toHaveLength(0);
    findAll(r.tree, (el) => el.props['data-qa'] === 'take-gain')[0].props.onPointerUp();
    expect(edits).toHaveLength(1);
    expect(apply(edits, p.takes)[0]).toMatchObject({ gain: 1.4, trimStart: 0.3 });
  });

  it('a trim can never eat the whole take (≥ 50 ms is left)', () => {
    const edits: Array<(s: SongSlice) => SongSlice> = [];
    const p = props({ edits, takes: [take('a', { durationSec: 2, trimEnd: 1 })] });
    const r = drive(() => RecordBooth(p), [(t) => findAll(t, (el) => el.props['data-qa'] === 'take-trim-start')[0].props.onChange({ target: { value: '2' } })]);
    findAll(r.tree, (el) => el.props['data-qa'] === 'take-trim-start')[0].props.onBlur();
    expect(apply(edits, p.takes)[0].trimStart).toBeCloseTo(0.95, 9);
  });

  it('RECORD waits for ARM (the mic opens ahead of the bar, never on it); the mic is off until then', () => {
    const { html, tree } = drive(() => RecordBooth(props({ takes: [] })));
    expect(html).toContain('● ARM MIC');
    expect(html).toContain('mic off');
    expect(html).not.toContain('MIC ON');
    expect(button(tree, /RECORD/).props.disabled).toBe(true);
    expect(html).toContain('ARM opens the mic first');
  });

  it('below THE STUDIO: no ARM and no RECORD, and the takes already made are still listed (they still play)', () => {
    const { html, tree } = drive(() => RecordBooth(props({ canRecord: false })));
    expect(html).toContain('Recording takes opens at THE STUDIO');
    expect(buttons(tree, /ARM|RECORD/)).toHaveLength(0);
    expect(findAll(tree, (el) => el.props['data-qa'] === 'song-take')).toHaveLength(3);
  });

  it('says why a take is silent: missing audio, loading, muted, outside the song', () => {
    const takes = [take('m'), take('l', { atBar: 1, bars: 1 }), take('u', { atBar: 2, bars: 1, muted: true }), take('o', { atBar: 3, bars: 1, loopBars: 4 })];
    const { html } = drive(() => RecordBooth(props({ takes, songMode: true, songBars: 2, missing: new Set(['m']), buffers: new Map([['u', buf], ['o', buf]]) })));
    expect(html).toContain('audio missing'); expect(html).toContain('loading…'); expect(html).toContain('muted');
    expect(html).toContain('outside the 2-bar song');
  });

  it('in song mode the region is the song\'s bars (FROM runs to its end, no LOOP picker); on the grid, LOOP is offered', () => {
    const song = drive(() => RecordBooth(props({ takes: [], songMode: true, songBars: 6 })));
    const from = findAll(song.tree, (el) => el.props['data-qa'] === 'booth-from')[0];
    expect(findAll(from.props.children, (el) => el.type === 'option')).toHaveLength(6);
    expect(song.html).toContain('loops with the song (6 bars)');
    expect(findAll(song.tree, (el) => el.props['data-qa'] === 'booth-loop')).toHaveLength(0);
    const grid = drive(() => RecordBooth(props({ takes: [] })));
    expect(findAll(grid.tree, (el) => el.props['data-qa'] === 'booth-loop')).toHaveLength(1);
  });
});
