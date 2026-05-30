import { AuthGuard } from '@/components/AuthGuard';

export default function PathwayLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard require2FA loginPath="/login">{children}</AuthGuard>;
}
