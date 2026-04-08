
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
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { setPortalSessionOfflineClient, trackLoginActivityClient } from '@/lib/login-activity-client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

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
  const firestore = useFirestore();
  const router = useRouter();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isMobileMenuOpen]);

  const handleSignOut = async () => {
    try {
      if (firestore && user?.uid) {
        const role = isSuperAdmin ? 'Super Admin' : (isAdmin ? 'Admin' : 'User');
        await trackLoginActivityClient(firestore, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role,
          action: 'logout',
          portal: isAdmin ? 'admin' : 'user',
        });
        await setPortalSessionOfflineClient(firestore, user.uid);
      }
    } catch {
      // best-effort only
    }
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
    try {
      if (firestore && user?.uid) {
        const role = isSuperAdmin ? 'Super Admin' : (isAdmin ? 'Admin' : 'User');
        await trackLoginActivityClient(firestore, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role,
          action: 'logout',
          portal: isAdmin ? 'admin' : 'user',
        });
        await setPortalSessionOfflineClient(firestore, user.uid);
      }
    } catch {
      // best-effort only
    }
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

            {!isAdmin && !isSuperAdmin ? <LanguageSwitcher className="h-9 w-9 ml-2" /> : null}
            
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-main-nav"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </div>
      </div>
      {isMobileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            id="mobile-main-nav"
            className="fixed inset-x-0 top-20 z-[60] max-h-[calc(100dvh-5rem)] overflow-y-auto border-t bg-card px-4 pb-5 pt-4 shadow-lg lg:hidden"
          >
            <div className="flex flex-col gap-3">
              <nav className="flex flex-col gap-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-base font-medium text-foreground hover:text-primary"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/contact"
                  className="mt-1 border-t pt-3 text-base font-medium text-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Contact Us
                </Link>
                {!isAdmin && !isSuperAdmin ? (
                  <div className="mt-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Language</span>
                      <LanguageSwitcher />
                    </div>
                  </div>
                ) : null}
              </nav>
              <div className="mt-2 border-t pt-3">
                {(isUserLoading || isAdminLoading) ? (
                  <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
                ) : showUserSession ? (
                  <div className="flex flex-col gap-3">
                    <p className="truncate text-sm text-muted-foreground">{user.displayName || user.email}</p>
                    <Button
                      type="button"
                      onClick={() => {
                        router.push('/profile');
                        setMobileMenuOpen(false);
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      <UserCog className="mr-2 h-4 w-4" />
                      My Profile
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSignOut();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </Button>
                  </div>
                ) : (
                  <Button asChild className="w-full">
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                      <LogIn className="mr-2 h-4 w-4" />
                      Login
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}
