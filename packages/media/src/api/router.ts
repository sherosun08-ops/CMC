import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '@cmc/auth';
import { createStorageService } from '../storage/service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

export function createMediaRouter(): Router {
  const router = Router();
  const storage = createStorageService();

  // List files
  router.get('/files', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = await storage.list(req.query.folderId as string, req.query.mimeType as string);
      res.json({ data: files });
    } catch (err) { next(err); }
  });

  // Get single file
  router.get('/files/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await storage.getById(req.params.id);
      res.json({ data: file });
    } catch (err) { next(err); }
  });

  // Upload file
  router.post('/files', requireAuth, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE', message: 'No file provided' } });
      const file = await storage.upload(req.file, req.body.storage || 'local', req.body.folderId, req.userId);
      res.status(201).json({ data: file });
    } catch (err) { next(err); }
  });

  // Upload multiple files
  router.post('/files/batch', requireAuth, upload.array('files', 20), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ error: { code: 'NO_FILES', message: 'No files provided' } });

      const results = await Promise.all(
        files.map((f) => storage.upload(f, 'local', req.body.folderId, req.userId))
      );
      res.status(201).json({ data: results });
    } catch (err) { next(err); }
  });

  // Update file metadata
  router.patch('/files/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await storage.update(req.params.id, req.body);
      res.json({ data: file });
    } catch (err) { next(err); }
  });

  // Delete file
  router.delete('/files/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await storage.deleteMedia(req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // Folders
  router.get('/folders', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const folders = await storage.listFolders(req.query.parentId as string);
      res.json({ data: folders });
    } catch (err) { next(err); }
  });

  router.post('/folders', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const folder = await storage.createFolder(req.body.name, req.body.parentId);
      res.status(201).json({ data: folder });
    } catch (err) { next(err); }
  });

  return router;
}