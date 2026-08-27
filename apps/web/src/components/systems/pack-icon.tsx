import type { LucideIcon } from 'lucide-react';
import { Shield, Swords } from 'lucide-react';

// Keyed by pack slug; single source for both the create wizard's pack selector and the library index.
const packIcons: Record<string, LucideIcon> = {
  'dnd-srd-5-2': Swords,
};

/** Per-pack icon, falling back to a generic shield for a pack with no icon of its own. */
export const PackIcon = ({ slug, className }: { slug: string; className?: string }) => {
  const Icon = packIcons[slug] ?? Shield;
  return <Icon className={className} aria-hidden="true" />;
};
