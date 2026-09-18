import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Minhas fichas',
};

export default function SheetsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
