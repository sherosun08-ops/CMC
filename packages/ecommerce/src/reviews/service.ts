// Reviews & ratings service

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createReviewService() {
  async function list(productId: string, params: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 25, status } = params;
    const where: Record<string, unknown> = { productId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.review.count({ where }),
    ]);

    // Calculate average rating
    const aggregation = await prisma.review.aggregate({
      where: { productId, status: 'approved' },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      averageRating: aggregation._avg.rating || 0,
      totalRatings: aggregation._count.rating,
    };
  }

  async function create(input: { productId: string; userId: string; rating: number; title?: string; content?: string }) {
    const review = await prisma.review.create({
      data: {
        productId: input.productId,
        userId: input.userId,
        rating: input.rating,
        title: input.title,
        content: input.content,
        storeId: (await prisma.product.findUnique({ where: { id: input.productId } }))?.storeId || '',
        status: 'pending',
      },
    });

    // Update product rating
    const agg = await prisma.review.aggregate({
      where: { productId: input.productId, status: 'approved' },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.product.update({
      where: { id: input.productId },
      data: {
        rating: agg._avg.rating || 0,
        ratingCount: agg._count.rating,
      },
    });

    return review;
  }

  async function moderate(id: string, status: string, response?: string) {
    return prisma.review.update({
      where: { id },
      data: { status, response },
    });
  }

  async function getStats(productId: string) {
    const reviews = await prisma.review.findMany({
      where: { productId, status: 'approved' },
    });

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => { distribution[r.rating as keyof typeof distribution]++; });

    const agg = await prisma.review.aggregate({
      where: { productId, status: 'approved' },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      averageRating: agg._avg.rating || 0,
      totalRatings: agg._count.rating,
      distribution,
    };
  }

  return { list, create, moderate, getStats };
}