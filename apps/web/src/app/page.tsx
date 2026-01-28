'use client';

import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-foreground">ForgeSheet AI</h1>
            </div>
            <nav className="flex items-center gap-4">
              {user ? (
                <>
                  <span className="text-sm text-muted-foreground">{user.email}</span>
                  <Button variant="outline" onClick={() => logout()}>
                    Sair
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link href="/auth/login">Entrar</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/auth/register">Criar conta</Link>
                  </Button>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-foreground">Bem-vindo ao ForgeSheet AI</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {user
              ? `Olá, ${user.email}! Em breve você poderá criar suas fichas de RPG aqui.`
              : 'Gere e gerencie fichas de personagens de RPG usando IA'}
          </p>
          {!user && (
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link href="/auth/register">Começar agora</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
