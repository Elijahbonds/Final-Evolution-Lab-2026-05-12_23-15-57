import { describe, expect, it } from 'vitest';
import { authOptions } from './auth';

describe('auth configuration', () => {
  it('always provides NextAuth a server-side secret so page session checks do not 500', () => {
    expect(typeof authOptions.secret).toBe('string');
    expect((authOptions.secret as string).length).toBeGreaterThanOrEqual(32);
  });
});
