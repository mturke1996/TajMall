import { notFound } from 'next/navigation';
import { UiKit } from './ui-kit';

/**
 * Development-only component gallery with fictional sample data. Lets the team review the
 * design system (and lets automated visual checks run) without signing in or touching the
 * database. It does not exist in production builds.
 */
export default function UiKitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <UiKit />;
}
