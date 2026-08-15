// Storage service — local, S3, GCS, Azure (Directus + Payload inspired)

import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';

const prisma = new PrismaClient();

export type StorageType = 'local' | 's3' | 'gcs' | 'azure';

interface StorageConfig {
  type: StorageType;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  baseUrl?: string;
}

const storageConfigs: Map<string, StorageConfig> = new Map();

export function registerStorageConfig(name: string, config: StorageConfig) {
  storageConfigs.set(name, config);
}

export function createStorageService() {
  function generateFilename(originalName: string): string {
    const ext = path.extname(originalName);
    const name = crypto.randomUUID();
    return `${name}${ext}`;
  }

  function getStoragePath(storage: string): string {
    const config = storageConfigs.get(storage);
    if (!config) return path.join(process.cwd(), 'uploads');
    return config.type === 'local' ? path.join(process.cwd(), 'uploads', storage) : '';
  }

  async function upload(file: Express.Multer.File, storage: string = 'local', folderId?: string, userId?: string): Promise<any> {
    const filename = generateFilename(file.originalname);
    let url = '';
    let metadata: Record<string, unknown> = {};
    let width: number | null = null;
    let height: number | null = null;

    // Determine image dimensions
    if (file.mimetype.startsWith('image/')) {
      try {
        const imageInfo = await sharp(file.buffer).metadata();
        width = imageInfo.width || null;
        height = imageInfo.height || null;
      } catch { /* not an image */ }
    }

    if (storage === 'local' || !storageConfigs.has(storage)) {
      const fs = require('fs');
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, file.buffer);
      url = `/uploads/${filename}`;
      metadata = { storage: 'local', path: filePath };
    } else if (storage === 's3') {
      const config = storageConfigs.get(storage)!;
      const { S3Client } = require('@aws-sdk/client-s3');
      const { Upload } = require('@aws-sdk/lib-storage');

      const s3 = new S3Client({
        region: config.region,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });

      const upload = new Upload({
        client: s3,
        params: {
          Bucket: config.bucket,
          Key: filename,
          Body: file.buffer,
          ContentType: file.mimetype,
        },
      });

      const result = await upload.done();
      url = result.Location || `${config.baseUrl || ''}/${filename}`;
      metadata = { storage: 's3', bucket: config.bucket, key: filename };
    }

    // Create media record
    const media = await prisma.media.create({
      data: {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        extension: path.extname(file.originalname).toLowerCase(),
        size: file.size,
        width,
        height,
        url,
        storage,
        folderId,
        uploadedById: userId,
        metadata,
        checksum: crypto.createHash('md5').update(file.buffer).digest('hex'),
      },
    });

    // Generate thumbnails for images
    if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
      await generateThumbnails(media, file.buffer);
    }

    return media;
  }

  async function generateThumbnails(media: any, buffer: Buffer) {
    const sizes = [
      { name: 'thumbnail', width: 150, height: 150 },
      { name: 'small', width: 300, height: 300 },
      { name: 'medium', width: 600, height: 600 },
      { name: 'large', width: 1200, height: 1200 },
    ];

    for (const size of sizes) {
      try {
        const resized = await sharp(buffer)
          .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        const thumbFilename = `${size.name}_${media.filename.replace(/\.[^/.]+$/, '')}.jpg`;

        if (media.storage === 'local') {
          const fs = require('fs');
          const thumbPath = path.join(process.cwd(), 'uploads', 'thumbs');
          if (!fs.existsSync(thumbPath)) fs.mkdirSync(thumbPath, { recursive: true });
          fs.writeFileSync(path.join(thumbPath, thumbFilename), resized);
        }

        await prisma.mediaTransformation.create({
          data: {
            mediaId: media.id,
            name: size.name,
            url: `/uploads/thumbs/${thumbFilename}`,
            width: size.width,
            height: size.height,
            format: 'jpeg',
            quality: 80,
          },
        });
      } catch (err) {
        console.error(`Failed to generate ${size.name} for ${media.filename}:`, err);
      }
    }
  }

  async function deleteMedia(id: string) {
    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) throw new Error('Media not found');

    // Delete from storage
    if (media.storage === 'local') {
      const fs = require('fs');
      const filePath = path.join(process.cwd(), 'uploads', media.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Delete thumbnails
    await prisma.mediaTransformation.deleteMany({ where: { mediaId: id } });
    await prisma.media.delete({ where: { id } });
  }

  async function list(folderId?: string, mimeType?: string) {
    const where: Record<string, unknown> = {};
    if (folderId) where.folderId = folderId;
    if (mimeType) where.mimeType = { startsWith: mimeType };

    return prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { transformations: true, folder: true },
    });
  }

  async function getById(id: string) {
    const media = await prisma.media.findUnique({
      where: { id },
      include: { transformations: true, folder: true },
    });
    if (!media) throw new Error('Media not found');
    return media;
  }

  async function update(id: string, input: { title?: string; alt?: string; caption?: string; description?: string }) {
    return prisma.media.update({ where: { id }, data: input });
  }

  // Folders
  async function createFolder(name: string, parentId?: string) {
    return prisma.mediaFolder.create({ data: { name, parentId } });
  }

  async function listFolders(parentId?: string) {
    return prisma.mediaFolder.findMany({
      where: { parentId: parentId || null },
      include: { children: true, _count: { select: { media: true } } },
    });
  }

  return { upload, deleteMedia, list, getById, update, createFolder, listFolders };
}