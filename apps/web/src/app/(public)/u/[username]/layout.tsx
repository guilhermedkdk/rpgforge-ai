import type { Metadata } from 'next';

type Props = { params: Promise<{ username: string }> };

/**
 * The username is the only fact available without a fetch, and it is enough to make every profile
 * its own title. A sheet's own name still needs `generateMetadata` on the sheet route, which means
 * fetching it server-side; until then a shared sheet link inherits this.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { username } = await params;
  const handle = `@${username}`;

  return {
    title: `Fichas de ${handle}`,
    description: `Personagens de D&D SRD 5.2 publicados por ${handle} no RPGForge.`,
    alternates: { canonical: `/u/${username}` },
    openGraph: {
      title: `Fichas de ${handle} | RPGForge AI`,
      description: `Personagens de D&D SRD 5.2 publicados por ${handle}.`,
      url: `/u/${username}`,
    },
  };
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
