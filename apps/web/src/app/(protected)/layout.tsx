import type { Metadata } from 'next';

/**
 * Nothing under here is reachable without a session, so a crawler can only ever meet a redirect.
 * `follow` stays on: the links out of these pages point at public routes worth crawling.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
