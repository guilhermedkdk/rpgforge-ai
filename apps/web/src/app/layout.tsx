import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter, Cinzel } from 'next/font/google';
import { Providers } from '@/components/layout/providers';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel' });

const DESCRIPTION =
  'Descreva o personagem em português e receba uma ficha de D&D SRD 5.2 pronta: a IA escolhe apenas entre regras reais e o motor faz as contas.';

export const metadata: Metadata = {
  // Relative URLs in every route's metadata resolve against this, which is what makes one shared
  // opengraph-image and one canonical per page enough.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Descreva o personagem, receba a ficha pronta`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'pt_BR',
    title: `${SITE_NAME} | Descreva o personagem, receba a ficha pronta`,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  // The app's own background, so the browser chrome on mobile matches the page instead of the
  // leftover placeholder navy that never existed in the palette.
  themeColor: '#0a0a0a',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Without the session cookie there is nothing for the session probe to find, so telling the client
  // that up front saves a guaranteed 401 pair on every anonymous page view. The cookie is httpOnly,
  // so only the server can answer this; the boolean leaks nothing the visitor does not already know.
  const hasSession = (await cookies()).has('refreshToken');

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${cinzel.variable} font-sans antialiased`}>
        <Providers hasSession={hasSession}>{children}</Providers>
      </body>
    </html>
  );
}
