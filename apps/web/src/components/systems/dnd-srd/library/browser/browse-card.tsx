'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <Card className="h-full gap-2 border-border bg-card py-4 transition-shadow group-hover:shadow-md group-focus-visible:shadow-md">
      <CardHeader className="gap-1.5 px-4">
        <CardTitle className="font-serif text-base leading-tight text-foreground line-clamp-2 group-hover:text-primary">
          {title}
        </CardTitle>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="px-1.5 py-0 text-[10px]">
                {chip}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      {snippet ? (
        <CardContent className="px-4">
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{snippet}</p>
        </CardContent>
      ) : null}
    </Card>
  </Link>
);
