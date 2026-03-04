import { redirect } from 'next/navigation';

// Legacy route. Keep for backwards compatibility.
export default function AdminSwClaimsLegacyPage() {
  redirect('/admin/sw-claims-management');
}

