'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const browseMarkdownClass =
  'text-sm leading-relaxed text-muted-foreground ' +
  '[&_p]:mb-2 [&_p:last-child]:mb-0 ' +
  '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ' +
  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic ' +
  '[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:font-serif [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground ' +
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:font-serif [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground ' +
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground ' +
  '[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 ' +
  '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs ' +
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground ' +
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top ' +
  '[&_thead:not(:has(th:not(:empty)))]:hidden';

export const BrowseMarkdown = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}) => (
  <div className={cn(browseMarkdownClass, className)}>
    <div className="overflow-x-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  </div>
);

/** Strips the ingestion preamble from `contentMd`: leading `# Title` and source-citation blockquote. */
export const stripContentPreamble = (md: string): string => {
  const lines = md.split('\n');
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index++;
  if (index < lines.length && /^#\s/.test(lines[index].trim())) index++;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('>')) {
      index++;
      continue;
    }
    break;
  }
  return lines.slice(index).join('\n').trim();
};
