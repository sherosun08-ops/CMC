// Product service — full product management with variants, prices, categories

import { PrismaClient, ProductType } from '@prisma/client';
import { eventBus, NotFoundError, QueryParams, PaginatedResult } from '@cmc/core';
import slugify from 'slugify';

const prisma = new PrismaClient();

export function createProductService() {
  async function list(params: QueryParams & { storeId?: string; categoryId?: string }): Promise<PaginatedResult<unknown>> {
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', search, filter, storeId, categoryId } = params;
    const where: Record<string, unknown> = {};

    if (storeId) where.storeId = storeId;
    if (categoryId) {
      where.categories = { some: { categoryId } };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (filter) Object.assign(where, filter);

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          prices: { include: { currency: true } },
          variants: { include: { prices: true, images: { include: { media: true } } } },
          images: { include: { media: true }, where: { isPrimary: true } },
          categories: { include: { category: true } },
          inventory: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async function getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: { include: { prices: true, images: { include: { media: true } }, inventory: true } },
        prices: { include: { currency: true } },
        images: { include: { media: true } },
        categories: { include: { category: true } },
        inventory: true,
        reviews: { where: { status: 'approved' }, take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!product) throw new NotFoundError('Product', id);
    return product;
  }

  async function getBySlug(slug: string, storeId?: string) {
    const product = await prisma.product.findFirst({
      where: { slug, ...(storeId ? { storeId } : {}) },
      include: {
        variants: { include: { prices: true, images: { include: { media: true } } } },
        prices: { include: { currency: true } },
        images: { include: { media: true } },
        categories: { include: { category: true } },
        inventory: true,
      },
    });
    if (!product) throw new NotFoundError('Product', slug);
    return product;
  }

  async function create(input: any) {
    const slug = input.slug || slugify(input.title, { lower: true, strict: true });
    const existing = await prisma.product.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const product = await prisma.product.create({
      data: {
        storeId: input.storeId,
        title: input.title,
        slug: finalSlug,
        description: input.description,
        shortDescription: input.shortDescription,
        type: input.type || 'SIMPLE',
        status: input.status || 'draft',
        sku: input.sku,
        barcode: input.barcode,
        brand: input.brand,
        weight: input.weight,
        metadata: input.metadata || {},
        tags: input.tags || [],
        // Create default price if provided
        ...(input.price ? {
          prices: {
            create: {
              amount: input.price,
              currencyId: input.currencyId || (await prisma.currency.findFirst({ where: { isDefault: true } }))?.id || '',
              isActive: true,
            },
          },
        } : {}),
        // Create initial inventory
        inventory: {
          create: {
            stockQuantity: input.stock || 0,
            reservedQuantity: 0,
            availableQuantity: input.stock || 0,
            trackInventory: input.trackInventory ?? true,
            allowBackorder: input.allowBackorder ?? false,
            lowStockThreshold: input.lowStockThreshold || 5,
          },
        },
      },
    });

    await eventBus.emit('product.created', { id: product.id, title: product.title }, input.createdById);
    return product;
  }

  async function update(id: string, input: any) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Product', id);

    const product = await prisma.product.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        shortDescription: input.shortDescription,
        status: input.status,
        sku: input.sku,
        barcode: input.barcode,
        brand: input.brand,
        weight: input.weight,
        metadata: input.metadata,
        tags: input.tags,
      },
    });

    await eventBus.emit('product.updated', { id: product.id }, input.updatedById);
    return product;
  }

  async function remove(id: string): Promise<void> {
    await prisma.product.update({ where: { id }, data: { status: 'archived' } });
    await eventBus.emit('product.deleted', { id });
  }

  // Variants
  async function addVariant(productId: string, input: any) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product', productId);

    return prisma.productVariant.create({
      data: {
        productId,
        title: input.title,
        sku: input.sku,
        barcode: input.barcode,
        options: input.options || {},
        price: input.price,
        isDefault: input.isDefault || false,
        weight: input.weight,
        metadata: input.metadata,
        // Create inventory for this variant
        inventory: {
          create: {
            productId,
            stockQuantity: input.stock || 0,
            reservedQuantity: 0,
            availableQuantity: input.stock || 0,
          },
        },
      },
      include: { prices: true, inventory: true },
    });
  }

  async function updateVariant(variantId: string, input: any) {
    return prisma.productVariant.update({
      where: { id: variantId },
      data: {
        title: input.title,
        sku: input.sku,
        options: input.options,
        price: input.price,
        isDefault: input.isDefault,
        weight: input.weight,
        metadata: input.metadata,
      },
    });
  }

  async function removeVariant(variantId: string) {
    await prisma.productVariant.delete({ where: { id: variantId } });
  }

  // Categories
  async function addToCategory(productId: string, categoryId: string) {
    await prisma.productCategoryProduct.create({ data: { productId, categoryId } });
  }

  async function removeFromCategory(productId: string, categoryId: string) {
    await prisma.productCategoryProduct.delete({ where: { productId_categoryId: { productId, categoryId } } });
  }

  return { list, getById, getBySlug, create, update, remove, addVariant, updateVariant, removeVariant, addToCategory, removeFromCategory };
}