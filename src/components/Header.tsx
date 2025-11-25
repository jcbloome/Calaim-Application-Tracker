
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LogOut, User, Database, HelpCircle, Menu } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth, useUser } from '@/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from 'next/navigation';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { useState } from 'react';

const navLinks = [
    { href: "/info", label: "Program Information" },
    { href: "/faq", label: "FAQ & Glossary" },
    { href: "/applications", label: "My Applications" },
    { href: "/forms/printable-package", label: "Printable Forms" },
    { href: "/db-tool", label: "DB Tool" },
];

export function Header() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const logo = PlaceHolderImages.find(p => p.id === 'calaim-logo');
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
          {logo && (
            <Image 
              src={logo.imageUrl}
              alt={logo.description}
              width={250}
              height={50}
              priority
              className="object-contain"
            />
          )}
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
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                  <span className="sr-only">User menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                                     <p className="text-sm text-muted-foreground text-center truncate">{user.email}</p>
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
