'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/hooks/use-admin';
import { useSocialWorker } from '@/hooks/use-social-worker';
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
  ClipboardCheck,
  Heart,
  Printer,
  FolderSync,
  Bell,
  BellRing,
  Database,
  FileEdit,
  Mail,
  Brain,
  ChevronDown,
  ChevronRight,
  Activity,
  Settings,
  MessageSquareText,
  FileText,
  TestTube2,
  Map,
  Calendar,
  DollarSign,
  Navigation,
  Wrench,
  UserPlus,
  CalendarCheck,
  RefreshCw,
  Users,
  RotateCcw,
  UserCheck,
  FileBarChart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/firebase';
import { NotificationManager } from '@/components/CursorStyleNotification';
import { StaffNotificationBell } from '@/components/StaffNotificationBell';
import { SocialWorkerRedirect } from '@/components/SocialWorkerRedirect';
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
    label: 'Dashboard', 
    icon: LayoutDashboard, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin', label: 'Activity Dashboard', icon: Activity },
      { href: '/admin/activity-log', label: 'Activity Log', icon: Activity },
      { href: '/admin/applications', label: 'All Applications', icon: FolderKanban },
      { href: '/admin/applications/create', label: 'Create Application', icon: UserPlus },
      { href: '/admin/member-notes', label: 'Member Notes Lookup', icon: MessageSquareText },
      { href: '/admin/eligibility-checks', label: 'Eligibility Checks', icon: Shield }
    ]
  },
  { 
    label: 'My Tasks', 
    icon: ClipboardList, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/my-notes', label: 'My Notifications', icon: Bell },
      { href: '/admin/tasks', label: 'My Tasks', icon: ClipboardList },
      { href: '/admin/morning-dashboard', label: 'Morning Dashboard', icon: LayoutDashboard }
    ]
  },
  { 
    label: 'Tools', 
    icon: Wrench, 
    isSubmenu: true,
    submenuItems: [
      { href: '/admin/ils-report-editor', label: 'ILS Report Editor', icon: FileEdit },
      { href: '/admin/kaiser-tracker', label: 'Kaiser Tracker', icon: Heart },
      { href: '/admin/social-worker-assignments', label: 'Social Worker Assignments', icon: UserPlus },
      { href: '/admin/sw-visit-tracking', label: 'SW Visit Tracking System', icon: FileBarChart },
      { href: '/admin/member-activity', label: 'Member Activity', icon: Activity },
      { href: '/admin/progress-tracker', label: 'Progress Tracker', icon: ListChecks },
      { href: '/admin/authorization-tracker', label: 'Authorization Tracker', icon: Shield },
      { href: '/admin/statistics', label: 'Statistics', icon: BarChart3 },
      { href: '/admin/california-map-enhanced', label: 'Map Intelligence', icon: Navigation },
      { href: '/admin/california-counties', label: 'County Analysis', icon: Map },
      { href: '/admin/reports', label: 'Reports', icon: FileText }
    ]
  },
];

const superAdminNavLinks = [
  { 
    label: 'Super Admin', 
    icon: ShieldAlert, 
    isSubmenu: true,
    submenuItems: [
      // Consolidated Management Pages
      { href: '/admin/user-staff-management', label: 'User & Staff Management', icon: Users },
      { href: '/admin/operations-dashboard', label: 'Operations Dashboard', icon: Kanban },
      { href: '/admin/system-configuration', label: 'System Configuration', icon: Settings },
      { href: '/admin/data-integration', label: 'Data & Integration Tools', icon: Database },
      { href: '/admin/communication-notes', label: 'Communication & Notes', icon: MessageSquareText },
      { href: '/admin/development-testing', label: 'Development & Testing', icon: TestTube2 }
    ]
  }
];

function AdminHeader() {
  const { user, isSuperAdmin } = useAdmin();
  const { isSocialWorker } = useSocialWorker();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
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

  // Filter navigation based on user role
  let combinedNavLinks = adminNavLinks;
  
  if (isSocialWorker) {
    // Social workers only see the SW tab
    combinedNavLinks = adminNavLinks.filter(nav => nav.label === 'SW');
  } else if (isSuperAdmin) {
    // Super admins see everything
    combinedNavLinks = [...adminNavLinks, ...superAdminNavLinks];
  } else {
    // Regular admins see admin nav links, but hide SW tab unless it's the test account
    const isTestAccount = user?.email === 'jcbloome@gmail.com';
    if (!isTestAccount) {
      combinedNavLinks = adminNavLinks.filter(nav => nav.label !== 'SW');
    }
  }

  return (
    <div className="bg-card border-b sticky top-0 z-40">
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

          {/* Desktop Navigation */}
          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList className="flex gap-1">
              {combinedNavLinks.map((navItem) => (
                <NavigationMenuItem key={navItem.label}>
                  {navItem.isSubmenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className={cn(
                            navigationMenuTriggerStyle(),
                            "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary focus:text-primary focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50",
                            pathname.startsWith(navItem.submenuItems?.[0]?.href || '') && "bg-accent text-accent-foreground"
                          )}
                        >
                          <navItem.icon className="h-4 w-4" />
                          {navItem.label}
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64 z-40">
                        {navItem.submenuItems?.map((item, index) => (
                          item.isDivider ? (
                            <div key={index}>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                                {item.label}
                              </DropdownMenuLabel>
                            </div>
                          ) : (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                                  pathname === item.href && "bg-accent text-accent-foreground font-medium"
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                              </Link>
                            </DropdownMenuItem>
                          )
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <NavigationMenuLink asChild>
                      <Link
                        href={navItem.href || '#'}
                        className={cn(
                          navigationMenuTriggerStyle(),
                          "flex items-center gap-2",
                          pathname === navItem.href && "bg-accent text-accent-foreground"
                        )}
                      >
                        <navItem.icon className="h-4 w-4" />
                        {navItem.label}
                      </Link>
                    </NavigationMenuLink>
                  )}
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-3 relative z-50">
          {/* Staff Notification Bell */}
          <StaffNotificationBell userId={user?.uid} />
          
          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                <span className="hidden sm:inline-block text-sm">
                  {user?.displayName || user?.email || 'Admin'}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-45">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.displayName || 'Admin User'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/admin/profile')}>
                <UserIcon className="h-4 w-4 mr-2" />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>
                  Access all admin features and tools
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {combinedNavLinks.map((navItem) => (
                  <div key={navItem.label}>
                    {navItem.isSubmenu ? (
                      <div>
                        <Button
                          variant="ghost"
                          onClick={() => toggleSubmenu(navItem.label)}
                          onMouseEnter={() => handleMouseEnter(navItem.label)}
                          onMouseLeave={handleMouseLeave}
                          className="w-full justify-between text-left font-medium"
                        >
                          <div className="flex items-center gap-3">
                            <navItem.icon className="h-4 w-4" />
                            {navItem.label}
                          </div>
                          <ChevronRight 
                            className={cn(
                              "h-4 w-4 transition-transform",
                              openSubmenus.has(navItem.label) && "rotate-90"
                            )}
                          />
                        </Button>
                        {openSubmenus.has(navItem.label) && (
                          <div className="ml-6 mt-2 space-y-2">
                            {navItem.submenuItems?.map((item, index) => (
                              item.isDivider ? (
                                <div key={index} className="py-2">
                                  <div className="border-t border-border" />
                                  <p className="mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {item.label}
                                  </p>
                                </div>
                              ) : (
                                <SheetClose asChild key={item.href}>
                                  <Link
                                    href={item.href}
                                    className={cn(
                                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                                      pathname === item.href && "bg-accent text-accent-foreground font-medium"
                                    )}
                                  >
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                  </Link>
                                </SheetClose>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <SheetClose asChild>
                        <Link
                          href={navItem.href || '#'}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            pathname === navItem.href && "bg-accent text-accent-foreground"
                          )}
                        >
                          <navItem.icon className="h-4 w-4" />
                          {navItem.label}
                        </Link>
                      </SheetClose>
                    )}
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();

  // Allow access to login page without authentication
  const isLoginPage = pathname === '/admin/login';

  // Debug logging for admin layout
  useEffect(() => {
    console.log('🔍 Admin Layout Debug:', {
      pathname,
      isLoginPage,
      loading,
      isAdmin,
      userEmail: user?.email,
      timestamp: new Date().toLocaleTimeString()
    });
  }, [pathname, isLoginPage, loading, isAdmin, user?.email]);

  useEffect(() => {
    if (!loading) {
      console.log('🔍 Admin Layout Auth Check:', {
        isAdmin,
        isLoginPage,
        userEmail: user?.email,
        willRedirect: !isAdmin && !isLoginPage
      });
      
      if (!isAdmin && !isLoginPage) {
        console.log('🚫 Redirecting to login - user not recognized as admin');
        router.replace('/admin/login');
      } else if (isAdmin && isLoginPage) {
        console.log('✅ Admin detected on login page - redirecting to dashboard');
        router.replace('/admin');
      }
    }
  }, [loading, isAdmin, isLoginPage, router, user?.email]);

  // Show loading spinner while checking authentication (but not for login page)
  if (loading && !isLoginPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // If this is the login page, render it without the admin layout
  if (isLoginPage) {
    return (
      <NotificationManager>
        <div className="min-h-screen">
          {children}
        </div>
      </NotificationManager>
    );
  }
  
  // If loading is done and user is an admin, show the full admin layout.
  return (
    <NotificationManager>
      <SocialWorkerRedirect />
      <div className="flex flex-col min-h-screen">
        <AdminHeader />
        <main className="flex-grow p-4 sm:p-6 md:p-8 bg-slate-50/50">
          {children}
        </main>
      </div>
    </NotificationManager>
  );
}