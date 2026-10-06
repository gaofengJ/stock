import type { MetadataRoute } from 'next';
import { siteUrl } from '@/discovery/site';

export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/profile/', '/feedback/', '/blog-frame/'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
