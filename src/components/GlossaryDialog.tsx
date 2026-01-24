
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { acronyms } from '@/lib/data';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlossaryDialog({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "shadow-sm border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800",
            className
          )}
        >
            <BookOpen className="mr-2 h-4 w-4" />
            Acronym Glossary
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acronym Glossary</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-72">
          <dl className="p-4">
            {acronyms.map((item, index) => (
              <div key={item.term}>
                <div className="flex items-baseline gap-4 py-3">
                  <dt className="w-20 text-right font-bold text-primary shrink-0">{item.term}</dt>
                  <dd className="text-muted-foreground">{item.definition}</dd>
                </div>
                {index < acronyms.length - 1 && <Separator />}
              </div>
            ))}
          </dl>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
