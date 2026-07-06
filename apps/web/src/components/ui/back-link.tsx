'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const backLinkClass =
  'group inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface BackLinkProps {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

export const BackLink = ({ href, onClick, className, children }: BackLinkProps) => {
  const content = (
    <>
      <ArrowLeft
        className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cn(backLinkClass, className)}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(backLinkClass, className)}>
      {content}
    </button>
  );
};
