/**
 * Notifications — THE single notification system: in-app inbox records,
 * produced by event subscribers. Channel drivers (email etc.) can be plugged
 * into the same service later without a second pipeline.
 */
import type { RecordsService } from '../engine/records.js';
import type { EventBus } from '../kernel/events.js';
import type { Db } from '../db/adapter.js';
import { SYSTEM } from '../access/index.js';

export class NotificationService {
  constructor(private records: RecordsService, private db: Db) {}

  async notify(recipientId: string, subject: string, body?: string, link?: string): Promise<void> {
    await this.records.create(SYSTEM, 'notifications', {
      recipient: recipientId,
      subject,
      body: body ?? null,
      link: link ?? null,
      read: false,
    });
  }

  async notifyAdmins(subject: string, body?: string, link?: string): Promise<void> {
    const admins = this.db.all(
      `SELECT DISTINCT ur.user AS id FROM user_roles ur JOIN roles r ON r.id = ur.role WHERE r.admin_access = 1`,
    );
    for (const a of admins) {
      await this.notify(a.id as string, subject, body, link);
    }
  }

  /** Built-in subscribers on the single event pipeline. */
  connect(events: EventBus): void {
    events.on('orders.placed', async (e) => {
      const { orderId, number, grandTotal, currency } = e.payload as Record<string, unknown>;
      await this.notifyAdmins(
        `New order ${number}`,
        `Order total: ${((grandTotal as number) / 100).toFixed(2)} ${currency}`,
        `/admin/collections/orders/${orderId}`,
      );
    });
    events.on('jobs.failed', async (e) => {
      const { type, error } = e.payload as Record<string, unknown>;
      await this.notifyAdmins(`Background job failed: ${type}`, String(error).slice(0, 500));
    });
  }
}
