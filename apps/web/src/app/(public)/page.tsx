'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Sparkles, Scroll, Zap } from 'lucide-react';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/sheets');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return null; // Redirecting
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-16">
        {/* Hero Section */}
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-10 w-10 text-primary" aria-hidden="true" />
            </div>
          </div>
          <h1 className="mb-4 font-serif text-5xl font-bold text-foreground md:text-6xl">
            Bem-vindo ao RPGForge AI
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-muted-foreground">
            Gere e gerencie fichas de personagens de RPG usando inteligência artificial. Forje
            personagens únicos para suas aventuras.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth/register">
                <Sparkles className="mr-2 h-5 w-5" aria-hidden="true" />
                Começar agora
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/auth/login">Entrar</Link>
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-24 grid gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            </div>
            <h3 className="mb-2 font-serif text-xl font-semibold text-foreground">
              Criação com IA
            </h3>
            <p className="text-muted-foreground">
              Descreva seu conceito e deixe a IA criar seu personagem completo com atributos,
              habilidades e backstory.
            </p>
          </div>

          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Scroll className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            </div>
            <h3 className="mb-2 font-serif text-xl font-semibold text-foreground">
              Biblioteca Completa
            </h3>
            <p className="text-muted-foreground">
              Acesse uma biblioteca completa de regras, feitiços, equipamentos e muito mais para
              personalizar seu personagem.
            </p>
          </div>

          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            </div>
            <h3 className="mb-2 font-serif text-xl font-semibold text-foreground">
              Gerenciamento Fácil
            </h3>
            <p className="text-muted-foreground">
              Organize, edite e compartilhe suas fichas. Exporte para PDF e mantenha tudo organizado
              em um só lugar.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card/50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-muted-foreground">
            RPGForge AI — Forje seus personagens, viva suas histórias.
          </p>
        </div>
      </footer>
    </div>
  );
}
