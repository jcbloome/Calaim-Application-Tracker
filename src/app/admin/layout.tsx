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
  FolderSync,
  Bell,
  Database,
  FileEdit,
  Mail,
  Brain,
  ChevronDown,
  ChevronRight,
  Settings,
  MessageSquareText,
  FileText,
  Activity,
  TestTube2,
  Scissors,
  Map,
  Calendar,
  DollarSign,
  Navigation,
  Wrench
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/firebase';
import { NotificationManager } from '@/components/CursorStyleNotification';
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
  { 
    label: 'Overview', 
    icon: LayoutDashboard, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
      { href: '/admin/authorization-tracker', label: 'Authorization Tracker', icon: DollarSign },
    ]
  },
  { 
    label: 'Applications', 
    icon: FolderKanban, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/applications', label: 'All Applications', icon: FolderKanban },
      { href: '/admin/progress-tracker', label: 'Progress Tracker', icon: ListChecks },
      { href: '/admin/forms/review', label: 'Form Review', icon: FileEdit },
    ]
  },
  { 
    label: 'Tasks', 
    icon: ClipboardList, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/tasks', label: 'Task Management', icon: ClipboardList },
      { href: '/admin/staff-notes', label: 'My Notes', icon: MessageSquareText },
    ]
  },
  { 
    label: 'Kaiser', 
    icon: Heart, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/kaiser-tracker', label: 'Kaiser Tracker', icon: Heart },
      { href: '/admin/daily-tasks', label: 'Daily Task Board', icon: Calendar },
      { href: '/admin/ils-report-editor', label: 'ILS Report Editor', icon: FileEdit },
    ]
  },
  { 
    label: 'Tools', 
    icon: Wrench, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/california-map-enhanced', label: 'California Resource Map', icon: Map },
      { href: '/admin/form-separator', label: 'Form Separator Tool', icon: Scissors },
    ]
  },
];

const superAdminNavLinks = [
    { 
      label: 'Super Admin', 
      icon: Shield, 
      isSubmenu: true,
      submenuItems: [
        { href: '/admin/super', label: 'Admin Panel', icon: Shield },
        { href: '/admin/managerial-overview', label: 'Managerial Overview', icon: Kanban },
        { href: '/admin/login-activity', label: 'Login Activity', icon: Activity },
        { isDivider: true, label: 'Caspio Tools' },
        { href: '/admin/caspio-field-mapping', label: 'Field Mapping Configuration', icon: Map },
        { href: '/admin/caspio-test', label: 'Sync Testing & Development', icon: Database },
        { href: '/admin/migrate-drive', label: 'Migrate Drive', icon: FolderSync },
        { href: '/admin/comprehensive-matching', label: 'Legacy Member Search', icon: Brain },
        { isDivider: true, label: 'Notifications' },
        { href: '/admin/notification-settings', label: 'Notification Settings', icon: Settings },
        { href: '/admin/system-note-log', label: 'System Note Log', icon: MessageSquareText },
        { href: '/admin/super-admin-notes', label: 'Complete Note Log', icon: FileText },
        { href: '/admin/notification-demo', label: 'Notification Demo', icon: Bell },
        { isDivider: true, label: 'Development Tools' },
        { href: '/admin/user-diagnostics', label: 'User Side Diagnostic Tools', icon: TestTube2 },
        { href: '/admin/email-test', label: 'Email Test Panel', icon: Mail },
      ]
    },
];


function AdminHeader() {
  const { user, isSuperAdmin } = useAdmin();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set());
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
    }
    window.location.href = '/';
  };

  const toggleSubmenu = (label: string) => {
    const newOpenSubmenus = new Set(openSubmenus);
    if (newOpenSubmenus.has(label)) {
      newOpenSubmenus.delete(label);
    } else {
      newOpenSubmenus.add(label);
    }
    setOpenSubmenus(newOpenSubmenus);
  };

  const handleMouseEnter = (label: string) => {
    setHoveredSubmenu(label);
  };

  const handleMouseLeave = () => {
    setHoveredSubmenu(null);
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
                if (link.isSubmenu && link.submenuItems) {
                  const isSubmenuActive = link.submenuItems.some(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href)));
                  const Icon = link.icon;
                  return (
                    <NavigationMenuItem key={link.label}>
                      <div 
                        className="relative"
                        onMouseEnter={() => handleMouseEnter(link.label)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <button className={`${navigationMenuTriggerStyle()} ${isSubmenuActive ? 'bg-accent text-accent-foreground' : ''} flex items-center gap-2 hover:bg-accent hover:text-accent-foreground ${link.label === 'Super Admin' ? '!text-foreground font-medium' : 'text-foreground'}`}>
                          {Icon && <Icon className="h-4 w-4" />}
                          {link.label}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <div className={`absolute top-full left-0 mt-1 w-48 bg-white border rounded-md shadow-lg transition-all duration-200 z-50 ${
                          hoveredSubmenu === link.label ? 'opacity-100 visible' : 'opacity-0 invisible'
                        }`}>
                          {link.submenuItems.map((subItem, index) => {
                            if (subItem.isDivider) {
                              return (
                                <div key={`divider-${index}`} className="px-3 py-1 border-t border-gray-200 mt-1 pt-2">
                                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {subItem.label}
                                  </div>
                                </div>
                              );
                            }
                            const isActive = pathname === subItem.href;
                            const SubIcon = subItem.icon;
                            return (
                              <Link
                                key={subItem.href}
                                href={subItem.href}
                                className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 ${isActive ? 'bg-gray-100 font-medium' : ''}`}
                              >
                                {SubIcon && <SubIcon className="h-4 w-4" />}
                                {subItem.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </NavigationMenuItem>
                  );
                } else {
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
                }
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
                       
                       if (link.isSubmenu && link.submenuItems) {
                         const isOpen = openSubmenus.has(link.label);
                         return (
                           <div key={link.label}>
                             <button
                               onClick={() => toggleSubmenu(link.label)}
                               className="flex items-center justify-between w-full gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                             >
                               <div className="flex items-center gap-3">
                                 {Icon && <Icon className="h-4 w-4" />}
                                 {link.label}
                               </div>
                               {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                             </button>
                             {isOpen && (
                               <div className="ml-6 space-y-1">
                                 {link.submenuItems.map((subItem, index) => {
                                   if (subItem.isDivider) {
                                     return (
                                       <div key={`mobile-divider-${index}`} className="px-3 py-1 border-t border-gray-200 mt-2 pt-2">
                                         <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                           {subItem.label}
                                         </div>
                                       </div>
                                     );
                                   }
                                   const SubIcon = subItem.icon;
                                   return (
                                     <SheetClose asChild key={subItem.href}>
                                       <Link href={subItem.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-primary">
                                         {SubIcon && <SubIcon className="h-3 w-3" />}
                                         {subItem.label}
                                       </Link>
                                     </SheetClose>
                                   );
                                 })}
                               </div>
                             )}
                           </div>
                         );
                       } else {
                         return (
                          <SheetClose asChild key={link.href}>
                            <Link href={link.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary">
                              {Icon && <Icon className="h-4 w-4" />}
                              {link.label}
                            </Link>
                          </SheetClose>
                        );
                       }
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
    <NotificationManager>
      <div className="flex flex-col min-h-screen">
        <AdminHeader />
        <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
          {children}
        </main>
      </div>
    </NotificationManager>
  );
}
