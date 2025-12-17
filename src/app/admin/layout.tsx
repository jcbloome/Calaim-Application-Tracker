
'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/hooks/use-admin';
import { LayoutDashboard, List, Shield, Loader2, Lock, LogOut, User as UserIcon, FolderKanban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Image from 'next/image';

const adminNavLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/applications', label: 'Applications', icon: FolderKanban },
  { href: '/admin/activities', label: 'Activities', icon: List },
  { href: '/admin/super', label: 'Super Admin', icon: Shield, super: true },
];

function AdminSidebar() {
  const pathname = usePathname();
  const { isSuperAdmin } = useAdmin();

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-card pr-4">
      <nav className="flex flex-col space-y-2 p-4">
        <h2 className="text-lg font-semibold tracking-tight px-2">Admin Menu</h2>
        <div className="space-y-1">
          {adminNavLinks.map(link => {
            if (link.super && !isSuperAdmin) return null;

            const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                  isActive && 'bg-muted text-primary'
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function AdminHeader() {
    const { user } = useAdmin();
    const auth = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        if (auth) {
            await auth.signOut();
        }
        router.push('/admin/login');
    };

    return (
        <header className="bg-card border-b sticky top-0 z-40">
            <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
                <Link href="/admin" className="flex items-center gap-2 font-bold text-lg text-primary">
                    <Image 
                        src="/calaimlogopdf.png"
                        alt="CalAIM Pathfinder Logo"
                        width={240}
                        height={60}
                        className="w-60 h-auto object-contain"
                        priority
                    />
                     <span className="border-l-2 pl-2 text-muted-foreground font-normal">Admin Portal</span>
                </Link>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full">
                        <UserIcon className="h-5 w-5" />
                        <span className="sr-only">User menu</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{user?.displayName || user?.email}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => router.push('/profile')}>
                            <UserIcon className="mr-2 h-4 w-4" />
                            <span>My Profile</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}


export default function AdminLayout({ children }: { children: ReactNode }) {
    const { isAdmin, isSuperAdmin, isLoading, user } = useAdmin();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !user && pathname !== '/admin/login') {
            router.push('/admin/login');
        }
    }, [isLoading, user, router, pathname]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Verifying access...</p>
            </div>
        );
    }
    
    // Allow login page to render without the layout
    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    if (user && !isAdmin && !isSuperAdmin) {
        return (
             <main className="flex-grow flex items-center justify-center p-4 bg-slate-100 min-h-screen">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2">
                            <Lock className="h-6 w-6 text-destructive" />
                            Access Denied
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>You do not have permission to view this page. Please contact an administrator if you believe this is an error.</p>
                         <Button onClick={() => router.push('/admin/login')} className="mt-4">Return to Login</Button>
                    </CardContent>
                </Card>
            </main>
        );
    }

    if (!user) {
        // This state is briefly hit during the redirect, returning null prevents a flash of unstyled content.
        return null;
    }

  return (
    <div className="flex flex-col min-h-screen">
      <AdminHeader />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
            {children}
        </main>
      </div>
    </div>
  );
}
