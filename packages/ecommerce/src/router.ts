// E-commerce REST router — unified endpoints for all commerce features

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, authorize } from '@cmc/auth';
import { PrismaClient } from '@prisma/client';
import { createProductService } from './products/service';
import { createCartService } from './orders/cart-service';
import { createOrderService } from './orders/order-service';
import { createPaymentService } from './payments/service';
import { createShippingService } from './shipping/service';
import { createDiscountService } from './discounts/service';
import { createInventoryService } from './inventory/service';
import { createCustomerService } from './customers/service';
import { createReviewService } from './reviews/service';

const prisma = new PrismaClient();

export function createEcommerceRouter(): Router {
  const router = Router();
  const products = createProductService();
  const cart = createCartService();
  const orders = createOrderService();
  const payments = createPaymentService();
  const shipping = createShippingService();
  const discounts = createDiscountService();
  const inventory = createInventoryService();
  const customers = createCustomerService();
  const reviews = createReviewService();

  // ═══════════════════════════════════════════
  // PRODUCTS
  // ═══════════════════════════════════════════

  router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await products.list({
        storeId: req.query.storeId as string,
        categoryId: req.query.categoryId as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
      });
      res.json({ data: result.items, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  });

  router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await products.getById(req.params.id);
      res.json({ data: product });
    } catch (err) { next(err); }
  });

  router.get('/products/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await products.getBySlug(req.params.slug, req.query.storeId as string);
      res.json({ data: product });
    } catch (err) { next(err); }
  });

  router.post('/products', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await products.create({ ...req.body, storeId: req.body.storeId, createdById: req.userId });
      res.status(201).json({ data: product });
    } catch (err) { next(err); }
  });

  router.patch('/products/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await products.update(req.params.id, req.body);
      res.json({ data: product });
    } catch (err) { next(err); }
  });

  router.delete('/products/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await products.remove(req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // Product Variants
  router.post('/products/:id/variants', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const variant = await products.addVariant(req.params.id, req.body);
      res.status(201).json({ data: variant });
    } catch (err) { next(err); }
  });

  router.patch('/products/:id/variants/:variantId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const variant = await products.updateVariant(req.params.variantId, req.body);
      res.json({ data: variant });
    } catch (err) { next(err); }
  });

  router.delete('/products/:id/variants/:variantId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await products.removeVariant(req.params.variantId);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════

  router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await prisma.productCategory.findMany({
        where: { storeId: req.query.storeId as string, isActive: true },
        include: { children: true },
        orderBy: { sortOrder: 'asc' },
      });
      res.json({ data: categories });
    } catch (err) { next(err); }
  });

  router.post('/categories', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await prisma.productCategory.create({ data: req.body });
      res.status(201).json({ data: category });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // CART
  // ═══════════════════════════════════════════

  router.get('/cart', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userCart = await cart.getOrCreateCart(req.userId, req.query.token as string);
      res.json({ data: userCart });
    } catch (err) { next(err); }
  });

  router.post('/cart/items', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cartId = req.body.cartId || (await cart.getOrCreateCart(req.userId)).id;
      const updatedCart = await cart.addItem(cartId, req.body);
      res.json({ data: updatedCart });
    } catch (err) { next(err); }
  });

  router.patch('/cart/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updatedCart = await cart.updateItemQuantity(req.params.itemId, req.body.quantity);
      res.json({ data: updatedCart });
    } catch (err) { next(err); }
  });

  router.delete('/cart/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updatedCart = await cart.removeItem(req.params.itemId);
      res.json({ data: updatedCart });
    } catch (err) { next(err); }
  });

  router.post('/cart/discount', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updatedCart = await cart.applyDiscount(req.body.cartId, req.body.code);
      res.json({ data: updatedCart });
    } catch (err) { next(err); }
  });

  router.delete('/cart/:id/discount', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updatedCart = await cart.removeDiscount(req.params.id);
      res.json({ data: updatedCart });
    } catch (err) { next(err); }
  });

  router.post('/cart/:id/checkout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orders.createFromCart(req.params.id, req.body);
      res.status(201).json({ data: order });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════

  router.get('/orders', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await orders.list({
        storeId: req.query.storeId as string,
        status: req.query.status as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
      });
      res.json({ data: result.items, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  });

  router.get('/orders/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orders.getById(req.params.id);
      res.json({ data: order });
    } catch (err) { next(err); }
  });

  router.patch('/orders/:id/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orders.updateStatus(req.params.id, req.body.status);
      res.json({ data: order });
    } catch (err) { next(err); }
  });

  router.post('/orders/:id/cancel', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orders.cancel(req.params.id, req.body.reason);
      res.json({ data: order });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════

  router.post('/payments', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await payments.createPayment(req.body);
      res.status(201).json({ data: payment });
    } catch (err) { next(err); }
  });

  router.post('/payments/:id/capture', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await payments.capturePayment(req.params.id);
      res.json({ data: payment });
    } catch (err) { next(err); }
  });

  router.post('/payments/:id/refund', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await payments.refundPayment(req.params.id, req.body.amount);
      res.json({ data: payment });
    } catch (err) { next(err); }
  });

  router.post('/payments/webhook/:provider', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await payments.handleWebhook(req.params.provider, req.body);
      res.json({ received: true });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // SHIPPING
  // ═══════════════════════════════════════════

  router.get('/shipping/options', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = await shipping.getAvailableOptions(req.query.storeId as string, req.query.regionId as string);
      res.json({ data: options });
    } catch (err) { next(err); }
  });

  router.post('/shipments', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shipment = await shipping.createShipment(req.body);
      res.status(201).json({ data: shipment });
    } catch (err) { next(err); }
  });

  router.post('/shipments/:id/tracking', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shipment = await shipping.updateTracking(req.params.id, req.body.trackingNumber, req.body.trackingUrl);
      res.json({ data: shipment });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // DISCOUNTS
  // ═══════════════════════════════════════════

  router.get('/discounts', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await discounts.list(req.query.storeId as string);
      res.json({ data: items });
    } catch (err) { next(err); }
  });

  router.post('/discounts', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discount = await discounts.create(req.body);
      res.status(201).json({ data: discount });
    } catch (err) { next(err); }
  });

  router.get('/discounts/validate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await discounts.validateCode(req.query.code as string, req.query.storeId as string, parseFloat(req.query.amount as string) || 0);
      res.json({ data: result });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════════

  router.get('/inventory/:productId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inv = await inventory.getInventory(req.params.productId);
      res.json({ data: inv });
    } catch (err) { next(err); }
  });

  router.post('/inventory/:productId/adjust', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inv = await inventory.adjustStock(req.params.productId, req.body.quantity, req.body.type, req.body.reason, req.body.variantId);
      res.json({ data: inv });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // CUSTOMERS
  // ═══════════════════════════════════════════

  router.get('/customers', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await customers.list(req.query.storeId as string, {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
        search: req.query.search as string,
      });
      res.json({ data: result.items, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) { next(err); }
  });

  router.get('/customers/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customers.getById(req.params.id);
      res.json({ data: customer });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // REVIEWS
  // ═══════════════════════════════════════════

  router.get('/reviews/:productId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await reviews.list(req.params.productId, {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
        status: req.query.status as string,
      });
      res.json({ data: result.items, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages, averageRating: result.averageRating, totalRatings: result.totalRatings } });
    } catch (err) { next(err); }
  });

  router.post('/reviews', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const review = await reviews.create({ ...req.body, userId: req.userId! });
      res.status(201).json({ data: review });
    } catch (err) { next(err); }
  });

  // ═══════════════════════════════════════════
  // STORES
  // ═══════════════════════════════════════════

  router.get('/stores', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stores = await prisma.store.findMany({ where: { status: 'active' } });
      res.json({ data: stores });
    } catch (err) { next(err); }
  });

  router.get('/currencies', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currencies = await prisma.currency.findMany({ where: { isActive: true } });
      res.json({ data: currencies });
    } catch (err) { next(err); }
  });

  router.get('/regions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const regions = await prisma.region.findMany({ where: { isActive: true } });
      res.json({ data: regions });
    } catch (err) { next(err); }
  });

  return router;
}