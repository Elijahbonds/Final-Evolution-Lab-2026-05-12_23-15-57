// lane/hoops-shot-core: the shot clock's scorebug cell draws the string the mode hands it — nothing for '' (no clock / their ball).
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HoopsShotClock } from './hoops-shot-clock';
import { hudColor } from './tv-hud';

const html = (v: unknown) => renderToStaticMarkup(h(HoopsShotClock, { value: v }));

describe('the shot clock cell', () => {
  it('nothing when there is no clock', () => {
    for (const v of ['', undefined, null, 12]) expect(html(v)).toBe('');
  });
  it('the seconds, labelled SHOT, in the body colour; red in the last five', () => {
    const m = html('12');
    expect(m).toContain('data-hud="shot-clock"');
    expect(m).toContain('SHOT');
    expect(m).toContain('>12<');
    expect(m).toContain(hudColor('text'));
    const late = html('4.2');
    expect(late).toContain('>4.2<');
    expect(late).toContain(hudColor('danger'));
  });
});
