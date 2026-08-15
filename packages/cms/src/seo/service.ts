// SEO management service

import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@cmc/core';

const prisma = new PrismaClient();

export interface SeoInput {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  ogType?: string;
  twitterCard?: string;
  canonicalUrl?: string;
  robots?: string;
  structuredData?: Record<string, unknown>;
  sitemapInclude?: boolean;
  sitemapPriority?: number;
  sitemapChangeFreq?: string;
  noIndex?: boolean;
}

export function createSeoService() {
  async function getSeo(itemId: string) {
    let seo = await prisma.seoMeta.findUnique({ where: { itemId } });
    if (!seo) {
      // Create default SEO entry
      seo = await prisma.seoMeta.create({
        data: { itemId, sitemapInclude: true, sitemapPriority: 0.5, sitemapChangeFreq: 'weekly' },
      });
    }
    return seo;
  }

  async function updateSeo(itemId: string, input: SeoInput) {
    const existing = await prisma.contentItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new NotFoundError('ContentItem', itemId);

    return prisma.seoMeta.upsert({
      where: { itemId },
      update: input as any,
      create: { itemId, ...input } as any,
    });
  }

  async function generateSitemap(baseUrl: string) {
    const items = await prisma.contentItem.findMany({
      where: {
        status: 'published',
        seo: { sitemapInclude: true },
      },
      include: { seo: true },
    });

    const urls = items.map((item) => ({
      loc: `${baseUrl}/${item.slug || item.id}`,
      lastmod: item.updatedAt.toISOString(),
      priority: item.seo?.sitemapPriority || 0.5,
      changefreq: item.seo?.sitemapChangeFreq || 'weekly',
    }));

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>
  </url>`).join('\n')}
</urlset>`;
  }

  return { getSeo, updateSeo, generateSitemap };
}