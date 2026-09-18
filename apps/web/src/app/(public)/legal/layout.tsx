import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Licenças e atribuições',
  description:
    'O RPGForge AI usa exclusivamente conteúdo de regras publicado sob licenças abertas. Esta página lista cada pacote e a atribuição que a sua licença exige.',
  alternates: { canonical: '/legal' },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
