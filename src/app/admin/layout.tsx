
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Users,
  LayoutGrid,
  BarChart,
  Activity,
  FileCheck2,
  ShieldAlert,
  LogOut,
  UserCog,
  BellRing,
} from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarSeparator } from '@/components/ui/sidebar';
import { useUser, useAuth } from '@/firebase';
import imageData from '@/lib/placeholder-images.json';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const menuItems = [
  { href: '/admin/applications', label: 'Applications', icon: Users },
  { href: '/admin/application-statistics', label: 'Statistics', icon: BarChart },
  { href: '/admin/form-tracker', label: 'Form Tracker', icon: FileCheck2 },
];

const superAdminMenuItems = [
    { href: '/admin/super', label: 'Super Admin', icon: ShieldAlert },
    { href: '/admin/activity-log', label: 'Activity Log', icon: Activity },
];

// Hardcoded admin email
const ADMIN_EMAIL = 'jason@carehomefinders.com';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const mascot = imageData.placeholderImages.find(p => p.id === 'fox-mascot');

  const isSuperAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    // Wait until user status and auth service are resolved
    if (isUserLoading || !auth) {
        return;
    }

    // If on the login page, do nothing, allow the user to log in.
    if (pathname === '/admin/login') {
        return;
    }

    // If there is no user authenticated, redirect to the admin login page.
    if (!user) {
        router.push('/admin/login');
        return;
    }

    // If a user is logged in, but they are not the designated admin,
    // sign them out and redirect them to the login page.
    if (user.email !== ADMIN_EMAIL) {
        auth.signOut().then(() => {
            router.push('/admin/login');
        });
    }
}, [user, isUserLoading, pathname, router, auth]);


  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  // If on the login page, just render children (the login page itself).
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // If there's no user, or the user is not the admin, we render a loader
  // while the useEffect handles the redirection. This avoids content flashing.
  if (!user || user.email !== ADMIN_EMAIL) {
     return (
      <div className="flex items-center justify-center h-screen">
        <p>Redirecting to login...</p>
      </div>
    );
  }
  
  const handleSignOut = async () => {
      if (auth) await auth.signOut();
      router.push('/admin/login');
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex flex-col items-center gap-2 p-4 border-b">
            {mascot && (
                <Image 
                    src={mascot.imageUrl}
                    alt={mascot.description}
                    width={80}
                    height={80}
                    className="w-20 h-20 object-contain rounded-full"
                />
            )}
            <div className="text-center">
                <h1 className="text-xl font-semibold">Admin Panel</h1>
                {user?.displayName && <p className="text-sm text-muted-foreground">Welcome, {user.displayName}</p>}
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={pathname === item.href}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          
          {isSuperAdmin && (
            <>
                <SidebarSeparator />
                <div className="p-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Super Admin</p>
                </div>
                <SidebarMenu>
                {superAdminMenuItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
                            <Link href={item.href}>
                                <item.icon />
                                <span>{item.label}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
                </SidebarMenu>
            </>
          )}

        </SidebarContent>
        <SidebarFooter>
          <div className="border-t p-2">
            <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4"/>
                Logout
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </SidebarProvider>
  );
}
