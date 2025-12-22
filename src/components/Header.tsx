
'use client';

import Link from 'next/link';
import { LogOut, User, Menu, UserCog, Shield } from 'lucide-react';
import { Button } from './ui/button';
import { useUser } from '@/firebase';
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
    { href: "/applications", label: "My Applications" },
    { href: "/forms/printable-package", label: "Printable Forms" },
];

export function Header() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [isSheetOpen, setSheetOpen] = useState(false);

  const handleSignOut = async () => {
    if (auth) {
        await auth.signOut();
    }
    router.push('/');
  };

  return (
    <header className="bg-card/80 backdrop-blur-sm border-b sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between h-20 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-primary">
          <Image 
            src="/calaimlogopdf.png"
            alt="CalAIM Pathfinder Logo"
            width={300}
            height={84}
            className="w-64 sm:w-72 h-auto object-contain"
            priority
          />
        </Link>
        <nav className="hidden md:flex items-center gap-2">
            {navLinks.map(link => (
                <Button key={link.href} variant="ghost" asChild>
                    <Link href={link.href}>{link.label}</Link>
                </Button>
            ))}

           {isUserLoading ? (
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <div className='flex items-center gap-2'>
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
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
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ) : (
            <Button asChild>
              <Link href="/login">Login</Link>
            </Button>
          )}
        </nav>
        <div className="md:hidden">
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
                        </nav>
                        <div className="mt-auto border-t pt-6">
                             {isUserLoading ? (
                                <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
                            ) : user ? (
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
                                <Button asChild className="w-full">
                                    <Link href="/login" onClick={() => setSheetOpen(false)}>Login</Link>
                                </Button>
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
