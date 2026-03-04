import { redirect } from 'next/navigation';

export default function SWPortalPage() {
  // SW portal landing page should always start at weekly assignments roster.
  // (SW login already redirects there; this covers direct navigation to /sw-portal.)
  redirect('/sw-portal/roster');
}
