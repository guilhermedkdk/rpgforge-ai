import type { Metadata, Viewport } from 'next';
import { Inter, Cinzel } from 'next/font/google';
import { Providers } from '@/components/layout/providers';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel' });

export const metadata: Metadata = {
  title: 'RPGForge AI | Sua Biblioteca de Fichas de RPG',
  description:
    'Crie e gerencie fichas de RPG com inteligência artificial. Forje personagens únicos para suas aventuras.',
};

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${cinzel.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
