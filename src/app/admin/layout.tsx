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

function AdminAuthLoading({ logs }: { logs: string[] }) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 font-sans">
        <div className="p-6 bg-white rounded-lg shadow-md flex flex-col items-center gap-4 w-full max-w-md">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <h2 className="text-xl font-semibold">Verifying Session...</h2>
            </div>
            <div className="mt-4 w-full bg-gray-900 text-white font-mono text-xs rounded-md p-4 h-48 overflow-y-auto">
              <p className="font-bold mb-2">Auth Log:</p>
              {logs.map((log, index) => (
                <p key={index} className="whitespace-pre-wrap">{log}</p>
              ))}
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `${timestamp}: ${message}`]);
  };

  useEffect(() => {
    addLog(`Path changed to: ${pathname}`);

    if (pathname === '/admin/login') {
      addLog('On login page, skipping auth checks here.');
      setIsCheckingRole(false);
      return;
    }

    addLog(`User loading state: ${isUserLoading}`);
    if (isUserLoading) {
      addLog('Waiting for Firebase Auth to initialize...');
      return;
    }

    if (!user) {
      addLog('No user found. Redirecting to admin login.');
      router.push('/admin/login');
      setIsCheckingRole(false);
      return;
    }

    const checkAdminRole = async () => {
      // Ensure firestore is available before trying to use it
      if (!firestore) {
        addLog('Firestore is not available yet. Waiting...');
        return;
      }
      
      addLog(`User found: ${user.uid}. Checking roles in Firestore.`);
      setIsCheckingRole(true);
      try {
        const adminDocRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminDocRef = doc(firestore, 'roles_super_admin', user.uid);
        
        addLog('Fetching admin and super_admin docs.');
        const [adminDocSnap, superAdminDocSnap] = await Promise.all([
            getDoc(adminDocRef),
            getDoc(superAdminDocSnap)
        ]);
        
        const hasAdminRole = adminDocSnap.exists();
        const hasSuperAdminRole = superAdminDocSnap.exists();
        
        addLog(`Admin role exists: ${hasAdminRole}`);
        addLog(`Super Admin role exists: ${hasSuperAdminRole}`);

        setIsAdmin(hasAdminRole);
        setIsSuperAdmin(hasSuperAdminRole);
        
        if (!hasAdminRole && !hasSuperAdminRole) {
          addLog('User has no admin roles. Signing out and redirecting to user login.');
          if (auth) await auth.signOut();
          router.push('/login'); 
        }
      } catch (error: any) {
        addLog(`Error checking admin roles: ${error.message}`);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        if (auth) await auth.signOut();
        router.push('/login');
      } finally {
        addLog('Role check finished.');
        setIsCheckingRole(false);
      }
    };
    
    checkAdminRole();
  }, [user, isUserLoading, firestore, pathname, router, auth]);


  if ((isUserLoading || isCheckingRole) && pathname !== '/admin/login') {
    return <AdminAuthLoading logs={logs} />;
  }
  
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // This prevents a flash of admin content for non-admin users before redirect.
  if (!isAdmin && !isSuperAdmin) {
     return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 font-sans">
        <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl w-full">
          <h2 className="text-xl font-semibold mb-4 text-center text-red-600">Access Denied</h2>
          <p className="text-center">You do not have the required permissions. Redirecting...</p>
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
                <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
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
