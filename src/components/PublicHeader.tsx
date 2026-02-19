'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

const navLinks = [
  { href: '/info', label: 'Program Information' },
  { href: '/faq', label: 'FAQ & Glossary' },
  { href: '/eligibility-check', label: 'Eligibility Check' },
  { href: '/applications', label: 'My Applications' },
  { href: '/forms/printable-package', label: 'Printable Forms' },
];

export function PublicHeader() {
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
          {navLinks.map((link) => (
            <Button key={link.href} variant="ghost" size="sm" asChild>
              <Link href={link.href} className="text-sm">
                {link.label}
              </Link>
            </Button>
          ))}
          <Button variant="outline" size="sm" asChild className="ml-2 xl:ml-4">
            <Link href="/contact" className="text-sm">
              Contact Us
            </Link>
          </Button>
          <div className="flex items-center gap-2 ml-2">
            <Button asChild>
              <Link href="/login" className="text-sm">
                Login
              </Link>
            </Button>
          </div>
        </nav>

        {/* Mobile menu without JS (details/summary). */}
        <div className="lg:hidden">
          <details className="relative">
            <summary className="list-none">
              <Button variant="outline" size="sm">Menu</Button>
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-md border bg-white shadow-lg p-2">
              <div className="flex flex-col">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm hover:bg-accent"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="my-2 border-t" />
                <Link href="/contact" className="rounded-md px-3 py-2 text-sm hover:bg-accent">
                  Contact Us
                </Link>
                <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-accent">
                  Login
                </Link>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

