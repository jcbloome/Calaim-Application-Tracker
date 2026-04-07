import { redirect } from 'next/navigation';

export default function SWPortalPage() {
  // Redirect to the new task-driven home dashboard.
  redirect('/sw-portal/home');
}
