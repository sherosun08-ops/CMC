/**
 * Jobs module — THE single background-work system (queue + scheduler).
 * DB-backed, at-least-once, exponential backoff. Used by webhooks, scheduled
 * publishing, session pruning, cart cleanup. The interface is the contract;
 * a Redis driver is a drop-in later (ADR-002).
 */
import type { Db } from '../db/adapter.js';
import type { Logger } from '../kernel/logger.js';
import type { EventBus } from '../kernel/events.js';
import { randomId } from '../kernel/config.js';

export type JobHandler = (payload: Record<string, unknown>) => void | Promise<void>;

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  /** replace pending jobs with the same dedupe key */
  dedupeKey?: string;
}

export class JobQueue {
  private handlers = new Map<string, JobHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private cronTasks: { name: string; intervalMs: number; lastRun: number; fn: () => void | Promise<void> }[] = [];
  private processing = false;

  constructor(private db: Db, private logger: Logger, private events: EventBus) {}

  register(type: string, handler: JobHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Job handler "${type}" already registered (duplication guard)`);
    }
    this.handlers.set(type, handler);
  }

  enqueue(type: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): string {
    const id = randomId();
    const now = new Date().toISOString();
    if (opts.dedupeKey) {
      this.db.run(`DELETE FROM _jobs WHERE status = 'pending' AND type = ? AND json_extract(payload, '$._dedupe') = ?`, [type, opts.dedupeKey]);
      payload = { ...payload, _dedupe: opts.dedupeKey };
    }
    this.db.run(
      'INSERT INTO _jobs (id, type, payload, status, run_at, attempts, max_attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
      [id, type, JSON.stringify(payload), 'pending', (opts.runAt ?? new Date()).toISOString(), opts.maxAttempts ?? 5, now, now],
    );
    return id;
  }

  /** Recurring in-process task (cheap cron). */
  every(name: string, intervalMs: number, fn: () => void | Promise<void>): void {
    this.cronTasks.push({ name, intervalMs, lastRun: 0, fn });
  }

  start(pollMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Process due jobs + cron tasks. Public so tests can drive it deterministically. */
  async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = Date.now();
      for (const task of this.cronTasks) {
        if (now - task.lastRun >= task.intervalMs) {
          task.lastRun = now;
          try {
            await task.fn();
          } catch (err) {
            this.logger.error('cron task failed', { task: task.name, err: String(err) });
          }
        }
      }
      // claim due jobs one by one (single process; safe with IMMEDIATE tx)
      for (;;) {
        const job = this.db.get(
          `SELECT * FROM _jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 1`,
          [new Date().toISOString()],
        );
        if (!job) break;
        this.db.run(`UPDATE _jobs SET status = 'running', updated_at = ? WHERE id = ?`, [new Date().toISOString(), job.id]);
        await this.execute(job);
      }
    } finally {
      this.processing = false;
    }
  }

  private async execute(job: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(job.type as string);
    const attempts = Number(job.attempts) + 1;
    try {
      if (!handler) throw new Error(`No handler for job type "${job.type}"`);
      const payload = job.payload ? JSON.parse(job.payload as string) : {};
      await handler(payload);
      this.db.run(`UPDATE _jobs SET status = 'done', attempts = ?, updated_at = ? WHERE id = ?`, [attempts, new Date().toISOString(), job.id]);
    } catch (err) {
      const failedForGood = attempts >= Number(job.max_attempts);
      const backoffMs = Math.min(60_000 * 2 ** (attempts - 1), 3_600_000);
      this.db.run(
        `UPDATE _jobs SET status = ?, attempts = ?, last_error = ?, run_at = ?, updated_at = ? WHERE id = ?`,
        [failedForGood ? 'failed' : 'pending', attempts, String(err),
         new Date(Date.now() + backoffMs).toISOString(), new Date().toISOString(), job.id],
      );
      this.logger.error('job failed', { id: job.id, type: job.type, attempts, final: failedForGood, err: String(err) });
      if (failedForGood) {
        this.events.emit({ type: 'jobs.failed', payload: { id: job.id, type: job.type, error: String(err) } });
      }
    }
  }

  stats(): Record<string, number> {
    const rows = this.db.all(`SELECT status, COUNT(*) c FROM _jobs GROUP BY status`);
    return Object.fromEntries(rows.map((r) => [r.status as string, Number(r.c)]));
  }
}
