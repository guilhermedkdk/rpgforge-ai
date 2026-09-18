import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Biblioteca de regras',
  description:
    'Navegue o conteúdo aberto de D&D SRD 5.2 usado pelo RPGForge: classes, espécies, magias, talentos e equipamento, com a atribuição de cada licença.',
  alternates: { canonical: '/library' },
  openGraph: {
    title: 'Biblioteca de regras | RPGForge AI',
    description: 'O conteúdo aberto de D&D SRD 5.2 que alimenta as fichas, regra por regra.',
    url: '/library',
  },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
