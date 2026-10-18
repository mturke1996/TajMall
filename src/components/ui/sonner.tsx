'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      richColors={false}
      closeButton
      className="!z-[200]"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-xl border border-border bg-card text-foreground shadow-lift',
          description: 'text-muted-foreground',
          actionButton: 'bg-foreground text-sand-50',
          cancelButton: 'bg-secondary text-secondary-foreground',
        },
      }}
      {...props}
    />
  );
}
