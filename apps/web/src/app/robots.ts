import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * The disallowed paths are not secrets; they are routes a crawler can only meet as a redirect or as
 * somebody else's private draft. Keeping them out spends the crawl budget on pages that answer.
 */
const robots = (): MetadataRoute.Robots => ({
  rules: [
    {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/settings', '/admin', '/sheets', '/create'],
    },
  ],
  sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
});

export default robots;
