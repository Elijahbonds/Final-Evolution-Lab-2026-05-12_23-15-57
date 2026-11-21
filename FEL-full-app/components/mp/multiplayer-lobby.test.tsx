import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MultiplayerLobby } from './multiplayer-lobby';

describe('MultiplayerLobby', () => {
  it('turns the empty match list into an actionable next step', () => {
    const html = renderToStaticMarkup(createElement(MultiplayerLobby));

    expect(html).toContain('No matches yet. Create a challenge to get started.');
    expect(html).toContain('Create a challenge</button>');
    expect(html).not.toContain('Create a challenge above to get started.');
  });
});
