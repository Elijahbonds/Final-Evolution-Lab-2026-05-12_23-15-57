// QA P1-26 (2026-09-27): Big Screen /host only offered Downtown: the page defaults ?mode= to threepoint and the stage had
// no picker. The start panel lists the controller link's modes now; choosing one is the mode the room opens for.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HostStage, hostModes } from './host-stage';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { MODES } from '@/lib/babylon/modes/registry';
import { drive, findAll } from '@/tests/helpers/driveRender';

describe('/host: a mode chooser', () => {
  it('lists the controller link\'s modes (more than one), not The Flip', () => {
    const modes = hostModes();
    expect(modes.length).toBeGreaterThanOrEqual(2);
    // the stage runs the mode itself now (release, 2026-10-06), so a layout with no MODES entry is not offered
    expect(modes.map((m) => m.modeId)).toEqual(Object.keys(MODE_CONTROLLERS).filter((k) => k !== 'music_flip' && !!MODES[k]));
    const m = renderToStaticMarkup(createElement(HostStage, { modeId: 'threepoint' }));
    expect((m.match(/data-mode="/g) ?? []).length).toBe(modes.length);
    expect(m).toMatch(/data-mode="threepoint" aria-pressed="true"/);
  });

  it('choosing one makes it the mode (its title heads the panel)', () => {
    const pick = (t: ReturnType<typeof HostStage>) => {
      const b = findAll(t, (el) => el.type === 'button' && el.props['data-mode'] === 'tennis');
      expect(b).toHaveLength(1);
      b[0].props.onClick();
    };
    const { html } = drive(() => HostStage({ modeId: 'threepoint' }), [pick]);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${MODE_CONTROLLERS.tennis.title.toUpperCase()}</h1>`));
    expect(html).toMatch(/data-mode="tennis" aria-pressed="true"/);
  });

  it('an unknown ?mode= offers the chooser instead of a dead end; ?mode= still names the default', () => {
    const m = renderToStaticMarkup(createElement(HostStage, { modeId: 'nope' }));
    expect(m).toContain('No controller layout for “nope”. Pick a game:');
    expect(m).toContain('data-host-modes');
    expect(readFileSync(path.resolve(__dirname, '../../app/host/page.tsx'), 'utf8')).toContain("searchParams.mode : 'threepoint'");
  });
});
