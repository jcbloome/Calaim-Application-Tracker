
'use client';

import Link from 'next/link';
import { LogOut, User, Menu, UserCog, LogIn, TestTube2, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '@/firebase/provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { useState } from 'react';
import Image from 'next/image';
import { useAdmin } from '@/hooks/use-admin';

const navLinks = [
    { href: "/info", label: "Program Information" },
    { href: "/faq", label: "FAQ & Glossary" },
    { href: "/eligibility-check", label: "Eligibility Check" },
    { href: "/applications", label: "My Applications" },
    { href: "/forms/printable-package", label: "Printable Forms" },
];

export function Header() {
  const { user, isUserLoading, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const router = useRouter();
  const [isSheetOpen, setSheetOpen] = useState(false);

  const handleSignOut = async () => {
    if (auth) {
        await auth.signOut();
    }
    // Clear session storage to ensure fresh login next time
    sessionStorage.removeItem('auth_session_active');
    localStorage.clear(); // Clear all local storage for complete logout
    fetch('/api/auth/admin-session', { method: 'DELETE' }).catch(() => undefined);
    
    // After signing out, always return to the public home page.
    window.location.href = '/';
  };

  const handleSwitchRole = async () => {
    // Sign out and redirect to login selection
    if (auth) {
        await auth.signOut();
    }
    // Clear session storage to ensure fresh login next time
    sessionStorage.removeItem('auth_session_active');
    localStorage.clear();
    fetch('/api/auth/admin-session', { method: 'DELETE' }).catch(() => undefined);
    
    // Redirect to home page where user can choose admin or user login
    window.location.href = '/';
  };

  const showUserSession = !isUserLoading && !isAdminLoading && user;

  return (
    <header className="bg-card/80 backdrop-blur-sm border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-20 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary flex-shrink-0">
          <Image
              src="/calaimlogopdf.png"
              alt="Connect CalAIM Logo"
              width={240}
              height={67}
              className="w-32 sm:w-40 lg:w-48 h-auto object-contain"
              priority
            />
        </Link>
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
            {navLinks.map(link => (
                 <Button key={link.href} variant="ghost" size="sm" asChild>
                    <Link href={link.href} className="text-sm">{link.label}</Link>
                </Button>
            ))}
            
            {/* Contact Us on the right side */}
            <Button variant="outline" size="sm" asChild className="ml-2 xl:ml-4">
                <Link href="/contact" className="text-sm">Contact Us</Link>
            </Button>

           {(isUserLoading || isAdminLoading) ? (
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
          ) : showUserSession ? ( 
            <div className='flex items-center gap-3'>
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full h-11 w-11">
                  <User className="h-6 w-6" />
                  <span className="sr-only">User menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.displayName || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                 <DropdownMenuItem onSelect={() => router.push('/profile')}>
                  <UserCog className="mr-2 h-4 w-4" />
                  <span>My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSwitchRole}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  <span>Switch Role</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center gap-2">
                <Button asChild>
                    <Link href="/login"><LogIn className="mr-2 h-4 w-4" />Login</Link>
                </Button>
            </div>
          )}
        </nav>
        <div className="lg:hidden">
            <Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Open menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full max-w-xs">
                    <SheetHeader className="sr-only">
                        <SheetTitle>Mobile Menu</SheetTitle>
                        <SheetDescription>Navigation links for mobile view.</SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col h-full">
                        <nav className="flex flex-col gap-4 py-8">
                             {navLinks.map(link => (
                                <Link key={link.href} href={link.href} className="text-lg font-medium text-foreground hover:text-primary" onClick={() => setSheetOpen(false)}>
                                    {link.label}
                                </Link>
                            ))}
                            <Link href="/contact" className="text-lg font-medium text-primary border-t pt-4 mt-2" onClick={() => setSheetOpen(false)}>
                                Contact Us
                            </Link>
                        </nav>
                        <div className="mt-auto border-t pt-6">
                             {(isUserLoading || isAdminLoading) ? (
                                <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
                            ) : showUserSession ? (
                                <div className="flex flex-col gap-4">
                                     <p className="text-sm text-muted-foreground text-center truncate">{user.displayName || user.email}</p>
                                      <Button onClick={() => { router.push('/profile'); setSheetOpen(false); }} variant="outline" className="w-full">
                                        <UserCog className="mr-2 h-4 w-4" />
                                        My Profile
                                     </Button>
                                     <Button onClick={() => { handleSignOut(); setSheetOpen(false); }} className="w-full">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Log out
                                     </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <Button asChild className="w-full">
                                        <Link href="/login" onClick={() => setSheetOpen(false)}><LogIn className="mr-2 h-4 w-4" />Login</Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
      </div>
    </header>
  );
}
