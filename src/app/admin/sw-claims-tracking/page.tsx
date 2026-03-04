import { redirect } from 'next/navigation';

// Legacy route. Keep for backwards compatibility.
export default function AdminSwClaimsTrackingLegacyPage() {
  redirect('/admin/sw-claims-management');
}
