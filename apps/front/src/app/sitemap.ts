import type { MetadataRoute } from 'next';
import { publicPaths, siteUrl } from '@/discovery/site';

export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: `${siteUrl}${path === '/' ? '/' : `${path}/`}`, lastModified: '2026-10-06' }));
}
