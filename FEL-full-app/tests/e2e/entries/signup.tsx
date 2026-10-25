// E2E entry: /signup for a signed-out visitor with no age-block cookie — exactly what app/signup/page.tsx renders then.
import { createRoot } from 'react-dom/client';
import { AuthForm } from '@/components/auth-form';
import { Toaster } from '@/components/ui/sonner';

createRoot(document.getElementById('root')!).render(
  <>
    <AuthForm mode="signup" />
    <Toaster theme="dark" position="top-center" />
  </>,
);
