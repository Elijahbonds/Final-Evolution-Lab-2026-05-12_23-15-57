import { describe, expect, it } from 'vitest';
import { buildInstacartPayload, instacartConfigured, IDP_UNIT } from './instacart';
import { availablePaths } from './fulfillment';

describe('FEL Kitchens — Instacart behind the key', () => {
  it('is locked without INSTACART_IDP_KEY and unlocked with one', () => {
    expect(instacartConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(instacartConfigured({ INSTACART_IDP_KEY: '   ' } as NodeJS.ProcessEnv)).toBe(false);
    expect(instacartConfigured({ INSTACART_IDP_KEY: 'k' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('builds a shopping-list payload from the same grocery items, units mapped, optional kept and labelled', () => {
    const p = buildInstacartPayload([
      { name: 'rolled oats', qty: 80, unit: 'g' }, { name: 'lime', qty: 1, unit: 'each' }, { name: 'soy sauce', qty: 1, unit: 'tbsp', optional: true },
    ], { linkbackUrl: 'https://fel.local/kitchens/fuel' });
    expect(p.link_type).toBe('shopping_list');
    expect(p.line_items).toHaveLength(3);
    expect(p.line_items[0]).toMatchObject({ name: 'rolled oats', quantity: 80, unit: IDP_UNIT.g });
    expect(p.line_items[2].display_text).toContain('(optional)');
    expect(p.landing_page_configuration?.partner_linkback_url).toBe('https://fel.local/kitchens/fuel');
    expect(p.instructions?.[0]).toContain('not medical advice');
  });

  it('the path picker shows Instacart locked by default and live only when the server says so', () => {
    expect(availablePaths().find((o) => o.path === 'instacart')?.available).toBe(false);
    expect(availablePaths({ instacart: true }).find((o) => o.path === 'instacart')?.available).toBe(true);
    expect(availablePaths().find((o) => o.path === 'doordash')?.available).toBe(false);
  });
});
