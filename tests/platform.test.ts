import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestPlatform, SYSTEM, type TestPlatform } from './helpers.js';
import { JobQueue } from '../src/jobs/index.js';
import { createLogger } from '../src/kernel/logger.js';
import { SearchService, createFts5Driver } from '../src/search/index.js';
import { BlockRegistry, registerCoreBlocks, setupContentScheduling } from '../src/content/index.js';
import { SettingsService } from '../src/platform/settings.js';
import { NotificationService } from '../src/platform/notifications.js';
import { createLocalStorageDriver, FileService } from '../src/files/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let p: TestPlatform;
beforeEach(() => {
  p = createTestPlatform();
});

const logger = createLogger('test', 'error');

describe('job queue', () => {
  it('executes due jobs, retries with backoff, marks failed', async () => {
    const jobs = new JobQueue(p.db, logger, p.events);
    const runs: number[] = [];
    jobs.register('ok', () => {
      runs.push(1);
    });
    jobs.register('boom', () => {
      throw new Error('nope');
    });
    jobs.enqueue('ok');
    jobs.enqueue('boom', {}, { maxAttempts: 1 });
    await jobs.tick();
    expect(runs.length).toBe(1);
    const stats = jobs.stats();
    expect(stats.done).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it('dedupes pending jobs by key', async () => {
    const jobs = new JobQueue(p.db, logger, p.events);
    jobs.register('x', () => {});
    jobs.enqueue('x', {}, { dedupeKey: 'k', runAt: new Date(Date.now() + 60000) });
    jobs.enqueue('x', {}, { dedupeKey: 'k', runAt: new Date(Date.now() + 60000) });
    expect(jobs.stats().pending).toBe(1);
  });

  it('rejects duplicate handler registration (duplication guard)', () => {
    const jobs = new JobQueue(p.db, logger, p.events);
    jobs.register('h', () => {});
    expect(() => jobs.register('h', () => {})).toThrow(/already registered/);
  });
});

describe('search (FTS5, event-fed)', () => {
  it('indexes on create/update, removes on delete, ranks matches', async () => {
    const search = new SearchService(createFts5Driver(p.db), p.registry);
    search.connect(p.events);
    const page = await p.records.create(SYSTEM, 'pages', { title: 'Quantum computing guide', slug: 'qc' });
    await new Promise((r) => setTimeout(r, 20)); // async subscribers
    let hits = search.query('quantum');
    expect(hits.length).toBe(1);
    expect(hits[0].collection).toBe('pages');

    await p.records.update(SYSTEM, 'pages', page.id as string, { title: 'Classical mechanics' });
    await new Promise((r) => setTimeout(r, 20));
    expect(search.query('quantum').length).toBe(0);
    expect(search.query('classical').length).toBe(1);

    await p.records.remove(SYSTEM, 'pages', page.id as string);
    await new Promise((r) => setTimeout(r, 20));
    expect(search.query('classical').length).toBe(0);
  });
});

describe('blocks system', () => {
  it('validates trees against registered types', () => {
    const blocks = new BlockRegistry();
    registerCoreBlocks(blocks);
    expect(() => blocks.validateTree([{ type: 'ghost' }])).toThrow(/Unknown block/);
    expect(() => blocks.validateTree([{ type: 'heading', props: {} }])).toThrow(/requires prop/);
    expect(() => blocks.validateTree([{ type: 'heading', props: { text: 'x' }, children: [{ type: 'paragraph', props: { text: 'y' } }] }])).toThrow(/cannot contain/);
    blocks.validateTree([
      { type: 'section', props: {}, children: [{ type: 'heading', props: { text: 'Hi' } }] },
    ]);
  });

  it('renders escaped HTML', () => {
    const blocks = new BlockRegistry();
    registerCoreBlocks(blocks);
    const html = blocks.renderTree([
      { type: 'heading', props: { text: '<script>alert(1)</script>', level: 1 } },
      { type: 'button', props: { label: 'Go', href: 'javascript:evil()' } },
    ]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:evil');
    expect(html).toContain('href="#"');
  });

  it('duplication guard on block types', () => {
    const blocks = new BlockRegistry();
    registerCoreBlocks(blocks);
    expect(() => blocks.register({ type: 'heading', label: 'x', props: [], render: () => '' })).toThrow(/already registered/);
  });
});

describe('scheduled publishing', () => {
  it('publishes drafts when publish_at arrives, via the normal engine path', async () => {
    const jobs = new JobQueue(p.db, logger, p.events);
    setupContentScheduling({ records: p.records, jobs, registry: p.registry });
    const past = new Date(Date.now() - 1000).toISOString();
    const page = await p.records.create(SYSTEM, 'pages', { title: 'Soon', slug: 'soon', status: 'draft', publish_at: past });
    await jobs.tick();
    const updated = await p.records.getById(SYSTEM, 'pages', page.id as string);
    expect(updated.status).toBe('published');
    // revision written by the engine (proof it went through the single path)
    const revs = await p.records.revisions(SYSTEM, 'pages', page.id as string);
    expect(revs.some((r) => r.action === 'update')).toBe(true);
  });
});

describe('settings service', () => {
  it('sets, gets, caches', async () => {
    const settings = new SettingsService(p.records);
    expect(await settings.get('site.name', 'CMC')).toBe('CMC');
    await settings.set(SYSTEM, 'site.name', 'My Shop');
    expect(await settings.get('site.name')).toBe('My Shop');
  });
});

describe('notifications', () => {
  it('notifies admins on orders.placed via the event pipeline', async () => {
    const role = await p.records.create(SYSTEM, 'roles', { name: 'root', admin_access: true });
    const admin = await p.records.create(SYSTEM, 'users', { email: 'boss@x.co' });
    await p.records.create(SYSTEM, 'user_roles', { user: admin.id, role: role.id });
    const notifications = new NotificationService(p.records, p.db);
    notifications.connect(p.events);
    p.events.emit({ type: 'orders.placed', payload: { orderId: 'o1', number: 'ORD-1', grandTotal: 1000, currency: 'USD' } });
    await vi.waitFor(async () => {
      const inbox = await p.records.list(SYSTEM, 'notifications', {});
      expect(inbox.total).toBe(1);
      expect(inbox.items[0].subject).toContain('ORD-1');
    });
  });
});

describe('files', () => {
  it('uploads, probes PNG dimensions, downloads, deletes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmc-files-'));
    const files = new FileService(p.records, createLocalStorageDriver(dir));
    // 1x1 red PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const rec = await files.upload(SYSTEM, { filename: 'dot.png', mimeType: 'image/png', data: png });
    expect(rec.width).toBe(1);
    expect(rec.height).toBe(1);

    // hidden fields (storage_key) are serialized for admins only
    const role = await p.records.create(SYSTEM, 'roles', { name: 'viewer' });
    await p.records.create(SYSTEM, 'policies', { role: role.id, collection: 'files', action: 'read' });
    const viewer = await p.records.create(SYSTEM, 'users', { email: 'v@x.co' });
    await p.records.create(SYSTEM, 'user_roles', { user: viewer.id, role: role.id });
    const viewerList = await p.records.list(
      { userId: viewer.id as string, roleIds: [role.id as string], admin: false }, 'files', {},
    );
    expect(viewerList.items[0]).not.toHaveProperty('storage_key');

    const dl = await files.download(SYSTEM, rec.id as string);
    expect(dl.data.equals(png)).toBe(true);

    await files.remove(SYSTEM, rec.id as string);
    await expect(files.download(SYSTEM, rec.id as string)).rejects.toThrow(/not found/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects oversized and disallowed types', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmc-files-'));
    const files = new FileService(p.records, createLocalStorageDriver(dir));
    await expect(
      files.upload(SYSTEM, { filename: 'x.exe', mimeType: 'application/x-msdownload', data: Buffer.from('x') }),
    ).rejects.toThrow(/not allowed/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
