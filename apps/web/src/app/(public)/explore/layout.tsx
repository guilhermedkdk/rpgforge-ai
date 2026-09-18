import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fichas publicadas',
  description:
    'Personagens de D&D SRD 5.2 publicados por quem usa o RPGForge: espécie, classe, nível e a história que os originou.',
  alternates: { canonical: '/explore' },
  openGraph: {
    title: 'Fichas publicadas | RPGForge AI',
    description: 'Personagens de D&D SRD 5.2 publicados por quem usa o RPGForge.',
    url: '/explore',
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
