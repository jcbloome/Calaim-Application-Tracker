'use client';

import { useMemo } from 'react';
import { Check, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/components/LanguageProvider';

type LanguageCode = 'en' | 'es';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language: currentLanguage, setLanguage } = useLanguage();
  const languageLabel = useMemo(
    () => (currentLanguage === 'es' ? 'Español' : 'English'),
    [currentLanguage]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={className} aria-label="Language">
          <Languages className="h-4 w-4" />
          <span className="sr-only">Language: {languageLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setLanguage('en')}>
          {currentLanguage === 'en' ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 inline-block w-4" />}
          English
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLanguage('es')}>
          {currentLanguage === 'es' ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 inline-block w-4" />}
          Espanol
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
