import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

type Props = { params: Promise<{ packSlug: string; slug: string }> };

/**
 * The deepest public route in the app and the one with the most pages: every SRD rule has one. They
 * are the reason a rules library is worth crawling at all, so each gets its own title and canonical
 * instead of inheriting the listing's.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { packSlug, slug } = await params;
  const canonical = `/library/${packSlug}/${slug}`;
  const fallback: Metadata = { title: 'Regra', alternates: { canonical } };

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001';
    const response = await fetch(`${apiUrl}/rule-items/${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return fallback;

    const item = (await response.json()) as { name?: string; type?: string; summary?: string };
    const name = item.name?.trim();
    if (!name) return fallback;

    const description =
      item.summary?.trim() ||
      `${name}: regra de D&D SRD 5.2, conteúdo aberto, na biblioteca do ${SITE_NAME}.`;

    return {
      title: `${name} | ${SITE_NAME}`,
      description,
      alternates: { canonical },
      openGraph: { title: `${name} | ${SITE_NAME}`, description, url: canonical },
    };
  } catch {
    return fallback;
  }
};

export default function RuleItemLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
