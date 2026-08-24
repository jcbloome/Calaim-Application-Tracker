import { AuthGuard } from '@/components/AuthGuard';

export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  // Family portal: password login only (2FA is required for admin/SW portals).
  return <AuthGuard loginPath="/login">{children}</AuthGuard>;
}
