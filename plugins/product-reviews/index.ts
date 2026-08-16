/**
 * Example plugin: product reviews.
 * Proves the plugin contract end-to-end using ONLY official extension points:
 * a collection, a validation hook, an event subscriber, a custom route,
 * a block type, and default policies. Zero core changes.
 */
import type { Plugin } from '../../src/plugins/index.js';
import { SYSTEM } from '../../src/access/index.js';
import { ValidationError } from '../../src/kernel/errors.js';

const plugin: Plugin = {
  name: 'product-reviews',
  version: '1.0.0',
  async register(ctx) {
    ctx.defineCollection({
      name: 'product_reviews',
      label: 'Product reviews',
      icon: 'star',
      titleField: 'title',
      fields: [
        { name: 'product', type: 'relation', required: true, relation: { collection: 'products', onDelete: 'cascade' } },
        { name: 'author', type: 'relation', relation: { collection: 'users', onDelete: 'set null' } },
        { name: 'rating', type: 'integer', required: true, options: { min: 1, max: 5 } },
        { name: 'title', type: 'string', required: true, options: { maxLength: 120 } },
        { name: 'body', type: 'text', options: { maxLength: 4000 } },
        { name: 'status', type: 'string', required: true, default: 'pending', options: { choices: ['pending', 'approved', 'rejected'] } },
      ],
    });

    // one review per product per author — enforced in the single write path
    ctx.onFilter('product_reviews', 'create', async (payload) => {
      if (payload.author && payload.product) {
        const dup = await ctx.records.list(SYSTEM, 'product_reviews', {
          filter: { author: { _eq: String(payload.author) }, product: { _eq: String(payload.product) } },
          limit: 1,
        });
        if (dup.total > 0) throw new ValidationError('You have already reviewed this product');
      }
    });

    // custom aggregate endpoint under /api/x/product-reviews/summary/:productId
    ctx.route((r) => {
      r.get('/summary/:productId', async (c) => {
        const result = await ctx.records.list(SYSTEM, 'product_reviews', {
          filter: { product: { _eq: c.req.param('productId') }, status: { _eq: 'approved' } },
          limit: 200,
        });
        const ratings = result.items.map((i) => Number(i.rating));
        const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
        return c.json({ data: { count: ratings.length, average: avg ? Math.round(avg * 10) / 10 : null } });
      });
    });

    // block type for the visual builder
    ctx.registerBlock({
      type: 'review_stars',
      label: 'Review stars',
      props: [{ name: 'product', type: 'relation', required: true, relationCollection: 'products' }],
      render: (p) => `<div data-block="review-stars" data-product="${String(p.product ?? '').replace(/"/g, '&quot;')}"></div>`,
    });

    ctx.logger.info('product-reviews plugin registered');
  },
};

export default plugin;
