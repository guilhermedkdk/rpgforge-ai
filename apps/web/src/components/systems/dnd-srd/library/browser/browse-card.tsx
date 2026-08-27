'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export const BrowseCard = ({
  href,
  title,
  chips,
  snippet,
}: {
  href: string;
  title: string;
  chips: string[];
  snippet?: string;
}) => (
  <Link
    href={href}
    className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <div
      className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      aria-hidden="true"
    />

    <div className="relative flex items-start gap-2">
      <h3 className="line-clamp-2 min-w-0 flex-1 font-serif text-base font-semibold leading-tight text-foreground transition-colors duration-300 group-hover:text-primary">
        {title}
      </h3>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors duration-300 group-hover:text-primary"
        aria-hidden="true"
      />
    </div>

    {chips.length > 0 && (
      <div className="relative mt-2 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {chip}
          </span>
        ))}
      </div>
    )}

    {snippet ? (
      <p className="relative mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {snippet}
      </p>
    ) : null}
  </Link>
);
