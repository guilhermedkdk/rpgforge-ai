import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Painel administrativo',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
