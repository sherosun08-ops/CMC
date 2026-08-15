import React from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  className?: string;
  variant?: 'spinner' | 'skeleton' | 'page';
}

export function LoadingState({ message = 'Loading...', className, variant = 'spinner' }: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={cn('space-y-4 p-6', className)}>
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (variant === 'page') {
    return (
      <div className={cn('flex flex-col items-center justify-center min-h-[400px]', className)}>
        <div className="h-8 w-64 animate-pulse rounded bg-muted mb-4" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted mb-2" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-16', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}