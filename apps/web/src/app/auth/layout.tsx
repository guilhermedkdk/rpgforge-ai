import type { Metadata } from 'next';

/** Sign-in and recovery screens have nothing to rank for, and a crawler landing here is noise. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
