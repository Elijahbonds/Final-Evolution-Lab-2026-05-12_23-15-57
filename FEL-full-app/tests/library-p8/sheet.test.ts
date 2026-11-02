// PLAT-P08 (2026-11-02): the exercise sheet — the demo, the muscles, three cues and ONE primary, Try it, which opens the
// phase-1 player on a one-exercise session (lib/session-player/fromLibrary.ts) in one tap.
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { mount } from '@/tests/helpers/hookRuntime';
import { ExerciseSheet } from '@/components/library/exercise-sheet';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { fromLibrary } from '@/lib/session-player/fromLibrary';
import { doseParts } from '@/lib/session-player/dose';
import { loadLibraryFiles } from '@/lib/library/files';
import { demoFor, muscleMap } from '@/lib/library/demo';
import type { LibraryCard } from '@/lib/library/server';

function* walk(n: unknown): Generator<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(n)) { for (const x of n) yield* walk(x); return; }
  if (!isValidElement(n)) return;
  const el = n as ReactElement<Record<string, unknown>>;
  yield el;
  for (const v of Object.values(el.props ?? {})) if (isValidElement(v) || Array.isArray(v)) yield* walk(v);
}
const entry = loadLibraryFiles().find((e) => e.name === 'Bodyweight Squat')!;
const d = demoFor(entry);
// the card the server sends (lib/library/server.ts toCard), built here without the server module
const card = { ...entry, muscleMap: muscleMap(entry), avatarClip: d?.clip ?? null, avatarHold: d?.hold ?? null } as LibraryCard;

describe('fromLibrary', () => {
  it('one exercise, its own dose, cue, set-up and loop', () => {
    const s = fromLibrary(card);
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0]).toMatchObject({ exId: entry.id, name: entry.name, sets: entry.dosage.sets, setup: entry.setup, cue: entry.cues[0], clip: card.avatarClip });
    expect(doseParts(s.steps[0]).big).toMatch(/^\d+ × /);
    expect(fromLibrary({ ...card, dosage: { sets: 2, seconds: 30, restSec: 30 } }).steps[0]).toMatchObject({ workSeconds: 30, reps: '30 s' });
  });
});

describe('the exercise sheet', () => {
  it('three cues, the muscles, and Try it opens the player in one tap', async () => {
    expect(card.avatarClip).toBeTruthy();
    const m = mount(() => ExerciseSheet({ e: card, onClose: () => {}, onOpen: () => {} }));
    const all = () => [...walk(m.tree as ReactNode)];
    const cues = all().find((e) => 'data-sheet-cues' in e.props)!;
    expect([...walk(cues.props.children)].filter((e) => e.type === 'li')).toHaveLength(Math.min(3, entry.cues.length));
    expect(all().some((e) => e.props['data-testid'] === 'muscle-map')).toBe(true);
    const primaries = all().filter((e) => e.type === PrimaryCta);
    expect(primaries).toHaveLength(1);
    expect(all().some((e) => !!e.props.session)).toBe(false);
    (primaries[0].props.onClick as () => void)();
    await new Promise((r) => setTimeout(r, 0));
    const player = all().find((e) => !!e.props.session);
    expect(player).toBeTruthy();
    expect((player!.props.session as { steps: unknown[] }).steps).toHaveLength(1);
    expect(player!.props.mode).toBe('preview');
    m.unmount();
  });
});
