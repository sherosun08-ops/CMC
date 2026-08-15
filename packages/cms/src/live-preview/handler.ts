// Live preview handler — renders content with draft data (Payload-style)

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createLivePreviewHandler() {
  return async (req: Request, res: Response) => {
    const { itemId, secret } = req.query;

    // Verify preview secret
    if (secret !== process.env.PREVIEW_SECRET) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid preview secret' } });
    }

    const item = await prisma.contentItem.findUnique({
      where: { id: itemId as string },
      include: {
        contentType: true,
        seo: true,
      },
    });

    if (!item) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Content not found' } });
    }

    // Render preview HTML (in production, use SSG/SSR via Next.js)
    res.json({
      preview: true,
      id: item.id,
      status: item.status,
      data: item.data,
      seo: item.seo,
      contentType: item.contentType.name,
    });
  };
}