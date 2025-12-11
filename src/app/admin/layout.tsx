
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const mascot = imageData.placeholderImages.find(p => p.id === 'fox-mascot');

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    // Don't run any checks on the login page itself.
    if (pathname === '/admin/login') {
      setIsCheckingRole(false);
      return;
    }

    // If user state is still loading, wait.
    if (isUserLoading) {
      return;
    }

    // If no user is logged in, redirect to admin login.
    if (!user) {
      router.push('/admin/login');
      setIsCheckingRole(false);
      return;
    }

    // If we have a user, check their roles.
    const checkAdminRole = async () => {
      if (!firestore) {
        setIsCheckingRole(false);
        return;
      }
      
      setIsCheckingRole(true);
      try {
        const adminDocRef = doc(firestore, 'roles_admin', user.uid);
        const adminDocSnap = await getDoc(adminDocRef);
        const hasAdminRole = adminDocSnap.exists();
        setIsAdmin(hasAdminRole);

        const superAdminDocRef = doc(firestore, 'roles_super_admin', user.uid);
        const superAdminDocSnap = await getDoc(superAdminDocRef);
        const hasSuperAdminRole = superAdminDocSnap.exists();
        setIsSuperAdmin(hasSuperAdminRole);
        
        // If user has neither role after checking, sign out and redirect.
        if (!hasAdminRole && !hasSuperAdminRole) {
          if (auth) await auth.signOut();
          router.push('/login'); // Redirect to main user login, not admin
        }
      } catch (error) {
        console.error("Error checking admin role:", error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        if (auth) await auth.signOut();
        router.push('/login');
      } finally {
        setIsCheckingRole(false);
      }
    };
    
    checkAdminRole();
  }, [user, isUserLoading, firestore, pathname, router, auth]);


  if (isUserLoading || isCheckingRole) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  // Let the login page render itself without the layout.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // If after all checks, the user is not an admin, show redirecting message.
  if (!isAdmin && !isSuperAdmin) {
     return (
      <div className="flex items-center justify-center h-screen">
        <p>Access Denied. Redirecting...</p>
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
