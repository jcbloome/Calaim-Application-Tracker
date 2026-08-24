import { AuthGuard } from '@/components/AuthGuard';

export default function PathwayLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard loginPath="/login">{children}</AuthGuard>;
}
