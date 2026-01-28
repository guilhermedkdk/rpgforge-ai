'use client';

export const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="text-center">
      <div
        className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"
        aria-hidden
      />
      <p className="mt-4 text-muted-foreground">Carregando...</p>
    </div>
  </div>
);
