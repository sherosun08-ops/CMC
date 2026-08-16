/**
 * Files module — THE single media system. Storage-driver interface with a
 * local driver shipped; every other module references files by record id.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RecordsService } from '../engine/records.js';
import type { Accountability } from '../access/index.js';
import { InvalidPayloadError, NotFoundError } from '../kernel/errors.js';

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export function createLocalStorageDriver(root: string): StorageDriver {
  fs.mkdirSync(root, { recursive: true });
  const resolve = (key: string) => {
    if (!/^[A-Za-z0-9_\-./]+$/.test(key) || key.includes('..')) {
      throw new InvalidPayloadError('Invalid storage key');
    }
    return path.join(root, key);
  };
  return {
    async put(key, data) {
      const p = resolve(key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, data);
    },
    async get(key) {
      try {
        return await fs.promises.readFile(resolve(key));
      } catch {
        throw new NotFoundError('File data', key);
      }
    },
    async delete(key) {
      await fs.promises.rm(resolve(key), { force: true });
    },
  };
}

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif',
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg',
  'application/zip', 'application/octet-stream',
]);
const MAX_SIZE = 50 * 1024 * 1024;

export class FileService {
  constructor(private records: RecordsService, private storage: StorageDriver) {}

  async upload(
    acc: Accountability,
    input: { filename: string; mimeType: string; data: Buffer; title?: string; folder?: string },
  ): Promise<Record<string, unknown>> {
    if (input.data.length === 0) throw new InvalidPayloadError('Empty file');
    if (input.data.length > MAX_SIZE) throw new InvalidPayloadError('File exceeds 50MB limit');
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new InvalidPayloadError(`File type "${input.mimeType}" is not allowed`);
    }
    const safeName = path.basename(input.filename).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120) || 'file';
    const hash = crypto.createHash('sha256').update(input.data).digest('hex').slice(0, 16);
    const key = `${new Date().toISOString().slice(0, 7)}/${hash}-${safeName}`;
    await this.storage.put(key, input.data);

    const dims = input.mimeType.startsWith('image/') ? readImageSize(input.data, input.mimeType) : null;

    // The file record goes through the SAME engine pipeline (policy, audit, events).
    return this.records.create(acc, 'files', {
      filename: safeName,
      mime_type: input.mimeType,
      size: input.data.length,
      storage_key: key,
      title: input.title ?? safeName,
      folder: input.folder ?? null,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      uploaded_by: acc.userId,
    });
  }

  async download(acc: Accountability, fileId: string): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    const record = await this.records.getById(acc, 'files', fileId);
    // storage_key is hidden from serialization; fetch via engine-internal read
    const raw = await this.records.list({ ...acc, admin: true }, 'files', { filter: { id: { _eq: fileId } }, limit: 1 });
    const key = (raw.items[0] as { storage_key?: string })?.storage_key;
    const data = await this.storage.get(String(key));
    return { data, mimeType: record.mime_type as string, filename: record.filename as string };
  }

  async remove(acc: Accountability, fileId: string): Promise<void> {
    const raw = await this.records.list({ ...acc, admin: true }, 'files', { filter: { id: { _eq: fileId } }, limit: 1 });
    if (raw.items.length === 0) throw new NotFoundError('files', fileId);
    const key = (raw.items[0] as { storage_key?: string }).storage_key;
    await this.records.remove(acc, 'files', fileId);
    if (key) await this.storage.delete(key);
  }
}

/** Minimal header-based dimension probing for PNG/JPEG/GIF (no native deps). */
export function readImageSize(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && buf.length > 24 && buf.readUInt32BE(12) === 0x49484452) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mime === 'image/gif' && buf.length > 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (mime === 'image/jpeg') {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) break;
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        }
        off += 2 + len;
      }
    }
  } catch {
    /* dimensions are best-effort */
  }
  return null;
}
