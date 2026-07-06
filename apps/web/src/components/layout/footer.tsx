import Link from 'next/link';

export const SiteFooter = () => (
  <footer className="mt-auto border-t border-border bg-card/50 py-8">
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center">
      <p className="text-sm text-muted-foreground">
        RPGForge AI · Forje seus personagens, viva suas histórias.
      </p>
      <nav
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
        aria-label="Links do rodapé"
      >
        <Link
          href="/library"
          className="text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          Biblioteca
        </Link>
        <Link
          href="/legal"
          className="text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          Licenças
        </Link>
      </nav>
    </div>
  </footer>
);
