import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

type LoadingStateProps = {
  label: string;
  inline?: boolean;
  className?: string;
};

export const LoadingState = ({ label, inline = false, className }: LoadingStateProps) => {
  if (inline) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Spinner size="sm" className="text-primary" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-16', className)}>
      <Spinner size="lg" className="text-primary" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
    </div>
  );
};
