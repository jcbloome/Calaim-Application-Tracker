
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
    if (pathname === '/admin/login') {
      setIsCheckingRole(false);
      return;
    }

    if (isUserLoading) {
      return;
    }

    if (!user) {
      router.push('/admin/login');
      setIsCheckingRole(false);
      return;
    }

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
        
        if (!hasAdminRole && !hasSuperAdminRole) {
          if (auth) await auth.signOut();
          router.push('/login'); 
        }
      } catch (error: any) {
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


  if (isUserLoading || (isCheckingRole && pathname !== '/admin/login')) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 font-sans">
        <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl w-full">
            <h2 className="text-xl font-semibold mb-4 text-center">Verifying Session...</h2>
        </div>
      </div>
    );
  }
  
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (!isAdmin && !isSuperAdmin) {
     return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 font-sans">
        <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl w-full">
          <h2 className="text-xl font-semibold mb-4 text-center text-red-600">Access Denied</h2>
          <p className="text-center">You do not have the required admin role. Redirecting...</p>
        </div>
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
