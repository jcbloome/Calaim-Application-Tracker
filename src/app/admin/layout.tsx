
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  Loader2,
} from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarSeparator } from '@/components/ui/sidebar';
import { useUser, useAuth, useFirestore } from '@/firebase';
import imageData from '@/lib/placeholder-images.json';
import { doc, getDoc } from 'firebase/firestore';
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

function AdminAuthLoading() {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 font-sans">
        <div className="p-6 bg-white rounded-lg shadow-md flex flex-col items-center gap-4 w-full max-w-md">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <h2 className="text-xl font-semibold">Verifying Admin Access...</h2>
            </div>
        </div>
      </div>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const mascot = imageData.placeholderImages.find(p => p.id === 'fox-mascot');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    // If auth is still loading, wait.
    if (isUserLoading) {
      return;
    }

    // If there is no user and we are not on the login page, redirect to login.
    if (!user) {
      if (pathname !== '/admin/login') {
        router.push('/admin/login');
      }
      setIsCheckingRole(false);
      return;
    }

    // If we have a user, check their admin status.
    const checkAdminStatus = async () => {
      if (firestore && user) {
        const adminDocRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminDocRef = doc(firestore, 'roles_super_admin', user.uid);
        
        const [adminDocSnap, superAdminDocSnap] = await Promise.all([
            getDoc(adminDocRef),
            getDoc(superAdminDocRef)
        ]);

        if (adminDocSnap.exists() || superAdminDocSnap.exists()) {
          setIsAdmin(true);
        } else {
          // If not an admin, sign them out and redirect to login
          if (auth) await auth.signOut();
          router.push('/admin/login');
        }
      }
      setIsCheckingRole(false);
    };

    checkAdminStatus();
  }, [user, isUserLoading, firestore, auth, router, pathname]);

  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
    }
    // After admin signs out, they should go to the admin login page.
    router.push('/admin/login');
  };
  
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (isCheckingRole || !isAdmin) {
    return <AdminAuthLoading />;
  }

  // At this point, we have a user and they are a verified admin.
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
                <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          
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
