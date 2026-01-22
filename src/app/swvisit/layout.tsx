'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

interface SWPortalLayoutProps {
  children: React.ReactNode;
}

export default function SWPortalLayout({ children }: SWPortalLayoutProps) {
  const pathname = usePathname();
  
  // Don't apply layout to login page
  if (pathname === '/swvisit/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}