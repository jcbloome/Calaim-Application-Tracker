
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LogOut, User, Database, HelpCircle } from 'lucide-react';
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

export function Header() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const logo = PlaceHolderImages.find(p => p.id === 'calaim-logo');

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
          <Button variant="ghost" asChild>
            <Link href="/info">Program Information</Link>
          </Button>
           <Button variant="ghost" asChild>
            <Link href="/faq">FAQ & Glossary</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/applications">My Applications</Link>
          </Button>
           <Button variant="ghost" asChild>
            <Link href="/forms/printable-package">Printable Forms</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/db-tool">DB Tool</Link>
          </Button>
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
      </div>
    </header>
  );
}
