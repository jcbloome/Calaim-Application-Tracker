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
  LogOut,
  User as UserIcon,
  FolderKanban,
  BarChart3,
  ListChecks,
  Menu,
  ShieldAlert,
  Kanban,
  ClipboardList,
  Heart,
  Printer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const adminNavLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/applications', label: 'Applications', icon: FolderKanban },
  { href: '/admin/my-tasks', label: 'My Tasks', icon: ClipboardList },
  { href: '/admin/progress-tracker', label: 'Progress Tracker', icon: ListChecks },
  { href: '/admin/kaiser-tracker', label: 'Kaiser Tracker', icon: Heart },
  { href: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
];

const superAdminNavLinks = [
    { href: '/admin/managerial-overview', label: 'Managerial Overview', icon: Kanban },
    { href: '/admin/super', label: 'Super Admin', icon: Shield },
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
    window.location.href = '/';
  };

  const combinedNavLinks = [
    ...adminNavLinks,
    ...(isSuperAdmin ? superAdminNavLinks : []),
  ];

  return (
    <header className="bg-card border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="shrink-0">
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
              {combinedNavLinks.map(link => {
                const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
                const Icon = link.icon;
                return (
                  <NavigationMenuItem key={link.href}>
                    <NavigationMenuLink asChild active={isActive} className={navigationMenuTriggerStyle()}>
                      <Link href={link.href}>
                        {Icon && <Icon className="mr-2 h-4 w-4" />}
                        {link.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-4">
          {user && (
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
          )}

            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader className="sr-only">
                    <SheetTitle>Mobile Navigation Menu</SheetTitle>
                    <SheetDescription>
                      Links to navigate through the admin sections of the application.
                    </SheetDescription>
                  </SheetHeader>
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
                  <nav className="flex flex-col gap-4 mt-8">
                    {combinedNavLinks.map((link) => {
                       const Icon = link.icon;
                       return (
                        <SheetClose asChild key={link.href}>
                          <Link href={link.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
                            {Icon && <Icon className="h-4 w-4" />}
                            {link.label}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </nav>
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, isSuperAdmin, isLoading } = useAdmin();

  useEffect(() => {
    // Wait until the loading is complete before making any decisions
    if (isLoading) {
      return;
    }

    // If loading is done and the user is not an admin, redirect to login.
    // Exception: don't redirect if they are already on the login page.
    if (!isAdmin && !isSuperAdmin && pathname !== '/admin/login') {
      router.push('/admin/login');
    }
  }, [isLoading, isAdmin, isSuperAdmin, pathname, router]);


  // If it's the login page, just render it without the layout.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // While checking auth, show a full-screen loader.
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-4">Verifying admin access...</p>
      </div>
    );
  }
  
  // If loading is done and the user is NOT an admin, they will be redirected by the useEffect.
  // We can render a fallback "Access Denied" page for a moment before the redirect happens.
  if (!isAdmin && !isSuperAdmin) {
    return (
       <div className="flex h-screen items-center justify-center bg-gray-100 p-4">
         <Card className="w-full max-w-md text-center">
             <CardHeader>
                <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
                <CardTitle className="mt-4">Access Denied</CardTitle>
                <CardDescription>You do not have permission to view this page.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={() => router.push('/admin/login')}>
                    Return to Login
                </Button>
            </CardContent>
         </Card>
      </div>
    );
  }
  
  // If loading is done and user is an admin, show the full admin layout.
  return (
    <div className="flex flex-col min-h-screen">
      <AdminHeader />
      <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
        {children}
      </main>
    </div>
  );
}
