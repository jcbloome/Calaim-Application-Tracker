'use client';

import { ReactNode, useEffect } from 'react';
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
    router.push('/admin/login');
  };

  return (
    <header className="bg-card border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-lg text-primary">
            <Image
              src="/calaimlogopdf.png"
              alt="CalAIM Pathfinder Logo"
              width={240}
              height={60}
              className="w-60 h-auto object-contain"
              priority
            />
            <span className="sr-only">Admin Portal</span>
          </Link>

          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList>
              {adminNavLinks.map(link => {
                if (link.super && !isSuperAdmin) return null;
                const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
                return (
                  <NavigationMenuItem key={link.href}>
                    <Link href={link.href} legacyBehavior passHref>
                      <NavigationMenuLink active={isActive} className={navigationMenuTriggerStyle()}>
                        <link.icon className="mr-2 h-4 w-4" />
                        {link.label}
                      </NavigationMenuLink>
                    </Link>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-4">
            <div className="hidden lg:block text-sm text-muted-foreground">
                <span className="border-r pr-4 mr-4 font-medium">Admin Portal</span>
            </div>
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
      <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
        {children}
      </main>
    </div>
  );
}
