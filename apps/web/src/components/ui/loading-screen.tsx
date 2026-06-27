import { LoadingState } from '@/components/ui/loading-state';

type LoadingScreenProps = {
  label?: string;
};

export const LoadingScreen = ({ label = 'Carregando...' }: LoadingScreenProps) => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <LoadingState label={label} />
  </div>
);
