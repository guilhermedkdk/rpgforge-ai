import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

type Props = { params: Promise<{ username: string; id: string }> };

/**
 * A shared sheet link is the one URL of this app that travels, so it gets real metadata rather than
 * inheriting the profile's. Without this the canonical points at the profile — telling a crawler the
 * sheet is a duplicate of it — and a pasted link previews the profile's title.
 *
 * The fetch is server-side and unauthenticated on purpose: the endpoint is public, and a private
 * sheet answers 404 exactly like a missing one, which is the behaviour this page already relies on.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { username, id } = await params;
  const canonical = `/u/${username}/${id}`;
  const fallback: Metadata = { title: `Ficha de @${username}`, alternates: { canonical } };

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001';
    const response = await fetch(`${apiUrl}/public/sheets/${encodeURIComponent(id)}/with-rules`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return fallback;

    const data = (await response.json()) as { sheet?: { name?: string } };
    const name = data.sheet?.name?.trim();
    if (!name) return fallback;

    const title = `${name}, por @${username}`;
    const description = `Ficha de D&D SRD 5.2 de ${name}, publicada por @${username} no ${SITE_NAME}.`;

    return {
      title: `${title} | ${SITE_NAME}`,
      description,
      alternates: { canonical },
      openGraph: { title: `${title} | ${SITE_NAME}`, description, url: canonical },
    };
  } catch {
    // A metadata fetch must never take the page down with it.
    return fallback;
  }
};

export default function PublicSheetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
