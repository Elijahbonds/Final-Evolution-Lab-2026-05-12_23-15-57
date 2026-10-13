import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThanksContact } from '@/components/coach-store/thanks-contact';
import { BUSINESS_CONTACT_PHONE } from '@/lib/legal/business';

// COACH-THANKS: the /coach/thanks support block carries the real business contact, checked like /terms.
describe('/coach/thanks support block', () => {
  it('shows the email, the phone and the #2012 business mailbox, never a home address or placeholder', () => {
    const html = renderToStaticMarkup(<ThanksContact />);
    expect(BUSINESS_CONTACT_PHONE).toBe('(424) 415-8330');
    expect(html).toContain('FinalEvolution.us@gmail.com');
    expect(html).toContain('(424) 415-8330');
    expect(html).toContain('href="tel:+14244158330"');
    expect(html).toContain('Mail: Final Evolution LLC, 18543 Devonshire St #2012, Northridge, CA 91324');
    expect(html).not.toMatch(/granada hills/i);
    expect(html).not.toContain('{BUSINESS_ADDRESS}');
    expect(html.replace(/<[^>]*>/g, '')).not.toContain('[');
  });
});
