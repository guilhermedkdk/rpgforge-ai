import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

type Props = { params: Promise<{ packSlug: string }> };

/**
 * Without this every pack page inherits `/library`'s canonical, which tells a crawler each of them
 * is a duplicate of the listing. The packs endpoint is public, so the real name costs one fetch.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { packSlug } = await params;
  const canonical = `/library/${packSlug}`;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001';
    const response = await fetch(`${apiUrl}/packs/${encodeURIComponent(packSlug)}`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return { title: 'Pacote de regras', alternates: { canonical } };

    const pack = (await response.json()) as { name?: string; systemName?: string };
    const name = pack.name?.trim() || 'Pacote de regras';
    const description = `Classes, espécies, magias, talentos e equipamento de ${name}, conteúdo aberto navegável no ${SITE_NAME}.`;

    return {
      // Spelled out rather than leaning on the root's title template: that only reaches direct
      // children, and this segment is two levels down.
      title: `${name} | ${SITE_NAME}`,
      description,
      alternates: { canonical },
      openGraph: { title: `${name} | ${SITE_NAME}`, description, url: canonical },
    };
  } catch {
    // Metadata must never take the page down with it.
    return { title: 'Pacote de regras', alternates: { canonical } };
  }
};

export default function PackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
