/**
 * Plugin loader — discovers plugins in ./plugins/<name>/index.ts.
 * Each must default-export a Plugin object.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginManager, Plugin } from './index.js';
import type { Logger } from '../kernel/logger.js';

export async function loadInstalledPlugins(manager: PluginManager, logger: Logger): Promise<void> {
  const dir = path.join(process.cwd(), 'plugins');
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidates = ['index.ts', 'index.js'].map((f) => path.join(dir, entry.name, f));
    const file = candidates.find((f) => fs.existsSync(f));
    if (!file) continue;
    try {
      const mod = await import(pathToFileURL(file).href);
      const plugin = mod.default as Plugin;
      if (!plugin?.name || typeof plugin.register !== 'function') {
        logger.warn('skipping invalid plugin', { dir: entry.name });
        continue;
      }
      await manager.load(plugin);
    } catch (err) {
      logger.error('failed to load plugin', { dir: entry.name, err: String(err) });
    }
  }
}
