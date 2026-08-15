// Webhook manager — triggers HTTP callbacks on events

import { eventBus } from '@cmc/core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class WebhookManager {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Listen to all events and dispatch matching webhooks
    eventBus.onAny(async (payload) => {
      await this.dispatch(payload.event, payload.data);
    });

    this.initialized = true;
  }

  async dispatch(event: string, data: unknown): Promise<void> {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: {
          isActive: true,
          events: { array_contains: event },
        },
      });

      for (const webhook of webhooks) {
        this.sendWebhook(webhook, event, data).catch((err) => {
          console.error(`Webhook delivery failed: ${webhook.name}`, err);
        });
      }
    } catch (err) {
      console.error('Webhook dispatch error:', err);
    }
  }

  private async sendWebhook(
    webhook: { id: string; url: string; secret?: string | null; headers?: unknown; retryCount: number; timeout: number },
    event: string,
    data: unknown
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CMC-Event': event,
      'X-CMC-Timestamp': Date.now().toString(),
      ...(typeof webhook.headers === 'object' && webhook.headers ? (webhook.headers as Record<string, string>) : {}),
    };

    if (webhook.secret) {
      headers['X-CMC-Signature'] = this.signPayload(data, webhook.secret);
    }

    let attempts = 0;
    let success = false;
    let responseStatus: number | null = null;
    let responseBody: string | null = null;

    while (attempts <= webhook.retryCount && !success) {
      attempts++;
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ event, data, timestamp: Date.now() }),
          signal: AbortSignal.timeout(webhook.timeout),
        });
        responseStatus = response.status;
        responseBody = await response.text();
        success = response.status >= 200 && response.status < 300;
      } catch (err) {
        if (attempts > webhook.retryCount) {
          console.error(`Webhook ${webhook.url} failed after ${attempts} attempts`);
        }
      }

      if (!success && attempts <= webhook.retryCount) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts)); // exponential backoff
      }
    }

    // Log delivery
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: data as any,
        responseStatus,
        responseBody,
        success,
        attempts,
      },
    });
  }

  private signPayload(payload: unknown, secret: string): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }
}

export const webhookManager = new WebhookManager();