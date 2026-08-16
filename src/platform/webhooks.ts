/**
 * Webhooks — event subscribers delivered through the single job queue,
 * HMAC-signed. Subscriptions are records in the `webhooks` collection.
 */
import crypto from 'node:crypto';
import type { Db } from '../db/adapter.js';
import type { EventBus, DomainEvent } from '../kernel/events.js';
import type { JobQueue } from '../jobs/index.js';
import type { Logger } from '../kernel/logger.js';

export function setupWebhooks(deps: { db: Db; events: EventBus; jobs: JobQueue; logger: Logger; secret: string }): void {
  const { db, events, jobs, logger, secret } = deps;

  jobs.register('webhook.deliver', async (payload) => {
    const { url, body, webhookSecret } = payload as { url: string; body: string; webhookSecret?: string };
    const signature = crypto.createHmac('sha256', webhookSecret || secret).update(body).digest('hex');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cmc-signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
    }
  });

  events.on('*', (event: DomainEvent) => {
    // never deliver auth internals or webhook config changes to webhooks about themselves
    if (event.type.startsWith('auth.') && event.type !== 'auth.login') return;
    const hooks = db.all(`SELECT id, url, events, secret FROM webhooks WHERE active = 1`);
    for (const hook of hooks) {
      let subscribed: string[] = [];
      try {
        subscribed = JSON.parse((hook.events as string) || '[]');
      } catch {
        continue;
      }
      const matches = subscribed.some((s) =>
        s === '*' || s === event.type || (s.endsWith('.*') && event.type.startsWith(s.slice(0, -1))),
      );
      if (!matches) continue;
      if (event.collection === 'webhooks') continue;
      const body = JSON.stringify({
        event: event.type,
        collection: event.collection ?? null,
        payload: sanitizeForDelivery(event.payload),
        at: event.at,
      });
      jobs.enqueue('webhook.deliver', { url: hook.url, body, webhookSecret: hook.secret ?? undefined }, { maxAttempts: 5 });
      logger.debug('webhook enqueued', { webhook: hook.id, event: event.type });
    }
  });
}

function sanitizeForDelivery(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'record' in (payload as object)) {
    const { record, ...rest } = payload as { record: Record<string, unknown> };
    const clean = { ...record };
    delete clean.password;
    delete clean.storage_key;
    delete clean.token;
    delete clean.secret;
    return { ...rest, record: clean };
  }
  return payload;
}
