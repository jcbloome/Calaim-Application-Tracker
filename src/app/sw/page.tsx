import { redirect } from 'next/navigation';

export default function SWLegacyEntryPage() {
  // Keep legacy SW bookmarks working.
  redirect('/sw-login');
}
