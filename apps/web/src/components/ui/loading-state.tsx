import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

type LoadingStateProps = {
  inline?: boolean;
  className?: string;
};

export const LoadingState = ({ inline = false, className }: LoadingStateProps) => (
  <div className={cn('flex items-center justify-center', !inline && 'py-16', className)}>
    <Spinner size={inline ? 'sm' : 'lg'} className="text-primary" />
  </div>
);
