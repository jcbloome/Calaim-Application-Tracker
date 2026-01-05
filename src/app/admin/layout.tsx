
'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/hooks/use-admin';
import {
  LayoutDashboard,
  Shield,
  Loader2,
  Lock,
  LogOut,
  User as UserIcon,
  FolderKanban,
  BarChart3,
  ListChecks,
  Menu,
} from 'lucide-react';
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
} from '@/components/ui/dropdown-menu';
import Image from 'next/image';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

const adminNavLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, super: false },
  { href: '/admin/applications', label: 'Applications', icon: FolderKanban, super: false },
  { href: '/admin/progress-tracker', label: 'Progress Tracker', icon: ListChecks, super: false },
  { href: '/admin/statistics', label: 'Statistics', icon: BarChart3, super: false },
];


function AdminHeader() {
  const { user, isSuperAdmin } = useAdmin();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
    }
    // Always force a full reload to the login page to clear all state.
    window.location.href = '/admin/login';
  };

  const combinedNavLinks = [
    ...adminNavLinks,
    ...(isSuperAdmin ? [{ href: '/admin/super', label: 'Super Admin', icon: Shield, super: true }] : []),
  ];

  return (
    <header className="bg-card border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin">
            <Image
              src="/calaimlogopdf.png"
              alt="Connect CalAIM Logo"
              width={240}
              height={67}
              className="w-48 h-auto object-contain"
              priority
            />
          </Link>
           <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList>
              {adminNavLinks.map(link => {
                const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
                return (
                  <NavigationMenuItem key={link.href}>
                    <NavigationMenuLink asChild active={isActive} className={navigationMenuTriggerStyle()}>
                      <Link href={link.href}>
                        <link.icon className="mr-2 h-4 w-4" />
                        {link.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              })}
              {isSuperAdmin && (
                 <NavigationMenuItem key='/admin/super'>
                    <NavigationMenuLink asChild active={pathname.startsWith('/admin/super')} className={navigationMenuTriggerStyle()}>
                      <Link href='/admin/super'>
                        <Shield className="mr-2 h-4 w-4" />
                        Super Admin
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full hidden lg:inline-flex">
                <UserIcon className="h-5 w-5" />
                <span className="sr-only">User menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.displayName || user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/admin/profile')}>
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

            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                     <Link href="/admin" className="mb-4">
                        <Image
                        src="/calaimlogopdf.png"
                        alt="Connect CalAIM Logo"
                        width={240}
                        height={67}
                        className="w-40 h-auto object-contain"
                        priority
                        />
                    </Link>
                  </SheetHeader>
                  <nav className="flex flex-col gap-4 mt-8">
                    {combinedNavLinks.map((link) => (
                        <SheetClose asChild key={link.href}>
                          <Link href={link.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
                            <link.icon className="h-4 w-4" />
                            {link.label}
                          </Link>
                        </SheetClose>
                      )
                    )}
                  </nav>
                  {/* User Actions for mobile */}
                   <div className="mt-auto border-t pt-6">
                     {user ? (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm text-muted-foreground text-center truncate">{user.displayName || user.email}</p>
                            <SheetClose asChild>
                                <Button onClick={() => router.push('/admin/profile')} variant="outline" className="w-full">
                                <UserIcon className="mr-2 h-4 w-4" />
                                My Profile
                                </Button>
                            </SheetClose>
                             <SheetClose asChild>
                                <Button onClick={handleSignOut} className="w-full">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </Button>
                            </SheetClose>
                        </div>
                        ) : (
                         <SheetClose asChild>
                            <Button onClick={() => router.push('/admin/login')} className="w-full">
                                <LogOut className="mr-2 h-4 w-4" />
                                Log In
                            </Button>
                        </SheetClose>
                        )}
                    </div>
                </SheetContent>
              </Sheet>
            </div>
        </div>
      </div>
    </header>
  );
}

function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isSuperAdmin, isLoading, user } = useAdmin();
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (isLoading) {
      return; // Still checking auth state and roles
    }
    
    // If not loading and there's no user at all, go to login.
    if (!user) {
      router.push('/admin/login');
      return;
    }
    
    // If there is a user, but they don't have admin rights, force logout and redirect.
    if (user && !isAdmin && !isSuperAdmin) {
       if (auth) {
        auth.signOut().then(() => {
          router.push('/admin/login');
        });
      } else {
        router.push('/admin/login');
      }
    }

  }, [isLoading, user, isAdmin, isSuperAdmin, router, auth]);

  if (isLoading || !user || (!isAdmin && !isSuperAdmin)) {
    // Show a loading spinner while we check roles or redirect
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Verifying access...</p>
      </div>
    );
  }
  
  // If we reach here, the user is authenticated and is an admin.
  return (
    <div className="flex flex-col min-h-screen">
      <AdminHeader />
      <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
        {children}
      </main>
    </div>
  );
}


export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The /admin/login page has its own layout and does not need the auth guard
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // All other /admin pages are protected by the auth guard
  return <AdminAuthGuard>{children}</AdminAuthGuard>;
}
