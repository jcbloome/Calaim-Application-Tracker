
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
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';

const adminNavLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/applications', label: 'Applications', icon: FolderKanban },
  { href: '/admin/progress-tracker', label: 'Progress Tracker', icon: ListChecks },
  { href: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
  { href: '/admin/super', label: 'Super Admin', icon: Shield, super: true },
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

  return (
    <header className="bg-card border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin">
            <Image
              src="/calaimlogopdf.png"
              alt="CalAIM Pathfinder Logo"
              width={180}
              height={50}
              className="w-48 h-auto object-contain"
              priority
            />
          </Link>

          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList>
              {adminNavLinks.map(link => {
                if (link.super && !isSuperAdmin) return null;
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
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-4">
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

            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <nav className="flex flex-col gap-4 mt-8">
                    {adminNavLinks.map((link) => {
                      if (link.super && !isSuperAdmin) return null;
                      return (
                        <SheetClose asChild key={link.href}>
                          <Link href={link.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
                            <link.icon className="h-4 w-4" />
                            {link.label}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
        </div>
      </div>
    </header>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin, isSuperAdmin, isLoading, user } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();

  useEffect(() => {
    // If auth state is still loading, do nothing.
    if (isLoading) {
      return;
    }

    // If not loading and there's no user, redirect to admin login.
    if (!user && pathname !== '/admin/login') {
      router.push('/admin/login');
      return;
    }
    
    // If a user is logged in but they are not any kind of admin,
    // they do not have permission. Sign them out and redirect.
    if (user && !isAdmin && !isSuperAdmin) {
        if (auth) {
            auth.signOut();
        }
        router.push('/admin/login');
        return;
    }

  }, [isLoading, user, isAdmin, isSuperAdmin, router, pathname, auth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Verifying access...</p>
      </div>
    );
  }

  // Allow login page to render without the layout and checks.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // If after loading, the user is not an authorized admin, show access denied.
  // This state is hit if a non-admin user somehow gets here.
  if (!user || (!isAdmin && !isSuperAdmin)) {
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
            <p>You do not have permission to view this page. Please log in with a staff account.</p>
            <Button onClick={() => router.push('/admin/login')} className="mt-4">Return to Login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // If we have an authorized user, render the full admin layout.
  return (
    <div className="flex flex-col min-h-screen">
      <AdminHeader />
      <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
        {children}
      </main>
    </div>
  );
}
