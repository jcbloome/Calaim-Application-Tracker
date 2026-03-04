import { redirect } from 'next/navigation';

export default function SWPortalPage() {
  // SW portal landing page should start at the action queue.
  // (SW login already redirects into the SW portal; this covers direct navigation to /sw-portal.)
  redirect('/sw-portal/queue');
}
