'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

export type AppDialogOptions = {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type DialogRequest = AppDialogOptions & {
  id: number;
  kind: 'confirm' | 'alert';
  resolve: (value: boolean) => void;
};

let nextId = 1;
let queue: DialogRequest[] = [];
let listener: ((queue: DialogRequest[]) => void) | null = null;

const emit = () => listener?.([...queue]);

const normalize = (input: string | AppDialogOptions): AppDialogOptions =>
  typeof input === 'string' ? { description: input } : input;

const descriptionAsText = (options: AppDialogOptions) =>
  [options.title, typeof options.description === 'string' ? options.description : '']
    .filter(Boolean)
    .join('\n\n');

function enqueue(kind: DialogRequest['kind'], input: string | AppDialogOptions): Promise<boolean> {
  const options = normalize(input);
  // Pages rendered outside AppProviders (no host mounted) fall back to the native dialogs.
  if (!listener) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (kind === 'confirm') return Promise.resolve(window.confirm(descriptionAsText(options)));
    window.alert(descriptionAsText(options));
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { ...options, kind, id: nextId++, resolve }];
    emit();
  });
}

/** In-app replacement for window.confirm. Resolves true when the user confirms. */
export function appConfirm(input: string | AppDialogOptions): Promise<boolean> {
  return enqueue('confirm', input);
}

/** In-app replacement for window.alert. Resolves when the user dismisses it. */
export async function appAlert(input: string | AppDialogOptions): Promise<void> {
  await enqueue('alert', input);
}

export function AppDialogHost() {
  const [pending, setPending] = useState<DialogRequest[]>([]);

  useEffect(() => {
    listener = setPending;
    setPending([...queue]);
    return () => {
      if (listener === setPending) listener = null;
    };
  }, []);

  const current = pending[0];

  const settle = (value: boolean) => {
    if (!current) return;
    queue = queue.filter((item) => item.id !== current.id);
    current.resolve(value);
    emit();
  };

  const isConfirm = current?.kind === 'confirm';
  const title = current?.title || (isConfirm ? 'Please confirm' : 'Notice');

  return (
    <AlertDialog open={Boolean(current)} onOpenChange={(open) => !open && settle(false)}>
      {current ? (
        <AlertDialogContent key={current.id}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {current.description ? (
              <AlertDialogDescription className="whitespace-pre-line">
                {current.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isConfirm ? (
              <AlertDialogCancel onClick={() => settle(false)}>
                {current.cancelText || 'Cancel'}
              </AlertDialogCancel>
            ) : null}
            <AlertDialogAction
              className={current.destructive ? buttonVariants({ variant: 'destructive' }) : undefined}
              onClick={() => settle(true)}
            >
              {current.confirmText || (isConfirm ? 'Continue' : 'OK')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
