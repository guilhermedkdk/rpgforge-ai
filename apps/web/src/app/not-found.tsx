import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RPGForgeMark } from '@/components/brand/rpgforge-mark';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';

export const metadata: Metadata = {
  title: 'Página não encontrada',
  robots: { index: false, follow: true },
};

const NotFound = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <RPGForgeMark className="h-16 w-16 text-primary-ink" lettering={false} />

        <h1 className="mt-8 font-serif text-3xl font-bold text-foreground">
          Essa página não está na mesa
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          O link pode ter mudado, ou a ficha que estava aqui deixou de ser pública. Nada se perdeu:
          as suas continuam salvas.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Voltar para o início</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/explore">Ver fichas publicadas</Link>
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default NotFound;
