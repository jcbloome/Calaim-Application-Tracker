
'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Users,
  LayoutGrid,
  BarChart,
  Activity,
  FileCheck2,
  PawPrint,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { useUser, useAuth } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const menuItems = [
  { href: '/admin/applications', label: 'Applications', icon: Users },
  { href: '/admin/application-statistics', label: 'Statistics', icon: BarChart },
  { href: '/admin/tracker', label: 'Tracker', icon: FileCheck2 },
  { href: '/admin/activity-log', label: 'Activity Log', icon: Activity },
];

// Hardcoded admin email
const ADMIN_EMAIL = 'jason@carehomefinders.com';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isUserLoading) return; // Wait until user status is resolved

    // If not logged in and not on the login page, redirect to admin login
    if (!user && pathname !== '/admin/login') {
      router.push('/admin/login');
    }
  }, [user, isUserLoading, pathname, router]);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  // If on the login page, just render children (the login page)
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // If there's no user at this point (and we're not on the login page),
  // it means we're about to redirect, so we can render a loader to avoid flicker.
  if (!user) {
     return (
      <div className="flex items-center justify-center h-screen">
        <p>Redirecting...</p>
      </div>
    );
  }

  const isAuthorized = user?.email === ADMIN_EMAIL;

  if (!isAuthorized) {
    const handleSignOut = async () => {
      if (auth) await auth.signOut();
      router.push('/admin/login');
    }
    return (
      <div className="flex items-center justify-center h-screen bg-muted/40">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2">
                    <ShieldAlert className="h-6 w-6 text-destructive" />
                    Access Denied
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p>You are not authorized to view this page.</p>
                <div className="flex items-center justify-center gap-4">
                  <Button asChild>
                      <Link href="/applications">Go to My Applications</Link>
                  </Button>
                   <Button variant="outline" onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" /> Log Out
                  </Button>
                </div>
            </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <PawPrint className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-semibold">Admin Panel</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <a>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <main className="flex-1">
        <div className="border-b p-4">
            {/* Can be a header bar for mobile or other controls */}
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
