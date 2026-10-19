import { notFound } from 'next/navigation';
import { PeoplePreview } from './people-preview';

/** Development-only gallery of the people components with fictional data (no sign-in, no database). */
export default function PeoplePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PeoplePreview />;
}
