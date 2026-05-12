import { redirect } from 'next/navigation';

/**
 * Root route — there is no public landing page.
 * The system is private; hitting `/` sends you straight to /login.
 * (Auth middleware will, in turn, forward authenticated users to /dashboard.)
 */
export default function Root() {
  redirect('/login');
}
