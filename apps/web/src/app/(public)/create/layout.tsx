import type { Metadata } from 'next';

/**
 * Public, but it is a draft in progress rather than a document: there is nothing here for a crawler
 * to index, and the URL carries wizard state.
 */
export const metadata: Metadata = {
  title: 'Criar ficha',
  description: 'Descreva o personagem em português e receba uma ficha de D&D SRD 5.2 pronta.',
  robots: { index: false, follow: true },
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
