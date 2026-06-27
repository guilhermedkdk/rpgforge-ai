import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const spinnerSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const;

export type SpinnerSize = keyof typeof spinnerSizes;

type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

export const Spinner = ({ size = 'md', className }: SpinnerProps) => (
  <Loader2 className={cn('animate-spin', spinnerSizes[size], className)} aria-hidden="true" />
);
