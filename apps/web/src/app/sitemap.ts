import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Only the routes a signed-out visitor can actually open.
 *
 * `/sheets`, `/settings` and `/admin` are behind auth and `/create` holds a draft, so listing any of
 * them would send a crawler to a redirect. Sheet and rule-item pages are user content and change
 * constantly; they belong in a generated sitemap once there is enough of either to be worth indexing.
 */
const ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/explore', changeFrequency: 'daily', priority: 0.8 },
  { path: '/library', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/legal', changeFrequency: 'yearly', priority: 0.3 },
];

const sitemap = (): MetadataRoute.Sitemap => {
  const lastModified = new Date();

  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified,
    changeFrequency,
    priority,
  }));
};

export default sitemap;
