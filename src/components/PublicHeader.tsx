'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';

const navLinks = [
  { href: '/info', label: 'Program Information' },
  { href: '/faq', label: 'FAQ & Glossary' },
  { href: '/eligibility-check', label: 'Eligibility Check' },
  { href: '/applications', label: 'My Applications' },
  { href: '/forms/printable-package', label: 'Printable Forms' },
];

export function PublicHeader() {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isMobileMenuOpen]);

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

        {/* Mobile menu */}
        <div className="lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="public-mobile-nav"
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
            id="public-mobile-nav"
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
              </nav>
              <div className="mt-2 border-t pt-3">
                <Button asChild className="w-full">
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    Login
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

